import { normaliser, type Candidature, type Statut } from './candidatures'
import { CLES_DE_BASE } from './etapes'

export interface Filtres {
  // Recherche dans le nom, l'e-mail et le poste
  q?: string
  // Compétences séparées par des virgules ; toutes sont exigées
  competences?: string
  experienceMin?: number
  statut?: Statut
  // Identifiant d'offre, ou « aucune » pour les candidatures sans offre
  offre?: string
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
  // « recent » est l'ordre par défaut : inutile de le garder dans l'adresse
  if (typeof search.tri === 'string' && Object.hasOwn(TRIS, search.tri) && search.tri !== 'recent')
    filtres.tri = search.tri as Tri
  const page = Number(search.page)
  if (Number.isInteger(page) && page > 1) filtres.page = page
  if (search.vue === 'tableau') filtres.vue = 'tableau'
  return filtres
}

export function filtrerCandidatures(candidatures: Candidature[], filtres: Filtres) {
  const recherche = normaliser(filtres.q ?? '')
  const competencesRequises = (filtres.competences ?? '').split(',').map(normaliser).filter(Boolean)

  return candidatures.filter((c) => {
    if (filtres.statut && c.statut !== filtres.statut) return false
    if (filtres.offre && (c.offre_id ?? 'aucune') !== filtres.offre) return false
    if (filtres.experienceMin && c.experience < filtres.experienceMin) return false
    if (recherche) {
      const texte = normaliser([c.nom, c.email, c.poste].filter(Boolean).join(' '))
      if (!texte.includes(recherche)) return false
    }
    const competences = c.competences.map(normaliser)
    return competencesRequises.every((requise) => competences.includes(requise))
  })
}

const comparerNoms = new Intl.Collator('fr', { sensitivity: 'base' }).compare

// Renvoie une copie triée ; à égalité, les plus récentes d'abord. ordreEtapes : clés des
// étapes dans leur ordre (tri par statut) ; moyennes : note moyenne par candidature (tri par note,
// les candidatures non évaluées à la fin)
export function trierCandidatures(
  candidatures: Candidature[],
  tri: Tri = 'recent',
  ordreEtapes: readonly string[] = CLES_DE_BASE,
  moyennes: ReadonlyMap<string, number> = new Map(),
) {
  const rang = (statut: string) => {
    const i = ordreEtapes.indexOf(statut)
    return i === -1 ? ordreEtapes.length : i
  }
  const plusRecente = (a: Candidature, b: Candidature) => b.created_at.localeCompare(a.created_at)
  const comparaisons: Record<Tri, (a: Candidature, b: Candidature) => number> = {
    recent: () => 0,
    ancien: (a, b) => -plusRecente(a, b),
    nom: (a, b) => comparerNoms(a.nom, b.nom),
    'nom-desc': (a, b) => comparerNoms(b.nom, a.nom),
    experience: (a, b) => b.experience - a.experience,
    'experience-asc': (a, b) => a.experience - b.experience,
    statut: (a, b) => rang(a.statut) - rang(b.statut),
    note: (a, b) => (moyennes.get(b.id) ?? -1) - (moyennes.get(a.id) ?? -1),
  }
  const comparer = comparaisons[tri]
  return [...candidatures].sort((a, b) => comparer(a, b) || plusRecente(a, b))
}

// Colonnes du tableau : une par étape (clés dans l'ordre), en gardant l'ordre reçu ; une
// candidature d'étape inconnue va dans la première colonne
export function regrouperParStatut(
  candidatures: Candidature[],
  cles: readonly string[] = CLES_DE_BASE,
) {
  const colonnes = new Map<Statut, Candidature[]>(cles.map((c) => [c, []]))
  for (const c of candidatures) (colonnes.get(c.statut) ?? colonnes.get(cles[0]))?.push(c)
  return colonnes
}

// Découpe la liste en pages ; une page trop grande (filtres modifiés…) devient la dernière
export function paginer<T>(liste: T[], page = 1) {
  const totalPages = Math.max(1, Math.ceil(liste.length / PAR_PAGE))
  const courante = Math.min(Math.max(1, page), totalPages)
  const debut = (courante - 1) * PAR_PAGE
  return {
    elements: liste.slice(debut, debut + PAR_PAGE),
    page: courante,
    totalPages,
    // Positions affichées, comptées à partir de 1 (0 si la liste est vide)
    premier: liste.length === 0 ? 0 : debut + 1,
    dernier: Math.min(debut + PAR_PAGE, liste.length),
  }
}
