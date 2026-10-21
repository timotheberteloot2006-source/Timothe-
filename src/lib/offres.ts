import type { PostgrestError } from '@supabase/postgrest-js'
import { SUPABASE_NON_CONFIGURE, supabase } from './supabase'

// Table créée par supabase/migrations/0006_offres.sql
export interface Offre {
  id: string
  titre: string
  created_at: string
  nb_candidatures: number
  // Formulaire de candidature public (supabase/migrations/0013_formulaire_public.sql)
  description: string | null
  publique: boolean
  jeton_public: string
}

function table() {
  if (!supabase) throw new Error(SUPABASE_NON_CONFIGURE)
  return supabase.from('offres')
}

function erreurOffre(error: PostgrestError) {
  // Index unique offres_user_titre_unique
  if (error.code === '23505') return new Error('Une offre porte déjà ce titre.')
  return new Error(error.message)
}

export async function listerOffres(): Promise<Offre[]> {
  const { data, error } = await table()
    .select('id, titre, created_at, description, publique, jeton_public, candidatures(count)')
    .order('titre')
  if (error) throw erreurOffre(error)
  // candidatures(count) renvoie [{ count: n }]
  return data.map(({ candidatures, ...offre }) => ({
    ...offre,
    nb_candidatures: candidatures?.[0]?.count ?? 0,
  }))
}

export async function creerOffre(titre: string) {
  const { error } = await table().insert({ titre: titre.trim() })
  if (error) throw erreurOffre(error)
}

export async function renommerOffre(id: string, titre: string) {
  const { error } = await table().update({ titre: titre.trim() }).eq('id', id)
  if (error) throw erreurOffre(error)
}

// Formulaire public : ouvert ou fermé, et texte présenté aux candidats
export async function modifierFormulaire(
  id: string,
  champs: Partial<Pick<Offre, 'publique' | 'description'>>,
) {
  const { error } = await table().update(champs).eq('id', id)
  if (error) throw erreurOffre(error)
}

// Nouveau lien : l'ancien ne fonctionne plus (s'il a été diffusé trop largement)
export async function nouveauLienFormulaire(id: string) {
  const { error } = await table().update({ jeton_public: crypto.randomUUID() }).eq('id', id)
  if (error) throw erreurOffre(error)
}

// Les candidatures rattachées sont conservées et détachées par la base
export async function supprimerOffre(id: string) {
  const { error } = await table().delete().eq('id', id)
  if (error) throw erreurOffre(error)
}

export function titresParId(offres: Offre[]) {
  return new Map(offres.map((o) => [o.id, o.titre]))
}
