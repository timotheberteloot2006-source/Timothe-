import { useRouter } from '@tanstack/react-router'
import { useEffect } from 'react'

// Rafraîchit les données de la page affichée pendant qu'elle est visible, pour voir les
// modifications des autres membres de l'espace : toutes les minutes, et en revenant sur l'onglet
// s'il est resté caché plus de 30 secondes. Le rechargement se fait en arrière-plan : la page
// reste affichée et les saisies en cours ne sont pas touchées.
export const INTERVALLE_RAFRAICHISSEMENT = 60_000
export const DELAI_RETOUR = 30_000

export function useRafraichissementAuto() {
  const router = useRouter()

  useEffect(() => {
    let dernier = Date.now()
    const rafraichir = () => {
      dernier = Date.now()
      router.invalidate()
    }
    const minuterie = window.setInterval(() => {
      if (document.visibilityState === 'visible') rafraichir()
    }, INTERVALLE_RAFRAICHISSEMENT)
    const auRetour = () => {
      if (document.visibilityState === 'visible' && Date.now() - dernier > DELAI_RETOUR)
        rafraichir()
    }
    document.addEventListener('visibilitychange', auRetour)
    return () => {
      window.clearInterval(minuterie)
      document.removeEventListener('visibilitychange', auRetour)
    }
  }, [router])
}
