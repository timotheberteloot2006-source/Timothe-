import { createFileRoute, Link, useRouter } from '@tanstack/react-router'
import { useState, type FormEvent } from 'react'
import { classeChamp } from '@/components/candidatures/styles'
import { creerOffre, listerOffres, renommerOffre, supprimerOffre, type Offre } from '@/lib/offres'

export const Route = createFileRoute('/_authentifie/offres')({
  loader: listerOffres,
  component: Offres,
  errorComponent: ({ error }) => (
    <section className="mx-auto max-w-3xl px-4 py-16">
      <p role="alert" className="rounded-md bg-red-50 px-4 py-3 text-red-700">
        Impossible de charger les offres : {error instanceof Error ? error.message : String(error)}
      </p>
    </section>
  ),
})

function Offres() {
  const offres = Route.useLoaderData()
  const router = useRouter()
  const [erreur, setErreur] = useState<string | null>(null)
  const [idEnEdition, setIdEnEdition] = useState<string | null>(null)

  // Exécute une modification puis recharge la liste ; renvoie false en cas d'erreur
  async function executer(action: () => Promise<void>) {
    setErreur(null)
    try {
      await action()
      await router.invalidate()
      return true
    } catch (e) {
      setErreur(e instanceof Error ? e.message : String(e))
      return false
    }
  }

  async function handleCreation(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const formulaire = event.currentTarget
    const titre = String(new FormData(formulaire).get('titre') ?? '').trim()
    if (titre && (await executer(() => creerOffre(titre)))) formulaire.reset()
  }

  async function handleRenommage(offre: Offre, titre: string) {
    if (await executer(() => renommerOffre(offre.id, titre))) setIdEnEdition(null)
  }

  function handleSuppression(offre: Offre) {
    const n = offre.nb_candidatures
    const message =
      n > 0
        ? `Supprimer l’offre « ${offre.titre} » ? Ses ${n} candidature${n > 1 ? 's' : ''} seront conservée${n > 1 ? 's' : ''}, sans offre.`
        : `Supprimer l’offre « ${offre.titre} » ?`
    if (window.confirm(message)) executer(() => supprimerOffre(offre.id))
  }

  return (
    <section className="mx-auto max-w-3xl space-y-6 px-4 py-12">
      <h1 className="text-2xl font-bold">Offres d’emploi</h1>
      <p className="text-slate-600">
        Rattachez chaque candidature à une offre pour les retrouver et les filtrer par poste.
      </p>

      <form onSubmit={handleCreation} className="flex flex-wrap items-end gap-3">
        <label className="block min-w-64 flex-1">
          <span className="text-sm font-medium">Nouvelle offre</span>
          <input
            name="titre"
            required
            maxLength={120}
            placeholder="Ex. Développeur front (CDI, Lyon)"
            className={classeChamp}
          />
        </label>
        <button
          type="submit"
          className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500"
        >
          Créer l’offre
        </button>
      </form>

      {erreur && (
        <p role="alert" className="rounded-md bg-red-50 px-4 py-3 text-sm text-red-700">
          {erreur}
        </p>
      )}

      {offres.length === 0 ? (
        <div className="rounded-lg border border-dashed border-slate-300 bg-surface p-12 text-center text-slate-500">
          Aucune offre pour le moment.
        </div>
      ) : (
        <ul className="divide-y divide-slate-200 rounded-lg border border-slate-200 bg-surface">
          {offres.map((offre) =>
            offre.id === idEnEdition ? (
              <li key={offre.id} className="p-4">
                <FormulaireRenommage
                  offre={offre}
                  onValider={(titre) => handleRenommage(offre, titre)}
                  onAnnuler={() => setIdEnEdition(null)}
                />
              </li>
            ) : (
              <li key={offre.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
                <div>
                  <p className="font-medium">{offre.titre}</p>
                  <Link
                    to="/tableau-de-bord"
                    search={{ offre: offre.id }}
                    className="text-sm text-accent hover:underline"
                  >
                    {offre.nb_candidatures} candidature{offre.nb_candidatures > 1 ? 's' : ''}
                  </Link>
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setIdEnEdition(offre.id)}
                    className="rounded-md px-2 py-1 text-sm text-slate-500 hover:bg-slate-100 hover:text-slate-900"
                  >
                    Renommer
                  </button>
                  <button
                    type="button"
                    onClick={() => handleSuppression(offre)}
                    className="rounded-md px-2 py-1 text-sm text-slate-500 hover:bg-red-50 hover:text-red-700"
                  >
                    Supprimer
                  </button>
                </div>
              </li>
            ),
          )}
        </ul>
      )}
    </section>
  )
}

function FormulaireRenommage({
  offre,
  onValider,
  onAnnuler,
}: {
  offre: Offre
  onValider: (titre: string) => void
  onAnnuler: () => void
}) {
  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const titre = String(new FormData(event.currentTarget).get('titre') ?? '').trim()
    if (titre) onValider(titre)
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-wrap items-end gap-3">
      <label className="block min-w-64 flex-1">
        <span className="sr-only">Nouveau titre de l’offre</span>
        <input
          name="titre"
          required
          maxLength={120}
          defaultValue={offre.titre}
          autoFocus
          className={classeChamp}
        />
      </label>
      <button
        type="submit"
        className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500"
      >
        Enregistrer
      </button>
      <button
        type="button"
        onClick={onAnnuler}
        className="rounded-md border border-slate-300 px-4 py-2 text-sm font-medium hover:bg-slate-100"
      >
        Annuler
      </button>
    </form>
  )
}
