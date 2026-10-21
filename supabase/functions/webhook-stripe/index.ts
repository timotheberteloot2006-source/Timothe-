// Reçoit les événements Stripe et met à jour la table abonnements.
// À déployer sans vérification de jeton Supabase : l'authenticité vient de la signature Stripe.
import type Stripe from 'npm:stripe@17.7.0'
import { json, STATUTS_EN_COURS, stripe, supabaseAdmin } from '../_shared/stripe.ts'

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

  // Stripe ne garantit pas l'ordre des notifications, et deux événements d'une même seconde ont
  // la même date : on ne se fie pas au contenu de l'événement, on relit l'abonnement chez Stripe.
  // L'heure de cette lecture départage deux notifications traitées en même temps.
  const luLe = new Date().toISOString()
  let abonnement: Stripe.Subscription
  try {
    abonnement = await stripe.subscriptions.retrieve(
      (evenement.data.object as Stripe.Subscription).id,
    )
  } catch (e) {
    // Stripe renverra l'événement plus tard
    return json(
      { erreur: `Lecture de l'abonnement impossible : ${e instanceof Error ? e.message : e}` },
      500,
    )
  }
  const clientId =
    typeof abonnement.customer === 'string' ? abonnement.customer : abonnement.customer.id
  const admin = supabaseAdmin()

  // La fin d'un ancien abonnement ne doit pas écraser celui qui l'a remplacé et qui est toujours
  // en cours
  const { data: actuel, error: erreurLecture } = await admin
    .from('abonnements')
    .select('stripe_subscription_id, statut')
    .eq('stripe_customer_id', clientId)
    .maybeSingle()
  if (erreurLecture) return json({ erreur: erreurLecture.message }, 500)
  if (
    actuel?.stripe_subscription_id &&
    actuel.stripe_subscription_id !== abonnement.id &&
    STATUTS_EN_COURS.has(actuel.statut ?? '') &&
    !STATUTS_EN_COURS.has(abonnement.status)
  ) {
    return json({ recu: true, ignore: 'ancien abonnement' })
  }

  // Un état lu avant celui déjà enregistré est ignoré (condition vérifiée par la base, au moment
  // même de la mise à jour)
  const { error } = await admin
    .from('abonnements')
    .update({
      stripe_subscription_id: abonnement.id,
      statut: abonnement.status,
      fin_periode: new Date(finPeriode(abonnement) * 1000).toISOString(),
      stripe_evenement_le: luLe,
      updated_at: new Date().toISOString(),
    })
    .eq('stripe_customer_id', clientId)
    .or(`stripe_evenement_le.is.null,stripe_evenement_le.lt."${luLe}"`)

  // Une erreur 500 fait renvoyer l'événement par Stripe plus tard
  if (error) return json({ erreur: error.message }, 500)
  return json({ recu: true })
})

// Selon la version d'API Stripe, la fin de période est sur l'abonnement ou sur ses lignes
function finPeriode(abonnement: Stripe.Subscription): number {
  const ligne = abonnement.items.data[0] as { current_period_end?: number } | undefined
  return ligne?.current_period_end ?? abonnement.current_period_end
}
