// Budget de taille : construit le site comme en production (avec des clés Supabase factices, sans
// quoi le client Supabase serait retiré du build) et vérifie le poids compressé (gzip) du
// JavaScript chargé à l'ouverture d'une page (script d'entrée + modulepreload) et du CSS.
// Usage : npm run budget
import { execFileSync } from 'node:child_process'
import { readFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { gzipSync } from 'node:zlib'

// Ko compressés ; à relever consciemment si une fonctionnalité le justifie
const BUDGET_JS_INITIAL = 135
const BUDGET_CSS = 8

const DOSSIER = 'dist-budget'

rmSync(DOSSIER, { recursive: true, force: true })
execFileSync('npx', ['vite', 'build', '--outDir', DOSSIER, '--logLevel', 'warn'], {
  stdio: 'inherit',
  env: {
    ...process.env,
    VITE_SUPABASE_URL: 'https://exemple.supabase.co',
    VITE_SUPABASE_ANON_KEY: 'cle-factice',
  },
})

const html = readFileSync(join(DOSSIER, 'index.html'), 'utf8')
const fichiers = (extension) =>
  [...html.matchAll(new RegExp(`(?:src|href)="(/assets/[^"]+\\.${extension})"`, 'g'))].map(
    (m) => m[1],
  )
const poids = (liste) =>
  liste.reduce((total, f) => total + gzipSync(readFileSync(join(DOSSIER, f))).length, 0) / 1024

const mesures = [
  { nom: 'JavaScript initial', ko: poids(fichiers('js')), budget: BUDGET_JS_INITIAL },
  { nom: 'CSS', ko: poids(fichiers('css')), budget: BUDGET_CSS },
]

let depasse = false
for (const { nom, ko, budget } of mesures) {
  const ok = ko <= budget
  depasse ||= !ok
  console.log(`${ok ? '✓' : '✗'} ${nom} : ${ko.toFixed(1)} Ko compressés (budget ${budget} Ko)`)
}
rmSync(DOSSIER, { recursive: true, force: true })
if (depasse) {
  console.error('Budget de taille dépassé : allégez le code chargé au démarrage ou relevez le budget.')
  process.exit(1)
}
