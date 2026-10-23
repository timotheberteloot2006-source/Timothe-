import { createFileRoute, Link } from '@tanstack/react-router'
import { useState, type ReactNode } from 'react'
import {
  demarrerPaiement,
  estPro,
  LIMITE_GRATUITE,
  lireAbonnement,
  ouvrirPortail,
  paiementEnAttente,
  PRIX_PRO,
} from '@/lib/abonnement'
import { titrePage } from '@/lib/titre'

export const Route = createFileRoute('/tarifs')({
  head: () => titrePage('Tarifs'),
  // L'offre actuelle n'est connue que si l'utilisateur est connecté ; une erreur
  // (base pas encore créée…) ne doit pas empêcher d'afficher les tarifs
  loader: ({ context }) =>
    context.auth.session ? lireAbonnement().catch(() => null) : Promise.resolve(null),
  component: Tarifs,
})

function Tarifs() {
  const abonnement = Route.useLoaderData()
  const { auth } = Route.useRouteContext()
  const connecte = auth.session !== null
  const pro = estPro(abonnement)
  // Un abonnement existe déjà (paiement à régulariser) : on n'en ouvre pas un second
  const enAttente = paiementEnAttente(abonnement)
  const [envoi, setEnvoi] = useState(false)
  const [erreur, setErreur] = useState<string | null>(null)

  async function handlePasserPro() {
    setEnvoi(true)
    setErreur(null)
    try {
      await (enAttente ? ouvrirPortail() : demarrerPaiement())
    } catch (e) {
      setErreur(e instanceof Error ? e.message : String(e))
      setEnvoi(false)
    }
  }

  return (
    <section className="mx-auto max-w-4xl px-4 py-16">
      <h1 className="text-center text-3xl font-bold">Tarifs</h1>
      {erreur && (
        <p
          role="alert"
          className="mx-auto mt-6 max-w-xl rounded-md bg-red-50 px-4 py-3 text-sm text-red-700"
        >
          {erreur}
        </p>
      )}
      <div className="mt-10 grid gap-6 sm:grid-cols-2">
        <Offre
          nom="Gratuit"
          prix="0 €"
          avantages={[
            `Jusqu'à ${LIMITE_GRATUITE} candidatures`,
            'Filtres et recherche',
            'Import CSV',
          ]}
        >
          {!connecte ? (
            <BoutonLien to="/inscription">Commencer</BoutonLien>
          ) : (
            !pro && !enAttente && <OffreActuelle />
          )}
        </Offre>
        <Offre
          nom="Pro"
          prix={PRIX_PRO}
          avantages={['Candidatures illimitées', 'Filtres et recherche', 'Import CSV']}
          miseEnAvant
        >
          {!connecte ? (
            <BoutonLien to="/inscription">Créer un compte</BoutonLien>
          ) : pro ? (
            <OffreActuelle />
          ) : (
            <button
              type="button"
              onClick={handlePasserPro}
              disabled={envoi}
              className="w-full rounded-md bg-indigo-600 px-4 py-2 font-medium text-white hover:bg-indigo-500 disabled:opacity-60"
            >
              {envoi ? 'Redirection…' : enAttente ? 'Gérer mon abonnement' : 'Passer à Pro'}
            </button>
          )}
        </Offre>
      </div>
    </section>
  )
}

function Offre({
  nom,
  prix,
  avantages,
  miseEnAvant,
  children,
}: {
  nom: string
  prix: string
  avantages: string[]
  miseEnAvant?: boolean
  children: ReactNode
}) {
  return (
    <div
      className={`flex flex-col rounded-lg border bg-surface p-6 ${miseEnAvant ? 'border-indigo-300 ring-1 ring-indigo-300' : 'border-slate-200'}`}
    >
      <h2 className="text-lg font-semibold">{nom}</h2>
      <p className="mt-2 text-2xl font-bold">{prix}</p>
      <ul className="mt-4 flex-1 space-y-2 text-sm text-slate-600">
        {avantages.map((avantage) => (
          <li key={avantage}>✓ {avantage}</li>
        ))}
      </ul>
      <div className="mt-6">{children}</div>
    </div>
  )
}

function BoutonLien({ to, children }: { to: '/inscription'; children: ReactNode }) {
  return (
    <Link
      to={to}
      className="block rounded-md bg-indigo-600 px-4 py-2 text-center font-medium text-white hover:bg-indigo-500"
    >
      {children}
    </Link>
  )
}

function OffreActuelle() {
  return (
    <p className="rounded-md bg-slate-100 px-4 py-2 text-center text-sm font-medium text-slate-700">
      Votre offre actuelle
    </p>
  )
}
