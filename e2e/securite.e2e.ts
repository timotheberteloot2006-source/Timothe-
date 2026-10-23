// En-têtes de sécurité (vercel.json, appliqués aussi par vite preview) : le site fonctionne sous
// la politique de contenu, sans aucune ressource bloquée.
import { expect, test } from '@playwright/test'
import { FauxSupabase, seConnecter } from './fauxSupabase.ts'

test('le site fonctionne sous la politique de sécurité du contenu', async ({ page }) => {
  // Violations relevées par le navigateur, page après page
  await page.addInitScript(() => {
    const w = window as unknown as { violations: string[] }
    w.violations = []
    document.addEventListener('securitypolicyviolation', (e) =>
      w.violations.push(`${e.violatedDirective} : ${e.blockedURI}`),
    )
  })
  const reponse = await page.goto('/')
  const entetes = reponse!.headers()
  expect(entetes['content-security-policy']).toContain("script-src 'self'")
  expect(entetes['x-frame-options']).toBe('DENY')
  expect(entetes['referrer-policy']).toBe('same-origin')

  const faux = new FauxSupabase()
  const offre = faux.ajouterOffre('Développeur front')
  faux.ajouter({ nom: 'Alice Martin', offre_id: offre.id, cv_chemin: 'moi/c1/cv.pdf' })
  await faux.installer(page)
  await seConnecter(page, faux)
  const violations = () =>
    page.evaluate(() => (window as unknown as { violations: string[] }).violations)

  await expect(page.getByRole('link', { name: 'Alice Martin' })).toBeVisible()
  expect(await violations()).toEqual([])

  await page.getByRole('link', { name: 'Alice Martin' }).click()
  await expect(page.getByRole('heading', { name: 'Historique' })).toBeVisible()
  expect(await violations()).toEqual([])

  for (const chemin of ['/offres', '/equipe', '/compte', '/tarifs']) {
    await page.goto(chemin)
    await expect(page.locator('main h1')).toBeVisible()
    expect(await violations(), chemin).toEqual([])
  }
})
