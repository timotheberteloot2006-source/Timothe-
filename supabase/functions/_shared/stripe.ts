import Stripe from 'npm:stripe@17.7.0'

export const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY') ?? '', {
  httpClient: Stripe.createFetchHttpClient(),
})

// Adresse du site, pour les retours depuis Stripe (ex. https://filtre.fr)
export const SITE_URL = Deno.env.get('SITE_URL') ?? 'http://localhost:5173'

export { corsHeaders, json, supabaseAdmin, utilisateur } from './http.ts'
