import { describe, expect, it } from 'vitest'
import { nomArchive } from './rgpd'

describe('nomArchive', () => {
  it('nom sans accents ni caractères spéciaux, avec la date', () => {
    expect(nomArchive('Chloé O’Brien-Petit', new Date(2026, 2, 7))).toBe(
      'donnees-chloe-o-brien-petit-2026-03-07.zip',
    )
    expect(nomArchive('***', new Date(2026, 0, 1))).toBe('donnees-candidat-2026-01-01.zip')
  })
})
