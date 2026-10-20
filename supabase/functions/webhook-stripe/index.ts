// Reçoit les événements Stripe et met à jour la table abonnements.
// À déployer sans vérification de jeton Supabase : l'authenticité vient de la signature Stripe.
import type Stripe from 'npm:stripe@17.7.0'
import { json, stripe, supabaseAdmin } from '../_shared/stripe.ts'

const EVENEMENTS = new Set([
  'customer.subscription.created',
  'customer.subscription.updated',
  'customer.subscription.deleted',
])

Deno.serve(async (req) => {
  const signature = req.headers.get('Stripe-Signature')
  if (!signature) return json({ erreur: 'Signature manquante.' }, 400)

  let evenement: Stripe.Event
  try {
    evenement = await stripe.webhooks.constructEventAsync(
      await req.text(),
      signature,
      Deno.env.get('STRIPE_WEBHOOK_SECRET') ?? '',
    )
  } catch (e) {
    return json({ erreur: `Signature invalide : ${e instanceof Error ? e.message : e}` }, 400)
  }

  if (!EVENEMENTS.has(evenement.type)) return json({ recu: true })

  const abonnement = evenement.data.object as Stripe.Subscription
  const clientId =
    typeof abonnement.customer === 'string' ? abonnement.customer : abonnement.customer.id
  const { error } = await supabaseAdmin()
    .from('abonnements')
    .update({
      stripe_subscription_id: abonnement.id,
      statut: abonnement.status,
      fin_periode: new Date(finPeriode(abonnement) * 1000).toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('stripe_customer_id', clientId)

  // Une erreur 500 fait renvoyer l'événement par Stripe plus tard
  if (error) return json({ erreur: error.message }, 500)
  return json({ recu: true })
})

// Selon la version d'API Stripe, la fin de période est sur l'abonnement ou sur ses lignes
function finPeriode(abonnement: Stripe.Subscription): number {
  const ligne = abonnement.items.data[0] as { current_period_end?: number } | undefined
  return ligne?.current_period_end ?? abonnement.current_period_end
}
