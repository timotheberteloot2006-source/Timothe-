import type { PostgrestError } from '@supabase/postgrest-js'
import { SUPABASE_NON_CONFIGURE, supabase } from './supabase'

// Étiquettes de l'espace et étiquettes posées sur les candidatures
// (supabase/migrations/0022_etiquettes.sql)
export interface Etiquette {
  id: string
  nom: string
  couleur: Couleur
}

export const NOMBRE_MAX_ETIQUETTES = 30

// Classes du badge, lisibles en clair comme en sombre (src/index.css)
export const COULEURS = {
  gris: { nom: 'Gris', badge: 'bg-slate-100 text-slate-700' },
  rouge: { nom: 'Rouge', badge: 'bg-red-100 text-red-800' },
  ambre: { nom: 'Ambre', badge: 'bg-amber-100 text-amber-800' },
  vert: { nom: 'Vert', badge: 'bg-green-100 text-green-800' },
  indigo: { nom: 'Indigo', badge: 'bg-indigo-50 text-indigo-700' },
} as const

export type Couleur = keyof typeof COULEURS

export function classeEtiquette(couleur: string) {
  return (COULEURS[couleur as Couleur] ?? COULEURS.gris).badge
}

function client() {
  if (!supabase) throw new Error(SUPABASE_NON_CONFIGURE)
  return supabase
}

function erreurEtiquette(error: Pick<PostgrestError, 'code' | 'message'>) {
  if (error.code === '23505') return new Error('Une étiquette porte déjà ce nom.')
  if (error.message.startsWith('trop_d_etiquettes'))
    return new Error(`${NOMBRE_MAX_ETIQUETTES} étiquettes au plus par espace.`)
  // Étiquette supprimée entre-temps par un autre membre
  if (error.code === '23503') return new Error('Cette étiquette n’existe plus : rechargez la page.')
  return new Error(error.message)
}

const comparerNoms = new Intl.Collator('fr', { sensitivity: 'base' }).compare

export async function listerEtiquettes(): Promise<Etiquette[]> {
  const { data, error } = await client().from('etiquettes').select('id, nom, couleur')
  if (error) throw erreurEtiquette(error)
  return (data as Etiquette[]).sort((a, b) => comparerNoms(a.nom, b.nom))
}

// Renvoie l'étiquette créée (pour la poser aussitôt)
export async function creerEtiquette(nom: string, couleur: Couleur = 'gris'): Promise<Etiquette> {
  const { data, error } = await client()
    .from('etiquettes')
    .insert({ nom: nom.trim(), couleur })
    .select('id, nom, couleur')
    .single()
  if (error) throw erreurEtiquette(error)
  return data as Etiquette
}

export async function modifierEtiquette(id: string, champs: { nom?: string; couleur?: Couleur }) {
  const { error } = await client()
    .from('etiquettes')
    .update(champs.nom === undefined ? champs : { ...champs, nom: champs.nom.trim() })
    .eq('id', id)
  if (error) throw erreurEtiquette(error)
}

// La retire aussi de toutes les candidatures
export async function supprimerEtiquette(id: string) {
  const { error } = await client().from('etiquettes').delete().eq('id', id)
  if (error) throw erreurEtiquette(error)
}

// L'API renvoie au plus 1000 lignes par requête : on lit par tranches
const TRANCHE = 1000

// Identifiants des étiquettes posées, par candidature, dans l'espace actif
export async function listerAttributions(): Promise<Map<string, string[]>> {
  const attributions = new Map<string, string[]>()
  for (let debut = 0; ; debut += TRANCHE) {
    const { data, error } = await client()
      .from('candidatures_etiquettes')
      .select('candidature_id, etiquette_id')
      .order('candidature_id')
      .order('etiquette_id')
      .range(debut, debut + TRANCHE - 1)
    if (error) throw erreurEtiquette(error)
    for (const { candidature_id, etiquette_id } of data) {
      const liste = attributions.get(candidature_id) ?? []
      // Une attribution ajoutée pendant la lecture peut revenir dans la tranche suivante
      if (!liste.includes(etiquette_id)) attributions.set(candidature_id, [...liste, etiquette_id])
    }
    if (data.length < TRANCHE) return attributions
  }
}

export async function listerEtiquettesCandidature(candidatureId: string): Promise<string[]> {
  const { data, error } = await client()
    .from('candidatures_etiquettes')
    .select('etiquette_id')
    .eq('candidature_id', candidatureId)
  if (error) throw erreurEtiquette(error)
  return data.map((a) => a.etiquette_id)
}

// Pose l'étiquette sur chaque candidature (sans effet là où elle est déjà)
export async function poserEtiquette(candidatureIds: string[], etiquetteId: string) {
  if (candidatureIds.length === 0) return
  const { error } = await client()
    .from('candidatures_etiquettes')
    .upsert(
      candidatureIds.map((candidature_id) => ({ candidature_id, etiquette_id: etiquetteId })),
      { onConflict: 'candidature_id,etiquette_id', ignoreDuplicates: true },
    )
  if (error) throw erreurEtiquette(error)
}

export async function retirerEtiquette(candidatureIds: string[], etiquetteId: string) {
  if (candidatureIds.length === 0) return
  const { error } = await client()
    .from('candidatures_etiquettes')
    .delete()
    .eq('etiquette_id', etiquetteId)
    .in('candidature_id', candidatureIds)
  if (error) throw erreurEtiquette(error)
}

// Étiquettes d'une candidature, dans l'ordre des étiquettes de l'espace
export function etiquettesDe(
  ids: readonly string[] | undefined,
  etiquettes: readonly Etiquette[],
): Etiquette[] {
  if (!ids?.length) return []
  return etiquettes.filter((e) => ids.includes(e.id))
}
