import type { PostgrestError } from '@supabase/postgrest-js'
import { supprimerFichiersCv } from './cv'
import { SUPABASE_NON_CONFIGURE, supabase } from './supabase'

// Clé de l'étape de recrutement (src/lib/etapes.ts) : « nouveau », « retenu », « ecarte » ou une
// étape ajoutée par l'espace
export type Statut = string

export interface Candidature {
  id: string
  nom: string
  email: string | null
  poste: string | null
  competences: string[]
  experience: number
  statut: Statut
  created_at: string
  // Chemin du PDF dans le bucket « cv » (supabase/migrations/0005_notes_et_cv.sql)
  cv_chemin: string | null
  // Offre d'emploi rattachée (supabase/migrations/0006_offres.sql)
  offre_id: string | null
  // Espace auquel appartient la candidature (supabase/migrations/0008_espaces.sql)
  espace_id: string
  // Rempli par listerCandidatures uniquement
  nb_notes?: number
}

export type NouvelleCandidature = Pick<
  Candidature,
  'nom' | 'email' | 'poste' | 'competences' | 'experience'
> & { offre_id?: string | null }

// Table créée par supabase/migrations/0001_candidatures.sql
function table() {
  if (!supabase) throw new Error(SUPABASE_NON_CONFIGURE)
  return supabase.from('candidatures')
}

// L'API renvoie au plus 1000 lignes par requête : on lit par tranches jusqu'à la dernière
const TRANCHE = 1000

export async function listerCandidatures(): Promise<Candidature[]> {
  const lignes: Candidature[] = []
  for (let debut = 0; ; debut += TRANCHE) {
    const { data, error } = await table()
      .select('*, notes(count)')
      .order('created_at', { ascending: false })
      .order('id')
      .range(debut, debut + TRANCHE - 1)
    if (error) throw erreurSupabase(error)
    // notes(count) renvoie [{ count: n }]
    lignes.push(
      ...data.map(({ notes, ...candidature }) => ({
        ...candidature,
        nb_notes: notes?.[0]?.count ?? 0,
      })),
    )
    // Une candidature ajoutée pendant la lecture décale les tranches suivantes : la dernière
    // d'une tranche peut revenir en tête de la suivante
    if (data.length < TRANCHE) return [...new Map(lignes.map((c) => [c.id, c])).values()]
  }
}

export async function lireCandidature(id: string): Promise<Candidature | null> {
  const { data, error } = await table().select('*').eq('id', id).maybeSingle()
  if (error) throw erreurSupabase(error)
  return data
}

export async function ajouterCandidature(candidature: NouvelleCandidature) {
  const { error } = await table().insert(candidature)
  if (error) throw erreurSupabase(error)
}

export async function ajouterCandidatures(candidatures: NouvelleCandidature[]) {
  const { error } = await table().insert(candidatures)
  if (error) throw erreurSupabase(error)
}

export async function modifierCandidature(id: string, champs: NouvelleCandidature) {
  const { error } = await table().update(champs).eq('id', id)
  if (error) throw erreurSupabase(error)
}

export async function changerStatut(id: string, statut: Statut) {
  const { error } = await table().update({ statut }).eq('id', id)
  if (error) throw erreurSupabase(error)
}

export async function supprimerCandidature(candidature: Candidature) {
  // Le fichier n'est pas supprimé automatiquement avec la ligne
  if (candidature.cv_chemin) await supprimerFichiersCv([candidature.cv_chemin])
  const { error } = await table().delete().eq('id', candidature.id)
  if (error) throw erreurSupabase(error)
}

export async function changerStatutGroupe(ids: string[], statut: Statut) {
  if (ids.length === 0) return
  const { error } = await table().update({ statut }).in('id', ids)
  if (error) throw erreurSupabase(error)
}

export async function supprimerCandidatures(candidatures: Candidature[]) {
  if (candidatures.length === 0) return
  const chemins = candidatures.flatMap((c) => (c.cv_chemin ? [c.cv_chemin] : []))
  await supprimerFichiersCv(chemins)
  const { error } = await table()
    .delete()
    .in(
      'id',
      candidatures.map((c) => c.id),
    )
  if (error) throw erreurSupabase(error)
}

// Violation de l'index unique de supabase/migrations/0002_candidatures_email_unique.sql
const VIOLATION_UNICITE = '23505'

function erreurSupabase(error: PostgrestError) {
  if (error.code === VIOLATION_UNICITE) {
    return new Error('Une candidature avec cet e-mail existe déjà.')
  }
  // Levée par le trigger de supabase/migrations/0004_abonnements.sql
  if (error.message.startsWith('limite_gratuite')) {
    return new Error(
      "Limite de l'offre Gratuite atteinte (50 candidatures) : passez à Pro pour en ajouter d'autres.",
    )
  }
  return new Error(error.message)
}

type Identite = Pick<Candidature, 'nom' | 'email'>

// Même e-mail quand les deux en ont un ; sinon même nom (sans accents ni majuscules)
export function estDoublon(a: Identite, b: Identite) {
  if (a.email && b.email) return a.email.trim().toLowerCase() === b.email.trim().toLowerCase()
  return normaliser(a.nom) === normaliser(b.nom)
}

// « React, TypeScript ; SQL » → ['React', 'TypeScript', 'SQL']
export function decouperCompetences(texte: string): string[] {
  const vues = new Set<string>()
  return texte
    .split(/[,;]/)
    .map((c) => c.trim())
    .filter((c) => {
      const cle = normaliser(c)
      if (!cle || vues.has(cle)) return false
      vues.add(cle)
      return true
    })
}

// Comparaison insensible à la casse et aux accents
export function normaliser(texte: string) {
  return texte
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .trim()
}
