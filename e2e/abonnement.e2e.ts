import { expect, test } from '@playwright/test'
import { FauxSupabase, seConnecter } from './fauxSupabase.ts'

let faux: FauxSupabase

test.beforeEach(async ({ page }) => {
  faux = new FauxSupabase()
  await faux.installer(page)
  // Les pages Stripe ne sont pas chargées : on vérifie seulement la redirection
  await page.route('https://stripe.test/**', (route) =>
    route.fulfill({ contentType: 'text/html', body: '<h1>Stripe (simulé)</h1>' }),
  )
})

test('en Gratuit, la limite de 50 bloque l’ajout et mène au paiement', async ({ page }) => {
  faux.ajouter(...Array.from({ length: 50 }, () => ({})))
  await seConnecter(page, faux)

  await expect(
    page.getByText('Offre Gratuite : 50 / 50 candidatures — limite atteinte'),
  ).toBeVisible()
  await expect(page.getByRole('button', { name: 'Ajouter une candidature' })).toBeDisabled()
  await expect(page.getByRole('button', { name: 'Importer un CSV' })).toBeDisabled()

  await page.getByRole('link', { name: 'Passer à Pro' }).click()
  await page.getByRole('button', { name: 'Passer à Pro' }).click()
  await expect(page).toHaveURL('https://stripe.test/creer-checkout')
  expect(faux.fonctionsAppelees).toEqual(['creer-checkout'])
})

test('au retour du paiement, l’offre Pro s’affiche dès qu’elle est active', async ({ page }) => {
  await seConnecter(page, faux)
  await page.goto('/compte?abonnement=ok')
  await expect(page.getByText('Paiement reçu, activation de l’offre Pro en cours…')).toBeVisible()

  // Le webhook Stripe met l'abonnement à jour pendant que la page relit l'état
  faux.abonnement = { statut: 'active', fin_periode: '2026-11-20T10:00:00Z' }
  await expect(page.getByText('Merci ! Votre offre Pro est active.')).toBeVisible()
  await expect(page.getByText('prochain renouvellement le 20/11/2026')).toBeVisible()

  await page.getByRole('button', { name: 'Gérer mon abonnement' }).click()
  await expect(page).toHaveURL('https://stripe.test/portail-client')
})
