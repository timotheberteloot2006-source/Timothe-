import { expect, test } from '@playwright/test'
import { FauxSupabase, seConnecter } from './fauxSupabase.ts'

let faux: FauxSupabase

test.beforeEach(async ({ page }) => {
  faux = new FauxSupabase()
  await faux.installer(page)
  page.on('dialog', (dialogue) => dialogue.accept())
  faux.ajouter({ nom: 'Alice Martin', poste: 'Développeuse', experience: 5 })
  await seConnecter(page, faux)
  await page.getByRole('link', { name: 'Alice Martin' }).click()
  await expect(page.getByRole('heading', { name: 'Alice Martin' })).toBeVisible()
})

const pdf = { name: 'cv.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4') }

test('déposer, remplacer et supprimer un CV', async ({ page }) => {
  const champ = page.getByLabel('Fichier PDF du CV')
  await champ.setInputFiles({ name: 'photo.png', mimeType: 'image/png', buffer: Buffer.from('x') })
  await expect(page.getByRole('alert')).toHaveText('Le CV doit être un fichier PDF.')

  await champ.setInputFiles(pdf)
  await expect(page.getByRole('button', { name: 'Ouvrir le CV' })).toBeVisible()
  const premier = faux.candidature('Alice Martin')!.cv_chemin
  expect(premier).toMatch(new RegExp(`^${faux.utilisateur.id}/c1/.+\\.pdf$`))

  await champ.setInputFiles(pdf)
  await expect.poll(() => faux.candidature('Alice Martin')!.cv_chemin).not.toBe(premier)
  expect([...faux.fichiers]).toEqual([faux.candidature('Alice Martin')!.cv_chemin])

  await page.getByRole('button', { name: 'Supprimer', exact: true }).first().click()
  await expect(page.getByRole('button', { name: 'Déposer un CV' })).toBeVisible()
  expect(faux.fichiers.size).toBe(0)
})

test('ajouter et supprimer des notes, puis supprimer la candidature', async ({ page }) => {
  await page.getByLabel('Nouvelle note').fill('Entretien positif.\nÀ revoir.')
  await page.getByRole('button', { name: 'Ajouter la note' }).click()
  await expect(page.getByText('Entretien positif.')).toBeVisible()
  await expect(page.getByLabel('Nouvelle note')).toHaveValue('')

  await page.getByRole('link', { name: '← Retour aux candidatures' }).click()
  await expect(page.getByText('1 note')).toBeVisible()
  await page.getByRole('link', { name: 'Alice Martin' }).click()

  await page.getByRole('button', { name: 'Supprimer la candidature' }).click()
  await expect(page).toHaveURL(/\/tableau-de-bord/)
  expect(faux.candidatures).toHaveLength(0)
  expect(faux.notes).toHaveLength(0)
})

test('l’historique retrace les actions sur la candidature', async ({ page }) => {
  await page.getByRole('combobox', { name: 'Statut' }).selectOption('retenu')
  await page.getByLabel('Nouvelle note').fill('Bon profil')
  await page.getByRole('button', { name: 'Ajouter la note' }).click()
  await page.getByLabel('Fichier PDF du CV').setInputFiles(pdf)
  await expect(page.getByRole('button', { name: 'Ouvrir le CV' })).toBeVisible()
  await page.getByRole('button', { name: 'Modifier' }).click()
  await page.getByLabel('Poste visé').fill('Développeuse senior')
  await page.getByRole('button', { name: 'Enregistrer' }).click()

  const historique = page.getByRole('heading', { name: 'Historique' }).locator('xpath=..')
  await expect(historique.getByRole('listitem')).toHaveText([
    /^Fiche modifiée \(poste\) · vous/,
    /^CV ajouté · vous/,
    /^Note ajoutée · vous/,
    /^Statut : Nouveau → Retenu · vous/,
  ])
})
