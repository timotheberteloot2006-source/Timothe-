import { describe, expect, it } from 'vitest'
import { ADRESSE_VALIDE, lienCarrieres, proposerAdresse } from './carrieres'

describe('proposerAdresse', () => {
  it('fabrique une adresse valide à partir du nom de l’espace', () => {
    expect(proposerAdresse('Agence RH Lyon')).toBe('agence-rh-lyon')
    expect(proposerAdresse('  Société Générale d’Études !  ')).toBe('societe-generale-d-etudes')
    expect(proposerAdresse('ÉCOLE 42')).toBe('ecole-42')
  })

  it('coupe à 40 caractères sans finir par un tiret', () => {
    const adresse = proposerAdresse(`${'a'.repeat(39)} b`)
    expect(adresse).toBe('a'.repeat(39))
    expect(ADRESSE_VALIDE.test(adresse)).toBe(true)
  })

  it('renonce quand le nom ne donne rien d’utilisable', () => {
    expect(proposerAdresse('—')).toBe('')
    expect(proposerAdresse('A')).toBe('')
  })

  it('lien public', () => {
    expect(lienCarrieres('agence-rh', 'https://filtre.fr')).toBe(
      'https://filtre.fr/carrieres/agence-rh',
    )
  })
})
