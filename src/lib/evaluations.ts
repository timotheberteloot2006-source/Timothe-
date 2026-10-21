import type { PostgrestError } from '@supabase/postgrest-js'
import { SUPABASE_NON_CONFIGURE, supabase } from './supabase'

// Grille de critères et notes de 1 à 5 (supabase/migrations/0020_evaluations.sql)
export interface Critere {
  id: string
  nom: string
  position: number
}

export interface Evaluation {
  critere_id: string
  // null : compte de l'évaluateur supprimé
  user_id: string | null
  note: number
}

export interface Moyenne {
  moyenne: number
  evaluateurs: number
}

export const NOMBRE_MAX_CRITERES = 10

function client() {
  if (!supabase) throw new Error(SUPABASE_NON_CONFIGURE)
  return supabase
}

function erreurEvaluation(error: Pick<PostgrestError, 'code' | 'message'>) {
  if (error.code === '23505') return new Error('Un critère porte déjà ce nom.')
  if (error.message.startsWith('trop_de_criteres'))
    return new Error(`${NOMBRE_MAX_CRITERES} critères au plus par espace.`)
  if (error.code === '42501')
    return new Error('Seul le propriétaire de l’espace peut modifier la grille.')
  return new Error(error.message)
}

export async function listerCriteres(): Promise<Critere[]> {
  const { data, error } = await client()
    .from('criteres')
    .select('id, nom, position')
    .order('position')
  if (error) throw erreurEvaluation(error)
  return data
}

export async function creerCritere(nom: string) {
  const { error } = await client().from('criteres').insert({ nom: nom.trim() })
  if (error) throw erreurEvaluation(error)
}

export async function renommerCritere(id: string, nom: string) {
  const { error } = await client().from('criteres').update({ nom: nom.trim() }).eq('id', id)
  if (error) throw erreurEvaluation(error)
}

// Supprime aussi les notes données sur ce critère
export async function supprimerCritere(id: string) {
  const { error } = await client().from('criteres').delete().eq('id', id)
  if (error) throw erreurEvaluation(error)
}

export async function listerEvaluations(candidatureId: string): Promise<Evaluation[]> {
  const { data, error } = await client()
    .from('evaluations')
    .select('critere_id, user_id, note')
    .eq('candidature_id', candidatureId)
  if (error) throw erreurEvaluation(error)
  return data
}

// Note de l'utilisateur connecté (remplace sa note précédente sur ce critère)
export async function noter(candidatureId: string, critereId: string, note: number) {
  const { error } = await client()
    .from('evaluations')
    .upsert(
      { candidature_id: candidatureId, critere_id: critereId, note },
      { onConflict: 'candidature_id,critere_id,user_id' },
    )
  if (error) throw erreurEvaluation(error)
}

// La base n'efface que les notes de l'utilisateur connecté
export async function effacerNote(candidatureId: string, critereId: string, userId: string) {
  const { error } = await client()
    .from('evaluations')
    .delete()
    .eq('candidature_id', candidatureId)
    .eq('critere_id', critereId)
    .eq('user_id', userId)
  if (error) throw erreurEvaluation(error)
}

// Moyenne de chaque candidature évaluée de l'espace actif
export async function listerMoyennes(): Promise<Map<string, Moyenne>> {
  const { data, error } = await client().rpc('moyennes_evaluations')
  if (error) throw erreurEvaluation(error)
  return new Map(
    (
      (data ?? []) as { candidature_id: string; moyenne: number | string; evaluateurs: number }[]
    ).map((m) => [m.candidature_id, { moyenne: Number(m.moyenne), evaluateurs: m.evaluateurs }]),
  )
}

const arrondir = (n: number) => Math.round(n * 10) / 10

// Pour la fiche : ma note, la moyenne de l'équipe et le nombre de notes, par critère ; moyenne
// générale (toutes les notes) et nombre d'évaluateurs
export function resumerEvaluations(
  evaluations: Evaluation[],
  criteres: Critere[],
  userId: string | undefined,
) {
  const parCritere = criteres.map((critere) => {
    const notes = evaluations.filter((e) => e.critere_id === critere.id)
    return {
      critere,
      mienne: notes.find((e) => userId && e.user_id === userId)?.note ?? null,
      moyenne: notes.length ? arrondir(notes.reduce((s, e) => s + e.note, 0) / notes.length) : null,
      nombre: notes.length,
    }
  })
  const toutes = evaluations.filter((e) => criteres.some((c) => c.id === e.critere_id))
  return {
    parCritere,
    moyenne: toutes.length
      ? arrondir(toutes.reduce((s, e) => s + e.note, 0) / toutes.length)
      : null,
    // Notes d'un compte supprimé : on ne sait plus qui les a données, comptées par critère
    evaluateurs: new Set(toutes.map((e) => e.user_id ?? `supprime-${e.critere_id}`)).size,
  }
}

// « 4,2 »
export function formaterNote(note: number) {
  return note.toLocaleString('fr-FR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })
}
