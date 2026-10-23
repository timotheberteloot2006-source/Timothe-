import { Link } from '@tanstack/react-router'

const annee = new Date().getFullYear()

const lienClass = 'hover:text-slate-900 hover:underline'

export function Footer() {
  return (
    <footer className="border-t border-slate-200 bg-surface">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-4 py-6 text-sm text-slate-500">
        <span>© {annee} Filtre</span>
        <nav className="flex flex-wrap gap-x-6 gap-y-2">
          <Link to="/mentions-legales" className={lienClass}>
            Mentions légales
          </Link>
          <Link to="/confidentialite" className={lienClass}>
            Confidentialité
          </Link>
          <Link to="/conditions" className={lienClass}>
            Conditions générales
          </Link>
        </nav>
      </div>
    </footer>
  )
}
