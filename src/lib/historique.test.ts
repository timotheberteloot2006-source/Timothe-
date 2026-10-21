import { describe, expect, it } from 'vitest'
import { auteur, decrireEvenement } from './historique'

const decrire = (action: string, details: Record<string, unknown> = {}) =>
  decrireEvenement({ action, details })

describe('decrireEvenement', () => {
  it('décrit chaque action en français', () => {
    expect(decrire('creation')).toBe('Candidature créée')
    expect(decrire('statut', { avant: 'nouveau', apres: 'ecarte' })).toBe(
      'Statut : Nouveau → Écarté',
    )
    expect(decrire('modification', { champs: ['poste', 'competences', 'offre'] })).toBe(
      'Fiche modifiée (poste, compétences, offre)',
    )
    expect(decrire('cv_ajoute')).toBe('CV ajouté')
    expect(decrire('cv_remplace')).toBe('CV remplacé')
    expect(decrire('cv_retire')).toBe('CV supprimé')
    expect(decrire('note_ajoutee')).toBe('Note ajoutée')
    expect(decrire('note_supprimee')).toBe('Note supprimée')
  })

  it('indique la date des entretiens, à l’heure locale', () => {
    // Fuseau Europe/Paris (vite.config.ts) : 14 h UTC = 15 h en novembre
    expect(decrire('entretien_planifie', { debut: '2026-11-03T14:00:00Z' })).toBe(
      'Entretien planifié (mardi 3 novembre 2026 à 15:00)',
    )
    expect(decrire('entretien_supprime', {})).toBe('Entretien supprimé')
  })

  it('reste lisible pour des données inattendues', () => {
    expect(decrire('modification', {})).toBe('Fiche modifiée')
    expect(decrire('statut', { avant: 'inconnu', apres: 'retenu' })).toBe(
      'Statut : inconnu → Retenu',
    )
    expect(decrire('action_future')).toBe('action_future')
  })
})

describe('auteur', () => {
  const evenement = (champs: Partial<Parameters<typeof auteur>[0]>) => ({
    user_id: null,
    email: null,
    par_systeme: false,
    ...champs,
  })

  it('distingue soi, un autre membre, un compte supprimé et une action automatique', () => {
    expect(auteur(evenement({ user_id: 'u1', email: 'a@x.fr' }), 'u1')).toBe('vous')
    expect(auteur(evenement({ user_id: 'u2', email: 'b@x.fr' }), 'u1')).toBe('b@x.fr')
    expect(auteur(evenement({}), 'u1')).toBe('compte supprimé')
    expect(auteur(evenement({ par_systeme: true }), 'u1')).toBe('automatique')
  })
})
