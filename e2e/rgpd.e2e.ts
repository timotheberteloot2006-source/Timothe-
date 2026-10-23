// Droits des candidats : export ZIP de leurs données, effacement, registre des demandes
import { readFile } from 'node:fs/promises'
import { strFromU8, unzipSync } from 'fflate'
import { expect, test } from '@playwright/test'
import { FauxSupabase, seConnecter } from './fauxSupabase.ts'

let faux: FauxSupabase

test.beforeEach(async ({ page }) => {
  faux = new FauxSupabase()
  await faux.installer(page)
  page.on('dialog', (dialogue) => dialogue.accept())
  faux.ajouter({
    nom: 'Chloé Petit',
    email: 'chloe@exemple.fr',
    poste: 'Data analyst',
    competences: ['SQL'],
    experience: 4,
    cv_chemin: 'u/c1/cv.pdf',
  })
  faux.fichiers.add('u/c1/cv.pdf')
  faux.notes.push({
    id: 'n1',
    candidature_id: faux.candidature('Chloé Petit')!.id,
    contenu: 'Très bon entretien.',
    created_at: '2026-01-05T10:00:00Z',
  })
})

test('exporter les données d’un candidat dans une archive ZIP', async ({ page }) => {
  await seConnecter(page, faux)
  await page.goto(`/candidatures/${faux.candidature('Chloé Petit')!.id}`)

  const [telechargement] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Exporter ses données (ZIP)' }).click(),
  ])
  expect(telechargement.suggestedFilename()).toMatch(/^donnees-chloe-petit-\d{4}-\d{2}-\d{2}\.zip$/)
  const archive = unzipSync(new Uint8Array(await readFile((await telechargement.path())!)))
  expect(Object.keys(archive).sort()).toEqual(['cv.pdf', 'donnees.json', 'lisez-moi.txt'])
  const donnees = JSON.parse(strFromU8(archive['donnees.json']))
  expect(donnees).toMatchObject({
    responsable: 'Mon espace',
    candidature: { nom: 'Chloé Petit', email: 'chloe@exemple.fr', poste: 'Data analyst' },
    notes: [{ contenu: 'Très bon entretien.' }],
  })
  expect(strFromU8(archive['cv.pdf'])).toContain('%PDF-')
  expect(strFromU8(archive['lisez-moi.txt'])).toContain('Données personnelles de Chloé Petit')

  await expect(
    page.getByText('Archive téléchargée et demande d’accès inscrite au registre.'),
  ).toBeVisible()
  expect(faux.demandesRgpd.map((d) => d.action)).toEqual(['acces'])
})

test('effacer définitivement, puis le registre sur la page Équipe', async ({ page }) => {
  await seConnecter(page, faux)
  await page.goto(`/candidatures/${faux.candidature('Chloé Petit')!.id}`)
  await page.getByRole('button', { name: 'Effacer définitivement' }).click()
  await expect(page.getByRole('heading', { name: 'Candidatures', level: 1 })).toBeVisible()
  expect(faux.candidature('Chloé Petit')).toBeUndefined()
  expect(faux.notes).toEqual([])
  expect(faux.fichiers.has('u/c1/cv.pdf')).toBe(false)

  await page.getByRole('banner').getByRole('link', { name: 'Équipe', exact: true }).click()
  const registre = page
    .getByRole('heading', { name: 'Registre des demandes RGPD' })
    .locator('xpath=..')
  await expect(registre.getByRole('row')).toHaveCount(2)
  await expect(registre).toContainText('Effacement')
  await expect(registre).toContainText('vous')
  // Aucune donnée du candidat dans le registre
  await expect(registre).not.toContainText('Chloé')
})
