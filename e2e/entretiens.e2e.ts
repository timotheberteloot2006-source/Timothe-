import { readFile } from 'node:fs/promises'
import { expect, test } from '@playwright/test'
import { FauxSupabase, seConnecter } from './fauxSupabase.ts'

const JOUR = 24 * 60 * 60 * 1000

test('planifier un entretien, l’exporter vers l’agenda et le voir dans le tableau de bord', async ({
  page,
}) => {
  const faux = new FauxSupabase()
  await faux.installer(page)
  page.on('dialog', (dialogue) => dialogue.accept())
  faux.ajouter({ nom: 'Alice Martin' }, { nom: 'Bruno Léger' })
  // Un entretien déjà passé : affiché sur la fiche, mais pas parmi les entretiens à venir
  faux.ajouterEntretien('c1', new Date(Date.now() - 3 * JOUR), { lieu: 'Ancien bureau' })
  await seConnecter(page, faux)
  await expect(page.getByRole('region', { name: 'Entretiens à venir' })).toHaveCount(0)

  await page.getByRole('link', { name: 'Alice Martin' }).click()
  await expect(page.getByText('(passé)')).toBeVisible()

  // Dans 3 jours à 14 h 30, heure du navigateur (Europe/Paris)
  const jour = new Date(Date.now() + 3 * JOUR).toISOString().slice(0, 10)
  await page.getByLabel('Date et heure').fill(`${jour}T14:30`)
  await page.getByLabel('Durée').selectOption('45')
  await page.getByLabel('Lieu ou lien de visio').fill('Visio ; salle 2')
  await page.getByRole('button', { name: 'Planifier' }).click()
  await expect(page.getByText('45 min · Visio ; salle 2')).toBeVisible()
  await expect(page.getByLabel('Lieu ou lien de visio')).toHaveValue('')

  const planifie = faux.entretiens.find((e) => e.lieu === 'Visio ; salle 2')!
  expect(planifie.duree_minutes).toBe(45)
  // 14 h 30 à Paris = 12 h 30 ou 13 h 30 UTC selon l'heure d'été
  expect(planifie.debut).toMatch(/T1[23]:30:00\.000Z$/)

  const [telechargement] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Ajouter à l’agenda (.ics)' }).click(),
  ])
  expect(telechargement.suggestedFilename()).toBe(`entretien-${planifie.debut.slice(0, 10)}.ics`)
  const ics = (await readFile((await telechargement.path())!, 'utf8')).replace(/\r\n /g, '')
  const debutIcs = planifie.debut.replace(/[-:]/g, '').replace('.000', '')
  expect(ics).toContain(`DTSTART:${debutIcs}`)
  expect(ics).toContain('SUMMARY:Entretien – Alice Martin')
  expect(ics).toContain('LOCATION:Visio \\; salle 2')

  // Tableau de bord : encadré et indication sur la ligne
  await page.getByRole('link', { name: '← Retour aux candidatures' }).click()
  const encadre = page.getByRole('region', { name: 'Entretiens à venir' })
  await expect(encadre.getByRole('link', { name: 'Alice Martin' })).toBeVisible()
  await expect(encadre.getByText('14:30')).toBeVisible()
  await expect(
    page
      .locator('main ul > li')
      .filter({ hasText: 'Alice Martin' })
      .getByText(/Entretien le .*14:30/),
  ).toBeVisible()

  // Suppression depuis la fiche
  await encadre.getByRole('link', { name: 'Alice Martin' }).click()
  await page
    .getByRole('listitem')
    .filter({ hasText: '45 min' })
    .getByRole('button', { name: 'Supprimer' })
    .click()
  await expect(page.getByText('45 min · Visio ; salle 2')).toHaveCount(0)
  expect(faux.entretiens).toHaveLength(1)
})
