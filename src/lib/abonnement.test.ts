import { describe, expect, it } from 'vitest'
import { estPro, LIMITE_GRATUITE, paiementEnAttente, placesRestantes } from './abonnement'

const avec = (statut: string | null) => ({ statut, fin_periode: null })

describe('abonnement', () => {
  it('est Pro seulement si actif ou en essai', () => {
    expect(estPro(avec('active'))).toBe(true)
    expect(estPro(avec('trialing'))).toBe(true)
    expect(estPro(avec('past_due'))).toBe(false)
    expect(estPro(avec('canceled'))).toBe(false)
    expect(estPro(avec(null))).toBe(false)
    expect(estPro(null)).toBe(false)
  })

  it('signale un paiement à régulariser', () => {
    expect(paiementEnAttente(avec('past_due'))).toBe(true)
    expect(paiementEnAttente(avec('active'))).toBe(false)
    expect(paiementEnAttente(null)).toBe(false)
  })

  it('calcule les places restantes', () => {
    expect(placesRestantes(false, 0)).toBe(LIMITE_GRATUITE)
    expect(placesRestantes(false, 48)).toBe(2)
    expect(placesRestantes(false, 51)).toBe(0)
    expect(placesRestantes(true, 500)).toBe(Infinity)
  })
})
