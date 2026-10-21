import type { PostgrestError } from '@supabase/postgrest-js'
import { SUPABASE_NON_CONFIGURE, supabase } from './supabase'

// Étapes de recrutement de l'espace (supabase/migrations/0015_etapes.sql) ; le statut d'une
// candidature est la clé de son étape
export interface Etape {
  id: string
  cle: string
  nom: string
  position: number
}

// Toujours présentes : « nouveau » en premier (où arrivent les candidatures), « retenu » et
// « ecarte » ; renommables, pas supprimables
export const CLES_DE_BASE = ['nouveau', 'retenu', 'ecarte'] as const

// Avant chargement des étapes, ou pour un espace qui n'en a pas ajouté
export const ETAPES_DE_BASE: Etape[] = [
  { id: 'nouveau', cle: 'nouveau', nom: 'Nouveau', position: 0 },
  { id: 'retenu', cle: 'retenu', nom: 'Retenu', position: 1000000 },
  { id: 'ecarte', cle: 'ecarte', nom: 'Écarté', position: 2000000 },
]

export const NOMBRE_MAX_ETAPES = 12

export function estDeBase(cle: string) {
  return (CLES_DE_BASE as readonly string[]).includes(cle)
}

export function nomsEtapes(etapes: Etape[]) {
  return new Map(etapes.map((e) => [e.cle, e.nom]))
}

// Badge et pastille : couleurs des étapes de base, les étapes ajoutées en indigo
const COULEURS: Record<string, { badge: string; pastille: string; bordure: string }> = {
  nouveau: {
    badge: 'bg-slate-100 text-slate-700',
    pastille: 'bg-slate-400',
    bordure: 'border-t-slate-400',
  },
  retenu: {
    badge: 'bg-green-100 text-green-800',
    pastille: 'bg-green-600',
    bordure: 'border-t-green-600',
  },
  ecarte: { badge: 'bg-red-100 text-red-800', pastille: 'bg-red-600', bordure: 'border-t-red-600' },
}
const COULEUR_AJOUTEE = {
  badge: 'bg-indigo-100 text-indigo-800',
  pastille: 'bg-indigo-500',
  bordure: 'border-t-indigo-500',
}

export function couleurEtape(cle: string) {
  return COULEURS[cle] ?? COULEUR_AJOUTEE
}

function table() {
  if (!supabase) throw new Error(SUPABASE_NON_CONFIGURE)
  return supabase.from('etapes')
}

function erreurEtape(error: Pick<PostgrestError, 'code' | 'message'>) {
  if (error.code === '23505') return new Error('Une étape porte déjà ce nom.')
  if (error.message.startsWith('trop_d_etapes'))
    return new Error(`${NOMBRE_MAX_ETAPES} étapes au plus par espace.`)
  if (error.message.startsWith('etape_protegee'))
    return new Error('Seules les étapes ajoutées peuvent être supprimées, par le propriétaire.')
  if (error.code === '42501')
    return new Error('Seul le propriétaire de l’espace peut modifier les étapes.')
  return new Error(error.message)
}

export async function listerEtapes(): Promise<Etape[]> {
  const { data, error } = await table().select('id, cle, nom, position').order('position')
  if (error) throw erreurEtape(error)
  // Base pas encore migrée : on garde les trois étapes habituelles
  return data.length > 0 ? data : ETAPES_DE_BASE
}

// Avec le nombre de candidatures de chaque étape (clé étrangère candidatures → etapes)
export async function compterParEtape(): Promise<Record<string, number>> {
  const { data, error } = await table().select('cle, candidatures(count)')
  if (error) throw erreurEtape(error)
  // candidatures(count) renvoie [{ count: n }]
  return Object.fromEntries(
    data.map((e) => [e.cle, (e.candidatures as unknown as { count: number }[])?.[0]?.count ?? 0]),
  )
}

// Placée avant « Retenu » par la base
export async function creerEtape(nom: string) {
  const { error } = await table().insert({ nom: nom.trim() })
  if (error) throw erreurEtape(error)
}

export async function renommerEtape(id: string, nom: string) {
  const { error } = await table().update({ nom: nom.trim() }).eq('id', id)
  if (error) throw erreurEtape(error)
}

// Échange la place d'une étape avec sa voisine (« Nouveau » reste toujours la première)
export async function deplacerEtape(etapes: Etape[], id: string, sens: -1 | 1) {
  const index = etapes.findIndex((e) => e.id === id)
  const voisine = etapes[index + sens]
  const etape = etapes[index]
  if (!etape || !voisine || etape.cle === 'nouveau' || voisine.cle === 'nouveau') return
  for (const [cible, position] of [
    [etape, voisine.position],
    [voisine, etape.position],
  ] as const) {
    const { error } = await table().update({ position }).eq('id', cible.id)
    if (error) throw erreurEtape(error)
  }
}

// Renvoie le nombre de candidatures revenues à « Nouveau »
export async function supprimerEtape(id: string): Promise<number> {
  if (!supabase) throw new Error(SUPABASE_NON_CONFIGURE)
  const { data, error } = await supabase.rpc('supprimer_etape', { eid: id })
  if (error) throw erreurEtape(error)
  return data as number
}
