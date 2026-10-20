import { createFileRoute, Link, useNavigate, useRouter } from '@tanstack/react-router'
import { useState, type ReactNode } from 'react'
import { accepterInvitation, choisirEspace, lireInvitation } from '@/lib/espace'
import { titrePage } from '@/lib/titre'

// Lien reçu d'un propriétaire d'espace ; sans session, _authentifie mène à la connexion puis revient
export const Route = createFileRoute('/_authentifie/invitation/$jeton')({
  head: () => titrePage('Invitation'),
  loader: ({ params }) =>
    // Un jeton mal formé (pas un UUID) est simplement une invitation introuvable
    lireInvitation(params.jeton).catch(() => null),
  component: Invitation,
})

function Invitation() {
  const apercu = Route.useLoaderData()
  const { jeton } = Route.useParams()
  const navigate = useNavigate()
  const router = useRouter()
  const [envoi, setEnvoi] = useState(false)
  const [erreur, setErreur] = useState<string | null>(null)

  async function rejoindre() {
    setEnvoi(true)
    setErreur(null)
    try {
      await accepterInvitation(jeton)
      await router.invalidate()
      navigate({ to: '/tableau-de-bord' })
    } catch (e) {
      setErreur(e instanceof Error ? e.message : String(e))
      setEnvoi(false)
    }
  }

  if (!apercu || (!apercu.valide && !apercu.deja_membre)) {
    return (
      <Cadre titre="Invitation invalide">
        <p className="text-slate-600">
          Ce lien d’invitation est invalide, expiré ou déjà utilisé. Demandez-en un nouveau au
          propriétaire de l’espace.
        </p>
        <Link to="/tableau-de-bord" className="text-accent underline underline-offset-2">
          Aller à mes candidatures
        </Link>
      </Cadre>
    )
  }

  return (
    <Cadre titre={`Rejoindre l’espace « ${apercu.espace_nom} »`}>
      <p className="text-slate-600">
        {apercu.proprietaire_email
          ? `${apercu.proprietaire_email} vous invite à travailler sur ses candidatures.`
          : 'Vous êtes invité à travailler sur les candidatures de cet espace.'}{' '}
        Vous pourrez revenir à votre propre espace à tout moment depuis la page « Équipe ».
      </p>
      {erreur && (
        <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
          {erreur}
        </p>
      )}
      {apercu.deja_membre ? (
        <button
          type="button"
          onClick={async () => {
            await choisirEspace(apercu.espace_id)
            await router.invalidate()
            navigate({ to: '/tableau-de-bord' })
          }}
          className="rounded-md bg-indigo-600 px-4 py-2 font-medium text-white hover:bg-indigo-500"
        >
          Vous êtes déjà membre : ouvrir l’espace
        </button>
      ) : (
        <button
          type="button"
          onClick={rejoindre}
          disabled={envoi}
          className="rounded-md bg-indigo-600 px-4 py-2 font-medium text-white hover:bg-indigo-500 disabled:opacity-60"
        >
          {envoi ? 'Patientez…' : 'Rejoindre l’espace'}
        </button>
      )}
    </Cadre>
  )
}

function Cadre({ titre, children }: { titre: string; children: ReactNode }) {
  return (
    <section className="mx-auto max-w-lg space-y-4 px-4 py-16">
      <h1 className="text-2xl font-bold">{titre}</h1>
      {children}
    </section>
  )
}
