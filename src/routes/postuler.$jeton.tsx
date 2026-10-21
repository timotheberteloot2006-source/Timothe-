import { createFileRoute, Link } from '@tanstack/react-router'
import { useState, type FormEvent, type InputHTMLAttributes, type ReactNode } from 'react'
import { classeChamp } from '@/components/candidatures/styles'
import { verifierFichierCv } from '@/lib/cv'
import { envoyerCandidature, lireOffrePublique } from '@/lib/formulairePublic'
import { titrePage } from '@/lib/titre'

// Page publique, sans compte : le lien est donné par le recruteur (page « Offres »)
export const Route = createFileRoute('/postuler/$jeton')({
  loader: ({ params }) => lireOffrePublique(params.jeton),
  // Après loader : les types de loaderData en dépendent
  head: ({ loaderData }) =>
    titrePage(loaderData ? `Postuler : ${loaderData.titre}` : 'Offre introuvable'),
  component: Postuler,
  errorComponent: () => (
    <Cadre titre="Formulaire indisponible">
      <p role="alert" className="rounded-md bg-red-50 px-4 py-3 text-red-700">
        Le formulaire ne peut pas être affiché pour le moment : réessayez dans quelques instants.
      </p>
    </Cadre>
  ),
})

function Postuler() {
  const offre = Route.useLoaderData()
  const { jeton } = Route.useParams()
  // Heure d'ouverture du formulaire : un envoi quasi immédiat est celui d'un robot
  const [ouvertLe] = useState(() => Date.now())
  const [envoi, setEnvoi] = useState(false)
  const [erreur, setErreur] = useState<string | null>(null)
  const [envoye, setEnvoye] = useState(false)

  if (!offre) {
    return (
      <Cadre titre="Offre introuvable">
        <p className="text-slate-600">
          Ce lien de candidature n’existe pas ou n’est plus actif. Demandez un nouveau lien au
          recruteur.
        </p>
      </Cadre>
    )
  }

  if (envoye) {
    return (
      <Cadre titre="Candidature envoyée">
        <p role="status" className="rounded-md bg-green-50 px-4 py-3 text-green-800">
          Merci ! Votre candidature au poste « {offre.titre} » a bien été transmise à{' '}
          {offre.espace_nom}.
        </p>
      </Cadre>
    )
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const donnees = new FormData(event.currentTarget)
    const cv = donnees.get('cv')
    if (cv instanceof File && cv.size > 0) {
      const erreurCv = verifierFichierCv(cv)
      if (erreurCv) return setErreur(erreurCv)
    }
    donnees.set('jeton', jeton)
    donnees.set('ouvert_le', String(ouvertLe))
    setEnvoi(true)
    setErreur(null)
    try {
      await envoyerCandidature(donnees)
      setEnvoye(true)
    } catch (e) {
      setErreur(e instanceof Error ? e.message : String(e))
      setEnvoi(false)
    }
  }

  return (
    <Cadre titre={offre.titre}>
      <p className="text-sm text-slate-600">Recrutement : {offre.espace_nom}</p>
      {offre.description && (
        <div className="whitespace-pre-line rounded-lg border border-slate-200 bg-surface p-4 text-sm">
          {offre.description}
        </div>
      )}

      {!offre.ouverte ? (
        <p className="rounded-md bg-amber-50 px-4 py-3 text-amber-800">
          Cette offre n’accepte plus de candidatures pour le moment.
        </p>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-4">
          <h2 className="text-lg font-semibold">Postuler</h2>
          <Champ libelle="Nom et prénom" name="nom" required maxLength={200} autoComplete="name" />
          <Champ
            libelle="E-mail"
            name="email"
            type="email"
            required
            maxLength={320}
            autoComplete="email"
          />
          <Champ
            libelle="Années d’expérience"
            name="experience"
            type="number"
            min={0}
            max={60}
            step={1}
            defaultValue="0"
          />
          <Champ
            libelle="Compétences"
            name="competences"
            maxLength={2000}
            aide="Séparées par des virgules, ex. React, TypeScript, anglais"
          />
          <label className="block">
            <span className="text-sm font-medium">CV (PDF, 5 Mo au plus, facultatif)</span>
            <input
              name="cv"
              type="file"
              accept="application/pdf"
              className="mt-1 block w-full text-sm"
            />
          </label>

          {/* Champ piège : invisible et hors de portée du clavier, seuls les robots le remplissent */}
          <div aria-hidden="true" className="absolute -left-[9999px] h-px w-px overflow-hidden">
            <label>
              Site web
              <input name="site_web" type="text" tabIndex={-1} autoComplete="off" />
            </label>
          </div>

          <label className="flex items-start gap-2 text-sm">
            <input name="consentement" type="checkbox" value="oui" required className="mt-1" />
            <span>
              J’accepte que ces informations et mon CV soient transmis à {offre.espace_nom} pour
              l’examen de ma candidature (voir la{' '}
              <Link to="/confidentialite" className="text-accent underline underline-offset-2">
                politique de confidentialité
              </Link>
              ).
            </span>
          </label>

          {erreur && (
            <p role="alert" className="rounded-md bg-red-50 px-4 py-3 text-sm text-red-700">
              {erreur}
            </p>
          )}
          <button
            type="submit"
            disabled={envoi}
            className="rounded-md bg-indigo-600 px-4 py-2 font-medium text-white hover:bg-indigo-500 disabled:opacity-60"
          >
            {envoi ? 'Envoi…' : 'Envoyer ma candidature'}
          </button>
        </form>
      )}
    </Cadre>
  )
}

function Champ({
  libelle,
  aide,
  name,
  ...attributs
}: { libelle: string; aide?: string; name: string } & InputHTMLAttributes<HTMLInputElement>) {
  return (
    <label className="block">
      <span className="text-sm font-medium">
        {libelle}
        {attributs.required && <span aria-hidden="true"> *</span>}
      </span>
      <input
        name={name}
        aria-describedby={aide ? `aide-${name}` : undefined}
        className={classeChamp}
        {...attributs}
      />
      {aide && (
        <span id={`aide-${name}`} className="mt-1 block text-xs text-slate-600">
          {aide}
        </span>
      )}
    </label>
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
