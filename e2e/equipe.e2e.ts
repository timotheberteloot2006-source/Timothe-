import { expect, test } from '@playwright/test'
import { FauxSupabase, MOT_DE_PASSE, seConnecter } from './fauxSupabase.ts'

let faux: FauxSupabase

test.beforeEach(async ({ page }) => {
  faux = new FauxSupabase()
  await faux.installer(page)
  page.on('dialog', (dialogue) => dialogue.accept())
})

test('le propriétaire renomme son espace et gère les liens d’invitation', async ({ page }) => {
  await seConnecter(page, faux)
  await page.getByRole('link', { name: 'Équipe', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Équipe', level: 1 })).toBeVisible()
  await expect(page.getByText('rh@exemple.fr (vous)')).toBeVisible()

  await page.getByLabel('Nom de l’espace').fill('Cabinet Martin')
  await page.getByRole('button', { name: 'Renommer' }).click()
  await expect(page.getByRole('heading', { name: 'Espace « Cabinet Martin »' })).toBeVisible()

  await page.getByRole('button', { name: 'Créer un lien d’invitation' }).click()
  const lien = page.getByRole('textbox', { name: /Lien valable jusqu’au/ })
  await expect(lien).toHaveValue(new RegExp(`/invitation/${faux.invitations[0].jeton}$`))

  await page.getByRole('button', { name: 'Révoquer' }).click()
  await expect(lien).toHaveCount(0)
  expect(faux.invitations).toHaveLength(0)

  // Le nom de l'espace apparaît dans le tableau de bord
  await page.getByRole('link', { name: 'Tableau de bord' }).click()
  await expect(page.getByText('Espace « Cabinet Martin »')).toBeVisible()
})

test('un invité rejoint un espace, y travaille, puis revient au sien', async ({ page }) => {
  faux.ajouter({ nom: 'Mon candidat' })
  const { espace, jeton } = faux.ajouterEspaceInvitant('Agence RH', 'patronne@agence.fr')
  faux.ajouter({ nom: 'Candidat de l’agence', espace_id: espace.id })

  // Sans session, le lien mène à la connexion puis revient à l'invitation
  await page.goto(`/invitation/${jeton}`)
  await expect(page).toHaveURL(/\/connexion\?redirect=/)
  await page.getByLabel('E-mail').fill(faux.utilisateur.email)
  await page.getByLabel('Mot de passe').fill(MOT_DE_PASSE)
  await page.getByRole('button', { name: 'Se connecter' }).click()
  await expect(
    page.getByRole('heading', { name: 'Rejoindre l’espace « Agence RH »' }),
  ).toBeVisible()
  await expect(page.getByText('patronne@agence.fr vous invite')).toBeVisible()

  await page.getByRole('button', { name: 'Rejoindre l’espace' }).click()
  await expect(page).toHaveURL(/\/tableau-de-bord$/)
  await expect(page.getByText('Espace « Agence RH » · 2 membres')).toBeVisible()
  await expect(page.getByRole('link', { name: 'Candidat de l’agence' })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Mon candidat' })).toHaveCount(0)
  // Seul le propriétaire gère l'abonnement de l'espace
  await expect(
    page.getByText('Le propriétaire de l’espace peut passer à l’offre Pro.'),
  ).toBeVisible()

  // Ce que l'invité ajoute arrive dans l'espace de l'agence
  await page.getByRole('button', { name: 'Ajouter une candidature' }).click()
  await page.getByLabel('Nom *').fill('Ajout de l’invité')
  await page.getByRole('button', { name: 'Ajouter', exact: true }).click()
  await expect(page.getByRole('link', { name: 'Ajout de l’invité' })).toBeVisible()
  expect(faux.candidature('Ajout de l’invité')?.espace_id).toBe(espace.id)

  // Retour à son propre espace depuis la page Équipe
  await page.getByRole('link', { name: '2 membres' }).click()
  await expect(page.getByRole('button', { name: 'Quitter l’espace' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Créer un lien d’invitation' })).toHaveCount(0)
  await page
    .getByRole('listitem')
    .filter({ hasText: 'Mon espace' })
    .getByRole('button', { name: 'Ouvrir' })
    .click()
  await page.getByRole('link', { name: 'Tableau de bord' }).click()
  await expect(page.getByRole('link', { name: 'Mon candidat' })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Candidat de l’agence' })).toHaveCount(0)

  // Le lien a déjà servi : il ne peut plus être utilisé par quelqu'un d'autre, mais l'invité
  // déjà membre peut rouvrir l'espace
  expect(faux.invitations[0].utilisee).toBe(true)
  await page.goto(`/invitation/${jeton}`)
  await page.getByRole('button', { name: 'Vous êtes déjà membre : ouvrir l’espace' }).click()
  await expect(page.getByText('Espace « Agence RH »')).toBeVisible()
})

test('quitter un espace ramène à son espace personnel', async ({ page }) => {
  const { espace, jeton } = faux.ajouterEspaceInvitant('Agence RH', 'patronne@agence.fr')
  faux.ajouter({ nom: 'Candidat de l’agence', espace_id: espace.id })
  await seConnecter(page, faux)
  await page.goto(`/invitation/${jeton}`)
  await page.getByRole('button', { name: 'Rejoindre l’espace' }).click()
  await expect(page.getByRole('link', { name: 'Candidat de l’agence' })).toBeVisible()

  await page.goto('/equipe')
  await page.getByRole('button', { name: 'Quitter l’espace' }).click()
  await expect(page.getByRole('heading', { name: 'Espace « Mon espace »' })).toBeVisible()
  expect(faux.membres.filter((m) => m.espace_id === espace.id)).toHaveLength(1)
})

test('un lien invalide ou inconnu est refusé', async ({ page }) => {
  await seConnecter(page, faux)
  await page.goto('/invitation/00000000-0000-0000-0000-000000000000')
  await expect(page.getByRole('heading', { name: 'Invitation invalide' })).toBeVisible()
  await page.goto('/invitation/pas-un-jeton')
  await expect(page.getByRole('heading', { name: 'Invitation invalide' })).toBeVisible()
})
