import { describe, expect, it } from 'vitest'
import { formaterNote, resumerEvaluations, type Critere } from './evaluations'

const CRITERES: Critere[] = [
  { id: 'tech', nom: 'Technique', position: 0 },
  { id: 'com', nom: 'Communication', position: 1 },
]

describe('resumerEvaluations', () => {
  it('ma note, la moyenne de l’équipe par critère et la moyenne générale', () => {
    const resume = resumerEvaluations(
      [
        { critere_id: 'tech', user_id: 'moi', note: 4 },
        { critere_id: 'tech', user_id: 'lea', note: 5 },
        { critere_id: 'com', user_id: 'lea', note: 2 },
        // Critère supprimé entre-temps : ignoré
        { critere_id: 'ancien', user_id: 'lea', note: 1 },
      ],
      CRITERES,
      'moi',
    )
    expect(resume.parCritere).toEqual([
      { critere: CRITERES[0], mienne: 4, moyenne: 4.5, nombre: 2 },
      { critere: CRITERES[1], mienne: null, moyenne: 2, nombre: 1 },
    ])
    expect(resume.moyenne).toBe(3.7)
    expect(resume.evaluateurs).toBe(2)
  })

  it('sans note : rien à afficher', () => {
    const resume = resumerEvaluations([], CRITERES, 'moi')
    expect(resume.moyenne).toBeNull()
    expect(resume.evaluateurs).toBe(0)
    expect(resume.parCritere.every((c) => c.mienne === null && c.moyenne === null)).toBe(true)
  })

  it('formaterNote : une décimale, virgule française', () => {
    expect(formaterNote(4)).toBe('4,0')
    expect(formaterNote(3.66)).toBe('3,7')
  })
})
