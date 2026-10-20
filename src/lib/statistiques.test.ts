import { describe, expect, it } from 'vitest'
import type { Candidature } from './candidatures'
import {
  basculerCompetence,
  calculerStatistiques,
  competenceDansFiltre,
  NOMBRE_COMPETENCES,
} from './statistiques'

function candidature(champs: Partial<Candidature>): Candidature {
  return {
    id: 'x',
    nom: 'X',
    email: null,
    poste: null,
    competences: [],
    experience: 0,
    statut: 'nouveau',
    created_at: '2026-01-01T00:00:00Z',
    cv_chemin: null,
    offre_id: null,
    ...champs,
  }
}

describe('calculerStatistiques', () => {
  it('compte les statuts, la moyenne d’expérience et les CV', () => {
    const stats = calculerStatistiques([
      candidature({ statut: 'retenu', experience: 5, cv_chemin: 'u/c/cv.pdf' }),
      candidature({ statut: 'retenu', experience: 2 }),
      candidature({ statut: 'ecarte', experience: 0 }),
    ])
    expect(stats).toMatchObject({
      total: 3,
      parStatut: { nouveau: 0, retenu: 2, ecarte: 1 },
      experienceMoyenne: 2.3,
      avecCv: 1,
    })
  })

  it('regroupe les compétences sans tenir compte des accents ni des majuscules', () => {
    const { competences } = calculerStatistiques([
      candidature({ competences: ['React', 'SQL'] }),
      candidature({ competences: ['react', 'Écoute'] }),
      candidature({ competences: ['React', 'ecoute', 'Go'] }),
    ])
    expect(competences).toEqual([
      { nom: 'React', nombre: 3 },
      { nom: 'Écoute', nombre: 2 },
      { nom: 'Go', nombre: 1 },
      { nom: 'SQL', nombre: 1 },
    ])
  })

  it('choisit la même orthographe quel que soit l’ordre des candidatures', () => {
    const a = candidature({ competences: ['react'] })
    const b = candidature({ competences: ['React'] })
    expect(calculerStatistiques([a, b]).competences[0].nom).toBe('React')
    expect(calculerStatistiques([b, a]).competences[0].nom).toBe('React')
  })

  it('limite la liste des compétences', () => {
    const competences = Array.from({ length: 12 }, (_, i) => `C${i}`)
    expect(calculerStatistiques([candidature({ competences })]).competences).toHaveLength(
      NOMBRE_COMPETENCES,
    )
  })

  it('gère une liste vide', () => {
    expect(calculerStatistiques([])).toMatchObject({ total: 0, experienceMoyenne: null })
  })
})

describe('basculerCompetence', () => {
  it('ajoute puis retire une compétence du filtre', () => {
    expect(basculerCompetence(undefined, 'React')).toBe('React')
    expect(basculerCompetence('SQL', 'React')).toBe('SQL, React')
    expect(basculerCompetence('sql, react', 'React')).toBe('sql')
    expect(basculerCompetence('React', 'react')).toBeUndefined()
  })

  it('indique si une compétence est déjà filtrée', () => {
    expect(competenceDansFiltre('SQL, écoute', 'Écoute')).toBe(true)
    expect(competenceDansFiltre(undefined, 'React')).toBe(false)
  })
})
