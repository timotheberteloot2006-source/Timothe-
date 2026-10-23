import { useRouter } from '@tanstack/react-router'
import { useEffect } from 'react'
import { supabase } from './supabase'

// Rafraîchit les données de la page affichée pendant qu'elle est visible, pour voir les
// modifications des autres membres de l'espace : toutes les minutes, et en revenant sur l'onglet
// s'il est resté caché plus de 30 secondes. Le rechargement se fait en arrière-plan : la page
// reste affichée et les saisies en cours ne sont pas touchées.
//
// Pour ménager la base, on demande d'abord la signature de l'espace actif (une petite requête,
// supabase/migrations/0025_signature_espace.sql) et on ne recharge que si elle a changé. Si elle
// ne peut pas être lue (base pas encore à jour, coupure réseau), on recharge comme avant : une
// coupure est alors signalée par la page.
export const INTERVALLE_RAFRAICHISSEMENT = 60_000
export const DELAI_RETOUR = 30_000

// null : signature illisible
export async function lireSignature(): Promise<string | null> {
  if (!supabase) return null
  try {
    const { data, error } = await supabase.rpc('signature_espace')
    return error || typeof data !== 'string' ? null : data
  } catch {
    return null
  }
}

export function useRafraichissementAuto() {
  const router = useRouter()

  useEffect(() => {
    let dernier = Date.now()
    // Signature lue avant le dernier rechargement (undefined : aucun encore). Toujours lue avant
    // de recharger, jamais après : une modification faite entre les deux provoque un rechargement
    // de plus, jamais un oubli. Le premier contrôle recharge donc toujours.
    let connue: string | null | undefined
    let enCours = false
    let actif = true

    async function verifier() {
      if (enCours) return
      enCours = true
      dernier = Date.now()
      try {
        const signature = await lireSignature()
        if (!actif) return
        if (signature === null || signature !== connue) {
          connue = signature
          await router.invalidate()
        }
      } finally {
        enCours = false
      }
    }

    const minuterie = window.setInterval(() => {
      if (document.visibilityState === 'visible') verifier()
    }, INTERVALLE_RAFRAICHISSEMENT)
    const auRetour = () => {
      if (document.visibilityState === 'visible' && Date.now() - dernier > DELAI_RETOUR) verifier()
    }
    document.addEventListener('visibilitychange', auRetour)
    return () => {
      actif = false
      window.clearInterval(minuterie)
      document.removeEventListener('visibilitychange', auRetour)
    }
  }, [router])
}
