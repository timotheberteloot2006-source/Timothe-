// Évaluation des candidats : notes de 1 à 5 par critère sur la fiche, moyenne et tri dans la liste
import { expect, test, type Page } from '@playwright/test'
import { FauxSupabase, seConnecter } from './fauxSupabase.ts'

let faux: FauxSupabase

test.beforeEach(async ({ page }) => {
  faux = new FauxSupabase()
  await faux.installer(page)
  page.on('dialog', (dialogue) => dialogue.accept())
})

const carte = (page: Page) =>
  page.getByRole('heading', { name: 'Évaluation' }).locator('xpath=..').locator('xpath=..')

test('noter un candidat, au clavier aussi ; moyenne de l’équipe', async ({ page }) => {
  faux.ajouter({ nom: 'Alice Martin' })
  const alice = faux.candidature('Alice Martin')!.id
  const [technique] = faux.criteres()
  // Une collègue a déjà noté la technique
  faux.evaluations.push({
    candidature_id: alice,
    critere_id: technique.id,
    user_id: 'lea',
    note: 5,
  })
  await seConnecter(page, faux)
  await page.goto(`/candidatures/${alice}`)

  const technique1 = carte(page).getByRole('group', { name: 'Compétences techniques' })
  await expect(technique1).toContainText('Équipe : 5,0 (1 note)')
  // Clic sur la case visible (le bouton radio lui-même est masqué)
  await technique1.locator('label').filter({ hasText: '3 sur 5' }).click()
  await expect(technique1.getByRole('radio', { name: '3 sur 5' })).toBeChecked()
  await expect
    .poll(() => faux.evaluations.find((e) => e.user_id === faux.utilisateur.id)?.note)
    .toBe(3)
  await expect(technique1).toContainText('Équipe : 4,0 (2 notes)')
  await expect(carte(page)).toContainText('Moyenne de l’équipe : 4,0 sur 5 · 2 évaluateurs')

  // Au clavier : flèche droite dans le groupe de boutons radio
  await technique1.getByRole('radio', { name: '3 sur 5' }).focus()
  await page.keyboard.press('ArrowRight')
  await expect(technique1.getByRole('radio', { name: '4 sur 5' })).toBeChecked()
  await expect
    .poll(() => faux.evaluations.find((e) => e.user_id === faux.utilisateur.id)?.note)
    .toBe(4)
  // Le focus reste dans le groupe (la carte n'est pas reconstruite)
  await expect(technique1.getByRole('radio', { name: '4 sur 5' })).toBeFocused()

  await technique1.getByRole('button', { name: 'Effacer ma note' }).click()
  await expect
    .poll(() => faux.evaluations.filter((e) => e.user_id === faux.utilisateur.id))
    .toEqual([])
  await expect(technique1.getByRole('radio', { name: '4 sur 5' })).not.toBeChecked()
})

test('la liste montre la moyenne et trie par note', async ({ page }) => {
  faux.ajouter({ nom: 'Alice' }, { nom: 'Bruno' }, { nom: 'Chloé' })
  const [technique, communication] = faux.criteres()
  const id = (nom: string) => faux.candidature(nom)!.id
  faux.evaluations.push(
    { candidature_id: id('Alice'), critere_id: technique.id, user_id: 'lea', note: 3 },
    { candidature_id: id('Chloé'), critere_id: technique.id, user_id: 'lea', note: 5 },
    { candidature_id: id('Chloé'), critere_id: communication.id, user_id: 'max', note: 4 },
  )
  await seConnecter(page, faux)
  await expect(page.getByText('Note moyenne 4,5 sur 5, 2 évaluateurs')).toBeAttached()
  await page.getByLabel('Trier par').selectOption({ label: 'Mieux notées' })
  await expect(page.locator('main ul > li a')).toHaveText(['Chloé', 'Alice', 'Bruno'])
})

test('le propriétaire gère la grille ; un membre la voit seulement', async ({ page }) => {
  await seConnecter(page, faux)
  await page.goto('/equipe')
  const grille = page.getByRole('heading', { name: 'Critères d’évaluation' }).locator('xpath=..')
  await expect(grille.getByRole('listitem')).toHaveText([
    /Compétences techniques/,
    /Communication/,
    /Motivation/,
  ])
  await grille.getByLabel('Nouveau critère').fill('Esprit d’équipe')
  await grille.getByRole('button', { name: 'Ajouter le critère' }).click()
  await expect(grille.getByRole('listitem')).toHaveCount(4)
  await grille.getByRole('button', { name: 'Renommer le critère « Motivation »' }).click()
  await grille.getByLabel('Nouveau nom du critère « Motivation »').fill('Envie')
  await grille.getByRole('button', { name: 'Enregistrer' }).click()
  await expect(grille).toContainText('Envie')
  await grille.getByRole('button', { name: 'Supprimer le critère « Envie »' }).click()
  await expect(grille.getByRole('listitem')).toHaveCount(3)

  const { espace } = faux.ajouterEspaceInvitant('Agence RH', 'patronne@agence.fr')
  faux.membres.push({
    espace_id: espace.id,
    user_id: faux.utilisateur.id,
    email: faux.utilisateur.email,
    role: 'membre',
    created_at: '2026-01-02T00:00:00Z',
  })
  faux.espaceActif = espace.id
  await page.reload()
  await expect(grille).toContainText('Seul le propriétaire de l’espace peut modifier la grille.')
  await expect(grille.getByRole('button')).toHaveCount(0)
})
