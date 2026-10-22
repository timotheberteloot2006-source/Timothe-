import { normaliser, type Candidature, type Statut } from './candidatures'
import { CLES_DE_BASE } from './etapes'
import { PAR_PAGE, type Filtres, type Tri } from './parametres'

export { lireFiltres, PAR_PAGE, TRIS, type Filtres, type Tri } from './parametres'

// attributions : identifiants des étiquettes posées, par candidature
export function filtrerCandidatures(
  candidatures: Candidature[],
  filtres: Filtres,
  attributions: ReadonlyMap<string, readonly string[]> = new Map(),
) {
  const recherche = normaliser(filtres.q ?? '')
  const competencesRequises = (filtres.competences ?? '').split(',').map(normaliser).filter(Boolean)

  return candidatures.filter((c) => {
    if (filtres.statut && c.statut !== filtres.statut) return false
    if (filtres.offre && (c.offre_id ?? 'aucune') !== filtres.offre) return false
    if (filtres.experienceMin && c.experience < filtres.experienceMin) return false
    if (filtres.etiquette && !attributions.get(c.id)?.includes(filtres.etiquette)) return false
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
  moyennes: ReadonlyMap<string, { moyenne: number }> = new Map(),
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
    note: (a, b) => (moyennes.get(b.id)?.moyenne ?? -1) - (moyennes.get(a.id)?.moyenne ?? -1),
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
