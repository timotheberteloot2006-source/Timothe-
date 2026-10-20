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
  if (error) throw new Error(error.message)
  return data
}

export async function ajouterCandidature(candidature: NouvelleCandidature) {
  const { error } = await table().insert(candidature)
  if (error) throw new Error(error.message)
}

export async function modifierCandidature(id: string, champs: NouvelleCandidature) {
  const { error } = await table().update(champs).eq('id', id)
  if (error) throw new Error(error.message)
}

export async function changerStatut(id: string, statut: Statut) {
  const { error } = await table().update({ statut }).eq('id', id)
  if (error) throw new Error(error.message)
}

export async function supprimerCandidature(id: string) {
  const { error } = await table().delete().eq('id', id)
  if (error) throw new Error(error.message)
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
