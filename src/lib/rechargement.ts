import { isNotFound, isRedirect } from '@tanstack/react-router'

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

// Dernières données chargées de chaque page (une seule adresse retenue par page)
const dernieres = new Map<string, { parametres: string; donnees: unknown }>()
const ecouteurs = new Set<(enPanne: boolean) => void>()

function signaler(enPanne: boolean) {
  ecouteurs.forEach((ecouteur) => ecouteur(enPanne))
}

// Prévenu quand un rechargement échoue (true) ou réussit de nouveau (false)
export function ecouterPanne(ecouteur: (enPanne: boolean) => void) {
  ecouteurs.add(ecouteur)
  return () => {
    ecouteurs.delete(ecouteur)
  }
}

// À la connexion ou à la déconnexion : rien ne doit survivre d'un compte à l'autre
export function oublierDonnees() {
  dernieres.clear()
}

// Loader qui garde la page affichée quand un rechargement échoue alors qu'on y reste
// (rafraîchissement automatique pendant une coupure réseau…) : la page conserve ses dernières
// données, et les saisies en cours, au lieu d'être remplacée par un message d'erreur. Arriver
// sur la page sans pouvoir la charger affiche toujours l'erreur.
export async function sansInterruption<T>(
  page: string,
  contexte: { cause: string; params?: unknown },
  charger: () => Promise<T>,
): Promise<T> {
  const parametres = JSON.stringify(contexte.params ?? {})
  try {
    const donnees = await charger()
    dernieres.set(page, { parametres, donnees })
    signaler(false)
    return donnees
  } catch (erreur) {
    const derniere = dernieres.get(page)
    // Candidature supprimée entre-temps, session expirée… : réponses voulues, pas des pannes
    if (isNotFound(erreur) || isRedirect(erreur)) throw erreur
    if (contexte.cause !== 'stay' || derniere?.parametres !== parametres) throw erreur
    signaler(true)
    return derniere.donnees as T
  }
}
