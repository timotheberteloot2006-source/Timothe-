import { createFileRoute, Outlet, redirect } from '@tanstack/react-router'

// Layout sans chemin : toutes les routes de src/routes/_authentifie/ exigent une session
export const Route = createFileRoute('/_authentifie')({
  beforeLoad: ({ context, location }) => {
    if (!context.auth.session) {
      throw redirect({ to: '/connexion', search: { redirect: location.href } })
    }
  },
  component: Outlet,
})
