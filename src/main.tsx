import { StrictMode, useEffect } from 'react'
import { createRoot } from 'react-dom/client'
import { createRouter, RouterProvider } from '@tanstack/react-router'
import './index.css'
import { AuthProvider } from './components/AuthProvider'
import { useAuth } from './lib/auth'
import { routeTree } from './routeTree.gen'

const router = createRouter({
  routeTree,
  // Renseigné par InnerApp à chaque rendu
  context: { auth: undefined! },
})

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router
  }
}

function InnerApp() {
  const auth = useAuth()

  // Relance les beforeLoad (protection des routes) à chaque changement de session
  useEffect(() => {
    if (!auth.chargement) router.invalidate()
  }, [auth.session, auth.chargement])

  // Attendre la session initiale pour ne pas rediriger à tort vers la connexion
  if (auth.chargement) return null

  return <RouterProvider router={router} context={{ auth }} />
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AuthProvider>
      <InnerApp />
    </AuthProvider>
  </StrictMode>,
)
