// Audit automatique (axe-core) des règles WCAG 2.1 A et AA sur chaque page, en clair et en sombre.
// axe ne voit pas tout (sens des textes, ordre de lecture…) : il complète une relecture humaine.
import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'
import { FauxSupabase, seConnecter } from './fauxSupabase.ts'

const NORMES = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']
const JOUR = 24 * 60 * 60 * 1000

async function auditer(page: Page) {
  const { violations } = await new AxeBuilder({ page }).withTags(NORMES).analyze()
  // Résumé lisible en cas d'échec : règle, gravité et éléments fautifs
  return violations.map((v) => ({
    regle: v.id,
    gravite: v.impact,
    aide: v.help,
    elements: v.nodes.slice(0, 5).map((n) => n.target.join(' ')),
  }))
}

const PAGES_PUBLIQUES = [
  '/',
  '/tarifs',
  '/connexion',
  '/inscription',
  '/mot-de-passe-oublie',
  '/nouveau-mot-de-passe',
  '/mentions-legales',
  '/confidentialite',
  '/conditions',
  '/page-inexistante',
]

// « fiche » : remplacée par l'adresse de la fiche d'Alice Martin
const PAGES_CONNECTE = [
  '/tableau-de-bord',
  '/tableau-de-bord?vue=tableau',
  'fiche',
  '/offres',
  '/compte',
  '/equipe',
]

function donneesDeDemonstration(faux: FauxSupabase) {
  const offre = faux.ajouterOffre('Développeur front')
  faux.ajouter(
    {
      nom: 'Alice Martin',
      email: 'alice@exemple.fr',
      poste: 'Développeuse',
      competences: ['React', 'SQL'],
      experience: 5,
      statut: 'retenu',
      offre_id: offre.id,
      cv_chemin: 'u/c1/cv.pdf',
    },
    { nom: 'Bruno Léger', competences: ['SQL'], experience: 2, statut: 'ecarte' },
    { nom: 'Chloé Petit', competences: ['React'], experience: 8 },
  )
  const alice = faux.candidature('Alice Martin')!.id
  faux.notes.push({
    id: 'n1',
    candidature_id: alice,
    contenu: 'Bon entretien.',
    created_at: '2026-01-05T10:00:00Z',
  })
  // Une étiquette de chaque couleur (contraste en clair et en sombre)
  faux.ajouterEtiquette('Senior', 'vert', 'Alice Martin')
  faux.ajouterEtiquette('Télétravail', 'indigo', 'Alice Martin', 'Chloé Petit')
  faux.ajouterEtiquette('Relancer', 'rouge', 'Bruno Léger')
  faux.ajouterEtiquette('Urgent', 'ambre', 'Alice Martin')
  faux.ajouterEtiquette('À revoir', 'gris', 'Chloé Petit')
  faux.ajouterEntretien(alice, new Date(Date.now() + 2 * JOUR), { lieu: 'Visio' })
  faux.ajouterEntretien(alice, new Date(Date.now() - 2 * JOUR), { lieu: 'Téléphone' })
}

for (const schema of ['light', 'dark'] as const) {
  test.describe(`thème ${schema === 'light' ? 'clair' : 'sombre'}`, () => {
    test.use({ colorScheme: schema })

    for (const chemin of PAGES_PUBLIQUES) {
      test(`page publique ${chemin}`, async ({ page }) => {
        await new FauxSupabase().installer(page)
        await page.goto(chemin)
        await expect(page.locator('h1')).toBeVisible()
        expect(await auditer(page)).toEqual([])
      })
    }

    for (const chemin of PAGES_CONNECTE) {
      test(`page connectée ${chemin === 'fiche' ? '/candidatures/:id' : chemin}`, async ({
        page,
      }) => {
        const faux = new FauxSupabase()
        await faux.installer(page)
        donneesDeDemonstration(faux)
        await seConnecter(page, faux)
        const adresse =
          chemin === 'fiche' ? `/candidatures/${faux.candidature('Alice Martin')!.id}` : chemin
        await page.goto(adresse)
        // Vérifie qu'on audite bien la page voulue, pas « Page introuvable »
        await expect(page.locator('h1')).not.toHaveText('Page introuvable')
        expect(await auditer(page)).toEqual([])
      })
    }

    test('page d’invitation', async ({ page }) => {
      const faux = new FauxSupabase()
      await faux.installer(page)
      const { jeton } = faux.ajouterEspaceInvitant('Agence RH', 'patronne@agence.fr')
      await seConnecter(page, faux)
      await page.goto(`/invitation/${jeton}`)
      await expect(page.locator('h1')).toHaveText('Rejoindre l’espace « Agence RH »')
      expect(await auditer(page)).toEqual([])
    })

    test('formulaire de candidature public', async ({ page }) => {
      const faux = new FauxSupabase()
      await faux.installer(page)
      const offre = faux.ajouterOffre('Développeur front', {
        publique: true,
        description: 'CDI à Lyon.',
      })
      await page.goto(`/postuler/${offre.jeton_public}`)
      await expect(page.locator('h1')).toHaveText('Développeur front')
      expect(await auditer(page)).toEqual([])
    })

    test('page carrières publique', async ({ page }) => {
      const faux = new FauxSupabase()
      await faux.installer(page)
      Object.assign(faux.espaces[0], {
        nom: 'Agence RH',
        slug: 'agence-rh',
        carrieres_publiques: true,
        presentation: 'Cabinet lyonnais.',
      })
      faux.ajouterOffre('Développeur front', { publique: true, description: 'CDI à Lyon.' })
      await page.goto('/carrieres/agence-rh')
      await expect(page.locator('h1')).toHaveText('Agence RH')
      expect(await auditer(page)).toEqual([])
    })

    test('réglages du formulaire public (page Offres)', async ({ page }) => {
      const faux = new FauxSupabase()
      await faux.installer(page)
      faux.ajouterOffre('Développeur front', { publique: true })
      await seConnecter(page, faux)
      await page.goto('/offres')
      await page.getByText('Formulaire de candidature').click()
      await expect(page.getByLabel('Lien à diffuser')).toBeVisible()
      expect(await auditer(page)).toEqual([])
    })

    test('panneaux ouverts du tableau de bord', async ({ page }) => {
      const faux = new FauxSupabase()
      await faux.installer(page)
      donneesDeDemonstration(faux)
      await seConnecter(page, faux)
      // Formulaire d'ajout, sélection et import ouverts
      await page.getByRole('button', { name: 'Ajouter une candidature' }).click()
      await page.getByLabel('Sélectionner Alice Martin').check()
      expect(await auditer(page)).toEqual([])
      await page.getByRole('button', { name: 'Fermer' }).click()
      await page.getByRole('button', { name: 'Importer un CSV' }).click()
      await page
        .getByLabel('Fichier CSV')
        .setInputFiles({
          name: 'a.csv',
          mimeType: 'text/csv',
          buffer: Buffer.from('nom;experience\nAlice Martin;2\nX;deux\nNouveau;1\n'),
        })
      expect(await auditer(page)).toEqual([])
    })
  })
}

// Ce qu'axe ne vérifie pas : navigation au clavier, focus visible, titres de page
test.describe('clavier et titres', () => {
  test('le lien d’évitement mène au contenu', async ({ page }) => {
    await new FauxSupabase().installer(page)
    await page.goto('/')
    // Le site s'affiche une fois la session lue : attendre avant le premier Tab
    await expect(page.locator('h1')).toBeVisible()
    await page.keyboard.press('Tab')
    const lien = page.getByRole('link', { name: 'Aller au contenu' })
    await expect(lien).toBeFocused()
    await expect(lien).toBeInViewport()
    await page.keyboard.press('Enter')
    await expect(page.locator('main#contenu')).toBeFocused()
  })

  test('on se connecte entièrement au clavier, avec un focus visible', async ({ page }) => {
    const faux = new FauxSupabase()
    await faux.installer(page)
    await page.goto('/connexion')
    await expect(page.locator('h1')).toBeVisible()
    const email = page.getByLabel('E-mail')
    // Lien d'évitement, logo, 3 liens de navigation, puis le formulaire
    for (let i = 0; i < 6 && !(await email.evaluate((e) => e === document.activeElement)); i++) {
      await page.keyboard.press('Tab')
    }
    await expect(email).toBeFocused()
    expect(await email.evaluate((e) => getComputedStyle(e).outlineStyle)).toBe('solid')
    await page.keyboard.type(faux.utilisateur.email)
    await page.keyboard.press('Tab')
    await expect(page.getByLabel('Mot de passe')).toBeFocused()
    await page.keyboard.type('motdepasse')
    await page.keyboard.press('Enter')
    await expect(page).toHaveURL(/\/tableau-de-bord$/)
  })

  test('chaque page a un titre qui la décrit', async ({ page }) => {
    const faux = new FauxSupabase()
    await faux.installer(page)
    faux.ajouter({ nom: 'Alice Martin' })
    await page.goto('/connexion')
    await expect(page).toHaveTitle('Connexion · Filtre')
    await page.goto('/mentions-legales')
    await expect(page).toHaveTitle('Mentions légales · Filtre')
    await seConnecter(page, faux)
    await expect(page).toHaveTitle('Candidatures · Filtre')
    await page.getByRole('link', { name: 'Alice Martin' }).click()
    await expect(page).toHaveTitle('Alice Martin · Filtre')
  })
})
