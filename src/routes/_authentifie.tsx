import { createFileRoute, Outlet, redirect } from '@tanstack/react-router'
import { useRafraichissementAuto } from '@/lib/rafraichissement'

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
  return <Outlet />
}
