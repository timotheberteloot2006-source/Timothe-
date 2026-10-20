import { FunctionsHttpError } from '@supabase/supabase-js'
import { SUPABASE_NON_CONFIGURE, supabase } from './supabase'

// Même valeur que dans supabase/migrations/0004_abonnements.sql
export const LIMITE_GRATUITE = 50

// Prix affiché sur la page Tarifs ; le vrai prix est celui configuré dans Stripe
export const PRIX_PRO = 'Prix à définir'

export interface Abonnement {
  // Statut Stripe : active, trialing, past_due, canceled…
  statut: string | null
  fin_periode: string | null
}

export function estPro(abonnement: Abonnement | null) {
  return abonnement?.statut === 'active' || abonnement?.statut === 'trialing'
}

// Paiement échoué ou incomplet : à régulariser dans le portail Stripe
export function paiementEnAttente(abonnement: Abonnement | null) {
  return ['past_due', 'unpaid', 'incomplete'].includes(abonnement?.statut ?? '')
}

// pro : l'espace est couvert par l'offre Pro de son propriétaire
export function placesRestantes(pro: boolean, nombreCandidatures: number) {
  if (pro) return Infinity
  return Math.max(0, LIMITE_GRATUITE - nombreCandidatures)
}

export async function lireAbonnement(): Promise<Abonnement | null> {
  if (!supabase) throw new Error(SUPABASE_NON_CONFIGURE)
  const { data, error } = await supabase
    .from('abonnements')
    .select('statut, fin_periode')
    .maybeSingle()
  if (error) throw new Error(error.message)
  return data
}

// Redirige vers le paiement Stripe (fonction supabase/functions/creer-checkout)
export function demarrerPaiement() {
  return redirigerVers('creer-checkout')
}

// Redirige vers le portail client Stripe (fonction supabase/functions/portail-client)
export function ouvrirPortail() {
  return redirigerVers('portail-client')
}

async function redirigerVers(fonction: string) {
  if (!supabase) throw new Error(SUPABASE_NON_CONFIGURE)
  const { data, error } = await supabase.functions.invoke<{ url: string }>(fonction)
  if (error) {
    // Les fonctions renvoient { erreur } avec un message lisible
    const corps =
      error instanceof FunctionsHttpError ? await error.context.json().catch(() => null) : null
    throw new Error(corps?.erreur ?? error.message)
  }
  if (!data?.url) throw new Error('Réponse inattendue du serveur de paiement.')
  window.location.assign(data.url)
}
