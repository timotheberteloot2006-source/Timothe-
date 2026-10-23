import { createFileRoute, Link, redirect, useRouter } from '@tanstack/react-router'
import { FormulaireAuth } from '@/components/FormulaireAuth'
import { useAuth } from '@/lib/auth'
import { cheminInterne } from '@/lib/redirection'
import { titrePage } from '@/lib/titre'

export const Route = createFileRoute('/connexion')({
  head: () => titrePage('Connexion'),
  validateSearch: (search: Record<string, unknown>): { redirect?: string } => ({
    redirect: cheminInterne(search.redirect),
  }),
  beforeLoad: ({ context }) => {
    if (context.auth.session) throw redirect({ to: '/tableau-de-bord' })
  },
  component: Connexion,
})

function Connexion() {
  const { connexion } = useAuth()
  const router = useRouter()
  const { redirect: destination } = Route.useSearch()

  async function handleSubmit(email: string, motDePasse: string) {
    const erreur = await connexion(email, motDePasse)
    if (!erreur) router.history.push(destination ?? '/tableau-de-bord')
    return erreur
  }

  return (
    <FormulaireAuth
      titre="Connexion"
      libelleBouton="Se connecter"
      autoCompleteMotDePasse="current-password"
      onSubmit={handleSubmit}
    >
      <p className="mt-4 text-right text-sm">
        <Link to="/mot-de-passe-oublie" className="text-accent hover:underline">
          Mot de passe oublié ?
        </Link>
      </p>
      <p className="mt-4 text-center text-sm text-slate-600">
        Pas encore de compte ?{' '}
        <Link
          to="/inscription"
          // Garde la page demandée (ex. une invitation) pendant l'inscription
          search={{ redirect: destination }}
          className="text-accent underline underline-offset-2 hover:no-underline"
        >
          Créer un compte
        </Link>
      </p>
    </FormulaireAuth>
  )
}
