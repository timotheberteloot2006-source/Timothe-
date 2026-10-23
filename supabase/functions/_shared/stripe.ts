import Stripe from 'npm:stripe@17.7.0'

export const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY') ?? '', {
  httpClient: Stripe.createFetchHttpClient(),
})

// Abonnement qui prélève ou va prélever : même liste que public.abonnement_en_cours
// (supabase/migrations/0012_relecture_securite.sql), qui empêche aussi de supprimer le compte
export const STATUTS_EN_COURS = new Set(['active', 'trialing', 'past_due', 'unpaid', 'incomplete'])

// Paiement à régulariser dans le portail : un second abonnement serait aussi prélevé. Pas
// « incomplete » (premier paiement non abouti) : le portail ne permet pas de le régler, Stripe
// l'abandonne de lui-même, et un nouveau paiement doit rester possible.
// Même liste que paiementEnAttente (src/lib/abonnement.ts).
export const STATUTS_A_REGULARISER = new Set(['past_due', 'unpaid'])

export { corsHeaders, json, SITE_URL, supabaseAdmin, utilisateur } from './http.ts'
