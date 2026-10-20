import type { PostgrestError } from '@supabase/supabase-js'
import { SUPABASE_NON_CONFIGURE, supabase } from './supabase'

export const STATUTS = ['nouveau', 'retenu', 'ecarte'] as const
export type Statut = (typeof STATUTS)[number]

export const LIBELLES_STATUT: Record<Statut, string> = {
  nouveau: 'Nouveau',
  retenu: 'Retenu',
  ecarte: 'Écarté',
}

export interface Candidature {
  id: string
  nom: string
  email: string | null
  poste: string | null
  competences: string[]
  experience: number
  statut: Statut
  created_at: string
}

export type NouvelleCandidature = Pick<
  Candidature,
  'nom' | 'email' | 'poste' | 'competences' | 'experience'
>

// Table créée par supabase/migrations/0001_candidatures.sql
function table() {
  if (!supabase) throw new Error(SUPABASE_NON_CONFIGURE)
  return supabase.from('candidatures')
}

export async function listerCandidatures(): Promise<Candidature[]> {
  const { data, error } = await table().select('*').order('created_at', { ascending: false })
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

export async function supprimerCandidature(id: string) {
  const { error } = await table().delete().eq('id', id)
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
