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
  await page.getByRole('button', { name: 'Renommer', exact: true }).click()
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

test('créer son compte depuis une invitation y ramène après la confirmation de l’e-mail', async ({
  page,
}) => {
  const { jeton } = faux.ajouterEspaceInvitant('Agence RH', 'patronne@agence.fr')
  await page.goto(`/invitation/${jeton}`)
  await expect(page).toHaveURL(/\/connexion\?redirect=/)

  await page.getByRole('link', { name: 'Créer un compte' }).click()
  await expect(page).toHaveURL(new RegExp(`/inscription\\?redirect=%2Finvitation%2F${jeton}`))
  await page.getByLabel('E-mail').fill('nouvelle@exemple.fr')
  await page.getByLabel('Mot de passe').fill('motdepasse')
  await page.getByRole('button', { name: 'Créer mon compte' }).click()

  await expect(page.getByText('vous reviendrez directement à votre invitation')).toBeVisible()
  // Le lien de confirmation envoyé par Supabase ramènera à l'invitation
  expect(faux.redirectionInscription).toMatch(new RegExp(`/invitation/${jeton}$`))
})

test('transférer la propriété de l’espace à un membre', async ({ page }) => {
  faux.ajouter({ nom: 'Candidat de l’équipe' })
  const collegue = faux.ajouterMembre('collegue@exemple.fr')
  await seConnecter(page, faux)
  await page.goto('/equipe')

  await page
    .getByRole('listitem')
    .filter({ hasText: 'collegue@exemple.fr' })
    .getByRole('button', { name: 'Transférer la propriété' })
    .click()
  await expect(page.getByText('Votre rôle : membre')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Quitter l’espace' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Créer un lien d’invitation' })).toHaveCount(0)
  expect(faux.membres.find((m) => m.user_id === collegue)?.role).toBe('proprietaire')

  // Un nouvel espace personnel apparaît parmi « Vos espaces »
  const vosEspaces = page.getByRole('heading', { name: 'Vos espaces' })
  await expect(vosEspaces).toBeVisible()
  // L'espace d'équipe (actif, où l'on est désormais membre) et le nouvel espace personnel
  const lignes = page.getByRole('listitem').filter({ hasText: /^Mon espace(Membre|Propriétaire)/ })
  await expect(lignes).toHaveCount(2)
  await expect(lignes.filter({ hasText: 'Membre' })).toContainText('Espace actif')
  await lignes.filter({ hasText: 'Propriétaire' }).getByRole('button', { name: 'Ouvrir' }).click()
  await expect(page.getByText('Votre rôle : propriétaire')).toBeVisible()
  await expect(page.getByText('rh@exemple.fr (vous)')).toBeVisible()
  await expect(page.getByText('collegue@exemple.fr')).toHaveCount(0)
})

test('notifications : chacun choisit d’être prévenu, le propriétaire règle l’accusé de réception', async ({
  page,
}) => {
  await seConnecter(page, faux)
  await page.goto('/equipe')
  const carte = page.getByRole('heading', { name: 'Notifications' }).locator('xpath=..')
  const pourMoi = carte.getByLabel(
    'Me prévenir par e-mail des nouvelles candidatures de cet espace',
  )
  const accuse = carte.getByLabel('Envoyer un accusé de réception aux candidats')
  await expect(pourMoi).toBeChecked()
  await expect(accuse).toBeChecked()

  await pourMoi.uncheck()
  await expect.poll(() => faux.membres[0].notifier).toBe(false)
  await accuse.uncheck()
  await expect.poll(() => faux.espaces[0].accuse_reception).toBe(false)
  // Le réglage personnel n'a pas été modifié par celui de l'espace
  expect(faux.membres[0].notifier).toBe(false)

  // Rechargée, la page garde les réglages
  await page.reload()
  await expect(pourMoi).not.toBeChecked()
  await expect(accuse).not.toBeChecked()
})

test('notifications : un membre ne voit pas le réglage de l’accusé de réception', async ({
  page,
}) => {
  const { espace } = faux.ajouterEspaceInvitant('Agence RH', 'patronne@agence.fr')
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
  const carte = page.getByRole('heading', { name: 'Notifications' }).locator('xpath=..')
  await expect(
    carte.getByLabel('Me prévenir par e-mail des nouvelles candidatures de cet espace'),
  ).toBeChecked()
  await expect(carte.getByLabel('Envoyer un accusé de réception aux candidats')).toHaveCount(0)
})

test('étapes : le propriétaire ajoute, renomme, ordonne et supprime ses étapes', async ({
  page,
}) => {
  faux.ajouter({ nom: 'Alice Martin' })
  await seConnecter(page, faux)
  await page.goto('/equipe')
  const carte = page.getByRole('heading', { name: 'Étapes de recrutement' }).locator('xpath=..')
  const noms = () => carte.getByRole('listitem').locator('span.font-medium')
  await expect(noms()).toHaveText(['Nouveau', 'Retenu', 'Écarté'])
  // Étapes de base : pas de suppression ; « Nouveau » ne bouge pas
  await expect(carte.getByRole('button', { name: /^Supprimer/ })).toHaveCount(0)
  await expect(carte.getByRole('button', { name: 'Monter l’étape « Nouveau »' })).toBeDisabled()

  await carte.getByLabel('Nouvelle étape').fill('Entretien RH')
  await carte.getByRole('button', { name: 'Ajouter l’étape' }).click()
  await expect(noms()).toHaveText(['Nouveau', 'Entretien RH', 'Retenu', 'Écarté'])
  await carte.getByLabel('Nouvelle étape').fill('entretien rh')
  await carte.getByRole('button', { name: 'Ajouter l’étape' }).click()
  await expect(page.getByRole('alert')).toHaveText('Une étape porte déjà ce nom.')

  await carte.getByRole('button', { name: 'Renommer l’étape « Retenu »' }).click()
  await carte.getByLabel('Nouveau nom de l’étape « Retenu »').fill('Embauché')
  await carte.getByRole('button', { name: 'Enregistrer' }).click()
  await expect(noms()).toHaveText(['Nouveau', 'Entretien RH', 'Embauché', 'Écarté'])

  await carte.getByRole('button', { name: 'Descendre l’étape « Entretien RH »' }).click()
  await expect(noms()).toHaveText(['Nouveau', 'Embauché', 'Entretien RH', 'Écarté'])

  // La nouvelle étape est proposée sur la liste et dans la fiche
  await page.goto('/tableau-de-bord')
  await page.getByLabel('Statut de Alice Martin').selectOption({ label: 'Entretien RH' })
  await expect.poll(() => faux.candidature('Alice Martin')!.statut).toMatch(/^e_/)

  // Suppression : la candidature revient à la première étape
  await page.goto('/equipe')
  // Le message est vérifié ; la boîte est acceptée par le gestionnaire commun (beforeEach)
  let message = ''
  page.once('dialog', (d) => {
    message = d.message()
  })
  await carte.getByRole('button', { name: 'Supprimer l’étape « Entretien RH »' }).click()
  await expect(noms()).toHaveText(['Nouveau', 'Embauché', 'Écarté'])
  expect(message).toContain('Ses 1 candidature reviendra à « Nouveau »')
  expect(faux.candidature('Alice Martin')!.statut).toBe('nouveau')
})

test('étapes : un membre les voit sans pouvoir les modifier', async ({ page }) => {
  const { espace } = faux.ajouterEspaceInvitant('Agence RH', 'patronne@agence.fr')
  faux.membres.push({
    espace_id: espace.id,
    user_id: faux.utilisateur.id,
    email: faux.utilisateur.email,
    role: 'membre',
    created_at: '2026-01-02T00:00:00Z',
  })
  faux.espaceActif = espace.id
  faux.ajouterEtape('Présélection', espace.id)
  await seConnecter(page, faux)
  await page.goto('/equipe')
  const carte = page.getByRole('heading', { name: 'Étapes de recrutement' }).locator('xpath=..')
  await expect(carte).toContainText('Présélection')
  await expect(carte).toContainText('Seul le propriétaire de l’espace peut les modifier.')
  await expect(carte.getByRole('button')).toHaveCount(0)
  await expect(carte.getByLabel('Nouvelle étape')).toHaveCount(0)
})
