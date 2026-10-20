import { describe, expect, it } from 'vitest'
import { decouperCompetences, type Candidature } from './candidatures'
import { filtrerCandidatures, lireFiltres } from './filtres'

function candidature(champs: Partial<Candidature>): Candidature {
  return {
    id: champs.nom ?? 'x',
    nom: 'Sans nom',
    email: null,
    poste: null,
    competences: [],
    experience: 0,
    statut: 'nouveau',
    created_at: '2026-01-01T00:00:00Z',
    ...champs,
  }
}

const alice = candidature({
  nom: 'Alice Martin',
  email: 'alice@exemple.fr',
  poste: 'Développeuse front',
  competences: ['React', 'TypeScript'],
  experience: 5,
})
const bruno = candidature({
  nom: 'Bruno Léger',
  poste: 'Data analyst',
  competences: ['SQL', 'Python'],
  experience: 2,
  statut: 'retenu',
})
const chloe = candidature({
  nom: 'Chloé Petit',
  poste: 'Développeuse fullstack',
  competences: ['React', 'Node.js', 'SQL'],
  experience: 8,
  statut: 'ecarte',
})
const toutes = [alice, bruno, chloe]
const noms = (liste: Candidature[]) => liste.map((c) => c.nom)

describe('filtrerCandidatures', () => {
  it('renvoie tout sans filtre', () => {
    expect(filtrerCandidatures(toutes, {})).toEqual(toutes)
  })

  it('cherche dans le nom, l’e-mail et le poste, sans tenir compte des accents ni de la casse', () => {
    expect(noms(filtrerCandidatures(toutes, { q: 'leger' }))).toEqual(['Bruno Léger'])
    expect(noms(filtrerCandidatures(toutes, { q: 'ALICE@' }))).toEqual(['Alice Martin'])
    expect(noms(filtrerCandidatures(toutes, { q: 'developpeuse' }))).toEqual([
      'Alice Martin',
      'Chloé Petit',
    ])
  })

  it('exige toutes les compétences demandées', () => {
    expect(noms(filtrerCandidatures(toutes, { competences: 'react' }))).toEqual([
      'Alice Martin',
      'Chloé Petit',
    ])
    expect(noms(filtrerCandidatures(toutes, { competences: 'React, sql' }))).toEqual([
      'Chloé Petit',
    ])
  })

  it('filtre sur l’expérience minimum et le statut', () => {
    expect(noms(filtrerCandidatures(toutes, { experienceMin: 5 }))).toEqual([
      'Alice Martin',
      'Chloé Petit',
    ])
    expect(noms(filtrerCandidatures(toutes, { statut: 'retenu' }))).toEqual(['Bruno Léger'])
  })

  it('combine les filtres', () => {
    expect(
      filtrerCandidatures(toutes, { competences: 'sql', experienceMin: 3, statut: 'retenu' }),
    ).toEqual([])
  })
})

describe('lireFiltres', () => {
  it('garde les valeurs valides', () => {
    expect(
      lireFiltres({ q: 'alice', competences: 'React', experienceMin: '3', statut: 'retenu' }),
    ).toEqual({ q: 'alice', competences: 'React', experienceMin: 3, statut: 'retenu' })
  })

  it('ignore les valeurs invalides', () => {
    expect(
      lireFiltres({ q: '  ', competences: 42, experienceMin: 'abc', statut: 'inconnu' }),
    ).toEqual({})
    expect(lireFiltres({ experienceMin: -2 })).toEqual({})
  })
})

describe('decouperCompetences', () => {
  it('découpe sur les virgules et points-virgules, sans doublons', () => {
    expect(decouperCompetences(' React, TypeScript ;SQL, react,, ')).toEqual([
      'React',
      'TypeScript',
      'SQL',
    ])
  })
})
