// Contrôles de configuration avant la mise en ligne (utilisés par scripts/verifier-config.mjs).
// Chaque contrôle renvoie une liste de résultats { niveau: 'ok' | 'attention' | 'erreur', message }.
// Les contrôles distants ne font que des lectures (aucune donnée créée ni modifiée).

import { SECRET_VALIDE } from './planification.mjs'

export const MIGRATIONS = [
  // Une table ou une colonne créée par chaque migration ; 0002, 0003 et 0009 n'ajoutent que des
  // contraintes ou des fonctions, non visibles sans compte
  { numero: '0001', table: 'candidatures', colonne: 'id' },
  { numero: '0004', table: 'abonnements', colonne: 'statut' },
  { numero: '0005', table: 'notes', colonne: 'id' },
  { numero: '0006', table: 'offres', colonne: 'id' },
  { numero: '0007', table: 'entretiens', colonne: 'id' },
  { numero: '0008', table: 'espaces', colonne: 'id' },
  { numero: '0010', table: 'historique', colonne: 'id' },
  { numero: '0011', table: 'historique', colonne: 'par_systeme' },
  { numero: '0012', table: 'abonnements', colonne: 'stripe_evenement_le' },
  { numero: '0013', table: 'offres', colonne: 'jeton_public' },
  { numero: '0014', table: 'membres', colonne: 'notifier' },
  { numero: '0015', table: 'etapes', colonne: 'cle' },
  { numero: '0016', table: 'espaces', colonne: 'slug' },
  // Sans nouvelle colonne visible : une fonction ajoutée, appelée sans droit (refus attendu)
  {
    numero: '0017',
    fonction: 'deplacer_etape',
    arguments: { eid: '00000000-0000-0000-0000-000000000000', sens: 0 },
  },
  { numero: '0018', table: 'entretiens', colonne: 'rappel_envoye_le' },
  { numero: '0019', table: 'modeles_reponse', colonne: 'nom' },
  { numero: '0020', table: 'criteres', colonne: 'nom' },
  // Nouveau paramètre « reservation » : sans la migration, la fonction est introuvable
  {
    numero: '0021',
    fonction: 'noter_reponse_envoyee',
    arguments: {
      id_candidature: '00000000-0000-0000-0000-000000000000',
      reservation: '00000000-0000-0000-0000-000000000000',
      sujet: '',
    },
  },
  { numero: '0022', table: 'etiquettes', colonne: 'couleur' },
  { numero: '0023', table: 'partages', colonne: 'jeton' },
  // N'ajoute que des contraintes et des corrections : repérée par la version du schéma
  { numero: '0024', fonction: 'version_schema', arguments: {} },
  // Réservée aux comptes connectés : sans compte, refus d'accès si elle existe
  { numero: '0025', fonction: 'signature_espace', arguments: {} },
]

// Événements que supabase/functions/webhook-stripe traite
export const EVENEMENTS_STRIPE = [
  'customer.subscription.created',
  'customer.subscription.updated',
  'customer.subscription.deleted',
]

const ok = (message) => ({ niveau: 'ok', message })
const attention = (message) => ({ niveau: 'attention', message })
const erreur = (message) => ({ niveau: 'erreur', message })

// Fichier .env : CLE=valeur, lignes vides et commentaires ignorés, guillemets retirés
export function lireEnv(texte) {
  const valeurs = {}
  for (const ligne of texte.split(/\r?\n/)) {
    const m = ligne.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/)
    if (!m) continue
    valeurs[m[1]] = m[2].replace(/^(['"])(.*)\1$/, '$2')
  }
  return valeurs
}

// Valeur laissée telle que dans .env.example
function estExemple(valeur) {
  return !valeur || valeur.includes('...') || /votre-|exemple/.test(valeur)
}

// Contenu d'un jeton JWT (sans vérifier sa signature), ou null
export function lireJwt(jeton) {
  const morceaux = jeton.split('.')
  if (morceaux.length !== 3) return null
  try {
    return JSON.parse(Buffer.from(morceaux[1], 'base64url').toString('utf8'))
  } catch {
    return null
  }
}

// Identifiant du projet dans https://<ref>.supabase.co, ou null (domaine personnalisé)
export function refProjet(url) {
  return url.match(/^https:\/\/([a-z0-9]+)\.supabase\.co\/?$/)?.[1] ?? null
}

// Variables du site (VITE_…), intégrées au JavaScript public : rien de secret ne doit s'y trouver
export function verifierSite(env) {
  const resultats = []
  const url = env.VITE_SUPABASE_URL ?? ''
  const cle = env.VITE_SUPABASE_ANON_KEY ?? ''

  if (estExemple(url)) resultats.push(erreur('VITE_SUPABASE_URL n’est pas renseignée.'))
  else if (!/^https:\/\/[^/]+\/?$/.test(url))
    resultats.push(
      erreur(`VITE_SUPABASE_URL doit être l’adresse https du projet, sans chemin (reçu : ${url}).`),
    )
  else resultats.push(ok(`Projet Supabase : ${url}`))

  if (estExemple(cle)) {
    resultats.push(erreur('VITE_SUPABASE_ANON_KEY n’est pas renseignée.'))
  } else if (cle.startsWith('sb_secret_')) {
    resultats.push(
      erreur(
        'VITE_SUPABASE_ANON_KEY est une clé secrète (sb_secret_…) : elle serait publiée avec le site. Utilisez la clé publique (sb_publishable_… ou anon).',
      ),
    )
  } else if (cle.startsWith('sb_publishable_')) {
    resultats.push(ok('Clé publique Supabase (sb_publishable_…).'))
  } else {
    const jwt = lireJwt(cle)
    if (!jwt) {
      resultats.push(erreur('VITE_SUPABASE_ANON_KEY n’a pas le format d’une clé Supabase.'))
    } else if (jwt.role !== 'anon') {
      resultats.push(
        erreur(
          `VITE_SUPABASE_ANON_KEY a le rôle « ${jwt.role} » : seule la clé anon peut être publiée avec le site.`,
        ),
      )
    } else if (refProjet(url) && jwt.ref && jwt.ref !== refProjet(url)) {
      resultats.push(
        erreur(
          `La clé anon appartient au projet ${jwt.ref}, pas à celui de VITE_SUPABASE_URL (${refProjet(url)}).`,
        ),
      )
    } else {
      resultats.push(ok('Clé anon Supabase.'))
    }
  }

  // Une clé Stripe secrète n'a rien à faire dans les variables du site
  for (const [nom, valeur] of Object.entries(env)) {
    if (nom.startsWith('VITE_') && /^(sk|rk)_(test|live)_|^whsec_/.test(valeur)) {
      resultats.push(erreur(`${nom} contient un secret Stripe : il serait publié avec le site.`))
    }
  }
  return resultats
}

// production : la configuration vise le site en ligne (et non le poste de développement)
export function verifierFonctions(env, { production = false } = {}) {
  const resultats = []
  const cle = env.STRIPE_SECRET_KEY ?? ''
  const prix = env.STRIPE_PRICE_PRO ?? ''
  const webhook = env.STRIPE_WEBHOOK_SECRET ?? ''
  const site = env.SITE_URL ?? ''

  const mode = cle.match(/^(?:sk|rk)_(test|live)_/)?.[1]
  if (estExemple(cle)) resultats.push(erreur('STRIPE_SECRET_KEY n’est pas renseignée.'))
  else if (!mode)
    resultats.push(erreur('STRIPE_SECRET_KEY doit commencer par sk_test_, sk_live_ ou rk_….'))
  else if (production && mode === 'test')
    resultats.push(
      attention(
        'Clé Stripe de test : les paiements ne seront pas réels (normal pour une répétition).',
      ),
    )
  else resultats.push(ok(`Clé Stripe en mode ${mode === 'live' ? 'réel' : 'test'}.`))

  if (estExemple(prix)) resultats.push(erreur('STRIPE_PRICE_PRO n’est pas renseigné.'))
  else if (!prix.startsWith('price_'))
    resultats.push(
      erreur(
        `STRIPE_PRICE_PRO doit être l’identifiant d’un prix (price_…), pas d’un produit (reçu : ${prix}).`,
      ),
    )
  else resultats.push(ok(`Prix Pro : ${prix}`))

  if (estExemple(webhook))
    resultats.push(
      erreur('STRIPE_WEBHOOK_SECRET n’est pas renseigné (créez d’abord le webhook dans Stripe).'),
    )
  else if (!webhook.startsWith('whsec_'))
    resultats.push(erreur('STRIPE_WEBHOOK_SECRET doit commencer par whsec_.'))
  else resultats.push(ok('Secret du webhook Stripe.'))

  if (estExemple(site) || !/^https?:\/\/[^/]+$/.test(site)) {
    resultats.push(
      erreur(`SITE_URL doit être l’adresse du site, sans / final (reçu : ${site || 'vide'}).`),
    )
  } else if (production && !site.startsWith('https://')) {
    resultats.push(erreur(`SITE_URL doit être l’adresse https du site en ligne (reçu : ${site}).`))
  } else if (mode === 'live' && !site.startsWith('https://')) {
    resultats.push(erreur('Clé Stripe réelle mais SITE_URL n’est pas une adresse https.'))
  } else {
    resultats.push(ok(`Retour après paiement vers ${site}`))
  }
  return resultats
}

// Erreurs PostgREST signifiant que la table ou la colonne n'existe pas
const CODES_ABSENT = new Set(['42P01', '42703', 'PGRST202', 'PGRST204', 'PGRST205'])

// Base, authentification et fonctions du projet Supabase, avec la clé publique
export async function verifierSupabase(env, fetch) {
  const url = (env.VITE_SUPABASE_URL ?? '').replace(/\/$/, '')
  const cle = env.VITE_SUPABASE_ANON_KEY ?? ''
  const entetes = { apikey: cle }
  if (!cle.startsWith('sb_')) entetes.Authorization = `Bearer ${cle}`

  try {
    return await interrogerSupabase(url, entetes, fetch)
  } catch (e) {
    return [erreur(`Projet Supabase injoignable (${url}) : ${e.message}`)]
  }
}

async function interrogerSupabase(url, entetes, fetch) {
  const resultats = []

  // Migrations : la dernière doit être la plus récente du dépôt
  const manquantes = []
  for (const migration of MIGRATIONS) {
    const reponse = migration.fonction
      ? await fetch(`${url}/rest/v1/rpc/${migration.fonction}`, {
          method: 'POST',
          headers: { ...entetes, 'Content-Type': 'application/json' },
          body: JSON.stringify(migration.arguments),
        })
      : await fetch(`${url}/rest/v1/${migration.table}?select=${migration.colonne}&limit=0`, {
          headers: entetes,
        })
    if (reponse.ok) continue
    const corps = await reponse.json().catch(() => ({}))
    // Refus d'accès (règles RLS, droits) : la table existe bien
    if (reponse.status === 404 || CODES_ABSENT.has(corps.code)) manquantes.push(migration.numero)
  }
  if (manquantes.length === 0)
    resultats.push(ok(`Migrations appliquées jusqu’à ${MIGRATIONS.at(-1).numero}.`))
  else
    resultats.push(
      erreur(
        `Migrations à exécuter (SQL Editor, dans l’ordre) à partir de ${manquantes[0]} : ${manquantes.join(', ')} manquent.`,
      ),
    )

  // Réglages de l'authentification
  const reponseAuth = await fetch(`${url}/auth/v1/settings`, { headers: entetes })
  if (reponseAuth.ok) {
    const reglages = await reponseAuth.json()
    if (reglages.external?.email === false)
      resultats.push(erreur('La connexion par e-mail est désactivée dans Supabase.'))
    if (reglages.disable_signup)
      resultats.push(attention('Les inscriptions sont fermées dans Supabase.'))
    if (reglages.mailer_autoconfirm)
      resultats.push(
        attention(
          'Les adresses e-mail ne sont pas confirmées (Confirm email désactivé) : n’importe qui peut s’inscrire avec l’adresse d’un autre.',
        ),
      )
    else resultats.push(ok('Confirmation de l’adresse e-mail activée.'))
  }

  // Fonctions : déployées, et le webhook sans vérification de jeton (Stripe n'en envoie pas)
  for (const fonction of ['creer-checkout', 'portail-client', 'envoyer-reponse']) {
    const reponse = await fetch(`${url}/functions/v1/${fonction}`, {
      method: 'OPTIONS',
      headers: entetes,
    })
    if (reponse.status === 404) resultats.push(erreur(`Fonction ${fonction} non déployée.`))
    else if (reponse.ok) resultats.push(ok(`Fonction ${fonction} déployée.`))
    else resultats.push(attention(`Fonction ${fonction} : réponse inattendue (${reponse.status}).`))
  }
  const webhook = await fetch(`${url}/functions/v1/webhook-stripe`, { method: 'POST', body: '{}' })
  const corpsWebhook = await webhook.json().catch(() => ({}))
  if (webhook.status === 404) resultats.push(erreur('Fonction webhook-stripe non déployée.'))
  else if (webhook.status === 401)
    resultats.push(
      erreur(
        'webhook-stripe refuse les appels sans jeton : redéployez-la avec --no-verify-jwt, sinon Stripe ne peut pas la joindre.',
      ),
    )
  else if (webhook.status === 400 && corpsWebhook.erreur?.includes('Signature'))
    resultats.push(ok('Fonction webhook-stripe déployée et joignable par Stripe.'))
  else resultats.push(attention(`webhook-stripe : réponse inattendue (${webhook.status}).`))

  // Rappels d'entretien : appelés par la tâche planifiée, avec leur secret (ici sans : refus attendu)
  const rappels = await fetch(`${url}/functions/v1/rappels-entretiens`, {
    method: 'POST',
    body: '{}',
  })
  const corpsRappels = await rappels.json().catch(() => ({}))
  if (rappels.status === 404) resultats.push(erreur('Fonction rappels-entretiens non déployée.'))
  else if (rappels.status === 401 && corpsRappels.erreur === 'Accès refusé.')
    resultats.push(ok('Fonction rappels-entretiens déployée, protégée par son secret.'))
  else if (rappels.status === 401)
    resultats.push(
      erreur(
        'rappels-entretiens refuse les appels sans jeton : redéployez-la avec --no-verify-jwt, sinon la tâche planifiée ne peut pas la lancer.',
      ),
    )
  else if (rappels.status === 500 && corpsRappels.erreur?.includes('RAPPELS_SECRET'))
    resultats.push(
      attention(
        'Rappels d’entretien désactivés : RAPPELS_SECRET absent des secrets des fonctions.',
      ),
    )
  else resultats.push(attention(`rappels-entretiens : réponse inattendue (${rappels.status}).`))

  // Formulaire public : appelé sans compte (un envoi vide est refusé par la fonction elle-même)
  const postuler = await fetch(`${url}/functions/v1/postuler`, { method: 'POST', body: '{}' })
  const corpsPostuler = await postuler.json().catch(() => ({}))
  if (postuler.status === 404) resultats.push(erreur('Fonction postuler non déployée.'))
  else if (postuler.status === 401)
    resultats.push(
      erreur(
        'postuler refuse les appels sans jeton : redéployez-la avec --no-verify-jwt, sinon les candidats ne peuvent pas envoyer le formulaire.',
      ),
    )
  else if (postuler.status === 400 && corpsPostuler.erreur)
    resultats.push(ok('Fonction postuler déployée et ouverte aux candidats.'))
  else resultats.push(attention(`postuler : réponse inattendue (${postuler.status}).`))

  // CV d'une candidature partagée : appelé sans compte (un appel sans lien est refusé par la
  // fonction elle-même)
  const cvPartage = await fetch(`${url}/functions/v1/cv-partage`, { method: 'POST', body: '{}' })
  const corpsCvPartage = await cvPartage.json().catch(() => ({}))
  if (cvPartage.status === 404) resultats.push(erreur('Fonction cv-partage non déployée.'))
  else if (cvPartage.status === 401)
    resultats.push(
      erreur(
        'cv-partage refuse les appels sans jeton : redéployez-la avec --no-verify-jwt, sinon les CV partagés ne s’ouvrent pas.',
      ),
    )
  else if (cvPartage.status === 400 && corpsCvPartage.erreur)
    resultats.push(ok('Fonction cv-partage déployée et ouverte aux liens de partage.'))
  else resultats.push(attention(`cv-partage : réponse inattendue (${cvPartage.status}).`))
  return resultats
}

// Prix, webhook et portail client dans Stripe, avec la clé secrète (lectures seulement)
export async function verifierStripe(envFonctions, urlSupabase, fetch) {
  try {
    return await interrogerStripe(envFonctions, urlSupabase, fetch)
  } catch (e) {
    return [erreur(`Stripe injoignable : ${e.message}`)]
  }
}

async function interrogerStripe(envFonctions, urlSupabase, fetch) {
  const resultats = []
  const appeler = async (chemin) => {
    const reponse = await fetch(`https://api.stripe.com/v1/${chemin}`, {
      headers: { Authorization: `Bearer ${envFonctions.STRIPE_SECRET_KEY}` },
    })
    const corps = await reponse.json().catch(() => ({}))
    return { ok: reponse.ok, status: reponse.status, corps }
  }

  const prix = await appeler(`prices/${encodeURIComponent(envFonctions.STRIPE_PRICE_PRO ?? '')}`)
  if (prix.status === 401) return [erreur('Clé Stripe refusée par Stripe (STRIPE_SECRET_KEY).')]
  if (!prix.ok)
    resultats.push(
      erreur(
        `Prix ${envFonctions.STRIPE_PRICE_PRO} introuvable dans ce compte Stripe (créé dans l’autre mode, test ou réel ?).`,
      ),
    )
  else if (!prix.corps.recurring)
    resultats.push(erreur('Le prix Pro n’est pas récurrent : créez un prix mensuel.'))
  else if (!prix.corps.active) resultats.push(erreur('Le prix Pro est archivé dans Stripe.'))
  else {
    const montant = (prix.corps.unit_amount ?? 0) / 100
    resultats.push(
      ok(
        `Prix Pro : ${montant.toLocaleString('fr-FR')} ${String(prix.corps.currency).toUpperCase()} par ${prix.corps.recurring.interval === 'year' ? 'an' : 'mois'}.`,
      ),
    )
  }

  const adresse = `${urlSupabase.replace(/\/$/, '')}/functions/v1/webhook-stripe`
  const webhooks = await appeler('webhook_endpoints?limit=100')
  const point = webhooks.corps.data?.find((w) => w.url === adresse && w.status === 'enabled')
  if (!point) {
    resultats.push(erreur(`Aucun webhook Stripe actif vers ${adresse}.`))
  } else {
    const ecoutes = point.enabled_events
    const manquants = ecoutes.includes('*')
      ? []
      : EVENEMENTS_STRIPE.filter((e) => !ecoutes.includes(e))
    if (manquants.length > 0)
      resultats.push(erreur(`Événements à ajouter au webhook Stripe : ${manquants.join(', ')}.`))
    else resultats.push(ok('Webhook Stripe configuré avec les bons événements.'))
  }

  const portails = await appeler('billing_portal/configurations?is_default=true&active=true')
  const portail = portails.corps.data?.[0]
  if (!portail)
    resultats.push(
      erreur('Portail client Stripe non activé (Settings > Billing > Customer portal).'),
    )
  else if (!portail.features?.subscription_cancel?.enabled)
    resultats.push(
      attention(
        'Le portail client Stripe ne permet pas de résilier : les clients ne pourront pas supprimer leur compte.',
      ),
    )
  else resultats.push(ok('Portail client Stripe activé, résiliation possible.'))
  return resultats
}

// Adresse de l'expéditeur, « Nom <adresse> » ou « adresse » : renvoie son domaine, ou null
export function domaineExpediteur(expediteur) {
  return expediteur.trim().match(/^(?:[^<>]*<)?[^<>\s@]+@([^<>\s@]+\.[^<>\s@]+?)>?$/)?.[1] ?? null
}

// Notifications par e-mail (facultatives) : RESEND_API_KEY et EMAIL_EXPEDITEUR vont ensemble
export function verifierCourriel(env, { production = false } = {}) {
  const cle = env.RESEND_API_KEY ?? ''
  const expediteur = env.EMAIL_EXPEDITEUR ?? ''
  if (estExemple(cle) && estExemple(expediteur))
    return [
      attention(
        'Notifications par e-mail désactivées (RESEND_API_KEY et EMAIL_EXPEDITEUR absents) : ni l’équipe ni les candidats ne seront prévenus.',
      ),
    ]
  const resultats = []
  if (estExemple(cle)) resultats.push(erreur('RESEND_API_KEY n’est pas renseignée.'))
  else if (!cle.startsWith('re_'))
    resultats.push(erreur('RESEND_API_KEY doit commencer par re_ (clé API Resend).'))
  else resultats.push(ok('Clé Resend.'))

  const domaine = domaineExpediteur(expediteur)
  if (estExemple(expediteur) || !domaine)
    resultats.push(
      erreur(
        `EMAIL_EXPEDITEUR doit être « Nom <adresse@domaine> » (reçu : ${expediteur || 'vide'}).`,
      ),
    )
  else if (domaine === 'resend.dev')
    resultats.push(
      (production ? erreur : attention)(
        'Expéditeur de test resend.dev : Resend n’envoie alors qu’à l’adresse de votre compte Resend. Vérifiez votre propre domaine.',
      ),
    )
  else resultats.push(ok(`Expéditeur : ${expediteur}`))
  return resultats
}

// Domaine de l'expéditeur vérifié chez Resend (lecture seule)
export async function verifierResend(env, fetch) {
  const domaine = domaineExpediteur(env.EMAIL_EXPEDITEUR ?? '')
  try {
    const reponse = await fetch('https://api.resend.com/domains', {
      headers: { Authorization: `Bearer ${env.RESEND_API_KEY}` },
    })
    if (reponse.status === 401) return [erreur('Clé Resend refusée (RESEND_API_KEY).')]
    if (reponse.status === 403)
      return [
        attention(
          'Clé Resend limitée à l’envoi : le domaine ne peut pas être vérifié d’ici. Contrôlez-le dans Resend (Domains).',
        ),
      ]
    const corps = await reponse.json().catch(() => ({}))
    const trouve = corps.data?.find((d) => d.name === domaine)
    if (!trouve)
      return [erreur(`Domaine ${domaine} absent du compte Resend : ajoutez-le (Domains).`)]
    if (trouve.status !== 'verified')
      return [
        erreur(
          `Domaine ${domaine} pas encore vérifié chez Resend (état : ${trouve.status}) : ajoutez les enregistrements DNS indiqués.`,
        ),
      ]
    return [ok(`Domaine ${domaine} vérifié chez Resend.`)]
  } catch (e) {
    return [erreur(`Resend injoignable : ${e.message}`)]
  }
}

// Rappels d'entretien (facultatifs) : secret de la tâche planifiée, et e-mails pour les envoyer
export function verifierRappels(env) {
  const secret = env.RAPPELS_SECRET ?? ''
  if (estExemple(secret))
    return [
      attention(
        'Rappels d’entretien désactivés (RAPPELS_SECRET absent) : npm run planifier:rappels en propose un.',
      ),
    ]
  if (!SECRET_VALIDE.test(secret))
    return [
      erreur('RAPPELS_SECRET doit compter 24 caractères au moins : lettres, chiffres, - et _.'),
    ]
  const resultats = [ok('Secret des rappels d’entretien.')]
  if (estExemple(env.RESEND_API_KEY ?? ''))
    resultats.push(
      attention('Rappels d’entretien sans e-mails (RESEND_API_KEY absent) : rien ne sera envoyé.'),
    )
  return resultats
}
