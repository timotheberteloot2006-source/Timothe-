import { describe, expect, it } from 'vitest'
import { preparerRappels, quand, type EntretienARappeler } from './rappels.ts'

// Lundi 2 novembre 2026, 17 h à Paris (16 h UTC)
const MAINTENANT = new Date('2026-11-02T16:00:00Z')
const PARIS = 'Europe/Paris'
const SITE = 'https://filtre.fr'

const entretien = (champs: Partial<EntretienARappeler>): EntretienARappeler => ({
  entretien: 'e1',
  debut: '2026-11-03T14:00:00Z',
  duree_minutes: 60,
  lieu: 'Visio',
  candidature: 'c1',
  candidat: 'Alice Martin',
  offre_titre: 'Développeur front',
  espace_nom: 'Agence RH',
  destinataires: ['rh@agence.fr'],
  ...champs,
})

describe('quand', () => {
  it('dit aujourd’hui, demain, ou la date, à l’heure du fuseau', () => {
    expect(quand(new Date('2026-11-02T19:30:00Z'), PARIS, MAINTENANT)).toBe('aujourd’hui à 20:30')
    expect(quand(new Date('2026-11-03T14:00:00Z'), PARIS, MAINTENANT)).toBe('demain à 15:00')
    expect(quand(new Date('2026-11-04T08:00:00Z'), PARIS, MAINTENANT)).toBe(
      'mercredi 4 novembre à 09:00',
    )
    // Même instant, autre fuseau : autre heure
    expect(quand(new Date('2026-11-03T14:00:00Z'), 'America/Montreal', MAINTENANT)).toBe(
      'demain à 09:00',
    )
  })
})

describe('preparerRappels', () => {
  it('un entretien : objet explicite, détails et lien vers la fiche', () => {
    const [courriel] = preparerRappels([entretien({})], SITE, PARIS, MAINTENANT)
    expect(courriel.to).toBe('rh@agence.fr')
    expect(courriel.subject).toBe('Rappel : entretien avec Alice Martin demain à 15:00')
    expect(courriel.text).toContain(
      'demain à 15:00 : Alice Martin (Développeur front, 60 min, lieu : Visio, espace « Agence RH »)',
    )
    expect(courriel.text).toContain('https://filtre.fr/candidatures/c1')
    expect(courriel.html).toContain('<a href="https://filtre.fr/candidatures/c1">')
    expect(courriel.text).toContain('rubrique « Notifications »')
  })

  it('un seul e-mail par destinataire, entretiens dans l’ordre, tous espaces confondus', () => {
    const courriels = preparerRappels(
      [
        entretien({
          entretien: 'e2',
          debut: '2026-11-03T16:00:00Z',
          candidat: 'Bruno',
          destinataires: ['rh@agence.fr', 'lea@agence.fr'],
        }),
        entretien({
          entretien: 'e1',
          debut: '2026-11-03T08:00:00Z',
          candidat: 'Alice',
          espace_nom: 'Autre',
        }),
      ],
      SITE,
      PARIS,
      MAINTENANT,
    )
    expect(courriels.map((c) => [c.to, c.subject])).toEqual([
      ['rh@agence.fr', 'Rappel : 2 entretiens à venir'],
      ['lea@agence.fr', 'Rappel : entretien avec Bruno demain à 17:00'],
    ])
    const texte = courriels[0].text
    expect(texte.indexOf('Alice')).toBeLessThan(texte.indexOf('Bruno'))
  })

  it('sans destinataire : aucun e-mail', () => {
    expect(preparerRappels([entretien({ destinataires: [] })], SITE, PARIS, MAINTENANT)).toEqual([])
  })

  it('échappe le HTML du nom saisi par un candidat et le garde sur une ligne', () => {
    const [courriel] = preparerRappels(
      [entretien({ candidat: '<script>x</script>\nAlice', lieu: null, offre_titre: null })],
      SITE,
      PARIS,
      MAINTENANT,
    )
    expect(courriel.html).not.toContain('<script>')
    expect(courriel.html).toContain('&lt;script&gt;')
    expect(courriel.subject).not.toContain('\n')
    expect(courriel.text).toContain('(60 min, espace « Agence RH »)')
  })
})
