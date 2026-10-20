import { createFileRoute, useNavigate, useRouter } from '@tanstack/react-router'
import {
  useEffect,
  useState,
  type FormEvent,
  type InputHTMLAttributes,
  type ReactNode,
} from 'react'
import { classeChamp } from '@/components/candidatures/styles'
import {
  demarrerPaiement,
  estPro,
  LIMITE_GRATUITE,
  lireAbonnement,
  ouvrirPortail,
  paiementEnAttente,
  type Abonnement,
} from '@/lib/abonnement'
import { useAuth } from '@/lib/auth'

export const Route = createFileRoute('/_authentifie/compte')({
  // ?abonnement=ok : retour depuis le paiement Stripe
  validateSearch: (search: Record<string, unknown>): { abonnement?: 'ok' } =>
    search.abonnement === 'ok' ? { abonnement: 'ok' } : {},
  // Sans abonnement lisible (base pas encore à jour…), la page reste utilisable en offre Gratuite
  loader: () => lireAbonnement().catch(() => null),
  component: Compte,
})

// Après le paiement, Stripe prévient le serveur en quelques secondes : on relit l'abonnement
const RELECTURES_MAX = 10
const DELAI_RELECTURE_MS = 2000

const CONFIRMATION_SUPPRESSION = 'SUPPRIMER'

function Compte() {
  const { user, changerEmail, verifierMotDePasse, changerMotDePasse, supprimerCompte } = useAuth()
  const navigate = useNavigate()

  return (
    <section className="mx-auto max-w-2xl space-y-6 px-4 py-12">
      <h1 className="text-2xl font-bold">Mon compte</h1>

      <CarteAbonnement />

      <Carte titre="Adresse e-mail">
        <p className="text-sm text-slate-600">
          Adresse actuelle : <strong>{user?.email}</strong>
        </p>
        <Formulaire
          libelleBouton="Changer d'adresse"
          succes={(donnees) =>
            `Un lien de confirmation a été envoyé à ${donnees.get('email')}. L'adresse changera après le clic sur ce lien.`
          }
          onSubmit={(donnees) => changerEmail(String(donnees.get('email')))}
        >
          <Champ libelle="Nouvelle adresse e-mail" name="email" type="email" autoComplete="email" />
        </Formulaire>
      </Carte>

      <Carte titre="Mot de passe">
        <Formulaire
          libelleBouton="Changer le mot de passe"
          succes={() => 'Mot de passe modifié.'}
          onSubmit={async (donnees) => {
            const erreur = await verifierMotDePasse(String(donnees.get('actuel')))
            return erreur ?? changerMotDePasse(String(donnees.get('nouveau')))
          }}
        >
          <Champ
            libelle="Mot de passe actuel"
            name="actuel"
            type="password"
            autoComplete="current-password"
          />
          <Champ
            libelle="Nouveau mot de passe"
            name="nouveau"
            type="password"
            autoComplete="new-password"
            minLength={6}
          />
        </Formulaire>
      </Carte>

      <Carte titre="Supprimer mon compte" danger>
        <p className="text-sm text-slate-600">
          Votre compte et toutes vos candidatures seront définitivement supprimés. Cette action est
          irréversible.
        </p>
        <Formulaire
          libelleBouton="Supprimer définitivement"
          danger
          onSubmit={async (donnees) => {
            const erreur = await verifierMotDePasse(String(donnees.get('motDePasse')))
            if (erreur) return erreur
            const erreurSuppression = await supprimerCompte()
            if (!erreurSuppression) navigate({ to: '/' })
            return erreurSuppression
          }}
        >
          <Champ
            libelle="Mot de passe"
            name="motDePasse"
            type="password"
            autoComplete="current-password"
          />
          <Champ
            libelle={`Tapez ${CONFIRMATION_SUPPRESSION} pour confirmer`}
            name="confirmation"
            pattern={CONFIRMATION_SUPPRESSION}
            autoComplete="off"
          />
        </Formulaire>
      </Carte>
    </section>
  )
}

function CarteAbonnement() {
  const abonnement = Route.useLoaderData()
  const { abonnement: retourPaiement } = Route.useSearch()
  const router = useRouter()
  const [relectures, setRelectures] = useState(0)
  const pro = estPro(abonnement)
  const enAttenteActivation = retourPaiement === 'ok' && !pro && relectures < RELECTURES_MAX

  useEffect(() => {
    if (!enAttenteActivation) return
    const minuteur = setTimeout(() => {
      setRelectures((n) => n + 1)
      router.invalidate()
    }, DELAI_RELECTURE_MS)
    return () => clearTimeout(minuteur)
  }, [enAttenteActivation, relectures, router])

  return (
    <Carte titre="Abonnement">
      <p className="text-sm text-slate-600">
        Offre actuelle : <strong>{pro ? 'Pro' : 'Gratuite'}</strong>
        {pro ? descriptionPro(abonnement) : ` (${LIMITE_GRATUITE} candidatures au plus)`}
      </p>
      {retourPaiement === 'ok' && (
        <p
          role="status"
          className={`rounded-md px-3 py-2 text-sm ${pro ? 'bg-green-50 text-green-800' : 'bg-slate-100 text-slate-700'}`}
        >
          {pro
            ? 'Merci ! Votre offre Pro est active.'
            : enAttenteActivation
              ? 'Paiement reçu, activation de l’offre Pro en cours…'
              : 'Paiement reçu. L’offre Pro sera active d’ici quelques minutes : rechargez la page.'}
        </p>
      )}
      {paiementEnAttente(abonnement) && (
        <p role="alert" className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-800">
          Le dernier paiement a échoué : mettez à jour votre moyen de paiement.
        </p>
      )}
      <BoutonAction
        libelle={pro || paiementEnAttente(abonnement) ? 'Gérer mon abonnement' : 'Passer à Pro'}
        action={pro || paiementEnAttente(abonnement) ? ouvrirPortail : demarrerPaiement}
      />
    </Carte>
  )
}

function descriptionPro(abonnement: Abonnement | null) {
  if (!abonnement?.fin_periode) return ''
  const date = new Date(abonnement.fin_periode).toLocaleDateString('fr-FR')
  return ` — prochain renouvellement le ${date}`
}

// Bouton qui redirige vers Stripe ; affiche l'erreur si la redirection échoue
function BoutonAction({ libelle, action }: { libelle: string; action: () => Promise<void> }) {
  const [envoi, setEnvoi] = useState(false)
  const [erreur, setErreur] = useState<string | null>(null)

  async function handleClick() {
    setEnvoi(true)
    setErreur(null)
    try {
      await action()
    } catch (e) {
      setErreur(e instanceof Error ? e.message : String(e))
      setEnvoi(false)
    }
  }

  return (
    <div className="space-y-3">
      {erreur && (
        <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
          {erreur}
        </p>
      )}
      <button
        type="button"
        onClick={handleClick}
        disabled={envoi}
        className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-60"
      >
        {envoi ? 'Redirection…' : libelle}
      </button>
    </div>
  )
}

function Carte({
  titre,
  danger,
  children,
}: {
  titre: string
  danger?: boolean
  children: ReactNode
}) {
  return (
    <div
      className={`space-y-4 rounded-lg border bg-white p-6 ${danger ? 'border-red-200' : 'border-slate-200'}`}
    >
      <h2 className={`text-lg font-semibold ${danger ? 'text-red-700' : ''}`}>{titre}</h2>
      {children}
    </div>
  )
}

interface FormulaireProps {
  libelleBouton: string
  danger?: boolean
  // Renvoie un message d'erreur, ou null en cas de succès
  onSubmit: (donnees: FormData) => Promise<string | null>
  succes?: (donnees: FormData) => string
  children: ReactNode
}

function Formulaire({ libelleBouton, danger, onSubmit, succes, children }: FormulaireProps) {
  const [envoi, setEnvoi] = useState(false)
  const [message, setMessage] = useState<{ texte: string; erreur: boolean } | null>(null)

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const formulaire = event.currentTarget
    const donnees = new FormData(formulaire)
    setEnvoi(true)
    setMessage(null)
    const erreur = await onSubmit(donnees)
    // Le formulaire a pu disparaître (compte supprimé) : ne rien mettre à jour dans ce cas
    if (!formulaire.isConnected) return
    if (erreur) {
      setMessage({ texte: erreur, erreur: true })
    } else {
      formulaire.reset()
      if (succes) setMessage({ texte: succes(donnees), erreur: false })
    }
    setEnvoi(false)
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {children}
      {message && (
        <p
          role={message.erreur ? 'alert' : 'status'}
          className={`rounded-md px-3 py-2 text-sm ${message.erreur ? 'bg-red-50 text-red-700' : 'bg-green-50 text-green-800'}`}
        >
          {message.texte}
        </p>
      )}
      <button
        type="submit"
        disabled={envoi}
        className={`rounded-md px-4 py-2 text-sm font-medium text-white disabled:opacity-60 ${danger ? 'bg-red-600 hover:bg-red-500' : 'bg-indigo-600 hover:bg-indigo-500'}`}
      >
        {envoi ? 'Patientez…' : libelleBouton}
      </button>
    </form>
  )
}

function Champ({
  libelle,
  ...props
}: { libelle: string; name: string } & InputHTMLAttributes<HTMLInputElement>) {
  return (
    <label className="block">
      <span className="text-sm font-medium">{libelle}</span>
      <input required className={classeChamp} {...props} />
    </label>
  )
}
