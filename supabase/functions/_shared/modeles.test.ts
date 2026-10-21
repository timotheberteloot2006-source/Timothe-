import { describe, expect, it } from 'vitest'
import { corpsHtml, expediteurPour, remplirModele, valeursModele } from './modeles.ts'

const VALEURS = { nom: 'Alice Martin', offre: 'Développeur front', espace: 'Agence RH' }

describe('remplirModele', () => {
  it('remplace les variables connues, laisse les autres accolades', () => {
    expect(
      remplirModele('Bonjour {nom}, poste « {offre} » chez {espace}. {inconnue}', VALEURS),
    ).toBe('Bonjour Alice Martin, poste « Développeur front » chez Agence RH. {inconnue}')
  })

  it('une valeur qui contient une variable n’est pas remplacée à son tour', () => {
    expect(remplirModele('{nom} / {espace}', { ...VALEURS, nom: '{espace}' })).toBe(
      '{espace} / Agence RH',
    )
  })
})

describe('valeursModele', () => {
  it('l’offre, à défaut le poste, à défaut « à pourvoir » ; noms sur une ligne', () => {
    const base = { nom: ' Alice\nMartin ', offre_titre: null, poste: null, espace_nom: 'Agence' }
    expect(valeursModele({ ...base, offre_titre: 'Dev', poste: 'Autre' }).offre).toBe('Dev')
    expect(valeursModele({ ...base, poste: 'Comptable' }).offre).toBe('Comptable')
    expect(valeursModele(base)).toEqual({
      nom: 'Alice Martin',
      offre: 'à pourvoir',
      espace: 'Agence',
    })
  })
})

describe('expediteurPour', () => {
  it('affiche le nom de l’espace, avec l’adresse d’envoi configurée', () => {
    expect(expediteurPour('Agence RH', 'Filtre <notifications@filtre.fr>')).toBe(
      '"Agence RH via Filtre" <notifications@filtre.fr>',
    )
    expect(expediteurPour('Agence', 'notifications@filtre.fr')).toBe(
      '"Agence via Filtre" <notifications@filtre.fr>',
    )
  })

  it('un nom d’espace ne peut pas fausser l’en-tête', () => {
    expect(expediteurPour('Pirate" <x@y.z>\nBcc: z@z.z', 'n@filtre.fr')).toBe(
      '"Pirate x@y.z Bcc: z@z.z via Filtre" <n@filtre.fr>',
    )
  })
})

describe('corpsHtml', () => {
  it('paragraphes, retours à la ligne et échappement', () => {
    expect(corpsHtml('Bonjour <b>Alice</b>,\n\nLigne 1\nLigne 2\n\n\n')).toBe(
      '<div style="font-family:sans-serif;line-height:1.5"><p>Bonjour &lt;b&gt;Alice&lt;/b&gt;,</p><p>Ligne 1<br>Ligne 2</p></div>',
    )
  })
})
