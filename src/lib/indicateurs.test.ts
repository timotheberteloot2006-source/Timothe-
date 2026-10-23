import { describe, expect, it } from 'vitest'
import type { Candidature } from './candidatures'
import { ETAPES_DE_BASE } from './etapes'
import {
  calculerIndicateurs,
  debutPeriode,
  formaterDelai,
  libelleMois,
  lirePeriode,
  pourcentage,
} from './indicateurs'

const MAINTENANT = new Date(2026, 5, 15, 12)

let compteur = 0
function candidature(champs: Partial<Candidature>): Candidature {
  compteur++
  return {
    id: `c${compteur}`,
    nom: `C${compteur}`,
    email: null,
    poste: null,
    competences: [],
    experience: 0,
    statut: 'nouveau',
    created_at: new Date(2026, 5, 1).toISOString(),
    cv_chemin: null,
    offre_id: null,
    espace_id: 'e1',
    ...champs,
  }
}

const vide = {
  etapes: ETAPES_DE_BASE,
  offres: [],
  etiquettes: [],
  attributions: new Map(),
  datesRetenues: new Map(),
}

describe('période', () => {
  it('lit la période depuis l’adresse, « tout » par défaut', () => {
    expect(lirePeriode({ periode: '30j' })).toEqual({ periode: '30j' })
    expect(lirePeriode({ periode: 'tout' })).toEqual({})
    expect(lirePeriode({ periode: '7j' })).toEqual({})
  })

  it('calcule le début de la période', () => {
    expect(debutPeriode('30j', MAINTENANT)).toEqual(new Date(2026, 4, 16, 12))
    expect(debutPeriode('12m', MAINTENANT)).toEqual(new Date(2025, 5, 15, 12))
    expect(debutPeriode('tout', MAINTENANT)).toBeNull()
  })
})

describe('calculerIndicateurs', () => {
  it('compte les candidatures de la période, en ligne, retenues et écartées', () => {
    const candidatures = [
      candidature({ source: 'formulaire', statut: 'retenu' }),
      candidature({ statut: 'ecarte' }),
      candidature({ source: 'formulaire' }),
      // Hors des 30 derniers jours
      candidature({ created_at: new Date(2026, 0, 10).toISOString(), statut: 'retenu' }),
    ]
    const i = calculerIndicateurs({ ...vide, candidatures }, '30j', MAINTENANT)
    expect([i.total, i.enLigne, i.retenues, i.ecartees]).toEqual([3, 2, 1, 1])
    expect(i.parEtape.map((e) => [e.etape.cle, e.nombre])).toEqual([
      ['nouveau', 1],
      ['retenu', 1],
      ['ecarte', 1],
    ])
    expect(calculerIndicateurs({ ...vide, candidatures }, 'tout', MAINTENANT).total).toBe(4)
  })

  it('délai médian jusqu’au premier passage à « Retenu », des seules candidatures retenues', () => {
    const recue = new Date(2026, 5, 1).toISOString()
    const a = candidature({ statut: 'retenu', created_at: recue })
    const b = candidature({ statut: 'retenu', created_at: recue })
    const c = candidature({ statut: 'retenu', created_at: recue })
    // Retenue puis écartée : pas comptée
    const d = candidature({ statut: 'ecarte', created_at: recue })
    // Retenue sans trace dans l'historique (base antérieure) : pas comptée
    const e = candidature({ statut: 'retenu', created_at: recue })
    const datesRetenues = new Map([
      [a.id, new Date(2026, 5, 3).toISOString()],
      [b.id, new Date(2026, 5, 11).toISOString()],
      [c.id, new Date(2026, 5, 5).toISOString()],
      [d.id, new Date(2026, 5, 2).toISOString()],
    ])
    const i = calculerIndicateurs(
      { ...vide, candidatures: [a, b, c, d, e], datesRetenues },
      'tout',
      MAINTENANT,
    )
    expect(i.delaiMedian).toBe(4)
    expect(i.nombreDelais).toBe(3)
    expect(
      calculerIndicateurs({ ...vide, candidatures: [d] }, 'tout', MAINTENANT).delaiMedian,
    ).toBe(null)
  })

  it('par mois : de la première candidature au mois en cours, mois vides compris', () => {
    const candidatures = [
      candidature({ created_at: new Date(2026, 2, 20).toISOString() }),
      candidature({ created_at: new Date(2026, 2, 2).toISOString() }),
      candidature({ created_at: new Date(2026, 5, 2).toISOString() }),
    ]
    expect(calculerIndicateurs({ ...vide, candidatures }, 'tout', MAINTENANT).parMois).toEqual([
      { mois: '2026-03', nombre: 2 },
      { mois: '2026-04', nombre: 0 },
      { mois: '2026-05', nombre: 0 },
      { mois: '2026-06', nombre: 1 },
    ])
    // Période choisie : à partir de son début, même sans candidature
    expect(
      calculerIndicateurs({ ...vide, candidatures }, '90j', MAINTENANT).parMois.map((m) => m.mois),
    ).toEqual(['2026-03', '2026-04', '2026-05', '2026-06'])
    expect(calculerIndicateurs({ ...vide, candidatures: [] }, 'tout', MAINTENANT).parMois).toEqual(
      [],
    )
  })

  it('par offre et par étiquette, les plus fournies d’abord', () => {
    const offres = [
      { id: 'o1', titre: 'Data' },
      { id: 'o2', titre: 'Front' },
    ] as never[]
    const candidatures = [
      candidature({ offre_id: 'o2', statut: 'retenu' }),
      candidature({ offre_id: 'o2' }),
      candidature({ offre_id: 'o1' }),
      candidature({}),
      // Offre supprimée : comptée sans offre
      candidature({ offre_id: 'o9' }),
    ]
    const etiquettes = [
      { id: 'e1', nom: 'Senior', couleur: 'vert' as const },
      { id: 'e2', nom: 'Anglais', couleur: 'gris' as const },
      { id: 'e3', nom: 'Zen', couleur: 'gris' as const },
    ]
    const attributions = new Map([
      [candidatures[0].id, ['e1', 'e2']],
      [candidatures[1].id, ['e1']],
    ])
    const i = calculerIndicateurs(
      { ...vide, candidatures, offres, etiquettes, attributions },
      'tout',
      MAINTENANT,
    )
    expect(i.parOffre.map((o) => [o.offre?.titre ?? null, o.recues, o.retenues])).toEqual([
      ['Front', 2, 1],
      [null, 2, 0],
      ['Data', 1, 0],
    ])
    expect(i.parEtiquette.map((e) => [e.etiquette.nom, e.nombre])).toEqual([
      ['Senior', 2],
      ['Anglais', 1],
      ['Zen', 0],
    ])
  })
})

describe('mise en forme', () => {
  it('pourcentages, délais et mois en français', () => {
    expect(pourcentage(1, 3)).toBe('33 %')
    expect(pourcentage(0, 0)).toBe('—')
    expect(formaterDelai(0.4)).toBe('moins d’un jour')
    expect(formaterDelai(1.2)).toBe('1 jour')
    expect(formaterDelai(11.6)).toBe('12 jours')
    expect(libelleMois('2026-03')).toBe('mars 2026')
    expect(libelleMois('2025-12', true)).toBe('déc. 25')
  })
})
