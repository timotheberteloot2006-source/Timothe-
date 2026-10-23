import { appelerFonction } from './fonctions'
import { SUPABASE_NON_CONFIGURE, supabase } from './supabase'

// Offre publiée (supabase/migrations/0013_formulaire_public.sql), lisible sans compte
export interface OffrePublique {
  titre: string
  description: string | null
  espace_nom: string
  // Faux quand l'espace ne peut plus recevoir de candidatures
  ouverte: boolean
}

// null : lien inconnu, régénéré ou formulaire désactivé
export async function lireOffrePublique(jeton: string): Promise<OffrePublique | null> {
  if (!supabase) throw new Error(SUPABASE_NON_CONFIGURE)
  const { data, error } = await supabase.rpc('lire_offre_publique', { code: jeton }).maybeSingle()
  // Jeton mal formé (pas un uuid) : même réponse qu'un lien inconnu
  if (error?.code === '22P02') return null
  if (error) throw new Error(error.message)
  return data as OffrePublique | null
}

// Envoie le formulaire (champs et CV) à supabase/functions/postuler
export async function envoyerCandidature(formulaire: FormData) {
  await appelerFonction<{ recu: true }>('postuler', formulaire)
}

// Adresse à communiquer aux candidats
export function lienFormulaire(jeton: string, origine = window.location.origin) {
  return `${origine}/postuler/${jeton}`
}
