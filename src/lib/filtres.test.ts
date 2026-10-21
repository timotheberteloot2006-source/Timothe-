import { describe, expect, it } from 'vitest'
import { decouperCompetences, type Candidature } from './candidatures'
import {
  filtrerCandidatures,
  lireFiltres,
  paginer,
  PAR_PAGE,
  regrouperParStatut,
  trierCandidatures,
} from './filtres'

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
    cv_chemin: null,
    offre_id: null,
    espace_id: 'e1',
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
      lireFiltres({ q: '  ', competences: 42, experienceMin: 'abc', statut: 'Inconnu !' }),
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

describe('trierCandidatures', () => {
  const dates = (liste: Candidature[]) => liste.map((c) => c.nom)
  const anne = candidature({
    nom: 'anne',
    experience: 5,
    statut: 'ecarte',
    created_at: '2026-01-01T00:00:00Z',
  })
  const eric = candidature({
    nom: 'Éric',
    experience: 2,
    statut: 'nouveau',
    created_at: '2026-01-03T00:00:00Z',
  })
  const bea = candidature({
    nom: 'Béa',
    experience: 5,
    statut: 'retenu',
    created_at: '2026-01-02T00:00:00Z',
  })
  const liste = [anne, eric, bea]

  it('met les plus récentes d’abord par défaut', () => {
    expect(dates(trierCandidatures(liste))).toEqual(['Éric', 'Béa', 'anne'])
    expect(dates(trierCandidatures(liste, 'ancien'))).toEqual(['anne', 'Béa', 'Éric'])
  })

  it('trie les noms sans tenir compte des accents ni des majuscules', () => {
    expect(dates(trierCandidatures(liste, 'nom'))).toEqual(['anne', 'Béa', 'Éric'])
    expect(dates(trierCandidatures(liste, 'nom-desc'))).toEqual(['Éric', 'Béa', 'anne'])
  })

  it('départage par date à expérience égale', () => {
    expect(dates(trierCandidatures(liste, 'experience'))).toEqual(['Béa', 'anne', 'Éric'])
    expect(dates(trierCandidatures(liste, 'experience-asc'))).toEqual(['Éric', 'Béa', 'anne'])
  })

  it('trie par statut : nouveau, retenu, écarté', () => {
    expect(dates(trierCandidatures(liste, 'statut'))).toEqual(['Éric', 'Béa', 'anne'])
  })

  it('ne modifie pas la liste d’origine', () => {
    trierCandidatures(liste, 'nom')
    expect(dates(liste)).toEqual(['anne', 'Éric', 'Béa'])
  })
})

describe('lireFiltres (tri)', () => {
  it('garde un tri valide et ignore le tri par défaut ou inconnu', () => {
    expect(lireFiltres({ tri: 'nom' })).toEqual({ tri: 'nom' })
    expect(lireFiltres({ tri: 'recent' })).toEqual({})
    expect(lireFiltres({ tri: 'inconnu' })).toEqual({})
    expect(lireFiltres({ tri: 'toString' })).toEqual({})
  })
})

describe('paginer', () => {
  const nombres = Array.from({ length: 60 }, (_, i) => i + 1)

  it('découpe en pages de PAR_PAGE', () => {
    expect(PAR_PAGE).toBe(25)
    const page2 = paginer(nombres, 2)
    expect(page2.elements[0]).toBe(26)
    expect(page2.elements).toHaveLength(25)
    expect(page2).toMatchObject({ page: 2, totalPages: 3, premier: 26, dernier: 50 })
    expect(paginer(nombres, 3)).toMatchObject({ premier: 51, dernier: 60 })
  })

  it('ramène une page hors limites dans la plage valide', () => {
    expect(paginer(nombres, 9)).toMatchObject({ page: 3, premier: 51 })
    expect(paginer(nombres, 0)).toMatchObject({ page: 1, premier: 1 })
  })

  it('gère une liste vide', () => {
    expect(paginer([], 2)).toEqual({ elements: [], page: 1, totalPages: 1, premier: 0, dernier: 0 })
  })

  it('lit la page depuis l’adresse', () => {
    expect(lireFiltres({ page: '3' })).toEqual({ page: 3 })
    expect(lireFiltres({ page: '1' })).toEqual({})
    expect(lireFiltres({ page: 'abc' })).toEqual({})
    expect(lireFiltres({ page: '2.5' })).toEqual({})
  })
})

describe('filtre par offre', () => {
  const avecOffre = candidature({ nom: 'Avec', offre_id: 'o1' })
  const sansOffre = candidature({ nom: 'Sans' })
  const autre = candidature({ nom: 'Autre', offre_id: 'o2' })

  it('garde l’offre demandée, ou les candidatures sans offre', () => {
    expect(noms(filtrerCandidatures([avecOffre, sansOffre, autre], { offre: 'o1' }))).toEqual([
      'Avec',
    ])
    expect(noms(filtrerCandidatures([avecOffre, sansOffre, autre], { offre: 'aucune' }))).toEqual([
      'Sans',
    ])
  })

  it('lit l’offre depuis l’adresse', () => {
    expect(lireFiltres({ offre: '3f1c-ab' })).toEqual({ offre: '3f1c-ab' })
    expect(lireFiltres({ offre: 'a b' })).toEqual({})
  })
})

describe('vue tableau', () => {
  it('lireFiltres ne garde que la vue « tableau »', () => {
    expect(lireFiltres({ vue: 'tableau' })).toEqual({ vue: 'tableau' })
    expect(lireFiltres({ vue: 'liste' })).toEqual({})
    expect(lireFiltres({ vue: ['tableau'] })).toEqual({})
    // Statut : n'importe quelle clé d'étape bien formée
    expect(lireFiltres({ statut: 'e_0f3a' })).toEqual({ statut: 'e_0f3a' })
    expect(lireFiltres({ statut: 'Pas une clé' })).toEqual({})
  })

  it('regroupe par statut, dans l’ordre des statuts et en gardant l’ordre reçu', () => {
    const a = candidature({ nom: 'A', statut: 'retenu' })
    const b = candidature({ nom: 'B', statut: 'nouveau' })
    const c = candidature({ nom: 'C', statut: 'retenu' })
    const colonnes = regrouperParStatut([a, b, c])
    expect([...colonnes.keys()]).toEqual(['nouveau', 'retenu', 'ecarte'])
    expect(colonnes.get('nouveau')).toEqual([b])
    expect(colonnes.get('retenu')).toEqual([a, c])
    expect(colonnes.get('ecarte')).toEqual([])
  })

  it('étapes ajoutées : leurs colonnes, et la première pour une étape inconnue', () => {
    const a = candidature({ nom: 'A', statut: 'e_rh' })
    const b = candidature({ nom: 'B', statut: 'supprimee' })
    const colonnes = regrouperParStatut([a, b], ['nouveau', 'e_rh', 'retenu'])
    expect(colonnes.get('e_rh')).toEqual([a])
    expect(colonnes.get('nouveau')).toEqual([b])
  })

  it('le tri par statut suit l’ordre des étapes', () => {
    const a = candidature({ nom: 'A', statut: 'retenu' })
    const b = candidature({ nom: 'B', statut: 'e_rh' })
    const c = candidature({ nom: 'C', statut: 'nouveau' })
    const ordre = trierCandidatures([a, b, c], 'statut', ['nouveau', 'e_rh', 'retenu', 'ecarte'])
    expect(ordre.map((x) => x.nom)).toEqual(['C', 'B', 'A'])
  })
})

describe('tri par note', () => {
  it('les mieux notées d’abord, les non évaluées à la fin', () => {
    const [a, b, c] = ['A', 'B', 'C'].map((nom) => candidature({ nom }))
    const moyennes = new Map([
      ['A', 3.5],
      ['C', 4.2],
    ])
    const ordre = trierCandidatures([a, b, c], 'note', undefined, moyennes)
    expect(ordre.map((x) => x.nom)).toEqual(['C', 'A', 'B'])
    expect(lireFiltres({ tri: 'note' })).toEqual({ tri: 'note' })
  })
})
