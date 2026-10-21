// Vérifie la configuration avant la mise en ligne (voir docs/MISE_EN_LIGNE.md).
// Usage :
//   npm run verifier:config                 fichiers .env et supabase/functions/.env
//   npm run verifier:config -- --distant    interroge aussi Supabase et Stripe (lectures seules)
//   npm run verifier:config -- --production exige une configuration de site en ligne (https…)
// Les variables d'environnement déjà définies l'emportent sur les fichiers (comme sur Vercel).
import { existsSync, readFileSync } from 'node:fs'
import {
  lireEnv,
  verifierCourriel,
  verifierFonctions,
  verifierRappels,
  verifierResend,
  verifierSite,
  verifierStripe,
  verifierSupabase,
} from './configuration.mjs'

const options = new Set(process.argv.slice(2))
const distant = options.has('--distant')
const production = options.has('--production')

function charger(chemin, filtre) {
  const fichier = existsSync(chemin) ? lireEnv(readFileSync(chemin, 'utf8')) : {}
  const surcharges = Object.fromEntries(Object.entries(process.env).filter(([cle]) => filtre(cle)))
  return { valeurs: { ...fichier, ...surcharges }, present: existsSync(chemin) }
}

const site = charger('.env', (cle) => cle.startsWith('VITE_SUPABASE_'))
const fonctions = charger('supabase/functions/.env', (cle) =>
  [
    'STRIPE_SECRET_KEY',
    'STRIPE_PRICE_PRO',
    'STRIPE_WEBHOOK_SECRET',
    'SITE_URL',
    'RESEND_API_KEY',
    'EMAIL_EXPEDITEUR',
    'RAPPELS_SECRET',
  ].includes(cle),
)

const SYMBOLES = { ok: '✓', attention: '!', erreur: '✗' }
let erreurs = 0
let alertes = 0

function afficher(titre, resultats) {
  console.log(`\n${titre}`)
  for (const r of resultats) {
    if (r.niveau === 'erreur') erreurs++
    if (r.niveau === 'attention') alertes++
    console.log(`  ${SYMBOLES[r.niveau]} ${r.message}`)
  }
}

const resultatsSite = verifierSite(site.valeurs)
const resultatsFonctions = verifierFonctions(fonctions.valeurs, { production })
const resultatsCourriel = verifierCourriel(fonctions.valeurs, { production })
afficher(`Site (${site.present ? '.env' : 'variables d’environnement'})`, resultatsSite)
afficher(
  `Fonctions Supabase (${fonctions.present ? 'supabase/functions/.env' : 'variables d’environnement'})`,
  resultatsFonctions,
)
afficher('E-mails (supabase/functions/.env)', resultatsCourriel)
afficher('Rappels d’entretien (supabase/functions/.env)', verifierRappels(fonctions.valeurs))

const sansErreur = (resultats) => resultats.every((r) => r.niveau !== 'erreur')
if (distant) {
  // Chaque partie distante n'est interrogée qu'avec une configuration locale correcte
  if (!sansErreur(resultatsSite)) {
    console.log('\nVérification distante non lancée : corrigez d’abord la configuration du site.')
  } else {
    afficher('Projet Supabase (en ligne)', await verifierSupabase(site.valeurs, fetch))
    if (sansErreur(resultatsFonctions))
      afficher(
        'Stripe (en ligne)',
        await verifierStripe(fonctions.valeurs, site.valeurs.VITE_SUPABASE_URL, fetch),
      )
    else console.log('\nStripe non interrogé : corrigez d’abord les secrets des fonctions.')
    // Seulement si les notifications sont configurées sans erreur
    if (resultatsCourriel.every((r) => r.niveau === 'ok'))
      afficher('Resend (en ligne)', await verifierResend(fonctions.valeurs, fetch))
  }
} else {
  console.log('\nAjoutez --distant pour interroger aussi Supabase et Stripe.')
}

console.log(
  `\n${erreurs === 0 ? 'Aucune erreur' : `${erreurs} erreur(s)`}${alertes > 0 ? `, ${alertes} point(s) d’attention` : ''}.`,
)
process.exit(erreurs === 0 ? 0 : 1)
