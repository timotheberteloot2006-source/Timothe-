import { STATUTS, normaliser, type Candidature, type Statut } from './candidatures'

export interface Filtres {
  // Recherche dans le nom, l'e-mail et le poste
  q?: string
  // Compétences séparées par des virgules ; toutes sont exigées
  competences?: string
  experienceMin?: number
  statut?: Statut
}

// Lit les filtres depuis les paramètres d'URL en ignorant les valeurs invalides
export function lireFiltres(search: Record<string, unknown>): Filtres {
  const filtres: Filtres = {}
  if (typeof search.q === 'string' && search.q.trim()) filtres.q = search.q
  if (typeof search.competences === 'string' && search.competences.trim())
    filtres.competences = search.competences
  const experience = Number(search.experienceMin)
  if (search.experienceMin !== undefined && Number.isInteger(experience) && experience > 0)
    filtres.experienceMin = experience
  if (STATUTS.includes(search.statut as Statut)) filtres.statut = search.statut as Statut
  return filtres
}

export function filtrerCandidatures(candidatures: Candidature[], filtres: Filtres) {
  const recherche = normaliser(filtres.q ?? '')
  const competencesRequises = (filtres.competences ?? '')
    .split(',')
    .map(normaliser)
    .filter(Boolean)

  return candidatures.filter((c) => {
    if (filtres.statut && c.statut !== filtres.statut) return false
    if (filtres.experienceMin && c.experience < filtres.experienceMin) return false
    if (recherche) {
      const texte = normaliser([c.nom, c.email, c.poste].filter(Boolean).join(' '))
      if (!texte.includes(recherche)) return false
    }
    const competences = c.competences.map(normaliser)
    return competencesRequises.every((requise) => competences.includes(requise))
  })
}
