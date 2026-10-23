import { SUPABASE_NON_CONFIGURE, supabase } from './supabase'

// Table créée par supabase/migrations/0007_entretiens.sql
export interface Entretien {
  id: string
  candidature_id: string
  // Date ISO (UTC)
  debut: string
  duree_minutes: number
  lieu: string | null
}

export interface EntretienAVenir extends Entretien {
  nom_candidat: string
}

export type NouvelEntretien = Pick<Entretien, 'debut' | 'duree_minutes' | 'lieu'>

export const DUREES = [30, 45, 60, 90, 120]

// Nombre d'entretiens montrés dans l'encadré du tableau de bord
export const NOMBRE_A_VENIR = 5

function table() {
  if (!supabase) throw new Error(SUPABASE_NON_CONFIGURE)
  return supabase.from('entretiens')
}

export async function listerEntretiens(candidatureId: string): Promise<Entretien[]> {
  const { data, error } = await table()
    .select('id, candidature_id, debut, duree_minutes, lieu')
    .eq('candidature_id', candidatureId)
    .order('debut')
  if (error) throw new Error(error.message)
  return data
}

// Entretiens qui ne sont pas encore terminés, du plus proche au plus lointain
export async function listerEntretiensAVenir(maintenant = new Date()): Promise<EntretienAVenir[]> {
  // Un entretien en cours (commencé il y a moins de 8 h, durée maximale) reste affiché
  const depuis = new Date(maintenant.getTime() - 8 * 60 * 60 * 1000)
  const { data, error } = await table()
    .select('id, candidature_id, debut, duree_minutes, lieu, candidatures(nom)')
    .gte('debut', depuis.toISOString())
    .order('debut')
  if (error) throw new Error(error.message)
  return data
    .map(({ candidatures, ...entretien }) => ({
      ...entretien,
      nom_candidat: (candidatures as unknown as { nom: string } | null)?.nom ?? '',
    }))
    .filter((e) => finEntretien(e) > maintenant)
}

export async function planifierEntretien(candidatureId: string, entretien: NouvelEntretien) {
  const { error } = await table().insert({ candidature_id: candidatureId, ...entretien })
  if (error) throw new Error(error.message)
}

export async function supprimerEntretien(id: string) {
  const { error } = await table().delete().eq('id', id)
  if (error) throw new Error(error.message)
}

export function finEntretien(entretien: Pick<Entretien, 'debut' | 'duree_minutes'>) {
  return new Date(new Date(entretien.debut).getTime() + entretien.duree_minutes * 60 * 1000)
}

// « mardi 3 novembre à 15:00 » ; avec l'année pour une date qui peut être lointaine (historique)
export function formaterDate(iso: string, { annee = false } = {}) {
  return new Date(iso).toLocaleString('fr-FR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    ...(annee && { year: 'numeric' }),
    hour: '2-digit',
    minute: '2-digit',
  })
}

// Premier entretien à venir de chaque candidature
export function prochainParCandidature(entretiens: EntretienAVenir[]) {
  const prochains = new Map<string, EntretienAVenir>()
  for (const e of entretiens) {
    const actuel = prochains.get(e.candidature_id)
    if (!actuel || e.debut < actuel.debut) prochains.set(e.candidature_id, e)
  }
  return prochains
}

// Fichier agenda (iCalendar, RFC 5545) pour ajouter l'entretien à Google Agenda, Outlook…
export function genererIcs(entretien: Entretien, nomCandidat: string, maintenant = new Date()) {
  const lignes = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Filtre//Entretiens//FR',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${entretien.id}@filtre`,
    `DTSTAMP:${dateIcs(maintenant)}`,
    `DTSTART:${dateIcs(new Date(entretien.debut))}`,
    `DTEND:${dateIcs(finEntretien(entretien))}`,
    `SUMMARY:${texteIcs(`Entretien – ${nomCandidat}`)}`,
    ...(entretien.lieu ? [`LOCATION:${texteIcs(entretien.lieu)}`] : []),
    'END:VEVENT',
    'END:VCALENDAR',
  ]
  return lignes.map(plierLigne).join('\r\n') + '\r\n'
}

// 20261103T140000Z
function dateIcs(date: Date) {
  return date
    .toISOString()
    .replace(/[-:]/g, '')
    .replace(/\.\d{3}/, '')
}

function texteIcs(texte: string) {
  return texte.replace(/[\\;,]/g, (c) => `\\${c}`).replace(/\r?\n/g, '\\n')
}

// Lignes de 75 octets au plus, les suivantes commençant par une espace (RFC 5545, 3.1)
function plierLigne(ligne: string) {
  const encodeur = new TextEncoder()
  const morceaux: string[] = []
  let courant = ''
  for (const caractere of ligne) {
    const limite = morceaux.length === 0 ? 75 : 74
    if (encodeur.encode(courant + caractere).length > limite) {
      morceaux.push(courant)
      courant = ''
    }
    courant += caractere
  }
  morceaux.push(courant)
  return morceaux.join('\r\n ')
}
