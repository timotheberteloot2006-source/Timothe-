import { describe, expect, it } from 'vitest'
import { preparerCourriels, type Depot } from './courriels.ts'

const DEPOT: Depot = {
  resultat: 'creee',
  candidature: 'c1',
  offre_titre: 'Développeur front',
  espace_nom: 'Agence RH',
  accuse_reception: true,
  destinataires: ['rh@agence.fr', 'lea@agence.fr'],
}
const CANDIDAT = { nom: 'Alice Martin', email: 'alice@exemple.fr' }
const SITE = 'https://filtre.fr'

describe('preparerCourriels', () => {
  it('prévient chaque membre séparément et accuse réception au candidat', () => {
    const courriels = preparerCourriels(DEPOT, CANDIDAT, SITE)
    expect(courriels.map((c) => [c.to, c.subject])).toEqual([
      ['rh@agence.fr', 'Nouvelle candidature : Alice Martin (Développeur front)'],
      ['lea@agence.fr', 'Nouvelle candidature : Alice Martin (Développeur front)'],
      ['alice@exemple.fr', 'Candidature reçue : Développeur front'],
    ])
    expect(courriels[0].text).toContain('Voir la candidature : https://filtre.fr/candidatures/c1')
    expect(courriels[0].html).toContain('<a href="https://filtre.fr/candidatures/c1">')
    expect(courriels[0].text).toContain('page « Équipe », rubrique « Notifications »')
    expect(courriels[2].text).toContain(
      'Votre candidature au poste « Développeur front » a bien été transmise à Agence RH.',
    )
  })

  it('candidat déjà présent : l’équipe le sait, le candidat reçoit le même accusé', () => {
    const courriels = preparerCourriels({ ...DEPOT, resultat: 'deja_recue' }, CANDIDAT, SITE)
    expect(courriels[0].subject).toBe('Alice Martin a postulé à nouveau (Développeur front)')
    expect(courriels[2]).toEqual(preparerCourriels(DEPOT, CANDIDAT, SITE)[2])
  })

  it('sans accusé de réception ni membre à prévenir : aucun e-mail', () => {
    expect(
      preparerCourriels({ ...DEPOT, accuse_reception: false, destinataires: [] }, CANDIDAT, SITE),
    ).toEqual([])
  })

  it('l’accusé de réception ne reprend rien de ce que le candidat a saisi', () => {
    const intrus = { nom: 'Gagnez 1000 € sur http://arnaque.test', email: 'victime@exemple.fr' }
    const [accuse] = preparerCourriels({ ...DEPOT, destinataires: [] }, intrus, SITE)
    expect(accuse.to).toBe('victime@exemple.fr')
    expect(`${accuse.subject} ${accuse.text} ${accuse.html}`).not.toMatch(/arnaque|1000/)
  })

  it('échappe le HTML et met le nom sur une ligne de longueur raisonnable', () => {
    const [equipe] = preparerCourriels(
      { ...DEPOT, destinataires: ['rh@agence.fr'], accuse_reception: false },
      { nom: `<img src=x onerror=alert(1)>\n${'x'.repeat(200)}`, email: 'a@x.fr' },
      SITE,
    )
    expect(equipe.html).not.toContain('<img')
    expect(equipe.html).toContain('&lt;img src=x onerror=alert(1)&gt;')
    expect(equipe.subject).not.toContain('\n')
    // Nom coupé à 100 caractères
    expect(equipe.subject).toMatch(/^Nouvelle candidature : <img .{80,}…/)
    expect(equipe.subject.length).toBeLessThanOrEqual(150)
  })
})
