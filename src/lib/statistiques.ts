import { normaliser, type Candidature, type Statut } from './candidatures'

export const NOMBRE_COMPETENCES = 8

export interface Statistiques {
  total: number
  // Nombre par clé d'étape (absente : aucune)
  parStatut: Record<Statut, number>
  // Moyenne arrondie au dixième, null sans candidature
  experienceMoyenne: number | null
  avecCv: number
  // Les plus fréquentes d'abord ; à égalité, ordre alphabétique
  competences: { nom: string; nombre: number }[]
}

export function calculerStatistiques(candidatures: Candidature[]): Statistiques {
  const parStatut: Record<Statut, number> = {}
  // Regroupe « React » et « react » ; garde l'orthographe la plus utilisée
  const competences = new Map<string, { nombre: number; orthographes: Map<string, number> }>()
  let experienceTotale = 0

  for (const c of candidatures) {
    parStatut[c.statut] = (parStatut[c.statut] ?? 0) + 1
    experienceTotale += c.experience
    for (const competence of c.competences) {
      const cle = normaliser(competence)
      const entree = competences.get(cle) ?? { nombre: 0, orthographes: new Map() }
      entree.nombre++
      entree.orthographes.set(competence, (entree.orthographes.get(competence) ?? 0) + 1)
      competences.set(cle, entree)
    }
  }

  const trier = new Intl.Collator('fr', { sensitivity: 'base' }).compare
  return {
    total: candidatures.length,
    parStatut,
    experienceMoyenne:
      candidatures.length === 0
        ? null
        : Math.round((experienceTotale / candidatures.length) * 10) / 10,
    avecCv: candidatures.filter((c) => c.cv_chemin).length,
    competences: [...competences.values()]
      .map(({ nombre, orthographes }) => ({ nom: orthographePreferee(orthographes), nombre }))
      .sort((a, b) => b.nombre - a.nombre || trier(a.nom, b.nom))
      .slice(0, NOMBRE_COMPETENCES),
  }
}

// Ajoute ou retire une compétence du filtre « compétences requises » (texte séparé par des virgules)
export function basculerCompetence(filtre: string | undefined, competence: string) {
  const liste = (filtre ?? '')
    .split(',')
    .map((c) => c.trim())
    .filter(Boolean)
  const cle = normaliser(competence)
  const presente = liste.some((c) => normaliser(c) === cle)
  const nouvelle = presente ? liste.filter((c) => normaliser(c) !== cle) : [...liste, competence]
  return nouvelle.length > 0 ? nouvelle.join(', ') : undefined
}

export function competenceDansFiltre(filtre: string | undefined, competence: string) {
  const cle = normaliser(competence)
  return (filtre ?? '').split(',').some((c) => normaliser(c) === cle)
}

// La plus utilisée ; à égalité, la plus « riche » (majuscules, accents), puis un ordre fixe :
// le résultat ne dépend pas de l'ordre des candidatures
function orthographePreferee(orthographes: Map<string, number>) {
  const richesse = (texte: string) =>
    [...texte].filter((caractere) => caractere !== normaliser(caractere)).length
  return [...orthographes].sort(
    ([a, na], [b, nb]) => nb - na || richesse(b) - richesse(a) || (a < b ? -1 : 1),
  )[0][0]
}
