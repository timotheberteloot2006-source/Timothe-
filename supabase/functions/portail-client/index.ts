// Ouvre le portail client Stripe (moyen de paiement, factures, résiliation) et renvoie son URL
import { corsHeaders, json, SITE_URL, stripe, supabaseAdmin, utilisateur } from '../_shared/stripe.ts'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const user = await utilisateur(req)
  if (!user) return json({ erreur: 'Non connecté.' }, 401)

  const { data: abonnement } = await supabaseAdmin()
    .from('abonnements')
    .select('stripe_customer_id')
    .eq('user_id', user.id)
    .maybeSingle()
  if (!abonnement) return json({ erreur: 'Aucun abonnement.' }, 404)

  const session = await stripe.billingPortal.sessions.create({
    customer: abonnement.stripe_customer_id,
    return_url: `${SITE_URL}/compte`,
  })
  return json({ url: session.url })
})
