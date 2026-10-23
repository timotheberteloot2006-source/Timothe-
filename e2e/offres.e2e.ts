import { expect, test, type Page } from '@playwright/test'
import { FauxSupabase, seConnecter } from './fauxSupabase.ts'

let faux: FauxSupabase

// Menu « Offre » de la barre de filtres (getByLabel inclurait le texte des options)
const filtreOffre = (page: Page) =>
  page.locator('main > section > div').getByRole('combobox', { name: 'Offre', exact: true })

test.beforeEach(async ({ page }) => {
  faux = new FauxSupabase()
  await faux.installer(page)
  page.on('dialog', (dialogue) => dialogue.accept())
})

test('créer, renommer et supprimer une offre', async ({ page }) => {
  await seConnecter(page, faux)
  await page.getByRole('link', { name: 'Offres', exact: true }).click()
  await expect(page.getByText('Aucune offre pour le moment.')).toBeVisible()

  await page.getByLabel('Nouvelle offre').fill('Développeur front')
  await page.getByRole('button', { name: 'Créer l’offre' }).click()
  await expect(page.getByText('Développeur front')).toBeVisible()
  await expect(page.getByLabel('Nouvelle offre')).toHaveValue('')

  // Titre déjà pris (majuscules ignorées)
  await page.getByLabel('Nouvelle offre').fill('développeur front')
  await page.getByRole('button', { name: 'Créer l’offre' }).click()
  await expect(page.getByRole('alert')).toHaveText('Une offre porte déjà ce titre.')

  await page.getByRole('button', { name: 'Renommer' }).click()
  await page.getByLabel('Nouveau titre de l’offre').fill('Développeur React')
  await page.getByRole('button', { name: 'Enregistrer' }).click()
  await expect(page.getByText('Développeur React')).toBeVisible()

  await page.getByRole('button', { name: 'Supprimer' }).click()
  await expect(page.getByText('Aucune offre pour le moment.')).toBeVisible()
})

test('rattacher, filtrer et détacher des candidatures', async ({ page }) => {
  const front = faux.ajouterOffre('Développeur front')
  faux.ajouterOffre('Data analyst')
  faux.ajouter({ nom: 'Alice', offre_id: front.id }, { nom: 'Bruno' })
  await seConnecter(page, faux)

  await expect(page.getByText('Offre : Développeur front')).toBeVisible()

  // Le filtre par offre présélectionne l'offre à l'ajout
  await filtreOffre(page).selectOption({ label: 'Développeur front' })
  await expect(page.getByText('1 candidature sur 2')).toBeVisible()
  await page.getByRole('button', { name: 'Ajouter une candidature' }).click()
  await expect(
    page.locator('form').getByRole('combobox', { name: 'Offre', exact: true }),
  ).toHaveValue(front.id)
  await page.getByLabel('Nom *').fill('Chloé')
  await page.getByRole('button', { name: 'Ajouter', exact: true }).click()
  await expect(page.getByText('2 candidatures sur 3')).toBeVisible()
  expect(faux.candidature('Chloé')?.offre_id).toBe(front.id)
  await page.getByRole('button', { name: 'Fermer' }).click()

  // Import rattaché à une autre offre
  await filtreOffre(page).selectOption({ label: 'Toutes' })
  await page.getByRole('button', { name: 'Importer un CSV' }).click()
  await page.getByLabel('Rattacher à l’offre').selectOption({ label: 'Data analyst' })
  await page.getByLabel('Fichier CSV').setInputFiles({
    name: 'a.csv',
    mimeType: 'text/csv',
    buffer: Buffer.from('nom\nDavid\nEmma\n'),
  })
  await page.getByRole('button', { name: 'Importer 2' }).click()
  await expect(page.getByText('5 candidatures sur 5')).toBeVisible()
  expect(faux.candidature('Emma')?.offre_id).toBe(faux.offre('Data analyst')?.id)

  await filtreOffre(page).selectOption({ label: 'Sans offre' })
  await expect(page.getByText('1 candidature sur 5')).toBeVisible()
  await expect(page.getByRole('link', { name: 'Bruno' })).toBeVisible()

  // La fiche mène aux candidatures de l'offre ; supprimer l'offre les détache
  await filtreOffre(page).selectOption({ label: 'Toutes' })
  await page.getByRole('link', { name: 'Alice' }).click()
  await page.getByRole('link', { name: 'Développeur front' }).click()
  await expect(page).toHaveURL(new RegExp(`offre=${front.id}`))
  await page.getByRole('link', { name: 'Offres', exact: true }).click()
  // Attendre la page des offres : les lignes du tableau de bord mentionnent aussi l'offre
  await expect(page.getByRole('heading', { name: 'Offres d’emploi' })).toBeVisible()
  await page
    .getByRole('listitem')
    .filter({ hasText: 'Développeur front' })
    .getByRole('button', { name: 'Supprimer' })
    .click()
  await expect(page.getByText('Développeur front')).toHaveCount(0)
  expect(faux.candidature('Alice')?.offre_id).toBeNull()
  expect(faux.candidatures).toHaveLength(5)
})
