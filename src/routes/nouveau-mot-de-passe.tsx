import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'
import { FormulaireAuth } from '@/components/FormulaireAuth'
import { useAuth } from '@/lib/auth'
import { titrePage } from '@/lib/titre'

// Page ouverte par le lien de réinitialisation : Supabase y crée une session à partir de l'URL
export const Route = createFileRoute('/nouveau-mot-de-passe')({
  head: () => titrePage('Nouveau mot de passe'),
  component: NouveauMotDePasse,
})

function NouveauMotDePasse() {
  const { session, changerMotDePasse } = useAuth()
  const navigate = useNavigate()

  if (!session) {
    return (
      <section className="mx-auto max-w-sm px-4 py-16 text-center">
        <h1 className="text-2xl font-bold">Lien invalide ou expiré</h1>
        <p className="mt-4 text-slate-600">
          Ce lien de réinitialisation ne fonctionne plus. Demandez-en un nouveau.
        </p>
        <Link to="/mot-de-passe-oublie" className="mt-6 inline-block text-accent hover:underline">
          Demander un nouveau lien
        </Link>
      </section>
    )
  }

  async function handleSubmit(_email: string, motDePasse: string) {
    const erreur = await changerMotDePasse(motDePasse)
    if (!erreur) navigate({ to: '/tableau-de-bord' })
    return erreur
  }

  return (
    <FormulaireAuth
      titre="Nouveau mot de passe"
      libelleBouton="Enregistrer"
      avecEmail={false}
      autoCompleteMotDePasse="new-password"
      libelleMotDePasse="Nouveau mot de passe"
      onSubmit={handleSubmit}
    />
  )
}
