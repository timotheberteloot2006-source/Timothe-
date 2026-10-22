// Données à jour : un filtre changé pendant un rechargement ne garde pas les anciennes données,
// et les pages connectées se rafraîchissent seules pour montrer les modifications des collègues
import { expect, test, type Page } from '@playwright/test'
import { FauxSupabase, seConnecter } from './fauxSupabase.ts'

let faux: FauxSupabase

test.beforeEach(async ({ page }) => {
  faux = new FauxSupabase()
  await faux.installer(page)
})

// Compte les lectures de la liste des candidatures
function compterLectures(page: Page) {
  const compteur = { n: 0 }
  page.on('request', (r) => {
    if (r.method() === 'GET' && new URL(r.url()).pathname === '/rest/v1/candidatures') compteur.n++
  })
  return compteur
}

// Simule un onglet caché ou affiché de nouveau
function visibilite(page: Page, etat: 'hidden' | 'visible') {
  return page.evaluate((etat) => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => etat })
    document.dispatchEvent(new Event('visibilitychange'))
  }, etat)
}

test('un filtre changé pendant le rechargement montre les nouvelles données', async ({ page }) => {
  faux.ajouter({ nom: 'Alice' }, { nom: 'Bruno' }, { nom: 'Chloé' })
  faux.ajouterEtiquette('Senior', 'vert', 'Alice')
  await seConnecter(page, faux)
  // Rechargement lent : le filtre est changé avant sa fin
  await page.route('**/rest/v1/candidatures_etiquettes**', async (route) => {
    if (route.request().method() === 'GET') await new Promise((r) => setTimeout(r, 1500))
    await route.fallback()
  })
  await page.getByLabel('Sélectionner Bruno').check()
  await page.getByLabel('Ajouter une étiquette à la sélection').selectOption({ label: 'Senior' })
  await expect.poll(() => faux.etiquettesDe('Bruno')).toEqual(['Senior'])
  await page.getByLabel('Étiquette', { exact: true }).selectOption({ label: 'Senior' })
  await expect(page.getByText('2 candidatures sur 3')).toBeVisible()
})

test('changer un filtre ne recharge pas la liste ; y revenir, si', async ({ page }) => {
  faux.ajouter({ nom: 'Alice', competences: ['React'] }, { nom: 'Bruno' })
  await seConnecter(page, faux)
  await expect(page.getByRole('link', { name: 'Bruno' })).toBeVisible()
  await page.waitForLoadState('networkidle')
  const lectures = compterLectures(page)
  await page.getByLabel('Recherche').fill('ali')
  await expect(page.getByRole('link', { name: 'Bruno' })).toBeHidden()
  await page.getByLabel('Recherche').fill('')
  expect(lectures.n).toBe(0)

  // Un collègue ajoute une candidature pendant qu'on consulte une fiche
  await page.getByRole('link', { name: 'Alice' }).click()
  await expect(page.getByRole('heading', { name: 'Alice', level: 1 })).toBeVisible()
  faux.ajouter({ nom: 'Chloé' })
  await page.getByRole('link', { name: '← Retour aux candidatures' }).click()
  await expect(page.getByRole('link', { name: 'Chloé' })).toBeVisible()
})

test('rafraîchissement toutes les minutes, sans toucher à la saisie en cours', async ({ page }) => {
  await page.clock.install()
  faux.ajouter({ nom: 'Alice' })
  await seConnecter(page, faux)
  await page.getByRole('button', { name: 'Modifier' }).click()
  await page.getByRole('textbox', { name: 'Nom' }).fill('Alice Martin')

  // Un collègue ajoute une candidature
  faux.ajouter({ nom: 'Bruno' })
  await page.clock.runFor(61_000)
  await expect(page.getByRole('link', { name: 'Bruno' })).toBeVisible()
  await expect(page.getByRole('textbox', { name: 'Nom' })).toHaveValue('Alice Martin')
})

test('onglet caché : pas de rafraîchissement ; au retour, aussitôt', async ({ page }) => {
  await page.clock.install()
  faux.ajouter({ nom: 'Alice' })
  await seConnecter(page, faux)
  // Fin des chargements qui suivent la connexion
  await expect(page.getByRole('link', { name: 'Alice' })).toBeVisible()
  await page.waitForLoadState('networkidle')
  const lectures = compterLectures(page)

  await visibilite(page, 'hidden')
  faux.ajouter({ nom: 'Bruno' })
  await page.clock.runFor(181_000)
  expect(lectures.n).toBe(0)

  await visibilite(page, 'visible')
  await expect(page.getByRole('link', { name: 'Bruno' })).toBeVisible()
  expect(lectures.n).toBe(1)
})

test('coupure réseau pendant le rafraîchissement : la page et la saisie restent', async ({
  page,
}) => {
  await page.clock.install()
  faux.ajouter({ nom: 'Alice' })
  await seConnecter(page, faux)
  await page.getByRole('button', { name: 'Modifier' }).click()
  await page.getByRole('textbox', { name: 'Nom' }).fill('Alice Martin')
  await page.waitForLoadState('networkidle')

  // Plus de réseau : le rafraîchissement échoue
  await page.route('**/rest/v1/**', (route) => route.abort('internetdisconnected'))
  await page.clock.runFor(61_000)
  await expect(page.getByRole('status')).toContainText('Connexion perdue')
  await expect(page.getByRole('textbox', { name: 'Nom' })).toHaveValue('Alice Martin')
  await expect(page.getByText('Impossible de charger les candidatures')).toHaveCount(0)

  // Réseau revenu : données à jour, message retiré
  await page.unroute('**/rest/v1/**')
  faux.ajouter({ nom: 'Bruno' })
  await page.clock.runFor(61_000)
  await expect(page.getByRole('link', { name: 'Bruno' })).toBeVisible()
  await expect(page.getByRole('status')).not.toContainText('Connexion perdue')
  await expect(page.getByRole('textbox', { name: 'Nom' })).toHaveValue('Alice Martin')
})

test('arriver sur une page sans réseau affiche toujours l’erreur', async ({ page }) => {
  faux.ajouter({ nom: 'Alice' })
  await seConnecter(page, faux)
  await page.getByRole('link', { name: 'Alice' }).click()
  await expect(page.getByRole('heading', { name: 'Alice', level: 1 })).toBeVisible()
  await page.route('**/rest/v1/**', (route) => route.abort('internetdisconnected'))
  await page.getByRole('link', { name: '← Retour aux candidatures' }).click()
  await expect(page.getByText('Impossible de charger les candidatures')).toBeVisible()
})
