import type { Statut } from './candidatures'

// Paramètres d'adresse des pages filtrées dans le navigateur, lus au démarrage du site
// (validateSearch) : ce module reste léger, sans dépendance, pour ne pas alourdir le code chargé
// à l'ouverture. Les calculs sont dans filtres.ts et indicateurs.ts, chargés avec chaque page.

// Liste des candidatures (src/routes/_authentifie/tableau-de-bord.tsx)
export interface Filtres {
  // Recherche dans le nom, l'e-mail et le poste
  q?: string
  // Compétences séparées par des virgules ; toutes sont exigées
  competences?: string
  experienceMin?: number
  statut?: Statut
  // Identifiant d'offre, ou « aucune » pour les candidatures sans offre
  offre?: string
  // Identifiant d'étiquette (src/lib/etiquettes.ts)
  etiquette?: string
  // Absent : plus récentes d'abord
  tri?: Tri
  // Absent : première page
  page?: number
  // Absent : liste ; « tableau » : colonnes par statut (sans pagination)
  vue?: 'tableau'
}

export const PAR_PAGE = 25

export const TRIS = {
  recent: 'Plus récentes',
  ancien: 'Plus anciennes',
  nom: 'Nom (A → Z)',
  'nom-desc': 'Nom (Z → A)',
  experience: 'Plus d’expérience',
  'experience-asc': 'Moins d’expérience',
  statut: 'Statut',
  note: 'Mieux notées',
} as const

export type Tri = keyof typeof TRIS

// Lit les filtres depuis les paramètres d'URL en ignorant les valeurs invalides
export function lireFiltres(search: Record<string, unknown>): Filtres {
  const filtres: Filtres = {}
  if (typeof search.q === 'string' && search.q.trim()) filtres.q = search.q
  if (typeof search.competences === 'string' && search.competences.trim())
    filtres.competences = search.competences
  const experience = Number(search.experienceMin)
  if (search.experienceMin !== undefined && Number.isInteger(experience) && experience > 0)
    filtres.experienceMin = experience
  // Clé d'étape (vérifiée ensuite contre les étapes de l'espace : une clé inconnue ne filtre rien)
  if (typeof search.statut === 'string' && /^[a-z0-9_]{1,40}$/.test(search.statut))
    filtres.statut = search.statut
  if (typeof search.offre === 'string' && /^[\w-]{1,64}$/.test(search.offre))
    filtres.offre = search.offre
  if (typeof search.etiquette === 'string' && /^[\w-]{1,64}$/.test(search.etiquette))
    filtres.etiquette = search.etiquette
  // « recent » est l'ordre par défaut : inutile de le garder dans l'adresse
  if (typeof search.tri === 'string' && Object.hasOwn(TRIS, search.tri) && search.tri !== 'recent')
    filtres.tri = search.tri as Tri
  const page = Number(search.page)
  if (Number.isInteger(page) && page > 1) filtres.page = page
  if (search.vue === 'tableau') filtres.vue = 'tableau'
  return filtres
}

// Page Statistiques (src/routes/_authentifie/statistiques.tsx)
export const PERIODES = {
  '30j': '30 derniers jours',
  '90j': '90 derniers jours',
  '12m': '12 derniers mois',
  tout: 'Depuis le début',
} as const

export type Periode = keyof typeof PERIODES

// « tout » est la période par défaut : inutile de la garder dans l'adresse
export function lirePeriode(search: Record<string, unknown>): { periode?: Periode } {
  return typeof search.periode === 'string' &&
    Object.hasOwn(PERIODES, search.periode) &&
    search.periode !== 'tout'
    ? { periode: search.periode as Periode }
    : {}
}
