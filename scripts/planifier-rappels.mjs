// Affiche la requête SQL qui planifie les rappels d'entretien (à coller dans le SQL Editor).
// Usage : npm run planifier:rappels [-- --heure 16]   (heure UTC, 16 par défaut)
import { existsSync, readFileSync } from 'node:fs'
import { lireEnv } from './configuration.mjs'
import { genererSecret, SECRET_VALIDE, sqlPlanification } from './planification.mjs'

const lire = (chemin) => (existsSync(chemin) ? lireEnv(readFileSync(chemin, 'utf8')) : {})
const url = process.env.VITE_SUPABASE_URL ?? lire('.env').VITE_SUPABASE_URL ?? ''
const secret = process.env.RAPPELS_SECRET ?? lire('supabase/functions/.env').RAPPELS_SECRET ?? ''
const indice = process.argv.indexOf('--heure')
const heure = indice > -1 ? Number(process.argv[indice + 1]) : 16

if (!SECRET_VALIDE.test(secret)) {
  console.log('RAPPELS_SECRET manquant ou trop court dans supabase/functions/.env. Par exemple :\n')
  console.log(`RAPPELS_SECRET=${genererSecret()}\n`)
  console.log('Ajoutez-le, lancez npm run deployer:supabase, puis relancez cette commande.')
  process.exit(1)
}
try {
  console.log(sqlPlanification(url, secret, heure))
} catch (e) {
  console.error(e.message)
  process.exit(1)
}
