import { readFile } from 'node:fs/promises'
import { expect, test } from '@playwright/test'
import { FauxSupabase, seConnecter } from './fauxSupabase.ts'

let faux: FauxSupabase

test.beforeEach(async ({ page }) => {
  faux = new FauxSupabase()
  await faux.installer(page)
})

test('importer un CSV écarte les lignes invalides et les doublons', async ({ page }) => {
  faux.ajouter({ nom: 'Alice Martin', email: 'alice@exemple.fr' })
  await seConnecter(page, faux)

  const csv = [
    'Nom;E-mail;Compétences;Expérience',
    'Alice M.;ALICE@exemple.fr;;',
    'Chloé Petit;chloe@exemple.fr;"React, SQL";8',
    ';sans@nom.fr;;',
    'David;;Go;deux',
  ].join('\n')
  await page.getByRole('button', { name: 'Importer un CSV' }).click()
  await page.getByLabel('Fichier CSV').setInputFiles({
    name: 'candidats.csv',
    mimeType: 'text/csv',
    buffer: Buffer.from(csv),
  })
  await expect(page.getByText('1 candidature prête à importer.')).toBeVisible()
  await expect(page.getByText('Ligne 2 : Alice M. est déjà dans vos candidatures.')).toBeVisible()
  await expect(page.getByText('2 lignes invalides ignorées :')).toBeVisible()

  await page.getByRole('button', { name: 'Importer 1' }).click()
  await expect(page.getByRole('link', { name: 'Chloé Petit' })).toBeVisible()
  expect(faux.candidature('Chloé Petit')).toMatchObject({
    experience: 8,
    competences: ['React', 'SQL'],
  })
})

test('exporter ne contient que les candidatures filtrées', async ({ page }) => {
  faux.ajouter(
    { nom: 'Alice', competences: ['React'] },
    { nom: 'Bruno', competences: ['SQL'] },
    { nom: '=FORMULE()', competences: ['React'] },
  )
  await seConnecter(page, faux)
  await page.getByLabel('Compétences requises').fill('react')

  const [telechargement] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Exporter en CSV' }).click(),
  ])
  const contenu = await readFile((await telechargement.path())!, 'utf8')
  const lignes = contenu.replace(/^﻿/, '').trim().split('\r\n')
  expect(lignes.map((l) => l.split(';')[0])).toEqual(['nom', "'=FORMULE()", 'Alice'])
})
