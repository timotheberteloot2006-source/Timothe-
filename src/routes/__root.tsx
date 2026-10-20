import { createRootRouteWithContext, Link, Outlet } from '@tanstack/react-router'
import { Footer } from '@/components/Footer'
import { Header } from '@/components/Header'
import type { AuthState } from '@/lib/auth'

interface RouterContext {
  auth: AuthState
}

export const Route = createRootRouteWithContext<RouterContext>()({
  component: RootLayout,
  notFoundComponent: NotFound,
})

function RootLayout() {
  return (
    <div className="flex min-h-screen flex-col bg-slate-50 text-slate-900">
      <Header />
      <main className="flex-1">
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
      <Link to="/" className="mt-6 inline-block text-indigo-600 hover:underline">
        Retour à l'accueil
      </Link>
    </div>
  )
}
