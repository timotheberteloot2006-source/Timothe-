// Vue tableau (Kanban) : colonnes par statut, déplacement au clavier et par glisser-déposer
import { expect, test, type Page } from '@playwright/test'
import { FauxSupabase, seConnecter } from './fauxSupabase.ts'

let faux: FauxSupabase

const colonne = (page: Page, nom: string) =>
  page.getByRole('region', { name: new RegExp(`^${nom}`) })

test.beforeEach(async ({ page }) => {
  faux = new FauxSupabase()
  await faux.installer(page)
  faux.ajouter(
    { nom: 'Alice Martin', competences: ['React'] },
    { nom: 'Bruno Léger', statut: 'retenu' },
    { nom: 'Chloé Petit', statut: 'ecarte', competences: ['SQL'] },
  )
  await seConnecter(page, faux)
})

test('affiche les candidatures en colonnes et garde la vue dans l’adresse', async ({ page }) => {
  await page.getByRole('button', { name: 'Tableau' }).click()
  await expect(page).toHaveURL(/vue=tableau/)
  await expect(page.getByRole('button', { name: 'Tableau' })).toHaveAttribute(
    'aria-pressed',
    'true',
  )
  await expect(colonne(page, 'Nouveau')).toContainText('Alice Martin')
  await expect(colonne(page, 'Retenu')).toContainText('Bruno Léger')
  await expect(colonne(page, 'Écarté')).toContainText('Chloé Petit')
  await expect(colonne(page, 'Nouveau').getByRole('heading')).toHaveText('Nouveau1')
  // Pas de sélection groupée ni de pagination en tableau
  await expect(page.getByText('Tout sélectionner')).toHaveCount(0)

  await page.reload()
  await expect(colonne(page, 'Retenu')).toContainText('Bruno Léger')
  await page.getByRole('button', { name: 'Liste' }).click()
  await expect(page).not.toHaveURL(/vue=/)
  await expect(page.getByLabel('Statut de Alice Martin')).toBeVisible()
})

test('déplace une candidature au clavier, avec annonce pour les lecteurs d’écran', async ({
  page,
}) => {
  await page.goto('/tableau-de-bord?vue=tableau')
  await page.getByRole('button', { name: 'Retenir Alice Martin' }).focus()
  await page.keyboard.press('Enter')
  await expect(colonne(page, 'Retenu')).toContainText('Alice Martin')
  await expect(colonne(page, 'Nouveau')).toContainText('Aucune candidature')
  await expect(page.getByText('Alice Martin : Retenu.')).toBeAttached()
  await expect.poll(() => faux.candidature('Alice Martin')!.statut).toBe('retenu')
})

test('déplace une candidature par glisser-déposer', async ({ page }) => {
  await page.goto('/tableau-de-bord?vue=tableau')
  const carte = colonne(page, 'Retenu').getByRole('listitem').filter({ hasText: 'Bruno Léger' })
  await carte.dragTo(colonne(page, 'Écarté'))
  await expect(colonne(page, 'Écarté')).toContainText('Bruno Léger')
  await expect.poll(() => faux.candidature('Bruno Léger')!.statut).toBe('ecarte')
})

test('les filtres s’appliquent aux colonnes ; réinitialiser garde le tableau', async ({ page }) => {
  await page.goto('/tableau-de-bord?vue=tableau')
  await page.getByLabel('Compétences').fill('SQL')
  await expect(colonne(page, 'Écarté')).toContainText('Chloé Petit')
  await expect(colonne(page, 'Nouveau')).not.toContainText('Alice Martin')
  await page.getByRole('button', { name: 'Réinitialiser les filtres' }).click()
  await expect(page).toHaveURL(/vue=tableau/)
  await expect(colonne(page, 'Nouveau')).toContainText('Alice Martin')
})

test('un déplacement refusé par la base remet la carte à sa place', async ({ page }) => {
  await page.route('**/rest/v1/candidatures**', (route) =>
    route.request().method() === 'PATCH'
      ? route.fulfill({
          status: 403,
          contentType: 'application/json',
          body: JSON.stringify({ code: '42501', message: 'Accès refusé' }),
        })
      : route.fallback(),
  )
  await page.goto('/tableau-de-bord?vue=tableau')
  await page.getByRole('button', { name: 'Écarter Alice Martin' }).click()
  await expect(page.getByRole('alert')).toBeVisible()
  await expect(colonne(page, 'Nouveau')).toContainText('Alice Martin')
  expect(faux.candidature('Alice Martin')!.statut).toBe('nouveau')
})
