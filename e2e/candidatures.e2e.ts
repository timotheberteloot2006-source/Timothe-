import { expect, test, type Page } from '@playwright/test'
import { FauxSupabase, seConnecter } from './fauxSupabase.ts'

let faux: FauxSupabase

test.beforeEach(async ({ page }) => {
  faux = new FauxSupabase()
  await faux.installer(page)
  page.on('dialog', (dialogue) => dialogue.accept())
})

// Liens des noms, dans l'ordre affiché (toHaveText attend que la liste soit chargée)
const nomsAffiches = (page: Page) => page.locator('main ul > li p a')
// Une ligne de candidature = une case « Sélectionner … » (les compétences sont aussi des <li>)
const lignes = (page: Page) => page.getByRole('checkbox', { name: /^Sélectionner / })

test('ajouter, modifier et refuser un e-mail en double', async ({ page }) => {
  faux.ajouter({ nom: 'Alice Martin', email: 'alice@exemple.fr' })
  await seConnecter(page, faux)

  await page.getByRole('button', { name: 'Ajouter une candidature' }).click()
  await page.getByLabel('Nom *').fill('Bruno Léger')
  await page.getByLabel('Poste visé').fill('Data analyst')
  await page.getByLabel('Compétences', { exact: true }).fill('SQL; Python, sql')
  await page.getByRole('button', { name: 'Ajouter', exact: true }).click()
  await expect(page.getByRole('link', { name: 'Bruno Léger' })).toBeVisible()
  expect(faux.candidature('Bruno Léger')?.competences).toEqual(['SQL', 'Python'])

  // E-mail déjà utilisé par Alice (majuscules ignorées)
  await page.getByRole('button', { name: 'Fermer' }).click()
  const ligne = page.locator('li', { has: page.getByRole('link', { name: 'Bruno Léger' }) })
  await ligne.getByRole('button', { name: 'Modifier' }).click()
  await page.getByLabel('E-mail').fill('ALICE@exemple.fr')
  await page.getByRole('button', { name: 'Enregistrer' }).click()
  await expect(page.getByRole('alert')).toHaveText('Une candidature avec cet e-mail existe déjà.')

  await page.getByLabel('E-mail').fill('bruno@exemple.fr')
  await page.getByRole('button', { name: 'Enregistrer' }).click()
  await expect(page.getByText('bruno@exemple.fr')).toBeVisible()
})

test('filtres et tri sont gardés dans l’adresse', async ({ page }) => {
  faux.ajouter(
    { nom: 'anne', competences: ['React', 'SQL'], experience: 5 },
    { nom: 'Éric', competences: ['React'], experience: 2 },
    { nom: 'Béa', competences: ['react', 'sql'], experience: 7 },
  )
  await seConnecter(page, faux)
  await expect(nomsAffiches(page)).toHaveText(['Béa', 'Éric', 'anne'])

  await page.getByLabel('Compétences requises').fill('react, SQL')
  await page.getByLabel('Trier par').selectOption('nom')
  await expect(page).toHaveURL(/competences=react/)
  await expect(nomsAffiches(page)).toHaveText(['anne', 'Béa'])

  await page.reload()
  await expect(page.getByLabel('Trier par')).toHaveValue('nom')
  await expect(nomsAffiches(page)).toHaveText(['anne', 'Béa'])

  await page.getByRole('button', { name: 'Réinitialiser les filtres' }).click()
  await expect(lignes(page)).toHaveCount(3)
})

test('pagination et actions groupées', async ({ page }) => {
  faux.abonnement = { statut: 'active', fin_periode: null }
  faux.ajouter(...Array.from({ length: 30 }, (_, i) => ({ nom: `Candidat ${i + 1}` })))
  await seConnecter(page, faux)

  await expect(page.getByText('Page 1 sur 2')).toBeVisible()
  await page.getByLabel('Tout sélectionner sur cette page').check()
  await expect(page.getByText('25 sélectionnées')).toBeVisible()
  await page.getByLabel('Sélectionner Candidat 30').uncheck()
  await page.getByLabel('Changer le statut de la sélection').selectOption('retenu')
  await expect(page.getByText('Tout sélectionner sur cette page')).toBeVisible()
  expect(faux.candidatures.filter((c) => c.statut === 'retenu')).toHaveLength(24)
  expect(faux.candidature('Candidat 30')?.statut).toBe('nouveau')

  // La sélection ne survit pas à un changement de page
  await page.getByLabel('Sélectionner Candidat 29').check()
  await page.getByRole('button', { name: 'Suivante →' }).click()
  await expect(page).toHaveURL(/page=2/)
  await expect(lignes(page)).toHaveCount(5)
  await page.goBack()
  await expect(page.getByText('Tout sélectionner sur cette page')).toBeVisible()

  await page.getByLabel('Sélectionner Candidat 30').check()
  await page.getByLabel('Sélectionner Candidat 28').check()
  await page.locator('main').getByRole('button', { name: 'Supprimer', exact: true }).first().click()
  await expect(page.getByText('28 candidatures sur 28')).toBeVisible()
  expect(faux.candidature('Candidat 30')).toBeUndefined()
})
