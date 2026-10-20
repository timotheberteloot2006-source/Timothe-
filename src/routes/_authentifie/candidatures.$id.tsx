import { createFileRoute, Link, notFound, useRouter } from '@tanstack/react-router'
import { useRef, useState, type ChangeEvent, type FormEvent } from 'react'
import { classeChamp } from '@/components/candidatures/styles'
import {
  changerStatut,
  LIBELLES_STATUT,
  lireCandidature,
  STATUTS,
  type Candidature,
  type Statut,
} from '@/lib/candidatures'
import { deposerCv, ouvrirCv, retirerCv, verifierFichierCv } from '@/lib/cv'
import { ajouterNote, listerNotes, supprimerNote, type Note } from '@/lib/notes'

export const Route = createFileRoute('/_authentifie/candidatures/$id')({
  loader: async ({ params }) => {
    const [candidature, notes] = await Promise.all([
      lireCandidature(params.id),
      listerNotes(params.id),
    ])
    if (!candidature) throw notFound()
    return { candidature, notes }
  },
  component: FicheCandidature,
  errorComponent: ({ error }) => (
    <section className="mx-auto max-w-3xl px-4 py-16">
      <p role="alert" className="rounded-md bg-red-50 px-4 py-3 text-red-700">
        Impossible de charger la candidature :{' '}
        {error instanceof Error ? error.message : String(error)}
      </p>
    </section>
  ),
})

function FicheCandidature() {
  const { candidature: c, notes } = Route.useLoaderData()
  const router = useRouter()
  const [erreur, setErreur] = useState<string | null>(null)

  // Exécute une modification puis recharge la fiche ; renvoie false en cas d'erreur
  async function executer(action: () => Promise<void>) {
    setErreur(null)
    try {
      await action()
      return true
    } catch (e) {
      setErreur(e instanceof Error ? e.message : String(e))
      return false
    } finally {
      await router.invalidate()
    }
  }

  return (
    <section className="mx-auto max-w-3xl space-y-6 px-4 py-12">
      <Link to="/tableau-de-bord" className="text-sm text-indigo-600 hover:underline">
        ← Retour aux candidatures
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">{c.nom}</h1>
          <p className="mt-1 text-slate-600">
            {[c.poste, `${c.experience} an${c.experience > 1 ? 's' : ''} d'expérience`]
              .filter(Boolean)
              .join(' · ')}
          </p>
          {c.email && (
            <a href={`mailto:${c.email}`} className="text-sm text-indigo-600 hover:underline">
              {c.email}
            </a>
          )}
        </div>
        <select
          value={c.statut}
          onChange={(e) => executer(() => changerStatut(c.id, e.target.value as Statut))}
          aria-label="Statut"
          className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-medium"
        >
          {STATUTS.map((statut) => (
            <option key={statut} value={statut}>
              {LIBELLES_STATUT[statut]}
            </option>
          ))}
        </select>
      </div>

      {c.competences.length > 0 && (
        <ul className="flex flex-wrap gap-1.5">
          {c.competences.map((competence) => (
            <li
              key={competence}
              className="rounded-full bg-indigo-50 px-2.5 py-0.5 text-sm text-indigo-700"
            >
              {competence}
            </li>
          ))}
        </ul>
      )}

      {erreur && (
        <p role="alert" className="rounded-md bg-red-50 px-4 py-3 text-sm text-red-700">
          {erreur}
        </p>
      )}

      <CarteCv candidature={c} executer={executer} />
      <CarteNotes candidatureId={c.id} notes={notes} executer={executer} />
    </section>
  )
}

interface PropsCarte {
  executer: (action: () => Promise<void>) => Promise<boolean>
}

function CarteCv({ candidature, executer }: PropsCarte & { candidature: Candidature }) {
  const champFichier = useRef<HTMLInputElement>(null)
  const [envoi, setEnvoi] = useState(false)

  async function handleFichier(event: ChangeEvent<HTMLInputElement>) {
    const fichier = event.target.files?.[0]
    event.target.value = ''
    if (!fichier) return
    setEnvoi(true)
    await executer(async () => {
      // Vérifié avant l'envoi pour un message immédiat
      const erreur = verifierFichierCv(fichier)
      if (erreur) throw new Error(erreur)
      await deposerCv(candidature, fichier)
    })
    setEnvoi(false)
  }

  function handleRetirer() {
    if (!window.confirm('Supprimer le CV de cette candidature ?')) return
    executer(() => retirerCv(candidature))
  }

  return (
    <div className="space-y-3 rounded-lg border border-slate-200 bg-white p-6">
      <h2 className="text-lg font-semibold">CV</h2>
      <input
        ref={champFichier}
        type="file"
        accept="application/pdf,.pdf"
        onChange={handleFichier}
        className="hidden"
        aria-label="Fichier PDF du CV"
      />
      {candidature.cv_chemin ? (
        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            onClick={() => executer(() => ouvrirCv(candidature.cv_chemin!))}
            className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500"
          >
            Ouvrir le CV
          </button>
          <button
            type="button"
            disabled={envoi}
            onClick={() => champFichier.current?.click()}
            className="rounded-md border border-slate-300 px-4 py-2 text-sm font-medium hover:bg-slate-100 disabled:opacity-60"
          >
            {envoi ? 'Envoi…' : 'Remplacer'}
          </button>
          <button
            type="button"
            onClick={handleRetirer}
            className="rounded-md px-4 py-2 text-sm text-slate-500 hover:bg-red-50 hover:text-red-700"
          >
            Supprimer
          </button>
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            disabled={envoi}
            onClick={() => champFichier.current?.click()}
            className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-60"
          >
            {envoi ? 'Envoi…' : 'Déposer un CV'}
          </button>
          <span className="text-sm text-slate-500">PDF, 5 Mo au plus</span>
        </div>
      )}
    </div>
  )
}

function CarteNotes({
  candidatureId,
  notes,
  executer,
}: PropsCarte & { candidatureId: string; notes: Note[] }) {
  const [envoi, setEnvoi] = useState(false)

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const formulaire = event.currentTarget
    const contenu = String(new FormData(formulaire).get('contenu') ?? '').trim()
    if (!contenu) return
    setEnvoi(true)
    if (await executer(() => ajouterNote(candidatureId, contenu))) formulaire.reset()
    setEnvoi(false)
  }

  function handleSupprimer(note: Note) {
    if (!window.confirm('Supprimer cette note ?')) return
    executer(() => supprimerNote(note.id))
  }

  return (
    <div className="space-y-4 rounded-lg border border-slate-200 bg-white p-6">
      <h2 className="text-lg font-semibold">Notes</h2>
      <form onSubmit={handleSubmit} className="space-y-3">
        <label className="block">
          <span className="sr-only">Nouvelle note</span>
          <textarea
            name="contenu"
            required
            rows={3}
            placeholder="Impressions d'entretien, points à vérifier…"
            className={classeChamp}
          />
        </label>
        <button
          type="submit"
          disabled={envoi}
          className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-60"
        >
          {envoi ? 'Ajout…' : 'Ajouter la note'}
        </button>
      </form>
      {notes.length === 0 ? (
        <p className="text-sm text-slate-500">Aucune note pour le moment.</p>
      ) : (
        <ul className="divide-y divide-slate-100">
          {notes.map((note) => (
            <li key={note.id} className="flex items-start justify-between gap-4 py-3">
              <div className="min-w-0">
                <p className="text-xs text-slate-500">
                  {new Date(note.created_at).toLocaleString('fr-FR', {
                    dateStyle: 'long',
                    timeStyle: 'short',
                  })}
                </p>
                <p className="mt-1 text-sm whitespace-pre-wrap">{note.contenu}</p>
              </div>
              <button
                type="button"
                onClick={() => handleSupprimer(note)}
                className="shrink-0 rounded-md px-2 py-1 text-sm text-slate-500 hover:bg-red-50 hover:text-red-700"
              >
                Supprimer
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
