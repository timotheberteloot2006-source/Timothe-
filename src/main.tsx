import { StrictMode, useEffect, useRef } from 'react'
import { createRoot } from 'react-dom/client'
import { createRouter, RouterProvider } from '@tanstack/react-router'
import './index.css'
import { AuthProvider } from './components/AuthProvider'
import { useAuth } from './lib/auth'
import { routeTree } from './routeTree.gen'
import { oublierDonnees } from './lib/rechargement'

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

  const userId = auth.user?.id ?? null
  const userIdPrecedent = useRef<string | null | undefined>(undefined)

  // Relance les beforeLoad (protection des routes) et les loaders à la connexion / déconnexion,
  // mais pas au premier affichage ni au simple renouvellement du jeton
  useEffect(() => {
    if (auth.chargement) return
    if (userIdPrecedent.current !== undefined && userIdPrecedent.current !== userId) {
      // Rien des pages de l'ancien compte ne doit resservir en cas de panne
      oublierDonnees()
      router.invalidate()
    }
    userIdPrecedent.current = userId
  }, [userId, auth.chargement])

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
