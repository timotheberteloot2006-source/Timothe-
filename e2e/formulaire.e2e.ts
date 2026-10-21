// Formulaire de candidature public : le recruteur le publie, le candidat postule sans compte
import { expect, test } from '@playwright/test'
import { FauxSupabase, seConnecter } from './fauxSupabase.ts'

let faux: FauxSupabase

test.beforeEach(async ({ page }) => {
  faux = new FauxSupabase()
  await faux.installer(page)
  page.on('dialog', (dialogue) => dialogue.accept())
})

test('le recruteur publie le formulaire d’une offre et obtient son lien', async ({ page }) => {
  const offre = faux.ajouterOffre('Développeur front')
  await seConnecter(page, faux)
  await page.goto('/offres')

  await page.getByText('Formulaire de candidature').click()
  await expect(page.getByLabel('Lien à diffuser')).toHaveCount(0)
  await page.getByLabel('Formulaire en ligne').check()
  await expect(page.getByText('Formulaire en ligne', { exact: true }).first()).toBeVisible()
  await expect(page.getByLabel('Lien à diffuser')).toHaveValue(
    `http://localhost:4175/postuler/${offre.jeton_public}`,
  )
  expect(faux.offre('Développeur front')!.publique).toBe(true)
  // Nom affiché aux candidats : celui par défaut est à remplacer
  await expect(
    page.getByText('Les candidats voient le nom de votre espace : « Mon espace »'),
  ).toContainText('Donnez-lui le nom de votre entreprise')

  await page
    .getByLabel('Description présentée aux candidats')
    .fill('CDI à Lyon, télétravail partiel.')
  await page.getByRole('button', { name: 'Enregistrer la description' }).click()
  await expect
    .poll(() => faux.offre('Développeur front')!.description)
    .toBe('CDI à Lyon, télétravail partiel.')

  // Un nouveau lien remplace l'ancien
  const ancien = offre.jeton_public
  await page.getByRole('button', { name: 'Nouveau lien' }).click()
  await expect(page.getByLabel('Lien à diffuser')).not.toHaveValue(new RegExp(ancien))
  expect(faux.offre('Développeur front')!.jeton_public).not.toBe(ancien)
})

test('un candidat postule sans compte, avec son CV ; la candidature arrive dans la liste', async ({
  page,
}) => {
  const offre = faux.ajouterOffre('Développeur front', {
    publique: true,
    description: 'CDI à Lyon.',
  })
  await page.goto(`/postuler/${offre.jeton_public}`)
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Développeur front')
  await expect(page.getByText('CDI à Lyon.')).toBeVisible()
  await expect(page.getByText('Recrutement : Mon espace')).toBeVisible()

  await page.getByLabel('Nom et prénom').fill('Alice Martin')
  await page.getByLabel('E-mail').fill('alice@exemple.fr')
  await page.getByLabel('Années d’expérience').fill('4')
  await page.getByLabel('Compétences').fill('React, TypeScript')
  await page
    .getByLabel('CV (PDF, 5 Mo au plus, facultatif)')
    .setInputFiles({
      name: 'cv.pdf',
      mimeType: 'application/pdf',
      buffer: Buffer.from('%PDF-1.4 cv'),
    })

  // Sans accord, le navigateur bloque l'envoi
  await page.getByRole('button', { name: 'Envoyer ma candidature' }).click()
  expect(faux.envoisFormulaire).toHaveLength(0)

  await page.getByRole('checkbox', { name: /J’accepte/ }).check()
  await page.getByRole('button', { name: 'Envoyer ma candidature' }).click()
  await expect(page.getByRole('status')).toContainText(
    'Votre candidature au poste « Développeur front » a bien été transmise à Mon espace.',
  )

  // Champs envoyés à la fonction : jeton de l'offre, heure d'ouverture, champ piège vide
  const [envoi] = faux.envoisFormulaire
  expect(envoi).toMatchObject({
    jeton: offre.jeton_public,
    nom: 'Alice Martin',
    email: 'alice@exemple.fr',
    consentement: 'oui',
    site_web: '',
  })
  expect(Number(envoi.ouvert_le)).toBeLessThan(Date.now())
  const recue = faux.candidature('Alice Martin')!
  expect(recue).toMatchObject({ source: 'formulaire', offre_id: offre.id, experience: 4 })
  expect(faux.fichiers.has(recue.cv_chemin!)).toBe(true)

  // Côté recruteur : dans la liste, avec son historique
  await seConnecter(page, faux)
  await page.getByRole('link', { name: 'Alice Martin' }).click()
  const historique = page.getByRole('heading', { name: 'Historique' }).locator('xpath=..')
  await expect(historique).toContainText(
    'Candidature reçue par le formulaire en ligne · le candidat',
  )
})

test('un second envoi du même candidat est noté sur sa fiche existante', async ({ page }) => {
  const offre = faux.ajouterOffre('Data analyst', { publique: true })
  faux.ajouter({ nom: 'Alice Martin', email: 'alice@exemple.fr' })
  await page.goto(`/postuler/${offre.jeton_public}`)
  await page.getByLabel('Nom et prénom').fill('Alice M.')
  await page.getByLabel('E-mail').fill('ALICE@exemple.fr')
  await page.getByRole('checkbox', { name: /J’accepte/ }).check()
  await page.getByRole('button', { name: 'Envoyer ma candidature' }).click()
  // Même message qu'une première candidature : rien n'indique qui figure déjà dans la base
  await expect(page.getByRole('status')).toContainText('a bien été transmise')
  expect(faux.candidatures).toHaveLength(1)
  expect(faux.historique.map((h) => [h.action, h.details])).toEqual([
    ['nouvelle_postulation', { offre: 'Data analyst' }],
  ])
})

test('lien inconnu, offre complète et refus du serveur', async ({ page }) => {
  await page.goto('/postuler/00000000-0000-0000-0000-000000000000')
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Offre introuvable')

  // Formulaire désactivé : le lien ne fonctionne plus
  const offre = faux.ajouterOffre('Développeur front', { publique: false })
  await page.goto(`/postuler/${offre.jeton_public}`)
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Offre introuvable')

  // Espace à la limite Gratuite : le formulaire l'annonce au lieu d'échouer à l'envoi
  faux.offre('Développeur front')!.publique = true
  faux.ajouter(...Array.from({ length: 50 }, () => ({})))
  await page.goto(`/postuler/${offre.jeton_public}`)
  await expect(
    page.getByText('Cette offre n’accepte plus de candidatures pour le moment.'),
  ).toBeVisible()
  await expect(page.getByRole('button', { name: 'Envoyer ma candidature' })).toHaveCount(0)

  // Message d'erreur de la fonction affiché tel quel
  faux.candidatures = []
  faux.erreurPostuler = {
    erreur: 'Trop de candidatures envoyées depuis cette connexion : réessayez dans une heure.',
    status: 429,
  }
  await page.goto(`/postuler/${offre.jeton_public}`)
  await page.getByLabel('Nom et prénom').fill('Bruno')
  await page.getByLabel('E-mail').fill('bruno@exemple.fr')
  await page.getByRole('checkbox', { name: /J’accepte/ }).check()
  await page.getByRole('button', { name: 'Envoyer ma candidature' }).click()
  await expect(page.getByRole('alert')).toHaveText(
    'Trop de candidatures envoyées depuis cette connexion : réessayez dans une heure.',
  )
  await expect(page.getByRole('button', { name: 'Envoyer ma candidature' })).toBeEnabled()
})
