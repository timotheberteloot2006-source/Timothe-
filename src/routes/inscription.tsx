import { createFileRoute, Link, redirect, useNavigate } from '@tanstack/react-router'
import { useState } from 'react'
import { FormulaireAuth } from '@/components/FormulaireAuth'
import { useAuth } from '@/lib/auth'
import { titrePage } from '@/lib/titre'

export const Route = createFileRoute('/inscription')({
  head: () => titrePage('Créer un compte'),
  beforeLoad: ({ context }) => {
    if (context.auth.session) throw redirect({ to: '/tableau-de-bord' })
  },
  component: Inscription,
})

function Inscription() {
  const { inscription } = useAuth()
  const navigate = useNavigate()
  const [emailAConfirmer, setEmailAConfirmer] = useState<string | null>(null)

  async function handleSubmit(email: string, motDePasse: string) {
    const resultat = await inscription(email, motDePasse)
    if (resultat.erreur !== null) return resultat.erreur
    if (resultat.confirmationRequise) setEmailAConfirmer(email)
    else navigate({ to: '/tableau-de-bord' })
    return null
  }

  if (emailAConfirmer) {
    return (
      <section className="mx-auto max-w-sm px-4 py-16 text-center">
        <h1 className="text-2xl font-bold">Vérifiez vos e-mails</h1>
        <p className="mt-4 text-slate-600">
          Un lien de confirmation a été envoyé à <strong>{emailAConfirmer}</strong>. Cliquez dessus
          pour activer votre compte, puis connectez-vous.
        </p>
        <Link to="/connexion" className="mt-6 inline-block text-accent hover:underline">
          Aller à la connexion
        </Link>
      </section>
    )
  }

  return (
    <FormulaireAuth
      titre="Créer un compte"
      libelleBouton="Créer mon compte"
      autoCompleteMotDePasse="new-password"
      onSubmit={handleSubmit}
    >
      <p className="mt-4 text-center text-xs text-slate-500">
        En créant un compte, vous acceptez les{' '}
        <Link to="/conditions" className="underline hover:text-slate-700">
          conditions générales
        </Link>{' '}
        et la{' '}
        <Link to="/confidentialite" className="underline hover:text-slate-700">
          politique de confidentialité
        </Link>
        .
      </p>
      <p className="mt-6 text-center text-sm text-slate-600">
        Déjà un compte ?{' '}
        <Link
          to="/connexion"
          className="text-accent underline underline-offset-2 hover:no-underline"
        >
          Se connecter
        </Link>
      </p>
    </FormulaireAuth>
  )
}
