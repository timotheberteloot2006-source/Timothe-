import { createFileRoute, Link, useRouter } from '@tanstack/react-router'
import { useState } from 'react'
import { BarreFiltres } from '@/components/candidatures/BarreFiltres'
import { FormulaireCandidature } from '@/components/candidatures/FormulaireCandidature'
import { ImportCsv } from '@/components/candidatures/ImportCsv'
import { ListeCandidatures } from '@/components/candidatures/ListeCandidatures'
import {
  ajouterCandidature,
  ajouterCandidatures,
  changerStatut,
  listerCandidatures,
  modifierCandidature,
  supprimerCandidature,
  type Candidature,
  type NouvelleCandidature,
  type Statut,
} from '@/lib/candidatures'
import { estPro, LIMITE_GRATUITE, lireAbonnement, placesRestantes } from '@/lib/abonnement'
import { filtrerCandidatures, lireFiltres, trierCandidatures, type Filtres } from '@/lib/filtres'
import { genererCsv, nomFichierExport, telechargerCsv } from '@/lib/exportCandidatures'

export const Route = createFileRoute('/_authentifie/tableau-de-bord')({
  validateSearch: lireFiltres,
  loader: async () => {
    const [candidatures, abonnement] = await Promise.all([listerCandidatures(), lireAbonnement()])
    return { candidatures, abonnement }
  },
  // Le filtrage se fait dans le navigateur : ne pas recharger à chaque changement de filtre
  shouldReload: false,
  component: TableauDeBord,
  errorComponent: ({ error }) => (
    <section className="mx-auto max-w-6xl px-4 py-16">
      <h1 className="text-2xl font-bold">Candidatures</h1>
      <p role="alert" className="mt-6 rounded-md bg-red-50 px-4 py-3 text-red-700">
        Impossible de charger les candidatures :{' '}
        {error instanceof Error ? error.message : String(error)}
      </p>
    </section>
  ),
})

function TableauDeBord() {
  const { candidatures, abonnement } = Route.useLoaderData()
  const places = placesRestantes(abonnement, candidatures.length)
  const filtres = Route.useSearch()
  const navigate = Route.useNavigate()
  const router = useRouter()
  const [panneau, setPanneau] = useState<'ajout' | 'import' | null>(null)
  const [idEnEdition, setIdEnEdition] = useState<string | null>(null)
  const [erreur, setErreur] = useState<string | null>(null)

  const resultats = trierCandidatures(filtrerCandidatures(candidatures, filtres), filtres.tri)

  function changerFiltres(nouveaux: Filtres) {
    navigate({ search: nouveaux, replace: true })
  }

  async function executer(action: () => Promise<void>) {
    setErreur(null)
    try {
      await action()
    } catch (e) {
      setErreur(e instanceof Error ? e.message : String(e))
    }
    await router.invalidate()
  }

  async function handleAjout(candidature: NouvelleCandidature) {
    // Les erreurs d'ajout sont affichées dans le formulaire
    await ajouterCandidature(candidature)
    await router.invalidate()
  }

  async function handleImport(nouvelles: NouvelleCandidature[]) {
    // Les erreurs d'import sont affichées dans le panneau
    await ajouterCandidatures(nouvelles)
    setPanneau(null)
    await router.invalidate()
  }

  async function handleModification(id: string, champs: NouvelleCandidature) {
    // Les erreurs sont affichées dans le formulaire, qui reste alors ouvert
    await modifierCandidature(id, champs)
    setIdEnEdition(null)
    await router.invalidate()
  }

  function handleSupprimer(candidature: Candidature) {
    if (!window.confirm(`Supprimer la candidature de ${candidature.nom} ?`)) return
    executer(() => supprimerCandidature(candidature))
  }

  return (
    <section className="mx-auto max-w-6xl space-y-6 px-4 py-12">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-2xl font-bold">Candidatures</h1>
        {!panneau && (
          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              disabled={places === 0}
              onClick={() => setPanneau('import')}
              className="rounded-md border border-slate-300 bg-surface px-4 py-2 text-sm font-medium hover:bg-slate-100 disabled:opacity-50"
            >
              Importer un CSV
            </button>
            <button
              type="button"
              disabled={places === 0}
              onClick={() => setPanneau('ajout')}
              className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-50"
            >
              Ajouter une candidature
            </button>
          </div>
        )}
      </div>

      {!estPro(abonnement) && <BandeauQuota nombre={candidatures.length} />}

      {panneau === 'ajout' && (
        <FormulaireCandidature onEnregistrer={handleAjout} onAnnuler={() => setPanneau(null)} />
      )}
      {panneau === 'import' && (
        <ImportCsv
          existantes={candidatures}
          placesRestantes={places}
          onImporter={handleImport}
          onFermer={() => setPanneau(null)}
        />
      )}

      {erreur && (
        <p role="alert" className="rounded-md bg-red-50 px-4 py-3 text-sm text-red-700">
          {erreur}
        </p>
      )}

      {candidatures.length === 0 ? (
        <div className="rounded-lg border border-dashed border-slate-300 bg-surface p-12 text-center text-slate-500">
          Aucune candidature pour le moment. Ajoutez-en une ou importez un fichier CSV pour
          commencer.
        </div>
      ) : (
        <>
          <BarreFiltres filtres={filtres} onChange={changerFiltres} />
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm text-slate-600">
              {resultats.length} candidature{resultats.length > 1 ? 's' : ''} sur{' '}
              {candidatures.length}
            </p>
            <button
              type="button"
              disabled={resultats.length === 0}
              onClick={() => telechargerCsv(genererCsv(resultats), nomFichierExport())}
              title="Exporte les candidatures affichées (filtres compris)"
              className="rounded-md border border-slate-300 bg-surface px-3 py-1.5 text-sm font-medium hover:bg-slate-100 disabled:opacity-50"
            >
              Exporter en CSV
            </button>
          </div>
          {resultats.length > 0 ? (
            <ListeCandidatures
              candidatures={resultats}
              idEnEdition={idEnEdition}
              onChangerStatut={(id: string, statut: Statut) =>
                executer(() => changerStatut(id, statut))
              }
              onModifier={(c) => setIdEnEdition(c.id)}
              onEnregistrer={handleModification}
              onAnnulerEdition={() => setIdEnEdition(null)}
              onSupprimer={handleSupprimer}
            />
          ) : (
            <div className="rounded-lg border border-dashed border-slate-300 bg-surface p-12 text-center text-slate-500">
              Aucune candidature ne correspond à ces filtres.
            </div>
          )}
        </>
      )}
    </section>
  )
}

function BandeauQuota({ nombre }: { nombre: number }) {
  const atteinte = nombre >= LIMITE_GRATUITE
  return (
    <div
      className={`flex flex-wrap items-center justify-between gap-2 rounded-md px-4 py-3 text-sm ${atteinte ? 'bg-amber-50 text-amber-800' : 'bg-slate-100 text-slate-700'}`}
    >
      <span>
        Offre Gratuite : {Math.min(nombre, LIMITE_GRATUITE)} / {LIMITE_GRATUITE} candidatures
        {atteinte && ' — limite atteinte'}
      </span>
      <Link to="/tarifs" className="font-medium text-accent hover:underline">
        Passer à Pro
      </Link>
    </div>
  )
}
