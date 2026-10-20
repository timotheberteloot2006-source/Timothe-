import { createFileRoute, Link } from '@tanstack/react-router'
import { useState } from 'react'
import { FormulaireAuth } from '@/components/FormulaireAuth'
import { useAuth } from '@/lib/auth'

export const Route = createFileRoute('/mot-de-passe-oublie')({
  component: MotDePasseOublie,
})

function MotDePasseOublie() {
  const { demanderReinitialisation } = useAuth()
  const [emailEnvoye, setEmailEnvoye] = useState<string | null>(null)

  async function handleSubmit(email: string) {
    const erreur = await demanderReinitialisation(email)
    if (!erreur) setEmailEnvoye(email)
    return erreur
  }

  if (emailEnvoye) {
    return (
      <section className="mx-auto max-w-sm px-4 py-16 text-center">
        <h1 className="text-2xl font-bold">Vérifiez vos e-mails</h1>
        <p className="mt-4 text-slate-600">
          Si un compte existe pour <strong>{emailEnvoye}</strong>, un lien pour choisir un nouveau
          mot de passe vient d'y être envoyé.
        </p>
        <Link to="/connexion" className="mt-6 inline-block text-indigo-600 hover:underline">
          Retour à la connexion
        </Link>
      </section>
    )
  }

  return (
    <FormulaireAuth
      titre="Mot de passe oublié"
      libelleBouton="Recevoir un lien"
      avecMotDePasse={false}
      onSubmit={handleSubmit}
    >
      <p className="mt-6 text-center text-sm text-slate-600">
        <Link to="/connexion" className="text-indigo-600 hover:underline">
          Retour à la connexion
        </Link>
      </p>
    </FormulaireAuth>
  )
}
