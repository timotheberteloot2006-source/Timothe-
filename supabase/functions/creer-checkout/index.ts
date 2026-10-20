// Crée une session de paiement Stripe Checkout pour l'offre Pro et renvoie son URL
import { corsHeaders, json, SITE_URL, stripe, supabaseAdmin, utilisateur } from '../_shared/stripe.ts'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const user = await utilisateur(req)
  if (!user) return json({ erreur: 'Non connecté.' }, 401)

  const prix = Deno.env.get('STRIPE_PRICE_PRO')
  if (!prix) return json({ erreur: 'STRIPE_PRICE_PRO non configuré.' }, 500)

  const admin = supabaseAdmin()
  const { data: abonnement } = await admin
    .from('abonnements')
    .select('stripe_customer_id, statut')
    .eq('user_id', user.id)
    .maybeSingle()

  if (abonnement?.statut === 'active' || abonnement?.statut === 'trialing') {
    return json({ erreur: 'Vous avez déjà l’offre Pro.' }, 409)
  }

  // Un seul client Stripe par utilisateur, créé au premier paiement
  let clientId = abonnement?.stripe_customer_id
  if (!clientId) {
    const client = await stripe.customers.create({
      email: user.email,
      metadata: { user_id: user.id },
    })
    clientId = client.id
    const { error } = await admin
      .from('abonnements')
      .insert({ user_id: user.id, stripe_customer_id: clientId })
    if (error) return json({ erreur: error.message }, 500)
  }

  const session = await stripe.checkout.sessions.create({
    mode: 'subscription',
    customer: clientId,
    line_items: [{ price: prix, quantity: 1 }],
    success_url: `${SITE_URL}/compte?abonnement=ok`,
    cancel_url: `${SITE_URL}/tarifs`,
    locale: 'fr',
  })
  return json({ url: session.url })
})
