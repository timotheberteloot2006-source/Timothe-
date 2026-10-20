import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useState, type FormEvent, type InputHTMLAttributes, type ReactNode } from 'react'
import { classeChamp } from '@/components/candidatures/styles'
import { useAuth } from '@/lib/auth'

export const Route = createFileRoute('/_authentifie/compte')({
  component: Compte,
})

const CONFIRMATION_SUPPRESSION = 'SUPPRIMER'

function Compte() {
  const { user, changerEmail, verifierMotDePasse, changerMotDePasse, supprimerCompte } = useAuth()
  const navigate = useNavigate()

  return (
    <section className="mx-auto max-w-2xl space-y-6 px-4 py-12">
      <h1 className="text-2xl font-bold">Mon compte</h1>

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
