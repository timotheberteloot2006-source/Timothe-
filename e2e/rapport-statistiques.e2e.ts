// Page Statistiques : indicateurs de la période, répartitions et liens vers la liste filtrée
import { expect, test } from '@playwright/test'
import { FauxSupabase, seConnecter } from './fauxSupabase.ts'

let faux: FauxSupabase
const JOUR = 24 * 3600 * 1000
const ilYA = (jours: number) => new Date(Date.now() - jours * JOUR).toISOString()

test.beforeEach(async ({ page }) => {
  faux = new FauxSupabase()
  await faux.installer(page)
  const offre = faux.ajouterOffre('Développeur front')
  faux.ajouter(
    { nom: 'Alice', statut: 'retenu', created_at: ilYA(20), offre_id: offre.id },
    { nom: 'Bruno', statut: 'ecarte', created_at: ilYA(10), source: 'formulaire' },
    { nom: 'Chloé', created_at: ilYA(5), offre_id: offre.id, source: 'formulaire' },
    // Hors des 90 derniers jours
    { nom: 'Denis', statut: 'retenu', created_at: ilYA(200) },
  )
  // Alice est passée à « Retenu » 6 jours après sa réception ; Denis n'a pas d'historique
  faux.historique.push({
    id: 1,
    candidature_id: faux.candidature('Alice')!.id,
    user_id: faux.utilisateur.id,
    email: faux.utilisateur.email,
    par_systeme: false,
    action: 'statut',
    details: { avant: 'nouveau', apres: 'retenu' },
    created_at: ilYA(14),
  })
  faux.ajouterEtiquette('Senior', 'vert', 'Alice', 'Denis')
})

test('indicateurs selon la période, gardée dans l’adresse', async ({ page }) => {
  await seConnecter(page, faux)
  await page.getByRole('link', { name: 'Statistiques', exact: true }).click()
  await expect(page).toHaveTitle('Statistiques · Filtre')

  const tuile = (titre: string) => page.locator('dt', { hasText: titre }).locator('xpath=..')
  await expect(tuile('Candidatures reçues')).toContainText('4')
  await expect(tuile('Candidatures reçues')).toContainText(
    'dont 2 par le formulaire en ligne (50 %)',
  )
  await expect(tuile('Retenues')).toContainText('50 %')
  await expect(tuile('Délai jusqu’à « Retenu »')).toContainText('6 jours')
  await expect(tuile('Délai jusqu’à « Retenu »')).toContainText('médiane sur 1 candidature')

  await page.getByLabel('Période').selectOption('90j')
  await expect(page).toHaveURL(/periode=90j/)
  await expect(tuile('Candidatures reçues')).toContainText('3')
  await expect(tuile('Retenues')).toContainText('33 %')

  // Répartitions (tableaux lisibles par les lecteurs d'écran)
  const parEtape = page.getByRole('heading', { name: 'Par étape' }).locator('xpath=..')
  await expect(parEtape.getByRole('row', { name: /Écarté/ })).toContainText('1')
  const parOffre = page.getByRole('heading', { name: 'Par offre' }).locator('xpath=..')
  await expect(parOffre.getByRole('row', { name: /Développeur front/ })).toContainText(
    '2' + '1' + '50 %',
  )
  await expect(parOffre.getByRole('row', { name: /Sans offre/ })).toContainText('1' + '0' + '0 %')
  const parEtiquette = page.getByRole('heading', { name: 'Par étiquette' }).locator('xpath=..')
  await expect(parEtiquette.getByRole('row', { name: /Senior/ })).toContainText('33 %')
  await expect(page.getByRole('table', { name: 'Candidatures reçues par mois' })).toBeAttached()

  // Une étape mène à la liste filtrée
  await parEtape.getByRole('link', { name: 'Écarté' }).click()
  await expect(page).toHaveURL(/tableau-de-bord\?statut=ecarte/)
  await expect(page.getByRole('link', { name: 'Bruno' })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Alice' })).toBeHidden()
})

test('période sans candidature', async ({ page }) => {
  faux.candidatures = faux.candidatures.filter((c) => c.nom === 'Denis')
  await seConnecter(page, faux)
  await page.goto('/statistiques?periode=30j')
  await expect(page.getByText('Aucune candidature reçue sur cette période.')).toBeVisible()
})
