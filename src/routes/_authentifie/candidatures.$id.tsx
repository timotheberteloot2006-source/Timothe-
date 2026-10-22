import { createFileRoute, Link, notFound, useNavigate, useRouter } from '@tanstack/react-router'
import { useRef, useState, type ChangeEvent, type FormEvent } from 'react'
import { CarteEntretiens } from '@/components/candidatures/CarteEntretiens'
import { CarteEvaluation } from '@/components/candidatures/CarteEvaluation'
import { CarteHistorique } from '@/components/candidatures/CarteHistorique'
import { CarteReponse } from '@/components/candidatures/CarteReponse'
import { CartePartage } from '@/components/candidatures/CartePartage'
import { EtiquettesFiche } from '@/components/candidatures/EtiquettesFiche'
import { FormulaireCandidature } from '@/components/candidatures/FormulaireCandidature'
import { classeChamp } from '@/components/candidatures/styles'
import {
  changerStatut,
  lireCandidature,
  modifierCandidature,
  supprimerCandidature,
  type Candidature,
  type NouvelleCandidature,
} from '@/lib/candidatures'
import { lireEspace } from '@/lib/espace'
import { ETAPES_DE_BASE, listerEtapes } from '@/lib/etapes'
import { listerCriteres, listerEvaluations } from '@/lib/evaluations'
import { listerEtiquettes, listerEtiquettesCandidature } from '@/lib/etiquettes'
import { listerModeles } from '@/lib/modeles'
import { listerPartages } from '@/lib/partages'
import { deposerCv, ouvrirCv, retirerCv, verifierFichierCv } from '@/lib/cv'
import { ajouterNote, listerNotes, supprimerNote, type Note } from '@/lib/notes'
import { listerEntretiens } from '@/lib/entretiens'
import { listerHistorique } from '@/lib/historique'
import { listerOffres } from '@/lib/offres'
import { useAuth } from '@/lib/auth'
import { sansInterruption } from '@/lib/rechargement'
import { titrePage } from '@/lib/titre'

async function chargerFiche(id: string) {
  const [
    candidature,
    notes,
    offres,
    entretiens,
    historique,
    etapes,
    modeles,
    espace,
    criteres,
    evaluations,
    etiquettes,
    etiquettesPosees,
    partages,
  ] = await Promise.all([
    lireCandidature(id),
    listerNotes(id),
    listerOffres(),
    listerEntretiens(id),
    // L'historique est secondaire : son échec ne doit pas empêcher d'afficher la fiche
    listerHistorique(id).catch(() => null),
    listerEtapes().catch(() => ETAPES_DE_BASE),
    // Base pas encore à jour (migration 0019) : aucun modèle, message libre seulement
    listerModeles().catch(() => []),
    lireEspace().catch(() => null),
    // Base pas encore à jour (migration 0020) : pas d'évaluation
    listerCriteres().catch(() => null),
    listerEvaluations(id).catch(() => []),
    // Base pas encore à jour (migration 0022) : pas d'étiquettes
    listerEtiquettes().catch(() => null),
    listerEtiquettesCandidature(id).catch(() => []),
    // null : base pas encore à jour (migration 0023), la carte est masquée
    listerPartages(id).catch(() => null),
  ])
  if (!candidature) throw notFound()
  return {
    candidature,
    notes,
    offres,
    entretiens,
    historique,
    etapes,
    modeles,
    espace,
    criteres,
    evaluations,
    etiquettes,
    etiquettesPosees,
    partages,
    // Heure du chargement (liens de partage expirés)
    chargeLe: Date.now(),
  }
}

export const Route = createFileRoute('/_authentifie/candidatures/$id')({
  loader: (contexte) => sansInterruption('fiche', contexte, () => chargerFiche(contexte.params.id)),
  // Après loader : les types de loaderData en dépendent
  head: ({ loaderData }) => titrePage(loaderData?.candidature.nom ?? 'Candidature'),
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
  const {
    candidature: c,
    notes,
    offres,
    entretiens,
    historique,
    etapes,
    modeles,
    espace,
    criteres,
    evaluations,
    etiquettes,
    etiquettesPosees,
    partages,
    chargeLe,
  } = Route.useLoaderData()
  const { user } = useAuth()
  const offre = offres.find((o) => o.id === c.offre_id)
  const router = useRouter()
  const navigate = useNavigate()
  const [enEdition, setEnEdition] = useState(false)
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

  async function handleModification(champs: NouvelleCandidature) {
    // Les erreurs (e-mail déjà utilisé…) sont affichées dans le formulaire, qui reste ouvert
    await modifierCandidature(c.id, champs)
    setEnEdition(false)
    await router.invalidate()
  }

  async function handleSuppression() {
    if (!window.confirm(`Supprimer la candidature de ${c.nom}, ses notes et son CV ?`)) return
    setErreur(null)
    try {
      await supprimerCandidature(c)
      navigate({ to: '/tableau-de-bord' })
    } catch (e) {
      setErreur(e instanceof Error ? e.message : String(e))
    }
  }

  return (
    <section className="mx-auto max-w-3xl space-y-6 px-4 py-12">
      <Link to="/tableau-de-bord" className="text-sm text-accent hover:underline">
        ← Retour aux candidatures
      </Link>

      {enEdition ? (
        <FormulaireCandidature
          initiale={c}
          offres={offres}
          onEnregistrer={handleModification}
          onAnnuler={() => setEnEdition(false)}
        />
      ) : (
        <>
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h1 className="text-2xl font-bold">{c.nom}</h1>
              {offre && (
                <p className="mt-1 text-sm">
                  Offre :{' '}
                  <Link
                    to="/tableau-de-bord"
                    search={{ offre: offre.id }}
                    className="text-accent underline underline-offset-2 hover:no-underline"
                  >
                    {offre.titre}
                  </Link>
                </p>
              )}
              <p className="mt-1 text-slate-600">
                {[c.poste, `${c.experience} an${c.experience > 1 ? 's' : ''} d'expérience`]
                  .filter(Boolean)
                  .join(' · ')}
              </p>
              {c.email && (
                <a href={`mailto:${c.email}`} className="text-sm text-accent hover:underline">
                  {c.email}
                </a>
              )}
            </div>
            <select
              value={c.statut}
              onChange={(e) => executer(() => changerStatut(c.id, e.target.value))}
              aria-label="Statut"
              className="rounded-md border border-slate-300 bg-surface px-3 py-2 text-sm font-medium"
            >
              {etapes.map((etape) => (
                <option key={etape.cle} value={etape.cle}>
                  {etape.nom}
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

          {etiquettes && (
            <EtiquettesFiche
              // Recréées en changeant de candidature (formulaire de création refermé)
              key={`etiquettes-${c.id}`}
              candidatureId={c.id}
              nomCandidat={c.nom}
              etiquettes={etiquettes}
              posees={etiquettesPosees}
              executer={executer}
            />
          )}

          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              onClick={() => setEnEdition(true)}
              className="rounded-md border border-slate-300 bg-surface px-4 py-2 text-sm font-medium hover:bg-slate-100"
            >
              Modifier
            </button>
            <button
              type="button"
              onClick={handleSuppression}
              className="rounded-md px-4 py-2 text-sm text-slate-500 hover:bg-red-50 hover:text-red-700"
            >
              Supprimer la candidature
            </button>
          </div>
        </>
      )}

      {erreur && (
        <p role="alert" className="rounded-md bg-red-50 px-4 py-3 text-sm text-red-700">
          {erreur}
        </p>
      )}

      <CarteCv candidature={c} executer={executer} />
      <CarteEntretiens
        candidatureId={c.id}
        nomCandidat={c.nom}
        entretiens={entretiens}
        executer={executer}
      />
      {criteres && (
        <CarteEvaluation
          // Recréée en changeant de candidature (sinon ses notes resteraient affichées)
          key={`evaluation-${c.id}`}
          candidatureId={c.id}
          criteres={criteres}
          evaluations={evaluations}
          userId={user?.id}
          executer={executer}
        />
      )}
      <CarteNotes candidatureId={c.id} notes={notes} executer={executer} />
      <CarteReponse
        // Recréée en changeant de candidature : brouillon et confirmation repartent de zéro
        key={`reponse-${c.id}`}
        candidature={c}
        offreTitre={offre?.titre ?? null}
        espaceNom={espace?.nom ?? null}
        modeles={modeles}
        onEnvoye={() => router.invalidate()}
      />
      {partages && (
        <CartePartage
          // Recréée en changeant de candidature (« Lien copié » repart de zéro)
          key={`partage-${c.id}`}
          candidatureId={c.id}
          avecCv={!!c.cv_chemin}
          partages={partages}
          maintenant={chargeLe}
          executer={executer}
        />
      )}
      <CarteHistorique historique={historique} userId={user?.id} />
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
    <div className="space-y-3 rounded-lg border border-slate-200 bg-surface p-6">
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
    <div className="space-y-4 rounded-lg border border-slate-200 bg-surface p-6">
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
