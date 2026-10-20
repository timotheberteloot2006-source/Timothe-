import { describe, expect, it } from 'vitest'
import { finEntretien, genererIcs, prochainParCandidature, type Entretien } from './entretiens'

const entretien: Entretien = {
  id: 'e1',
  candidature_id: 'c1',
  debut: '2026-11-03T14:00:00.000Z',
  duree_minutes: 45,
  lieu: 'Visio, lien: https://meet.exemple.fr/abc; salle 2',
}

describe('genererIcs', () => {
  const ics = genererIcs(entretien, 'Alice Martin', new Date('2026-10-20T08:00:00Z'))
  const lignes = ics.split('\r\n')

  it('produit un événement iCalendar en UTC, avec la bonne fin', () => {
    expect(lignes).toContain('BEGIN:VEVENT')
    expect(lignes).toContain('UID:e1@filtre')
    expect(lignes).toContain('DTSTAMP:20261020T080000Z')
    expect(lignes).toContain('DTSTART:20261103T140000Z')
    expect(lignes).toContain('DTEND:20261103T144500Z')
    expect(lignes).toContain('SUMMARY:Entretien – Alice Martin')
    expect(ics.endsWith('END:VCALENDAR\r\n')).toBe(true)
  })

  it('échappe les virgules, points-virgules et retours à la ligne', () => {
    // Lignes dépliées : une ligne longue est coupée par « CRLF + espace »
    expect(ics.replace(/\r\n /g, '')).toContain(
      'LOCATION:Visio\\, lien: https://meet.exemple.fr/abc\\; salle 2',
    )
    expect(genererIcs({ ...entretien, lieu: 'C:\\Salle' }, 'X')).toContain('LOCATION:C:\\\\Salle')
    expect(genererIcs({ ...entretien, lieu: 'Ligne 1\nLigne 2' }, 'X')).toContain(
      'LOCATION:Ligne 1\\nLigne 2',
    )
  })

  it('plie les lignes à 75 octets', () => {
    const long = genererIcs({ ...entretien, lieu: 'é'.repeat(100) }, 'X')
    const lignesLongues = long.split('\r\n')
    for (const ligne of lignesLongues)
      expect(new TextEncoder().encode(ligne).length).toBeLessThanOrEqual(75)
    // Le dépliage (retirer « CRLF + espace ») redonne la ligne d'origine
    expect(long.replace(/\r\n /g, '')).toContain(`LOCATION:${'é'.repeat(100)}`)
  })

  it('omet le lieu s’il est absent', () => {
    expect(genererIcs({ ...entretien, lieu: null }, 'X')).not.toContain('LOCATION')
  })
})

describe('outils', () => {
  it('calcule la fin de l’entretien', () => {
    expect(finEntretien(entretien).toISOString()).toBe('2026-11-03T14:45:00.000Z')
  })

  it('garde le premier entretien à venir de chaque candidature', () => {
    const avecNom = (champs: Partial<Entretien>) => ({ ...entretien, nom_candidat: 'X', ...champs })
    const prochains = prochainParCandidature([
      avecNom({ id: 'a', debut: '2026-11-05T09:00:00Z' }),
      avecNom({ id: 'b', debut: '2026-11-04T09:00:00Z' }),
      avecNom({ id: 'c', candidature_id: 'c2', debut: '2026-11-06T09:00:00Z' }),
    ])
    expect(prochains.get('c1')?.id).toBe('b')
    expect(prochains.get('c2')?.id).toBe('c')
  })
})
