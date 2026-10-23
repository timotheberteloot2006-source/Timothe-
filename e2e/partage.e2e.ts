// Partage d'une candidature : lien en lecture seule créé sur la fiche, ouvert sans compte
import { expect, test } from '@playwright/test'
import { FauxSupabase, seConnecter } from './fauxSupabase.ts'

let faux: FauxSupabase

test.beforeEach(async ({ context }) => {
  faux = new FauxSupabase()
  // Sur tout le contexte : l'onglet du CV passe aussi par le faux Supabase
  await faux.installer(context)
  faux.ajouter({
    nom: 'Alice Martin',
    email: 'alice@exemple.fr',
    poste: 'Développeuse',
    competences: ['React', 'SQL'],
    experience: 5,
    cv_chemin: 'u/c1/cv.pdf',
  })
  faux.notes.push({
    id: 'n1',
    candidature_id: faux.candidature('Alice Martin')!.id,
    contenu: 'Très bon entretien.',
    created_at: '2026-01-05T10:00:00Z',
  })
  faux.ajouterEtiquette('Senior', 'vert', 'Alice Martin')
})

test('créer un lien sur la fiche, l’ouvrir sans compte, le révoquer', async ({ page, browser }) => {
  page.on('dialog', (dialogue) => dialogue.accept())
  await seConnecter(page, faux)
  await page.goto(`/candidatures/${faux.candidature('Alice Martin')!.id}`)
  const carte = page.getByRole('heading', { name: 'Partage' }).locator('xpath=../..')

  await carte.getByLabel('Valable').selectOption({ label: '24 heures' })
  await expect(carte.getByLabel('Inclure le CV')).toBeChecked()
  await carte.getByRole('button', { name: 'Créer un lien' }).click()
  const lien = carte.getByLabel('Lien de partage')
  await expect(lien).toHaveValue(/\/partage\/[0-9a-f-]{36}$/)
  const partage = faux.partages[0]
  expect(partage).toMatchObject({ avec_cv: true, avec_notes: false })
  // 24 heures, à quelques secondes près
  expect(
    Math.abs(new Date(partage.expire_le).getTime() - Date.now() - 24 * 3600 * 1000),
  ).toBeLessThan(60_000)
  await expect(carte).toContainText('CV inclus · jamais ouvert')

  // Un manager, sans compte, dans un autre navigateur
  const contexte = await browser.newContext()
  await faux.installer(contexte)
  const manager = await contexte.newPage()
  await manager.goto(new URL(await lien.inputValue()).pathname)
  await expect(manager.getByRole('heading', { name: 'Alice Martin', level: 1 })).toBeVisible()
  await expect(manager).toHaveTitle('Alice Martin · Filtre')
  await expect(manager.locator('meta[name="robots"]')).toHaveAttribute(
    'content',
    'noindex, nofollow',
  )
  await expect(manager.getByText('Développeuse')).toBeVisible()
  await expect(manager.getByText('Senior')).toBeVisible()
  // Jamais l'e-mail ; pas de notes, elles ne sont pas incluses
  await expect(manager.getByText('alice@exemple.fr')).toHaveCount(0)
  await expect(manager.getByText('Très bon entretien.')).toHaveCount(0)
  // Le PDF s'ouvre dans un nouvel onglet par un lien signé (téléchargé par Chromium sans écran)
  const [ouverture] = await Promise.all([
    contexte.waitForEvent('request', (r) => r.url().includes('/storage/v1/object/sign/cv/')),
    manager.getByRole('button', { name: 'Ouvrir le CV (PDF)' }).click(),
  ])
  expect(ouverture.url()).toContain('cv/u/c1/cv.pdf?token=partage')
  expect(faux.partages[0].consultations).toBe(1)

  // La consultation apparaît sur la fiche (rafraîchie)
  await page.reload()
  await expect(carte).toContainText('ouvert 1 fois')

  await carte.getByRole('button', { name: 'Révoquer' }).click()
  await expect(carte.getByLabel('Lien de partage')).toHaveCount(0)
  await expect(carte).toContainText('1 ancien lien expiré ou révoqué.')
  const historique = page.getByRole('heading', { name: 'Historique' }).locator('xpath=../..')
  await expect(historique).toContainText('Lien de partage révoqué')
  await expect(historique).toContainText('Lien de partage créé, valable jusqu’au')

  await manager.reload()
  await expect(manager.getByRole('heading', { name: 'Lien de partage expiré' })).toBeVisible()
  await expect(manager.getByText('Alice Martin')).toHaveCount(0)
  await contexte.close()
})

test('notes incluses à la demande ; lien inconnu ou mal formé', async ({ page }) => {
  const alice = faux.candidature('Alice Martin')!
  const { jeton } = faux.ajouterPartage(alice.id, { avec_notes: true })
  await page.goto(`/partage/${jeton}`)
  await expect(page.getByText('Très bon entretien.')).toBeVisible()
  // CV non inclus : pas de bouton
  await expect(page.getByRole('button', { name: 'Ouvrir le CV (PDF)' })).toHaveCount(0)

  await page.goto('/partage/00000000-0000-0000-0000-000000000000')
  await expect(page.getByRole('heading', { name: 'Lien de partage expiré' })).toBeVisible()
  await page.goto('/partage/pas-un-lien')
  await expect(page.getByRole('heading', { name: 'Lien de partage expiré' })).toBeVisible()
})

test('10 liens valables au plus par candidature', async ({ page }) => {
  const alice = faux.candidature('Alice Martin')!
  for (let i = 0; i < 9; i++) faux.ajouterPartage(alice.id)
  // Un lien expiré ne compte pas
  faux.ajouterPartage(alice.id, { expire_le: new Date(Date.now() - 1000).toISOString() })
  await seConnecter(page, faux)
  await page.goto(`/candidatures/${alice.id}`)
  const carte = page.getByRole('heading', { name: 'Partage' }).locator('xpath=../..')
  await carte.getByRole('button', { name: 'Créer un lien' }).click()
  await expect(carte.getByLabel('Lien de partage')).toHaveCount(10)
  await expect(carte).toContainText('10 liens valables au plus : révoquez-en un')
  await expect(carte.getByRole('button', { name: 'Créer un lien' })).toHaveCount(0)
})
