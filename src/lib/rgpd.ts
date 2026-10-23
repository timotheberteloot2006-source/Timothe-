import { supprimerCandidature, type Candidature } from './candidatures'
import { lireCv } from './cv'
import { SUPABASE_NON_CONFIGURE, supabase } from './supabase'
import { telechargerFichier } from './telechargement'

// Droits des candidats (supabase/migrations/0026_rgpd.sql) : export de leurs données, effacement,
// et registre des demandes traitées (sans aucune donnée du candidat)

export interface DemandeRgpd {
  id: number
  // null : compte du membre supprimé
  email: string | null
  // expiration : suppression automatique au terme de la durée de conservation (sans membre)
  action: 'acces' | 'effacement' | 'expiration'
  created_at: string
}

export const LIMITE_REGISTRE = 20

function client() {
  if (!supabase) throw new Error(SUPABASE_NON_CONFIGURE)
  return supabase
}

async function noter(action: 'acces' | 'effacement') {
  const { error } = await client().rpc('noter_demande_rgpd', { type_demande: action })
  if (error) throw new Error(error.message)
}

const LISEZ_MOI = (nom: string, responsable: string, le: string, avecCv: boolean) =>
  [
    `Données personnelles de ${nom}`,
    `Responsable du traitement : ${responsable}`,
    `Export réalisé le ${le}`,
    '',
    'Contenu de cette archive :',
    '- donnees.json : toutes les informations enregistrées sur votre candidature (coordonnées,',
    '  poste, compétences, offre, étape du recrutement, étiquettes, notes de l’équipe, entretiens,',
    '  évaluations, historique des actions et liens de partage).',
    ...(avecCv ? ['- cv.pdf : le CV transmis.'] : []),
    '',
    'Les membres de l’équipe de recrutement ne sont pas nommés : seules vos données y figurent.',
    '',
  ].join('\r\n')

// Nom de fichier sans accents ni caractères spéciaux : « donnees-alice-martin-2026-03-12.zip »
export function nomArchive(nom: string, date = new Date()) {
  const simple =
    nom
      .normalize('NFD')
      .replace(/\p{Diacritic}/gu, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 40) || 'candidat'
  const jour = [date.getFullYear(), date.getMonth() + 1, date.getDate()]
    .map((n) => String(n).padStart(2, '0'))
    .join('-')
  return `donnees-${simple}-${jour}.zip`
}

// Télécharge une archive ZIP de toutes les données du candidat (et son CV), puis note la demande
// d'accès au registre
export async function exporterCandidature(
  candidature: Pick<Candidature, 'id' | 'nom' | 'cv_chemin'>,
) {
  const { data, error } = await client().rpc('exporter_candidature', {
    id_candidature: candidature.id,
  })
  if (error) throw new Error(error.message)
  if (!data) throw new Error('Candidature introuvable dans l’espace actif : rechargez la page.')
  const donnees = data as { responsable: string }
  const maintenant = new Date()
  const fichiers: Record<string, Uint8Array> = {}
  const texte = (contenu: string) => new TextEncoder().encode(contenu)
  fichiers['donnees.json'] = texte(
    JSON.stringify({ exporte_le: maintenant.toISOString(), ...donnees }, null, 2),
  )
  if (candidature.cv_chemin) fichiers['cv.pdf'] = await lireCv(candidature.cv_chemin)
  fichiers['lisez-moi.txt'] = texte(
    LISEZ_MOI(
      candidature.nom,
      donnees.responsable,
      maintenant.toLocaleDateString('fr-FR', { dateStyle: 'long' }),
      !!candidature.cv_chemin,
    ),
  )
  // Bibliothèque de compression chargée à la demande
  const { zipSync } = await import('fflate')
  telechargerFichier(
    zipSync(fichiers) as Uint8Array<ArrayBuffer>,
    nomArchive(candidature.nom, maintenant),
    'application/zip',
  )
  await noter('acces')
}

// Efface la candidature et tout ce qui s'y rattache (notes, entretiens, évaluations, historique,
// liens de partage, CV), puis note l'effacement au registre. Renvoie un avertissement si
// l'effacement a réussi mais pas l'inscription au registre.
export async function effacerCandidature(candidature: Candidature): Promise<string | null> {
  await supprimerCandidature(candidature)
  try {
    await noter('effacement')
    return null
  } catch (e) {
    return `Candidature effacée, mais la demande n’a pas pu être inscrite au registre : ${e instanceof Error ? e.message : String(e)}`
  }
}

export async function listerDemandes(): Promise<DemandeRgpd[]> {
  const { data, error } = await client()
    .from('demandes_rgpd')
    .select('id, email, action, created_at')
    .order('created_at', { ascending: false })
    .limit(LIMITE_REGISTRE)
  if (error) throw new Error(error.message)
  return data as DemandeRgpd[]
}

// Durée de conservation (supabase/migrations/0027_conservation.sql) : null = pas de suppression
// automatique
export const DUREES_CONSERVATION = [6, 12, 24, 36, 60] as const

export interface CandidatureAExpirer {
  id: string
  nom: string
  expire_le: string
}

export async function lireConservation(espaceId: string): Promise<number | null> {
  const { data, error } = await client()
    .from('espaces')
    .select('conservation_mois')
    .eq('id', espaceId)
    .single()
  if (error) throw new Error(error.message)
  return (data as { conservation_mois: number | null }).conservation_mois
}

// Réservé au propriétaire (règle d'accès de la table espaces)
export async function reglerConservation(espaceId: string, mois: number | null) {
  const { data, error } = await client()
    .from('espaces')
    .update({ conservation_mois: mois })
    .eq('id', espaceId)
    .select('id')
  if (error) throw new Error(error.message)
  if (data?.length !== 1)
    throw new Error('Seul le propriétaire de l’espace peut régler la durée de conservation.')
}

// Candidatures de l'espace actif supprimées dans les 30 jours, la plus proche d'abord
export async function listerAExpirer(): Promise<CandidatureAExpirer[]> {
  const { data, error } = await client().rpc('candidatures_a_expirer')
  if (error) throw new Error(error.message)
  return (data ?? []) as CandidatureAExpirer[]
}

export function libelleDemande(action: DemandeRgpd['action']) {
  if (action === 'acces') return 'Accès (export)'
  if (action === 'effacement') return 'Effacement'
  return 'Suppression automatique (durée de conservation)'
}
