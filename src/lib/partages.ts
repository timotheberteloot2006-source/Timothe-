import type { PostgrestError } from '@supabase/postgrest-js'
import { appelerFonction } from './fonctions'
import { SUPABASE_NON_CONFIGURE, supabase } from './supabase'

// Liens de partage d'une candidature (supabase/migrations/0023_partages.sql)
export interface Partage {
  id: string
  jeton: string
  avec_cv: boolean
  avec_notes: boolean
  expire_le: string
  revoque_le: string | null
  consultations: number
  derniere_consultation: string | null
  created_at: string
}

// Ce que voit la personne qui ouvre le lien (fonction SQL lire_partage)
export interface CandidaturePartagee {
  nom: string
  poste: string | null
  experience: number
  competences: string[]
  recue_le: string
  expire_le: string
  espace: string
  offre: string | null
  etape: string | null
  etiquettes: string[]
  evaluation: { critere: string; moyenne: number }[]
  // Un CV à ouvrir ; notes : null si elles ne sont pas partagées
  cv: boolean
  notes: { contenu: string; le: string }[] | null
}

export const DUREES = { 1: '24 heures', 7: '7 jours', 30: '30 jours' } as const
export type Duree = keyof typeof DUREES

export const NOMBRE_MAX_PARTAGES = 10

function client() {
  if (!supabase) throw new Error(SUPABASE_NON_CONFIGURE)
  return supabase
}

function erreurPartage(error: Pick<PostgrestError, 'code' | 'message'>) {
  if (error.message.startsWith('trop_de_partages'))
    return new Error(
      `${NOMBRE_MAX_PARTAGES} liens valables au plus par candidature : révoquez-en un d’abord.`,
    )
  return new Error(error.message)
}

const COLONNES =
  'id, jeton, avec_cv, avec_notes, expire_le, revoque_le, consultations, derniere_consultation, created_at'

// Les plus récents d'abord
export async function listerPartages(candidatureId: string): Promise<Partage[]> {
  const { data, error } = await client()
    .from('partages')
    .select(COLONNES)
    .eq('candidature_id', candidatureId)
    .order('created_at', { ascending: false })
  if (error) throw erreurPartage(error)
  return data as Partage[]
}

export async function creerPartage(
  candidatureId: string,
  options: { jours: Duree; avecCv: boolean; avecNotes: boolean },
  maintenant = Date.now(),
): Promise<Partage> {
  const { data, error } = await client()
    .from('partages')
    .insert({
      candidature_id: candidatureId,
      avec_cv: options.avecCv,
      avec_notes: options.avecNotes,
      // Ramenée à 30 jours au plus par la base (horloge de l'appareil en avance)
      expire_le: new Date(maintenant + options.jours * 24 * 3600 * 1000).toISOString(),
    })
    .select(COLONNES)
    .single()
  if (error) throw erreurPartage(error)
  return data as Partage
}

export async function revoquerPartage(id: string) {
  const { error } = await client().rpc('revoquer_partage', { id_partage: id })
  if (error) throw erreurPartage(error)
}

// null : lien inconnu, révoqué ou expiré
export async function lirePartage(jeton: string): Promise<CandidaturePartagee | null> {
  const { data, error } = await client().rpc('lire_partage', { code: jeton })
  // Jeton mal formé (pas un uuid) : même réponse qu'un lien inconnu
  if (error?.code === '22P02') return null
  if (error) throw new Error(error.message)
  return (data as CandidaturePartagee | null) ?? null
}

// Ouvre le CV partagé dans un nouvel onglet (lien signé donné par supabase/functions/cv-partage)
export async function ouvrirCvPartage(jeton: string) {
  // L'onglet est ouvert tout de suite (sinon le navigateur bloque la fenêtre surgissante)
  const onglet = window.open('', '_blank')
  try {
    const reponse = await appelerFonction<{ url: string }>('cv-partage', { jeton })
    if (!reponse?.url) throw new Error('Lien du CV manquant.')
    if (onglet) onglet.location.href = reponse.url
    else window.location.assign(reponse.url)
  } catch (e) {
    onglet?.close()
    throw e
  }
}

export function lienPartage(jeton: string, origine = window.location.origin) {
  return `${origine}/partage/${jeton}`
}

export function etatPartage(partage: Partage, maintenant = Date.now()) {
  if (partage.revoque_le) return 'revoque' as const
  if (new Date(partage.expire_le).getTime() <= maintenant) return 'expire' as const
  return 'valable' as const
}
