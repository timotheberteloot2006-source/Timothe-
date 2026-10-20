import { expect, test } from '@playwright/test'
import { FauxSupabase, MOT_DE_PASSE, seConnecter } from './fauxSupabase.ts'

test.beforeEach(async ({ page }) => {
  await new FauxSupabase().installer(page)
})

test('le tableau de bord exige une connexion puis y ramène', async ({ page }) => {
  await page.goto('/tableau-de-bord')
  await expect(page).toHaveURL(/\/connexion\?redirect=%2Ftableau-de-bord/)

  await page.getByLabel('E-mail').fill('rh@exemple.fr')
  await page.getByLabel('Mot de passe').fill(MOT_DE_PASSE)
  await page.getByRole('button', { name: 'Se connecter' }).click()

  await expect(page).toHaveURL(/\/tableau-de-bord$/)
  await expect(page.getByRole('heading', { name: 'Candidatures' })).toBeVisible()
})

test('un mauvais mot de passe affiche une erreur en français', async ({ page }) => {
  await page.goto('/connexion')
  await page.getByLabel('E-mail').fill('rh@exemple.fr')
  await page.getByLabel('Mot de passe').fill('mauvais-mot')
  await page.getByRole('button', { name: 'Se connecter' }).click()
  await expect(page.getByRole('alert')).toHaveText('E-mail ou mot de passe incorrect.')
})

test('la déconnexion ramène à l’accueil et referme l’accès', async ({ page }) => {
  await seConnecter(page, new FauxSupabase())
  await page.getByRole('button', { name: 'Déconnexion' }).click()
  await expect(page).toHaveURL(/\/$/)
  await page.goto('/tableau-de-bord')
  await expect(page).toHaveURL(/\/connexion/)
})
