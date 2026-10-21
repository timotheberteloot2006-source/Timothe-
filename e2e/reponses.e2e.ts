// Modèles de réponse : gérés sur la page Équipe, envoyés au candidat depuis sa fiche
import { expect, test, type Page } from '@playwright/test'
import { FauxSupabase, seConnecter } from './fauxSupabase.ts'

let faux: FauxSupabase

test.beforeEach(async ({ page }) => {
  faux = new FauxSupabase()
  await faux.installer(page)
  page.on('dialog', (dialogue) => dialogue.accept())
  faux.espaces[0].nom = 'Agence RH'
})

const carteReponse = (page: Page) =>
  page.getByRole('heading', { name: 'Répondre au candidat' }).locator('xpath=..')

test('envoie un modèle au candidat, retouché, avec aperçu et trace dans l’historique', async ({
  page,
}) => {
  const offre = faux.ajouterOffre('Développeur front')
  faux.ajouter({ nom: 'Alice Martin', email: 'alice@exemple.fr', offre_id: offre.id })
  await seConnecter(page, faux)
  await page.getByRole('link', { name: 'Alice Martin' }).click()

  const carte = carteReponse(page)
  await carte.getByLabel('Modèle').selectOption({ label: 'Réponse négative' })
  await expect(carte.getByLabel('Objet')).toHaveValue('Votre candidature au poste « {offre} »')
  await carte
    .getByLabel('Message', { exact: true })
    .fill('Bonjour {nom},\n\nMerci, nous ne donnerons pas suite.\n\n{espace}')
  await carte.getByText('Aperçu').click()
  await expect(carte).toContainText('Votre candidature au poste « Développeur front »')
  await expect(carte).toContainText('Bonjour Alice Martin,')

  await carte.getByRole('button', { name: 'Envoyer à alice@exemple.fr' }).click()
  await expect(carte.getByRole('status')).toHaveText(
    'E-mail « Votre candidature au poste « Développeur front » » envoyé à alice@exemple.fr.',
  )
  expect(faux.reponsesEnvoyees).toEqual([
    {
      to: 'alice@exemple.fr',
      sujet: 'Votre candidature au poste « Développeur front »',
      corps: 'Bonjour Alice Martin,\n\nMerci, nous ne donnerons pas suite.\n\nAgence RH',
    },
  ])
  // Le formulaire revient à un message libre vide
  await expect(carte.getByLabel('Message', { exact: true })).toHaveValue('')
  const historique = page.getByRole('heading', { name: 'Historique' }).locator('xpath=..')
  await expect(historique).toContainText(
    'Réponse envoyée au candidat : « Votre candidature au poste « Développeur front » » · vous',
  )
})

test('sans e-mail, ou refus du serveur', async ({ page }) => {
  faux.ajouter({ nom: 'Sans Adresse' }, { nom: 'Bruno', email: 'bruno@exemple.fr' })
  await seConnecter(page, faux)
  await page.getByRole('link', { name: 'Sans Adresse' }).click()
  await expect(carteReponse(page)).toContainText(
    'Ajoutez une adresse e-mail à la fiche pour pouvoir répondre au candidat.',
  )

  faux.erreurReponse = {
    erreur: 'Trop d’e-mails envoyés depuis cet espace : réessayez dans une heure.',
    status: 429,
  }
  await page.goto(`/candidatures/${faux.candidature('Bruno')!.id}`)
  const carte = carteReponse(page)
  await carte.getByLabel('Objet').fill('Bonjour')
  await carte.getByLabel('Message', { exact: true }).fill('Texte')
  await carte.getByRole('button', { name: 'Envoyer à bruno@exemple.fr' }).click()
  await expect(carte.getByRole('alert')).toHaveText(
    'Trop d’e-mails envoyés depuis cet espace : réessayez dans une heure.',
  )
  await expect(carte.getByLabel('Message', { exact: true })).toHaveValue('Texte')
})

test('les membres créent, modifient et suppriment les modèles de l’espace', async ({ page }) => {
  await seConnecter(page, faux)
  await page.goto('/equipe')
  const carte = page.getByRole('heading', { name: 'Modèles de réponse' }).locator('xpath=..')
  await expect(carte.getByRole('listitem')).toHaveCount(2)

  await carte.getByRole('button', { name: 'Nouveau modèle' }).click()
  await carte.getByLabel('Nom du modèle').fill('Relance')
  await carte.getByLabel('Objet de l’e-mail').fill('Votre candidature')
  await carte.getByLabel('Message', { exact: true }).fill('Bonjour {nom}, où en êtes-vous ?')
  await carte.getByRole('button', { name: 'Enregistrer le modèle' }).click()
  await expect(carte.getByRole('listitem')).toHaveCount(3)
  expect(faux.modeles().map((m) => m.nom)).toContain('Relance')

  // Nom déjà pris
  await carte.getByRole('button', { name: 'Modifier le modèle « Relance »' }).click()
  await carte.getByLabel('Nom du modèle').fill('réponse négative')
  await carte.getByRole('button', { name: 'Enregistrer le modèle' }).click()
  await expect(page.getByRole('alert')).toHaveText('Un modèle porte déjà ce nom.')
  await carte.getByLabel('Nom du modèle').fill('Relance à 15 jours')
  await carte.getByRole('button', { name: 'Enregistrer le modèle' }).click()
  await expect(carte).toContainText('Relance à 15 jours')

  await carte.getByRole('button', { name: 'Supprimer le modèle « Relance à 15 jours »' }).click()
  await expect(carte.getByRole('listitem')).toHaveCount(2)
})
