import { expect, test } from '@playwright/test'
import { FauxSupabase, MOT_DE_PASSE, seConnecter } from './fauxSupabase.ts'

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

test('paiement en attente : on régularise l’abonnement existant, sans en ouvrir un second', async ({
  page,
}) => {
  faux.abonnement = { statut: 'past_due', fin_periode: '2026-11-20T10:00:00Z' }
  await seConnecter(page, faux)
  await page.goto('/tarifs')
  await expect(page.getByRole('button', { name: 'Passer à Pro' })).toHaveCount(0)
  await page.getByRole('button', { name: 'Gérer mon abonnement' }).click()
  await expect(page).toHaveURL('https://stripe.test/portail-client')
  expect(faux.fonctionsAppelees).toEqual(['portail-client'])
})

async function supprimerLeCompte(page: import('@playwright/test').Page) {
  await page.goto('/compte')
  const carte = page.getByRole('heading', { name: 'Supprimer mon compte' }).locator('xpath=..')
  await carte.getByLabel('Mot de passe').fill(MOT_DE_PASSE)
  await carte.getByLabel('Tapez SUPPRIMER pour confirmer').fill('SUPPRIMER')
  await carte.getByRole('button', { name: 'Supprimer définitivement' }).click()
}

test('suppression du compte refusée tant qu’un paiement est en attente, CV conservés', async ({
  page,
}) => {
  faux.abonnement = { statut: 'past_due', fin_periode: '2026-11-20T10:00:00Z' }
  faux.ajouter({ cv_chemin: 'moi/c1/cv.pdf' })
  faux.fichiers.add('moi/c1/cv.pdf')
  await seConnecter(page, faux)
  await supprimerLeCompte(page)
  await expect(page.getByText('Résiliez d’abord votre abonnement Pro')).toBeVisible()
  expect(faux.compteSupprime).toBe(false)
  expect([...faux.fichiers]).toEqual(['moi/c1/cv.pdf'])
})

test('suppression du compte : seuls les CV de mes espaces sont effacés', async ({ page }) => {
  faux.ajouter({ cv_chemin: 'moi/c1/cv.pdf' })
  faux.fichiers.add('moi/c1/cv.pdf')
  // Espace d'une autre équipe dont l'utilisateur est membre : ses CV restent
  const { espace } = faux.ajouterEspaceInvitant('Agence', 'patron@exemple.fr')
  faux.membres.push({
    espace_id: espace.id,
    user_id: faux.utilisateur.id,
    email: faux.utilisateur.email,
    role: 'membre',
    created_at: '2026-01-02T00:00:00Z',
  })
  faux.ajouter({ cv_chemin: 'agence/c2/cv.pdf', espace_id: espace.id })
  faux.fichiers.add('agence/c2/cv.pdf')

  await seConnecter(page, faux)
  await supprimerLeCompte(page)
  await page.waitForURL((url) => url.pathname === '/')
  expect(faux.compteSupprime).toBe(true)
  expect([...faux.fichiers]).toEqual(['agence/c2/cv.pdf'])
})
