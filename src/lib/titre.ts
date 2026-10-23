// Titre de l'onglet d'une page (critère WCAG 2.4.2), pour l'option head des routes
export function titrePage(titre: string) {
  return { meta: [{ title: `${titre} · Filtre` }] }
}
