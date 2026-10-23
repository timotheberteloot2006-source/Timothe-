import { describe, expect, it } from 'vitest'
import type { Candidature } from './candidatures'
import { lireCsv } from './csv'
import { genererCsv, nomFichierExport } from './exportCandidatures'
import { analyserImport } from './importCandidatures'

function candidature(champs: Partial<Candidature>): Candidature {
  return {
    id: 'x',
    nom: 'Sans nom',
    email: null,
    poste: null,
    competences: [],
    experience: 0,
    statut: 'nouveau',
    created_at: '2026-03-05T10:00:00Z',
    cv_chemin: null,
    offre_id: null,
    espace_id: 'e1',
    ...champs,
  }
}

const alice = candidature({
  nom: 'Alice Martin',
  email: 'alice@exemple.fr',
  poste: 'Développeuse; front',
  competences: ['React', 'TypeScript'],
  experience: 5,
  statut: 'retenu',
})

describe('genererCsv', () => {
  it('commence par le BOM et utilise ; et CRLF', () => {
    const csv = genererCsv([alice])
    expect(
      csv.startsWith(
        '\uFEFFnom;email;poste;competences;experience;statut;ajoutee le;offre;etiquettes\r\n',
      ),
    ).toBe(true)
    expect(csv).toContain(
      'Alice Martin;alice@exemple.fr;"Développeuse; front";React, TypeScript;5;Retenu;05/03/2026;;\r\n',
    )
  })

  it('échappe les guillemets et les retours à la ligne', () => {
    const csv = genererCsv([candidature({ nom: 'Jean "JJ" Dupont', poste: 'Chef\nde projet' })])
    expect(lireCsv(csv)[1].slice(0, 3)).toEqual(['Jean "JJ" Dupont', '', 'Chef\nde projet'])
  })

  it('neutralise les cellules interprétables comme des formules', () => {
    const csv = genererCsv([
      candidature({ nom: '=HYPERLINK("http://x")', poste: '+33 6', email: '@moi' }),
    ])
    expect(lireCsv(csv)[1].slice(0, 3)).toEqual(['\'=HYPERLINK("http://x")', "'@moi", "'+33 6"])
  })

  it('peut être réimporté', () => {
    const bruno = candidature({ nom: 'Bruno Léger', competences: ['SQL'], experience: 2 })
    expect(analyserImport(genererCsv([alice, bruno]))).toEqual({
      candidatures: [
        {
          nom: 'Alice Martin',
          email: 'alice@exemple.fr',
          poste: 'Développeuse; front',
          competences: ['React', 'TypeScript'],
          experience: 5,
        },
        { nom: 'Bruno Léger', email: null, poste: null, competences: ['SQL'], experience: 2 },
      ],
      erreurs: [],
      doublons: [],
    })
  })
})

describe('colonne offre', () => {
  it('donne le titre de l’offre rattachée', () => {
    const csv = genererCsv(
      [alice, candidature({ nom: 'Lié', offre_id: 'o1' })],
      new Map([['o1', 'Data; BI']]),
    )
    expect(lireCsv(csv).map((l) => l[7])).toEqual(['offre', '', 'Data; BI'])
  })
})

describe('colonne etiquettes', () => {
  it('donne les noms des étiquettes posées', () => {
    const csv = genererCsv(
      [alice, candidature({ id: 'c2', nom: 'Étiquetée' })],
      new Map(),
      undefined,
      new Map([['c2', ['=Piège', 'Senior']]]),
    )
    expect(lireCsv(csv).map((l) => l[8])).toEqual(['etiquettes', '', "'=Piège, Senior"])
  })
})

describe('nomFichierExport', () => {
  it('contient la date du jour', () => {
    expect(nomFichierExport(new Date(2026, 0, 7))).toBe('candidatures-2026-01-07.csv')
  })
})
