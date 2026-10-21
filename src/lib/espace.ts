import { SUPABASE_NON_CONFIGURE, supabase } from './supabase'

// Tables et fonctions de supabase/migrations/0008_espaces.sql

export type Role = 'proprietaire' | 'membre'

export interface Espace {
  id: string
  nom: string
  // Rôle de l'utilisateur connecté dans cet espace
  role: Role
  // Offre Pro du propriétaire, qui couvre tout l'espace
  est_pro: boolean
  nb_membres: number
}

export interface Membre {
  user_id: string
  email: string | null
  role: Role
  created_at: string
}

export interface Invitation {
  id: string
  jeton: string
  expire_le: string
}

export interface ApercuInvitation {
  espace_id: string
  espace_nom: string
  proprietaire_email: string | null
  valide: boolean
  deja_membre: boolean
}

export interface MonEspace {
  espace_id: string
  role: Role
  nom: string
}

function client() {
  if (!supabase) throw new Error(SUPABASE_NON_CONFIGURE)
  return supabase
}

export function erreurEspace(message: string) {
  if (message.startsWith('transfert_refuse'))
    return 'Transfert impossible : seul le propriétaire peut transférer l’espace, à l’un de ses membres.'
  if (message.startsWith('invitation_invalide'))
    return 'Ce lien d’invitation est invalide, expiré ou déjà utilisé.'
  if (message.startsWith('espace_inaccessible')) return 'Vous n’êtes pas membre de cet espace.'
  return message
}

async function rpc<T>(fonction: string, parametres?: Record<string, unknown>) {
  const { data, error } = await client().rpc(fonction, parametres)
  if (error) throw new Error(erreurEspace(error.message))
  return data as T
}

// Espace actif (celui dont le site affiche les données)
export async function lireEspace(): Promise<Espace> {
  const lignes = await rpc<Espace[]>('mon_espace')
  if (!lignes?.[0]) throw new Error('Espace introuvable.')
  return lignes[0]
}

export function choisirEspace(id: string) {
  return rpc<void>('choisir_espace', { eid: id })
}

// Tous les espaces dont l'utilisateur est membre
export async function listerMesEspaces(userId: string): Promise<MonEspace[]> {
  const { data, error } = await client()
    .from('membres')
    .select('espace_id, role, espaces(nom)')
    .eq('user_id', userId)
    .order('created_at')
  if (error) throw new Error(error.message)
  return data.map(({ espaces, ...membre }) => ({
    ...membre,
    nom: (espaces as unknown as { nom: string } | null)?.nom ?? '',
  }))
}

// Le nouveau propriétaire doit être membre ; l'ancien devient membre et reçoit un nouvel espace
export function transfererPropriete(espaceId: string, nouveauProprietaire: string) {
  return rpc<void>('transferer_propriete', { eid: espaceId, nouveau: nouveauProprietaire })
}

export async function renommerEspace(id: string, nom: string) {
  const { error } = await client().from('espaces').update({ nom: nom.trim() }).eq('id', id)
  if (error) throw new Error(error.message)
}

export async function listerMembres(espaceId: string): Promise<Membre[]> {
  const { data, error } = await client()
    .from('membres')
    .select('user_id, email, role, created_at')
    .eq('espace_id', espaceId)
    .order('created_at')
  if (error) throw new Error(error.message)
  return data
}

// Le propriétaire retire un membre, ou un membre quitte l'espace (userId = soi-même)
export async function retirerMembre(espaceId: string, userId: string) {
  const { error } = await client()
    .from('membres')
    .delete()
    .eq('espace_id', espaceId)
    .eq('user_id', userId)
  if (error) throw new Error(error.message)
}

// Invitations encore utilisables (propriétaire uniquement)
export async function listerInvitations(espaceId: string): Promise<Invitation[]> {
  const { data, error } = await client()
    .from('invitations')
    .select('id, jeton, expire_le')
    .eq('espace_id', espaceId)
    .is('utilisee_par', null)
    .gt('expire_le', new Date().toISOString())
    .order('created_at', { ascending: false })
  if (error) throw new Error(error.message)
  return data
}

export async function creerInvitation(espaceId: string) {
  const { error } = await client().from('invitations').insert({ espace_id: espaceId })
  if (error) throw new Error(error.message)
}

export async function revoquerInvitation(id: string) {
  const { error } = await client().from('invitations').delete().eq('id', id)
  if (error) throw new Error(error.message)
}

export async function lireInvitation(jeton: string): Promise<ApercuInvitation | null> {
  const lignes = await rpc<ApercuInvitation[]>('lire_invitation', { code: jeton })
  return lignes?.[0] ?? null
}

export function accepterInvitation(jeton: string) {
  return rpc<string>('accepter_invitation', { code: jeton })
}

export function lienInvitation(jeton: string) {
  return `${window.location.origin}/invitation/${jeton}`
}
