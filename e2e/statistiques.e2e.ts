import { expect, test } from '@playwright/test'
import { FauxSupabase, seConnecter } from './fauxSupabase.ts'

test('la vue d’ensemble résume les candidatures et applique les filtres', async ({ page }) => {
  const faux = new FauxSupabase()
  await faux.installer(page)
  faux.ajouter(
    {
      nom: 'Alice',
      competences: ['React', 'SQL'],
      experience: 5,
      statut: 'retenu',
      cv_chemin: 'u/c1/cv.pdf',
    },
    { nom: 'Bruno', competences: ['react'], experience: 2 },
    { nom: 'Chloé', competences: ['SQL'], experience: 2, statut: 'ecarte' },
  )
  await seConnecter(page, faux)

  const vue = page.getByRole('region', { name: 'Vue d’ensemble' })
  await expect(vue.getByText('Expérience moyenne3 ans')).toBeVisible()
  await expect(vue.getByText('Avec CV1')).toBeVisible()
  await expect(vue.getByRole('button', { name: /React · 2/ })).toBeVisible()

  // Un statut filtre la liste ; un second clic retire le filtre
  const retenu = vue.getByRole('button', { name: /Retenu/ })
  await retenu.click()
  await expect(page).toHaveURL(/statut=retenu/)
  await expect(retenu).toHaveAttribute('aria-pressed', 'true')
  await expect(page.getByText('1 candidature sur 3')).toBeVisible()
  await retenu.click()
  await expect(page.getByText('3 candidatures sur 3')).toBeVisible()

  // Les compétences s'ajoutent au filtre « Compétences requises »
  await vue.getByRole('button', { name: /React · 2/ }).click()
  await vue.getByRole('button', { name: /SQL · 2/ }).click()
  await expect(page.getByLabel('Compétences requises')).toHaveValue('React, SQL')
  await expect(page.getByText('1 candidature sur 3')).toBeVisible()
  await vue.getByRole('button', { name: /React · 2/ }).click()
  await expect(page.getByLabel('Compétences requises')).toHaveValue('SQL')
})
