import { createFileRoute, Link, useRouter } from '@tanstack/react-router'
import { useState, type FormEvent } from 'react'
import { classeChamp } from '@/components/candidatures/styles'
import { lireEspace } from '@/lib/espace'
import { lienFormulaire } from '@/lib/formulairePublic'
import {
  creerOffre,
  listerOffres,
  modifierFormulaire,
  nouveauLienFormulaire,
  renommerOffre,
  supprimerOffre,
  type Offre,
} from '@/lib/offres'
import { titrePage } from '@/lib/titre'

export const Route = createFileRoute('/_authentifie/offres')({
  head: () => titrePage('Offres d’emploi'),
  // Nom de l'espace : c'est celui que voient les candidats sur le formulaire public
  loader: async () => {
    const [offres, espace] = await Promise.all([listerOffres(), lireEspace()])
    return { offres, nomEspace: espace.nom }
  },
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
  const { offres, nomEspace } = Route.useLoaderData()
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
        Rattachez chaque candidature à une offre pour les retrouver et les filtrer par poste. Chaque
        offre peut aussi avoir son formulaire en ligne : les candidats postulent eux-mêmes, et leur
        candidature arrive directement dans la liste.
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
              <li key={offre.id} className="space-y-3 p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="font-medium">
                      {offre.titre}
                      {offre.publique && (
                        <span className="ml-2 rounded-full bg-green-50 px-2 py-0.5 text-xs font-medium text-green-800">
                          Formulaire en ligne
                        </span>
                      )}
                    </p>
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
                </div>
                <PanneauFormulaire offre={offre} nomEspace={nomEspace} executer={executer} />
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

// Réglages du formulaire public d'une offre : ouverture, lien à diffuser, description
function PanneauFormulaire({
  offre,
  nomEspace,
  executer,
}: {
  offre: Offre
  nomEspace: string
  executer: (action: () => Promise<void>) => Promise<boolean>
}) {
  const [copie, setCopie] = useState(false)
  // Affiché tout de suite, remis à l'état précédent si la modification échoue
  const [publique, setPublique] = useState(offre.publique)
  const lien = lienFormulaire(offre.jeton_public)

  async function basculer(valeur: boolean) {
    setPublique(valeur)
    if (!(await executer(() => modifierFormulaire(offre.id, { publique: valeur }))))
      setPublique(!valeur)
  }

  async function copier() {
    try {
      await navigator.clipboard.writeText(lien)
      setCopie(true)
    } catch {
      // Presse-papiers refusé : le lien reste sélectionnable dans le champ
      setCopie(false)
    }
  }

  function handleNouveauLien() {
    if (
      window.confirm(
        'Créer un nouveau lien ? L’ancien ne fonctionnera plus : les candidats qui l’ont reçu ne pourront plus postuler.',
      )
    )
      executer(() => nouveauLienFormulaire(offre.id)).then(() => setCopie(false))
  }

  function handleDescription(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const texte = String(new FormData(event.currentTarget).get('description') ?? '').trim()
    executer(() => modifierFormulaire(offre.id, { description: texte || null }))
  }

  return (
    <details className="rounded-md border border-slate-200 px-3 py-2 text-sm">
      <summary className="cursor-pointer font-medium">Formulaire de candidature</summary>
      <div className="mt-3 space-y-3">
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={publique} onChange={(e) => basculer(e.target.checked)} />
          Formulaire en ligne
        </label>

        {publique && (
          <div className="flex flex-wrap items-end gap-2">
            <label className="block min-w-64 flex-1">
              <span className="font-medium">Lien à diffuser</span>
              <input
                readOnly
                value={lien}
                onFocus={(e) => e.target.select()}
                className={classeChamp}
              />
            </label>
            <button
              type="button"
              onClick={copier}
              className="rounded-md border border-slate-300 px-3 py-2 font-medium hover:bg-slate-100"
            >
              {copie ? 'Lien copié' : 'Copier le lien'}
            </button>
            <button
              type="button"
              onClick={handleNouveauLien}
              className="rounded-md px-3 py-2 text-slate-600 hover:bg-slate-100 hover:text-slate-900"
            >
              Nouveau lien
            </button>
          </div>
        )}

        <p className="text-slate-600">
          Les candidats voient le nom de votre espace : « {nomEspace} ».
          {nomEspace === 'Mon espace' && (
            <>
              {' '}
              Donnez-lui le nom de votre entreprise depuis la page{' '}
              <Link to="/equipe" className="text-accent underline underline-offset-2">
                Équipe
              </Link>
              .
            </>
          )}
        </p>

        <form onSubmit={handleDescription} className="space-y-2">
          <label className="block">
            <span className="font-medium">Description présentée aux candidats</span>
            <textarea
              name="description"
              rows={4}
              maxLength={5000}
              defaultValue={offre.description ?? ''}
              placeholder="Missions, profil recherché, lieu, type de contrat…"
              className={classeChamp}
            />
          </label>
          <button
            type="submit"
            className="rounded-md bg-indigo-600 px-3 py-2 font-medium text-white hover:bg-indigo-500"
          >
            Enregistrer la description
          </button>
        </form>
      </div>
    </details>
  )
}
