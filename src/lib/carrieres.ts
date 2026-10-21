import type { PostgrestError } from '@supabase/postgrest-js'
import { SUPABASE_NON_CONFIGURE, supabase } from './supabase'

// Page carrières d'un espace (supabase/migrations/0016_page_carrieres.sql)
export interface PageCarrieres {
  nom: string
  presentation: string | null
  // Offres dont le formulaire est en ligne ; jeton : lien /postuler/<jeton>
  offres: { titre: string; description: string | null; jeton: string }[]
}

export interface ReglagesCarrieres {
  slug: string | null
  carrieres_publiques: boolean
  presentation: string | null
}

export const ADRESSE_VALIDE = /^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$/

function client() {
  if (!supabase) throw new Error(SUPABASE_NON_CONFIGURE)
  return supabase
}

function erreurCarrieres(error: Pick<PostgrestError, 'code' | 'message'>) {
  if (error.code === '23505')
    return new Error('Cette adresse est déjà prise : choisissez-en une autre.')
  if (error.code === '23514')
    return new Error(
      'Adresse invalide : 3 à 40 caractères, minuscules sans accent, chiffres et tirets (pas au début ni à la fin).',
    )
  return new Error(error.message)
}

// Adresse proposée à partir du nom de l'espace : « Agence RH Lyon » → « agence-rh-lyon »
export function proposerAdresse(nom: string) {
  const adresse = nom
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
    .replace(/-+$/, '')
  return ADRESSE_VALIDE.test(adresse) ? adresse : ''
}

export function lienCarrieres(slug: string, origine = window.location.origin) {
  return `${origine}/carrieres/${slug}`
}

// Sans compte ; null : page inconnue ou pas en ligne
export async function lirePageCarrieres(adresse: string): Promise<PageCarrieres | null> {
  const { data, error } = await client().rpc('lire_page_carrieres', { adresse })
  if (error) throw erreurCarrieres(error)
  return data as PageCarrieres | null
}

export async function lireReglagesCarrieres(espaceId: string): Promise<ReglagesCarrieres> {
  const { data, error } = await client()
    .from('espaces')
    .select('slug, carrieres_publiques, presentation')
    .eq('id', espaceId)
    .single()
  if (error) throw erreurCarrieres(error)
  return data
}

// Réservé au propriétaire (règle de modification des espaces)
export async function reglerCarrieres(espaceId: string, reglages: ReglagesCarrieres) {
  const { error } = await client()
    .from('espaces')
    .update({
      slug: reglages.slug?.trim() || null,
      carrieres_publiques: reglages.carrieres_publiques,
      presentation: reglages.presentation?.trim() || null,
    })
    .eq('id', espaceId)
  if (error) throw erreurCarrieres(error)
}
