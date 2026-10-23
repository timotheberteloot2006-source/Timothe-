import { createFileRoute, Link } from '@tanstack/react-router'
import type { ReactNode } from 'react'
import { ApercuProduit } from '@/components/accueil/ApercuProduit'
import { LIMITE_GRATUITE } from '@/lib/abonnement'
import { useAuth } from '@/lib/auth'

export const Route = createFileRoute('/')({
  component: Accueil,
})

const avantages = [
  {
    titre: 'Filtrez en quelques secondes',
    texte:
      'Compétences requises, années d’expérience, statut, recherche par nom ou poste : combinez les filtres, la liste se met à jour à chaque frappe.',
  },
  {
    titre: 'Importez vos tableaux',
    texte:
      'Un fichier CSV suffit, y compris enregistré depuis Excel. Les colonnes sont reconnues automatiquement et les lignes en double sont écartées.',
  },
  {
    titre: 'Suivez chaque candidature',
    texte:
      'Classez en un clic : nouveau, retenu, écarté. Retrouvez vos filtres dans l’adresse de la page pour y revenir plus tard.',
  },
  {
    titre: 'Vos données restent à vous',
    texte:
      'Chaque compte ne voit que ses propres candidatures, contrôle appliqué directement par la base de données.',
  },
]

const etapes = [
  { titre: 'Créez votre compte', texte: 'Gratuit, sans carte bancaire.' },
  {
    titre: 'Ajoutez vos candidatures',
    texte: 'Une par une ou d’un coup depuis un fichier CSV.',
  },
  {
    titre: 'Filtrez et décidez',
    texte: 'Isolez les profils qui correspondent et classez-les.',
  },
]

const questions = [
  {
    question: 'Est-ce vraiment gratuit ?',
    reponse: `Oui : l’offre Gratuite permet de gérer jusqu’à ${LIMITE_GRATUITE} candidatures, avec tous les filtres et l’import CSV. L’offre Pro lève cette limite.`,
  },
  {
    question: 'Quels fichiers puis-je importer ?',
    reponse:
      'Des fichiers CSV, y compris ceux enregistrés depuis Excel. Seule la colonne « nom » est obligatoire ; e-mail, poste, compétences et expérience sont facultatifs. Un modèle est téléchargeable depuis le tableau de bord.',
  },
  {
    question: 'Puis-je résilier l’offre Pro ?',
    reponse:
      'À tout moment, depuis la page « Mon compte », bouton « Gérer mon abonnement ». Le paiement est géré par Stripe.',
  },
  {
    question: 'Comment supprimer mes données ?',
    reponse:
      'Depuis « Mon compte », vous pouvez supprimer votre compte : toutes vos candidatures sont effacées avec lui.',
  },
]

function Accueil() {
  const { user } = useAuth()

  return (
    <>
      <section className="mx-auto max-w-6xl px-4 pt-20 pb-16 text-center">
        <h1 className="mx-auto max-w-3xl text-4xl font-bold tracking-tight sm:text-5xl">
          Trouvez les bons profils parmi toutes vos candidatures
        </h1>
        <p className="mx-auto mt-5 max-w-2xl text-lg text-slate-600">
          Filtre rassemble vos candidatures au même endroit et vous laisse les trier par
          compétences, expérience et statut. Fini les tableaux à rallonge.
        </p>
        <div className="mt-8 flex flex-wrap justify-center gap-4">
          {user ? (
            <BoutonPrincipal to="/tableau-de-bord">Ouvrir le tableau de bord</BoutonPrincipal>
          ) : (
            <BoutonPrincipal to="/inscription">Commencer gratuitement</BoutonPrincipal>
          )}
          <Link
            to="/tarifs"
            className="rounded-md border border-slate-300 bg-surface px-5 py-2.5 font-medium hover:bg-slate-100"
          >
            Voir les tarifs
          </Link>
        </div>
        <div className="mt-14">
          <ApercuProduit />
        </div>
      </section>

      <Section titre="Pourquoi Filtre ?" fond>
        <div className="grid gap-6 sm:grid-cols-2">
          {avantages.map((a) => (
            <div key={a.titre} className="rounded-lg border border-slate-200 bg-surface p-6">
              <h3 className="font-semibold">{a.titre}</h3>
              <p className="mt-2 text-sm text-slate-600">{a.texte}</p>
            </div>
          ))}
        </div>
      </Section>

      <Section titre="Comment ça marche">
        <ol className="grid gap-6 sm:grid-cols-3">
          {etapes.map((e, index) => (
            <li key={e.titre} className="text-center">
              <span className="mx-auto flex size-10 items-center justify-center rounded-full bg-indigo-600 font-semibold text-white">
                {index + 1}
              </span>
              <h3 className="mt-3 font-semibold">{e.titre}</h3>
              <p className="mt-1 text-sm text-slate-600">{e.texte}</p>
            </li>
          ))}
        </ol>
      </Section>

      <Section titre="Questions fréquentes" fond>
        <div className="mx-auto max-w-3xl divide-y divide-slate-200 rounded-lg border border-slate-200 bg-surface">
          {questions.map((q) => (
            <details key={q.question} className="group p-5">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-medium">
                {q.question}
                <span
                  aria-hidden="true"
                  className="text-slate-400 transition-transform group-open:rotate-45"
                >
                  +
                </span>
              </summary>
              <p className="mt-3 text-sm text-slate-600">{q.reponse}</p>
            </details>
          ))}
        </div>
      </Section>

      {!user && (
        <section className="mx-auto max-w-6xl px-4 py-20 text-center">
          <h2 className="text-2xl font-bold sm:text-3xl">Prêt à trier vos candidatures ?</h2>
          <p className="mt-3 text-slate-600">Créez un compte en une minute, sans carte bancaire.</p>
          <div className="mt-6">
            <BoutonPrincipal to="/inscription">Commencer gratuitement</BoutonPrincipal>
          </div>
        </section>
      )}
    </>
  )
}

function Section({
  titre,
  fond,
  children,
}: {
  titre: string
  fond?: boolean
  children: ReactNode
}) {
  return (
    <section className={fond ? 'border-y border-slate-200 bg-surface/60' : ''}>
      <div className="mx-auto max-w-6xl px-4 py-16">
        <h2 className="mb-10 text-center text-2xl font-bold sm:text-3xl">{titre}</h2>
        {children}
      </div>
    </section>
  )
}

function BoutonPrincipal({
  to,
  children,
}: {
  to: '/inscription' | '/tableau-de-bord'
  children: ReactNode
}) {
  return (
    <Link
      to={to}
      className="inline-block rounded-md bg-indigo-600 px-5 py-2.5 font-medium text-white hover:bg-indigo-500"
    >
      {children}
    </Link>
  )
}
