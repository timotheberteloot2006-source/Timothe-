import { describe, expect, it } from 'vitest'
import {
  estRobot,
  lireFormulaire,
  traduireErreur,
  TAILLE_MAX_CV,
  verifierCv,
} from './validation.ts'

const JETON = '11111111-1111-1111-1111-111111111111'
const CHAMPS = {
  jeton: JETON,
  nom: '  Alice Martin ',
  email: 'alice@exemple.fr',
  experience: '4',
  competences: 'React, TypeScript; react\nReact',
  consentement: 'oui',
}

describe('lireFormulaire', () => {
  it('nettoie les champs et dédoublonne les compétences', () => {
    expect(lireFormulaire(CHAMPS)).toEqual({
      candidature: {
        jeton: JETON,
        nom: 'Alice Martin',
        email: 'alice@exemple.fr',
        competences: ['React', 'TypeScript'],
        experience: 4,
      },
    })
  })

  it('expérience et compétences facultatives', () => {
    const resultat = lireFormulaire({ ...CHAMPS, experience: '', competences: '' })
    expect(resultat).toMatchObject({ candidature: { experience: 0, competences: [] } })
  })

  it.each([
    [{ jeton: 'abc' }, 'Lien de candidature invalide.'],
    [{ nom: '   ' }, 'Indiquez votre nom.'],
    [{ nom: 'x'.repeat(201) }, 'Le nom est trop long.'],
    [{ email: 'alice' }, 'Adresse e-mail invalide.'],
    [{ experience: '-1' }, 'Les années d’expérience doivent être un nombre entre 0 et 60.'],
    [{ experience: '2.5' }, 'Les années d’expérience doivent être un nombre entre 0 et 60.'],
    [{ experience: '61' }, 'Les années d’expérience doivent être un nombre entre 0 et 60.'],
    [{ competences: 'x'.repeat(61) }, 'Trop de compétences, ou compétence trop longue.'],
    [{ consentement: '' }, 'Votre accord est nécessaire pour transmettre votre candidature.'],
  ])('refuse %o', (modification, erreur) => {
    expect(lireFormulaire({ ...CHAMPS, ...modification })).toEqual({ erreur })
  })
})

describe('estRobot', () => {
  const maintenant = 1_000_000
  it('accepte un envoi humain', () => {
    expect(estRobot({ site_web: '', ouvert_le: String(maintenant - 10_000) }, maintenant)).toBe(
      false,
    )
  })
  it('repère le champ piège, l’envoi trop rapide ou sans heure d’ouverture', () => {
    expect(estRobot({ site_web: 'http://spam', ouvert_le: '0' }, maintenant)).toBe(true)
    expect(estRobot({ ouvert_le: String(maintenant - 1000) }, maintenant)).toBe(true)
    expect(estRobot({}, maintenant)).toBe(true)
  })
})

describe('verifierCv', () => {
  const octets = (texte: string) => new TextEncoder().encode(texte)
  it('accepte un PDF', () => {
    expect(verifierCv(octets('%PDF-1.7 …'))).toBeNull()
  })
  it('refuse un autre fichier, même nommé .pdf', () => {
    expect(verifierCv(octets('<html>'))).toBe('Le CV doit être un fichier PDF.')
  })
  it('refuse un fichier trop lourd', () => {
    expect(verifierCv(new Uint8Array(TAILLE_MAX_CV + 1))).toBe('Le CV ne doit pas dépasser 5 Mo.')
  })
})

describe('traduireErreur', () => {
  it('ne révèle ni la limite Gratuite ni les détails techniques', () => {
    expect(traduireErreur('limite_gratuite: 50 candidatures au plus').erreur).toBe(
      'Cette offre n’accepte plus de candidatures.',
    )
    expect(traduireErreur('trop_de_candidatures: …').status).toBe(429)
    expect(traduireErreur('duplicate key value violates…')).toEqual({
      erreur: 'Envoi impossible pour le moment : réessayez plus tard.',
      status: 500,
    })
  })
})
