import { Link, useNavigate } from '@tanstack/react-router'
import { useAuth } from '@/lib/auth'
import { Logo } from './Logo'

const navLinkClass = 'text-sm text-slate-600 hover:text-slate-900'
const activeNavLinkClass = 'text-sm font-medium text-slate-900'

export function Header() {
  const { user, deconnexion } = useAuth()
  const navigate = useNavigate()

  async function handleDeconnexion() {
    await deconnexion()
    navigate({ to: '/' })
  }

  return (
    <header className="border-b border-slate-200 bg-surface">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-4 py-4">
        <Logo />
        <nav className="flex flex-wrap items-center gap-x-6 gap-y-2">
          <Link
            to="/tarifs"
            className={navLinkClass}
            activeProps={{ className: activeNavLinkClass }}
          >
            Tarifs
          </Link>
          <Link
            to="/tableau-de-bord"
            className={navLinkClass}
            activeProps={{ className: activeNavLinkClass }}
          >
            Tableau de bord
          </Link>
          {user && (
            <Link
              to="/offres"
              className={navLinkClass}
              activeProps={{ className: activeNavLinkClass }}
            >
              Offres
            </Link>
          )}
          {user && (
            <Link
              to="/statistiques"
              className={navLinkClass}
              activeProps={{ className: activeNavLinkClass }}
            >
              Statistiques
            </Link>
          )}
          {user && (
            <Link
              to="/equipe"
              className={navLinkClass}
              activeProps={{ className: activeNavLinkClass }}
            >
              Équipe
            </Link>
          )}
          {user && (
            <Link
              to="/compte"
              className={navLinkClass}
              activeProps={{ className: activeNavLinkClass }}
            >
              Mon compte
            </Link>
          )}
          {user ? (
            <button
              type="button"
              onClick={handleDeconnexion}
              className="rounded-md border border-slate-300 px-3 py-1.5 text-sm font-medium hover:bg-slate-100"
            >
              Déconnexion
            </button>
          ) : (
            <Link
              to="/connexion"
              className="rounded-md bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-500"
            >
              Connexion
            </Link>
          )}
        </nav>
      </div>
    </header>
  )
}
