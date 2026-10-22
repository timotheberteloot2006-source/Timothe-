import { createFileRoute, Outlet, redirect } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import { useRafraichissementAuto } from '@/lib/rafraichissement'
import { ecouterPanne } from '@/lib/rechargement'

// Layout sans chemin : toutes les routes de src/routes/_authentifie/ exigent une session
export const Route = createFileRoute('/_authentifie')({
  beforeLoad: ({ context, location }) => {
    if (!context.auth.session) {
      throw redirect({ to: '/connexion', search: { redirect: location.href } })
    }
  },
  component: PagesConnectees,
})

function PagesConnectees() {
  // Modifications des autres membres de l'espace
  useRafraichissementAuto()
  // Rechargement échoué (coupure réseau…) : la page garde ses données, on le signale
  const [enPanne, setEnPanne] = useState(false)
  useEffect(() => ecouterPanne(setEnPanne), [])

  return (
    <>
      <div role="status">
        {enPanne && (
          <p className="bg-amber-50 px-4 py-2 text-center text-sm text-amber-800">
            Connexion perdue : les données affichées ne sont peut-être plus à jour. Nouvel essai
            dans une minute.
          </p>
        )}
      </div>
      <Outlet />
    </>
  )
}
