// Réglages des pages filtrées dans le navigateur (liste, statistiques) : changer un filtre ne
// recharge pas les données, arriver sur la page si. Les données restent fraîches pendant
// qu'on y reste (staleTime infini) sans que le rechargement soit interdit (shouldReload laissé
// indéfini) : une navigation lancée pendant un rechargement, par exemple un filtre changé juste
// après une modification, attend sa fin au lieu de garder les anciennes données.
export const rechargementALaDemande = {
  staleTime: Infinity,
  shouldReload: ({ cause }: { cause: 'enter' | 'stay' | 'preload' }) =>
    cause === 'enter' ? true : undefined,
}
