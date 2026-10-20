import { describe, expect, it } from 'vitest'
import { lireCsv } from './csv'
import { analyserImport, MAX_LIGNES_IMPORT, MODELE_CSV } from './importCandidatures'

describe('lireCsv', () => {
  it('détecte le point-virgule et gère les guillemets', () => {
    expect(lireCsv('a;b\n"x;y";"il dit ""oui"""\n')).toEqual([
      ['a', 'b'],
      ['x;y', 'il dit "oui"'],
    ])
  })

  it('détecte la virgule, gère CRLF, le BOM et les retours à la ligne dans un champ', () => {
    expect(lireCsv('﻿a,b\r\n"1\n2",3\r\n\r\n')).toEqual([
      ['a', 'b'],
      ['1\n2', '3'],
    ])
  })
})

describe('analyserImport', () => {
  it('lit le modèle fourni', () => {
    expect(analyserImport(MODELE_CSV)).toEqual({
      candidatures: [
        {
          nom: 'Alice Martin',
          email: 'alice@exemple.fr',
          poste: 'Développeuse front',
          competences: ['React', 'TypeScript'],
          experience: 5,
        },
      ],
      erreurs: [],
    })
  })

  it('reconnaît les en-têtes avec accents, majuscules et dans le désordre', () => {
    const { candidatures } = analyserImport(
      'Expérience,Compétences,Nom,E-mail\n3,"SQL, Python",Bruno,\n',
    )
    expect(candidatures).toEqual([
      { nom: 'Bruno', email: null, poste: null, competences: ['SQL', 'Python'], experience: 3 },
    ])
  })

  it('signale les lignes invalides sans bloquer les autres', () => {
    const resultat = analyserImport('nom;experience\nAlice;2\n;4\nBruno;deux\nChloé;\n')
    expect(resultat.candidatures.map((c) => [c.nom, c.experience])).toEqual([
      ['Alice', 2],
      ['Chloé', 0],
    ])
    expect(resultat.erreurs).toEqual([
      'Ligne 3 : nom manquant.',
      'Ligne 4 : expérience « deux » invalide (nombre entier attendu).',
    ])
  })

  it('refuse un fichier sans colonne nom, vide ou trop long', () => {
    expect(analyserImport('email\na@b.fr\n').erreurs[0]).toContain('« nom » introuvable')
    expect(analyserImport('').erreurs).toEqual(['Le fichier est vide.'])
    const long = 'nom\n' + 'X\n'.repeat(MAX_LIGNES_IMPORT + 1)
    expect(analyserImport(long).erreurs[0]).toContain(`${MAX_LIGNES_IMPORT} lignes`)
  })
})
