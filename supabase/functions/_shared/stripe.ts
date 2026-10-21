import Stripe from 'npm:stripe@17.7.0'

export const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY') ?? '', {
  httpClient: Stripe.createFetchHttpClient(),
})

export { corsHeaders, json, SITE_URL, supabaseAdmin, utilisateur } from './http.ts'
