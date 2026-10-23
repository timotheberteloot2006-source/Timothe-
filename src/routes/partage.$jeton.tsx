import { createFileRoute } from '@tanstack/react-router'
import { useState, type ReactNode } from 'react'
import { formaterDate } from '@/lib/entretiens'
import { formaterNote } from '@/lib/evaluations'
import { lirePartage, ouvrirCvPartage } from '@/lib/partages'

// Page publique, sans compte : le lien est créé depuis la fiche d'une candidature
export const Route = createFileRoute('/partage/$jeton')({
  loader: ({ params }) => lirePartage(params.jeton),
  // Une seule lecture (et une seule consultation comptée) par ouverture du lien
  staleTime: Infinity,
  // Après loader : les types de loaderData en dépendent ; jamais dans les moteurs de recherche
  head: ({ loaderData }) => ({
    meta: [
      { title: `${loaderData ? loaderData.nom : 'Lien de partage expiré'} · Filtre` },
      { name: 'robots', content: 'noindex, nofollow' },
    ],
  }),
  component: PagePartage,
  errorComponent: () => (
    <Cadre titre="Candidature indisponible">
      <p role="alert" className="rounded-md bg-red-50 px-4 py-3 text-red-700">
        La candidature ne peut pas être affichée pour le moment : réessayez dans quelques instants.
      </p>
    </Cadre>
  ),
})

function PagePartage() {
  const c = Route.useLoaderData()
  const { jeton } = Route.useParams()
  const [erreur, setErreur] = useState<string | null>(null)

  if (!c) {
    return (
      <Cadre titre="Lien de partage expiré">
        <p className="text-slate-600">
          Ce lien n’existe pas, a expiré ou a été révoqué. Demandez un nouveau lien à la personne
          qui vous l’a envoyé.
        </p>
      </Cadre>
    )
  }

  async function ouvrirCv() {
    setErreur(null)
    try {
      await ouvrirCvPartage(jeton)
    } catch (e) {
      setErreur(e instanceof Error ? e.message : String(e))
    }
  }

  return (
    <Cadre titre={c.nom}>
      <p className="text-sm text-slate-600">
        Candidature partagée par {c.espace}, en lecture seule, jusqu’au{' '}
        {formaterDate(c.expire_le, { annee: true })}.
      </p>

      <div className="space-y-3 rounded-lg border border-slate-200 bg-surface p-5">
        <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
          <Champ titre="Poste">{c.poste ?? '—'}</Champ>
          <Champ titre="Expérience">
            {c.experience} an{c.experience > 1 ? 's' : ''}
          </Champ>
          <Champ titre="Offre">{c.offre ?? 'Candidature spontanée'}</Champ>
          <Champ titre="Étape">{c.etape ?? '—'}</Champ>
          <Champ titre="Reçue le">
            {new Date(c.recue_le).toLocaleDateString('fr-FR', { dateStyle: 'long' })}
          </Champ>
        </dl>
        {c.competences.length > 0 && (
          <div>
            <h2 className="text-sm text-slate-600">Compétences</h2>
            <ul className="mt-1 flex flex-wrap gap-1.5">
              {c.competences.map((competence) => (
                <li
                  key={competence}
                  className="rounded-full bg-indigo-50 px-2.5 py-0.5 text-sm text-indigo-700"
                >
                  {competence}
                </li>
              ))}
            </ul>
          </div>
        )}
        {c.etiquettes.length > 0 && (
          <div>
            <h2 className="text-sm text-slate-600">Étiquettes</h2>
            <ul className="mt-1 flex flex-wrap gap-1.5">
              {c.etiquettes.map((etiquette) => (
                <li
                  key={etiquette}
                  className="rounded-full bg-slate-100 px-2.5 py-0.5 text-sm text-slate-700"
                >
                  {etiquette}
                </li>
              ))}
            </ul>
          </div>
        )}
        {c.cv && (
          <button
            type="button"
            onClick={ouvrirCv}
            className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500"
          >
            Ouvrir le CV (PDF)
          </button>
        )}
        {erreur && (
          <p role="alert" className="rounded-md bg-red-50 px-4 py-3 text-sm text-red-700">
            {erreur}
          </p>
        )}
      </div>

      {c.evaluation.length > 0 && (
        <Section titre="Évaluation de l’équipe">
          <table className="w-full text-sm">
            <thead className="sr-only">
              <tr>
                <th scope="col">Critère</th>
                <th scope="col">Moyenne sur 5</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {c.evaluation.map(({ critere, moyenne }) => (
                <tr key={critere}>
                  <th scope="row" className="py-1.5 text-left font-normal">
                    {critere}
                  </th>
                  <td className="py-1.5 text-right tabular-nums">
                    {formaterNote(Number(moyenne))} sur 5
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Section>
      )}

      {c.notes && (
        <Section titre="Notes de l’équipe">
          {c.notes.length === 0 ? (
            <p className="text-sm text-slate-600">Aucune note.</p>
          ) : (
            <ul className="space-y-3">
              {c.notes.map((note, index) => (
                <li key={index} className="text-sm">
                  <p className="whitespace-pre-wrap">{note.contenu}</p>
                  <p className="mt-0.5 text-xs text-slate-600">
                    {new Date(note.le).toLocaleDateString('fr-FR', { dateStyle: 'long' })}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </Section>
      )}
    </Cadre>
  )
}

function Cadre({ titre, children }: { titre: string; children: ReactNode }) {
  return (
    <section className="mx-auto max-w-2xl space-y-4 px-4 py-12">
      <h1 className="text-2xl font-bold">{titre}</h1>
      {children}
    </section>
  )
}

function Champ({ titre, children }: { titre: string; children: ReactNode }) {
  return (
    <div>
      <dt className="text-sm text-slate-600">{titre}</dt>
      <dd>{children}</dd>
    </div>
  )
}

function Section({ titre, children }: { titre: string; children: ReactNode }) {
  return (
    <div className="space-y-2 rounded-lg border border-slate-200 bg-surface p-5">
      <h2 className="font-semibold">{titre}</h2>
      {children}
    </div>
  )
}
