import { createFileRoute, Link } from '@tanstack/react-router'
import { useId, type ReactNode } from 'react'
import { classeChamp } from '@/components/candidatures/styles'
import { listerCandidatures } from '@/lib/candidatures'
import { couleurEtape, ETAPES_DE_BASE, listerEtapes } from '@/lib/etapes'
import { classeEtiquette, listerAttributions, listerEtiquettes } from '@/lib/etiquettes'
import {
  calculerIndicateurs,
  formaterDelai,
  libelleMois,
  lirePeriode,
  listerDatesRetenues,
  PERIODES,
  pourcentage,
  type Periode,
} from '@/lib/indicateurs'
import { listerOffres } from '@/lib/offres'
import { titrePage } from '@/lib/titre'

export const Route = createFileRoute('/_authentifie/statistiques')({
  head: () => titrePage('Statistiques'),
  validateSearch: lirePeriode,
  loader: async () => {
    const [candidatures, etapes, offres, etiquettes, attributions, datesRetenues] =
      await Promise.all([
        listerCandidatures(),
        // Bases pas encore à jour (migrations 0015 et 0022) : étapes habituelles, sans étiquette
        listerEtapes().catch(() => ETAPES_DE_BASE),
        listerOffres(),
        listerEtiquettes().catch(() => []),
        listerAttributions().catch(() => new Map<string, string[]>()),
        // Le délai est secondaire : son échec n'empêche pas d'afficher le reste
        listerDatesRetenues().catch(() => new Map<string, string>()),
      ])
    return { candidatures, etapes, offres, etiquettes, attributions, datesRetenues }
  },
  // Le calcul se fait dans le navigateur : ne pas recharger en changeant de période
  shouldReload: false,
  component: PageStatistiques,
  errorComponent: ({ error }) => (
    <section className="mx-auto max-w-5xl px-4 py-16">
      <h1 className="text-2xl font-bold">Statistiques</h1>
      <p role="alert" className="mt-6 rounded-md bg-red-50 px-4 py-3 text-red-700">
        Impossible de charger les statistiques :{' '}
        {error instanceof Error ? error.message : String(error)}
      </p>
    </section>
  ),
})

function PageStatistiques() {
  const donnees = Route.useLoaderData()
  const { periode = 'tout' } = Route.useSearch()
  const navigate = Route.useNavigate()
  const i = calculerIndicateurs(donnees, periode)
  const id = useId()

  return (
    <section className="mx-auto max-w-5xl space-y-6 px-4 py-12">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Statistiques</h1>
          <p className="text-sm text-slate-600">
            Candidatures reçues pendant la période, et où elles en sont aujourd’hui.
          </p>
        </div>
        <div>
          <label htmlFor={id} className="text-sm font-medium">
            Période
          </label>
          <select
            id={id}
            value={periode}
            onChange={(e) => {
              const choisie = e.target.value as Periode
              navigate({ search: { periode: choisie === 'tout' ? undefined : choisie } })
            }}
            className={classeChamp}
          >
            {Object.entries(PERIODES).map(([valeur, libelle]) => (
              <option key={valeur} value={valeur}>
                {libelle}
              </option>
            ))}
          </select>
        </div>
      </div>

      {i.total === 0 ? (
        <div className="rounded-lg border border-dashed border-slate-300 bg-surface p-12 text-center text-slate-500">
          Aucune candidature reçue sur cette période.
        </div>
      ) : (
        <>
          <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Tuile titre="Candidatures reçues" valeur={String(i.total)}>
              dont {i.enLigne} par le formulaire en ligne ({pourcentage(i.enLigne, i.total)})
            </Tuile>
            <Tuile titre="Retenues" valeur={pourcentage(i.retenues, i.total)}>
              {i.retenues} candidature{i.retenues > 1 ? 's' : ''}
            </Tuile>
            <Tuile titre="Écartées" valeur={pourcentage(i.ecartees, i.total)}>
              {i.ecartees} candidature{i.ecartees > 1 ? 's' : ''}
            </Tuile>
            <Tuile
              titre="Délai jusqu’à « Retenu »"
              valeur={i.delaiMedian === null ? '—' : formaterDelai(i.delaiMedian)}
            >
              {i.delaiMedian === null
                ? 'Aucune candidature retenue avec un historique'
                : `médiane sur ${i.nombreDelais} candidature${i.nombreDelais > 1 ? 's' : ''}`}
            </Tuile>
          </dl>

          <Carte titre="Par mois de réception">
            <ColonnesParMois parMois={i.parMois} />
          </Carte>

          <div className="grid gap-6 lg:grid-cols-2">
            <Carte titre="Par étape">
              <TableauBarres
                entete="Étape"
                total={i.total}
                lignes={i.parEtape.map(({ etape, nombre }) => ({
                  cle: etape.cle,
                  libelle: (
                    <Link
                      to="/tableau-de-bord"
                      search={{ statut: etape.cle }}
                      className="inline-flex items-center gap-2 hover:text-accent hover:underline"
                    >
                      <span
                        aria-hidden="true"
                        className={`size-2.5 rounded-full ${couleurEtape(etape.cle).pastille}`}
                      />
                      {etape.nom}
                    </Link>
                  ),
                  nombre,
                }))}
              />
            </Carte>

            {donnees.etiquettes.length > 0 && (
              <Carte titre="Par étiquette">
                <TableauBarres
                  entete="Étiquette"
                  total={i.total}
                  lignes={i.parEtiquette.map(({ etiquette, nombre }) => ({
                    cle: etiquette.id,
                    libelle: (
                      <Link
                        to="/tableau-de-bord"
                        search={{ etiquette: etiquette.id }}
                        className={`rounded-full px-2 py-0.5 text-xs font-medium hover:underline ${classeEtiquette(etiquette.couleur)}`}
                      >
                        {etiquette.nom}
                      </Link>
                    ),
                    nombre,
                  }))}
                />
              </Carte>
            )}
          </div>

          <Carte titre="Par offre">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-left text-slate-600">
                    <th scope="col" className="py-2 pr-4 font-medium">
                      Offre
                    </th>
                    <th scope="col" className="py-2 pr-4 text-right font-medium">
                      Reçues
                    </th>
                    <th scope="col" className="py-2 pr-4 text-right font-medium">
                      Retenues
                    </th>
                    <th scope="col" className="py-2 text-right font-medium">
                      Taux de sélection
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {i.parOffre.map(({ offre, recues, retenues }) => (
                    <tr key={offre?.id ?? 'aucune'}>
                      <th scope="row" className="py-2 pr-4 text-left font-normal">
                        <Link
                          to="/tableau-de-bord"
                          search={{ offre: offre?.id ?? 'aucune' }}
                          className="hover:text-accent hover:underline"
                        >
                          {offre?.titre ?? 'Sans offre'}
                        </Link>
                      </th>
                      <td className="py-2 pr-4 text-right tabular-nums">{recues}</td>
                      <td className="py-2 pr-4 text-right tabular-nums">{retenues}</td>
                      <td className="py-2 text-right tabular-nums">
                        {pourcentage(retenues, recues)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Carte>
        </>
      )}
    </section>
  )
}

function Tuile({
  titre,
  valeur,
  children,
}: {
  titre: string
  valeur: string
  children: ReactNode
}) {
  return (
    <div className="rounded-lg border border-slate-200 bg-surface p-4">
      <dt className="text-sm text-slate-600">{titre}</dt>
      <dd className="mt-1 text-2xl font-semibold tabular-nums">{valeur}</dd>
      <dd className="mt-1 text-xs text-slate-600">{children}</dd>
    </div>
  )
}

function Carte({ titre, children }: { titre: string; children: ReactNode }) {
  return (
    <div className="space-y-3 rounded-lg border border-slate-200 bg-surface p-4">
      <h2 className="font-semibold">{titre}</h2>
      {children}
    </div>
  )
}

// Tableau à barres horizontales : libellé, nombre, part du total ; la barre double la part
function TableauBarres({
  entete,
  total,
  lignes,
}: {
  entete: string
  total: number
  lignes: { cle: string; libelle: ReactNode; nombre: number }[]
}) {
  const max = Math.max(1, ...lignes.map((l) => l.nombre))
  return (
    <table className="w-full text-sm">
      <thead className="sr-only">
        <tr>
          <th scope="col">{entete}</th>
          <th scope="col">Nombre</th>
          <th scope="col">Part</th>
        </tr>
      </thead>
      <tbody>
        {lignes.map((ligne) => (
          <tr key={ligne.cle}>
            <th scope="row" className="py-1.5 pr-3 text-left font-normal whitespace-nowrap">
              {ligne.libelle}
            </th>
            <td className="w-full py-1.5 pr-3">
              <span className="flex items-center gap-2">
                <span
                  aria-hidden="true"
                  className="h-2 rounded-r bg-indigo-500"
                  style={{
                    width: `${(ligne.nombre / max) * 100}%`,
                    minWidth: ligne.nombre ? 4 : 0,
                  }}
                />
                <span className="tabular-nums">{ligne.nombre}</span>
              </span>
            </td>
            <td className="py-1.5 text-right whitespace-nowrap text-slate-600 tabular-nums">
              {pourcentage(ligne.nombre, total)}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

// Colonnes par mois, avec le tableau des valeurs pour les lecteurs d'écran
function ColonnesParMois({ parMois }: { parMois: { mois: string; nombre: number }[] }) {
  const max = Math.max(1, ...parMois.map((m) => m.nombre))
  // Un mois sur deux ou trois étiqueté quand il y en a beaucoup
  const pas = parMois.length > 12 ? 3 : parMois.length > 6 ? 2 : 1
  return (
    <>
      <div aria-hidden="true" className="flex h-40 items-end gap-1 border-b border-slate-300">
        {parMois.map(({ mois, nombre }) => (
          <div
            key={mois}
            title={`${libelleMois(mois)} : ${nombre} candidature${nombre > 1 ? 's' : ''}`}
            className="group flex h-full min-w-0 flex-1 flex-col items-center justify-end"
          >
            <span className="text-xs text-slate-600 tabular-nums opacity-0 group-hover:opacity-100">
              {nombre}
            </span>
            <div
              className="w-full max-w-10 rounded-t bg-indigo-500 group-hover:bg-indigo-600"
              style={{ height: `${(nombre / max) * 85}%`, minHeight: nombre ? 4 : 0 }}
            />
          </div>
        ))}
      </div>
      <div aria-hidden="true" className="flex h-4 gap-1">
        {parMois.map(({ mois }, index) => (
          // Libellé centré sous sa colonne, qui peut déborder sur les voisines (sans libellé)
          <span key={mois} className="relative min-w-0 flex-1">
            {(parMois.length - 1 - index) % pas === 0 && (
              <span className="absolute left-1/2 -translate-x-1/2 text-xs whitespace-nowrap text-slate-600">
                {libelleMois(mois, true)}
              </span>
            )}
          </span>
        ))}
      </div>
      <table className="sr-only">
        <caption>Candidatures reçues par mois</caption>
        <thead>
          <tr>
            <th scope="col">Mois</th>
            <th scope="col">Candidatures</th>
          </tr>
        </thead>
        <tbody>
          {parMois.map(({ mois, nombre }) => (
            <tr key={mois}>
              <th scope="row">{libelleMois(mois)}</th>
              <td>{nombre}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  )
}
