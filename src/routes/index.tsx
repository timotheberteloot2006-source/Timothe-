import { createFileRoute, Link } from '@tanstack/react-router'

export const Route = createFileRoute('/')({
  component: Accueil,
})

function Accueil() {
  return (
    <section className="mx-auto max-w-6xl px-4 py-24 text-center">
      <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">Filtre</h1>
      <p className="mx-auto mt-4 max-w-xl text-lg text-slate-600">
        Accroche du produit à rédiger.
      </p>
      <div className="mt-8 flex flex-wrap justify-center gap-4">
        <Link
          to="/connexion"
          className="rounded-md bg-indigo-600 px-5 py-2.5 font-medium text-white hover:bg-indigo-500"
        >
          Commencer
        </Link>
        <Link
          to="/tarifs"
          className="rounded-md border border-slate-300 bg-white px-5 py-2.5 font-medium hover:bg-slate-100"
        >
          Voir les tarifs
        </Link>
      </div>
    </section>
  )
}
