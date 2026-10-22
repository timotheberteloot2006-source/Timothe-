// Étiquettes : gestion sur la page Équipe, pose sur la fiche et par lot, filtre et export
import { readFile } from 'node:fs/promises'
import AxeBuilder from '@axe-core/playwright'
import { expect, test } from '@playwright/test'
import { FauxSupabase, seConnecter } from './fauxSupabase.ts'

let faux: FauxSupabase

test.beforeEach(async ({ page }) => {
  faux = new FauxSupabase()
  await faux.installer(page)
  page.on('dialog', (dialogue) => dialogue.accept())
})

test('créer, recolorer, renommer et supprimer une étiquette (page Équipe)', async ({ page }) => {
  faux.ajouter({ nom: 'Alice' })
  faux.ajouterEtiquette('Senior', 'gris', 'Alice')
  await seConnecter(page, faux)
  await page.goto('/equipe')

  await page.getByLabel('Nouvelle étiquette').fill('Télétravail')
  await page.getByLabel('Couleur', { exact: true }).selectOption('indigo')
  await page.getByRole('button', { name: 'Ajouter l’étiquette' }).click()
  await expect
    .poll(() => faux.etiquettes.map((e) => [e.nom, e.couleur]))
    .toEqual([
      ['Senior', 'gris'],
      ['Télétravail', 'indigo'],
    ])
  await expect(page.getByLabel('Nouvelle étiquette')).toHaveValue('')

  // Nom déjà pris, sans tenir compte des majuscules
  await page.getByLabel('Nouvelle étiquette').fill('senior')
  await page.getByRole('button', { name: 'Ajouter l’étiquette' }).click()
  await expect(page.getByRole('alert')).toHaveText('Une étiquette porte déjà ce nom.')

  await page.getByLabel('Couleur de l’étiquette « Senior »').selectOption('vert')
  await expect.poll(() => faux.etiquettes[0].couleur).toBe('vert')

  await page.getByRole('button', { name: 'Renommer l’étiquette « Senior »' }).click()
  await page.getByLabel('Nouveau nom de l’étiquette « Senior »').fill('Confirmé')
  await page.getByRole('button', { name: 'Enregistrer', exact: true }).click()
  await expect(
    page.getByRole('button', { name: 'Renommer l’étiquette « Confirmé »' }),
  ).toBeVisible()
  expect(faux.etiquettesDe('Alice')).toEqual(['Confirmé'])

  // Supprimée : retirée aussi des candidatures
  await page.getByRole('button', { name: 'Supprimer l’étiquette « Confirmé »' }).click()
  await expect.poll(() => faux.etiquettes.map((e) => e.nom)).toEqual(['Télétravail'])
  expect(faux.etiquettesDe('Alice')).toEqual([])
})

test('poser, créer et retirer des étiquettes sur la fiche, avec l’historique', async ({ page }) => {
  faux.ajouter({ nom: 'Alice Martin' })
  faux.ajouterEtiquette('Senior', 'vert')
  await seConnecter(page, faux)
  await page.goto(`/candidatures/${faux.candidature('Alice Martin')!.id}`)

  await page.getByLabel('Ajouter une étiquette').selectOption({ label: 'Senior' })
  const etiquettes = page.getByRole('list', { name: 'Étiquettes' })
  await expect(etiquettes).toHaveText(/Senior/)
  // Plus proposée une fois posée
  await expect(page.getByLabel('Ajouter une étiquette')).toBeHidden()

  await page.getByRole('button', { name: 'Nouvelle étiquette' }).click()
  await page.getByLabel('Nom de la nouvelle étiquette').fill('Télétravail')
  await page.getByRole('button', { name: 'Créer et ajouter' }).click()
  await expect(etiquettes.getByRole('listitem')).toHaveCount(2)
  expect(faux.etiquettesDe('Alice Martin')).toEqual(['Senior', 'Télétravail'])

  await page.getByRole('button', { name: 'Retirer l’étiquette « Senior » de Alice Martin' }).click()
  await expect(etiquettes.getByRole('listitem')).toHaveCount(1)
  expect(faux.etiquettesDe('Alice Martin')).toEqual(['Télétravail'])

  const historique = page.getByRole('heading', { name: 'Historique' }).locator('xpath=../..')
  await expect(historique).toContainText('Étiquette « Senior » retirée')
  await expect(historique).toContainText('Étiquette « Télétravail » ajoutée')
  await expect(historique).toContainText('Étiquette « Senior » ajoutée')
})

test('étiqueter par lot, filtrer, afficher dans le tableau et exporter', async ({ page }) => {
  faux.ajouter({ nom: 'Alice' }, { nom: 'Bruno' }, { nom: 'Chloé' })
  faux.ajouterEtiquette('Senior', 'vert', 'Alice')
  await seConnecter(page, faux)

  await page.getByLabel('Sélectionner Bruno').check()
  await page.getByLabel('Sélectionner Alice').check()
  await page.getByLabel('Ajouter une étiquette à la sélection').selectOption({ label: 'Senior' })
  await expect.poll(() => faux.etiquettesDe('Bruno')).toEqual(['Senior'])
  const ligneBruno = page
    .getByRole('listitem')
    .filter({ has: page.getByRole('link', { name: 'Bruno' }) })
  await expect(ligneBruno.getByRole('list', { name: 'Étiquettes' })).toHaveText('Senior')
  // Déjà posée sur Alice : rien de plus
  expect(faux.historique.filter((h) => h.action === 'etiquette_ajoutee')).toHaveLength(1)

  await page.getByLabel('Étiquette', { exact: true }).selectOption({ label: 'Senior' })
  await expect(page).toHaveURL(/etiquette=/)
  await expect(page.getByText('2 candidatures sur 3')).toBeVisible()
  await expect(page.getByRole('link', { name: 'Chloé' })).toBeHidden()

  const [telechargement] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Exporter en CSV' }).click(),
  ])
  const contenu = await readFile((await telechargement.path())!, 'utf8')
  const lignes = contenu.replace(/^﻿/, '').trim().split('\r\n')
  expect(lignes.map((l) => [l.split(';')[0], l.split(';')[8]])).toEqual([
    ['nom', 'etiquettes'],
    ['Bruno', 'Senior'],
    ['Alice', 'Senior'],
  ])

  // Retrait par lot
  await page.getByLabel('Sélectionner Bruno').check()
  await page.getByLabel('Retirer une étiquette de la sélection').selectOption({ label: 'Senior' })
  await expect.poll(() => faux.etiquettesDe('Bruno')).toEqual([])
  expect(faux.etiquettesDe('Alice')).toEqual(['Senior'])

  await page.getByRole('button', { name: 'Tableau' }).click()
  const carteAlice = page
    .getByRole('listitem')
    .filter({ has: page.getByRole('link', { name: 'Alice' }) })
  await expect(carteAlice.getByRole('list', { name: 'Étiquettes' })).toHaveText('Senior')
})

test('une étiquette inconnue dans l’adresse ne filtre rien', async ({ page }) => {
  faux.ajouter({ nom: 'Alice' }, { nom: 'Bruno' })
  faux.ajouterEtiquette('Senior', 'vert', 'Alice')
  await seConnecter(page, faux)
  await page.goto('/tableau-de-bord?etiquette=inconnue')
  await expect(page.getByText('2 candidatures sur 2')).toBeVisible()
  await expect(page.getByLabel('Étiquette', { exact: true })).toHaveValue('')
})

test('formulaire de création ouvert sur la fiche : accessible', async ({ page }) => {
  faux.ajouter({ nom: 'Alice Martin' })
  faux.ajouterEtiquette('Senior', 'ambre', 'Alice Martin')
  await seConnecter(page, faux)
  await page.goto(`/candidatures/${faux.candidature('Alice Martin')!.id}`)
  await page.getByRole('button', { name: 'Nouvelle étiquette' }).click()
  const { violations } = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze()
  expect(violations.map((v) => v.id)).toEqual([])
})
