import { createFileRoute, Link } from '@tanstack/react-router'
import type { ReactNode } from 'react'
import { lirePageCarrieres } from '@/lib/carrieres'
import { titrePage } from '@/lib/titre'

// Description d'une offre dans la liste : son début seulement, la suite est sur le formulaire
const LONGUEUR_EXTRAIT = 220

// Page publique, sans compte : l'adresse est réglée par le propriétaire (page « Équipe »)
export const Route = createFileRoute('/carrieres/$adresse')({
  loader: ({ params }) => lirePageCarrieres(params.adresse),
  // Après loader : les types de loaderData en dépendent
  head: ({ loaderData }) =>
    titrePage(loaderData ? `Offres d’emploi : ${loaderData.nom}` : 'Page introuvable'),
  component: Carrieres,
  errorComponent: () => (
    <Cadre titre="Page indisponible">
      <p role="alert" className="rounded-md bg-red-50 px-4 py-3 text-red-700">
        La page ne peut pas être affichée pour le moment : réessayez dans quelques instants.
      </p>
    </Cadre>
  ),
})

function Carrieres() {
  const page = Route.useLoaderData()

  if (!page) {
    return (
      <Cadre titre="Page introuvable">
        <p className="text-slate-600">Cette page carrières n’existe pas ou n’est plus en ligne.</p>
      </Cadre>
    )
  }

  return (
    <Cadre titre={page.nom}>
      {page.presentation && (
        <p className="whitespace-pre-line text-slate-700">{page.presentation}</p>
      )}
      <h2 className="pt-2 text-lg font-semibold">
        {page.offres.length > 0
          ? `${page.offres.length} offre${page.offres.length > 1 ? 's' : ''} ouverte${page.offres.length > 1 ? 's' : ''}`
          : 'Offres ouvertes'}
      </h2>
      {page.offres.length === 0 ? (
        <p className="rounded-lg border border-dashed border-slate-300 bg-surface p-8 text-center text-slate-600">
          Aucune offre ouverte pour le moment.
        </p>
      ) : (
        <ul className="space-y-3">
          {page.offres.map((offre) => (
            <li
              key={offre.jeton}
              className="flex flex-wrap items-start justify-between gap-3 rounded-lg border border-slate-200 bg-surface p-4"
            >
              <div className="min-w-0 flex-1">
                <h3 className="font-medium">{offre.titre}</h3>
                {offre.description && (
                  <p className="mt-1 whitespace-pre-line text-sm text-slate-600">
                    {offre.description.length > LONGUEUR_EXTRAIT
                      ? `${offre.description.slice(0, LONGUEUR_EXTRAIT).trimEnd()}…`
                      : offre.description}
                  </p>
                )}
              </div>
              <Link
                to="/postuler/$jeton"
                params={{ jeton: offre.jeton }}
                aria-label={`Postuler : ${offre.titre}`}
                className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500"
              >
                Postuler
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Cadre>
  )
}

function Cadre({ titre, children }: { titre: string; children: ReactNode }) {
  return (
    <section className="mx-auto max-w-3xl space-y-4 px-4 py-12">
      <h1 className="text-2xl font-bold">{titre}</h1>
      {children}
    </section>
  )
}
