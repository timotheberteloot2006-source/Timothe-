import { createFileRoute, Link } from '@tanstack/react-router'

export const Route = createFileRoute('/tarifs')({
  component: Tarifs,
})

// Offres provisoires : noms et prix à définir
const offres = [
  { nom: 'Gratuit', prix: 'À définir' },
  { nom: 'Pro', prix: 'À définir' },
  { nom: 'Équipe', prix: 'À définir' },
]

function Tarifs() {
  return (
    <section className="mx-auto max-w-6xl px-4 py-16">
      <h1 className="text-center text-3xl font-bold">Tarifs</h1>
      <div className="mt-10 grid gap-6 sm:grid-cols-3">
        {offres.map((offre) => (
          <div
            key={offre.nom}
            className="flex flex-col rounded-lg border border-slate-200 bg-white p-6"
          >
            <h2 className="text-lg font-semibold">{offre.nom}</h2>
            <p className="mt-2 text-slate-600">{offre.prix}</p>
            <Link
              to="/connexion"
              className="mt-6 rounded-md bg-indigo-600 px-4 py-2 text-center font-medium text-white hover:bg-indigo-500"
            >
              Choisir
            </Link>
          </div>
        ))}
      </div>
    </section>
  )
}
