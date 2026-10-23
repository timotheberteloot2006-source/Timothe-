import { createRootRouteWithContext, HeadContent, Link, Outlet } from '@tanstack/react-router'
import { Footer } from '@/components/Footer'
import { Header } from '@/components/Header'
import type { AuthState } from '@/lib/auth'

interface RouterContext {
  auth: AuthState
}

export const Route = createRootRouteWithContext<RouterContext>()({
  // Titre par défaut ; chaque page déclare le sien avec titrePage()
  head: () => ({ meta: [{ title: 'Filtre — trier et filtrer vos candidatures' }] }),
  component: RootLayout,
  notFoundComponent: NotFound,
})

function RootLayout() {
  return (
    <div className="flex min-h-screen flex-col bg-slate-50 text-slate-900">
      <HeadContent />
      {/* Lien d'évitement : premier élément atteint au clavier, invisible sinon */}
      <a
        href="#contenu"
        className="sr-only rounded-md bg-surface px-4 py-2 font-medium text-accent shadow focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:px-4 focus:py-2"
      >
        Aller au contenu
      </a>
      <Header />
      <main id="contenu" tabIndex={-1} className="flex-1 focus:outline-none">
        <Outlet />
      </main>
      <Footer />
    </div>
  )
}

function NotFound() {
  return (
    <div className="mx-auto max-w-6xl px-4 py-24 text-center">
      <h1 className="text-2xl font-semibold">Page introuvable</h1>
      <p className="mt-2 text-slate-600">Cette page n'existe pas.</p>
      <Link to="/" className="mt-6 inline-block text-accent hover:underline">
        Retour à l'accueil
      </Link>
    </div>
  )
}
