import type { PostgrestError } from '@supabase/postgrest-js'
import { appelerFonction } from './fonctions'
import { SUPABASE_NON_CONFIGURE, supabase } from './supabase'

// Modèles de réponse de l'espace (supabase/migrations/0019_modeles_reponse.sql)
export interface Modele {
  id: string
  nom: string
  sujet: string
  corps: string
}

export type NouveauModele = Omit<Modele, 'id'>

function table() {
  if (!supabase) throw new Error(SUPABASE_NON_CONFIGURE)
  return supabase.from('modeles_reponse')
}

function erreurModele(error: PostgrestError) {
  if (error.code === '23505') return new Error('Un modèle porte déjà ce nom.')
  if (error.code === '23514') return new Error('Nom, objet et message sont obligatoires.')
  return new Error(error.message)
}

export async function listerModeles(): Promise<Modele[]> {
  const { data, error } = await table().select('id, nom, sujet, corps').order('nom')
  if (error) throw erreurModele(error)
  return data
}

const nettoyer = (m: NouveauModele) => ({
  nom: m.nom.trim(),
  sujet: m.sujet.trim(),
  corps: m.corps.trim(),
})

export async function creerModele(modele: NouveauModele) {
  const { error } = await table().insert(nettoyer(modele))
  if (error) throw erreurModele(error)
}

export async function modifierModele(id: string, modele: NouveauModele) {
  const { error } = await table().update(nettoyer(modele)).eq('id', id)
  if (error) throw erreurModele(error)
}

export async function supprimerModele(id: string) {
  const { error } = await table().delete().eq('id', id)
  if (error) throw erreurModele(error)
}

// Envoie la réponse au candidat (supabase/functions/envoyer-reponse) ; les variables sont
// remplacées par le serveur
export async function envoyerReponse(reponse: {
  candidature: string
  sujet: string
  corps: string
  modele: string | null
}) {
  await appelerFonction<{ envoye: true }>('envoyer-reponse', reponse)
}
