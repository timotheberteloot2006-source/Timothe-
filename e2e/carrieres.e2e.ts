// Page carrières publique : réglée par le propriétaire, lue sans compte
import { expect, test } from '@playwright/test'
import { FauxSupabase, seConnecter } from './fauxSupabase.ts'

let faux: FauxSupabase

test.beforeEach(async ({ page }) => {
  faux = new FauxSupabase()
  await faux.installer(page)
})

test('le propriétaire met en ligne la page carrières de son espace', async ({ page }) => {
  faux.espaces[0].nom = 'Agence RH Lyon'
  await seConnecter(page, faux)
  await page.goto('/equipe')
  const carte = page.getByRole('heading', { name: 'Page carrières' }).locator('xpath=..')
  // Adresse proposée à partir du nom de l'espace
  await expect(carte.getByLabel('Adresse de la page')).toHaveValue('agence-rh-lyon')
  await carte.getByLabel('Présentation').fill('Cabinet de recrutement lyonnais.')
  await carte.getByLabel('Page en ligne').check()
  await carte.getByRole('button', { name: 'Enregistrer la page carrières' }).click()
  await expect(carte.getByRole('link', { name: /\/carrieres\/agence-rh-lyon$/ })).toBeVisible()
  expect(faux.espaces[0]).toMatchObject({
    slug: 'agence-rh-lyon',
    carrieres_publiques: true,
    presentation: 'Cabinet de recrutement lyonnais.',
  })

  // Adresse déjà prise par un autre espace
  faux.ajouterEspaceInvitant('Autre', 'autre@x.fr', { slug: 'prise' })
  await carte.getByLabel('Adresse de la page').fill('prise')
  await carte.getByRole('button', { name: 'Enregistrer la page carrières' }).click()
  await expect(page.getByRole('alert')).toHaveText(
    'Cette adresse est déjà prise : choisissez-en une autre.',
  )
  expect(faux.espaces[0].slug).toBe('agence-rh-lyon')
})

test('un visiteur voit les offres en ligne et peut postuler', async ({ page }) => {
  Object.assign(faux.espaces[0], {
    nom: 'Agence RH',
    slug: 'agence-rh',
    carrieres_publiques: true,
    presentation: 'Cabinet lyonnais.',
  })
  faux.ajouterOffre('Développeur front', { publique: true, description: 'CDI à Lyon.' })
  faux.ajouterOffre('comptable', { publique: true })
  faux.ajouterOffre('Poste interne', { publique: false })

  await page.goto('/carrieres/agence-rh')
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Agence RH')
  await expect(page).toHaveTitle('Offres d’emploi : Agence RH · Filtre')
  await expect(page.getByText('Cabinet lyonnais.')).toBeVisible()
  await expect(page.getByRole('heading', { level: 2 })).toHaveText('2 offres ouvertes')
  await expect(page.getByRole('heading', { level: 3 })).toHaveText([
    'comptable',
    'Développeur front',
  ])
  await expect(page.getByText('Poste interne')).toHaveCount(0)

  await page.getByRole('link', { name: 'Postuler : Développeur front' }).click()
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Développeur front')
  await expect(page.getByRole('button', { name: 'Envoyer ma candidature' })).toBeVisible()
})

test('page inconnue, hors ligne, ou sans offre ouverte', async ({ page }) => {
  await page.goto('/carrieres/inconnue')
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Page introuvable')

  Object.assign(faux.espaces[0], { slug: 'agence-rh', carrieres_publiques: false })
  await page.goto('/carrieres/agence-rh')
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Page introuvable')

  faux.espaces[0].carrieres_publiques = true
  await page.goto('/carrieres/agence-rh')
  await expect(page.getByText('Aucune offre ouverte pour le moment.')).toBeVisible()
})

test('un membre voit le lien de la page sans pouvoir la régler', async ({ page }) => {
  const { espace } = faux.ajouterEspaceInvitant('Agence RH', 'patronne@agence.fr', {
    slug: 'agence-rh',
    carrieres_publiques: true,
  })
  faux.membres.push({
    espace_id: espace.id,
    user_id: faux.utilisateur.id,
    email: faux.utilisateur.email,
    role: 'membre',
    created_at: '2026-01-02T00:00:00Z',
  })
  faux.espaceActif = espace.id
  await seConnecter(page, faux)
  await page.goto('/equipe')
  const carte = page.getByRole('heading', { name: 'Page carrières' }).locator('xpath=..')
  await expect(carte.getByRole('link', { name: /\/carrieres\/agence-rh$/ })).toBeVisible()
  await expect(carte).toContainText('Seul le propriétaire de l’espace peut la régler.')
  await expect(carte.getByRole('textbox')).toHaveCount(0)
})
