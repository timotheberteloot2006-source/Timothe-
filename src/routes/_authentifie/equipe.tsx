import { createFileRoute, useRouter } from '@tanstack/react-router'
import { useState, type FormEvent, type ReactNode } from 'react'
import { classeChamp } from '@/components/candidatures/styles'
import { useAuth } from '@/lib/auth'
import {
  choisirEspace,
  creerInvitation,
  lienInvitation,
  lireEspace,
  listerInvitations,
  listerMembres,
  listerMesEspaces,
  lireNotifications,
  reglerNotifications,
  renommerEspace,
  retirerMembre,
  revoquerInvitation,
  transfererPropriete,
} from '@/lib/espace'
import { compterParEtape, ETAPES_DE_BASE, listerEtapes } from '@/lib/etapes'
import { GestionEtapes } from '@/components/GestionEtapes'
import { GestionCriteres } from '@/components/GestionCriteres'
import { GestionModeles } from '@/components/GestionModeles'
import { listerCriteres } from '@/lib/evaluations'
import { ReglagesPageCarrieres } from '@/components/ReglagesPageCarrieres'
import { listerModeles } from '@/lib/modeles'
import { lireReglagesCarrieres } from '@/lib/carrieres'
import { titrePage } from '@/lib/titre'

export const Route = createFileRoute('/_authentifie/equipe')({
  head: () => titrePage('Équipe'),
  loader: async ({ context }) => {
    const espace = await lireEspace()
    const [
      membres,
      invitations,
      mesEspaces,
      notifications,
      etapes,
      nombresParEtape,
      carrieres,
      modeles,
      criteres,
    ] = await Promise.all([
      listerMembres(espace.id),
      // Seul le propriétaire voit et gère les invitations
      espace.role === 'proprietaire' ? listerInvitations(espace.id) : Promise.resolve([]),
      listerMesEspaces(context.auth.user!.id),
      // null : base pas encore à jour (migration 0014), la rubrique est masquée
      lireNotifications().catch(() => null),
      // Base pas encore à jour (migration 0015) : les trois étapes habituelles
      listerEtapes().catch(() => ETAPES_DE_BASE),
      compterParEtape().catch(() => ({})),
      // null : base pas encore à jour (migration 0016), la rubrique est masquée
      lireReglagesCarrieres(espace.id).catch(() => null),
      // null : base pas encore à jour (migration 0019), la rubrique est masquée
      listerModeles().catch(() => null),
      // null : base pas encore à jour (migration 0020), la rubrique est masquée
      listerCriteres().catch(() => null),
    ])
    return {
      espace,
      membres,
      invitations,
      mesEspaces,
      notifications,
      etapes,
      nombresParEtape,
      carrieres,
      modeles,
      criteres,
    }
  },
  component: Equipe,
  errorComponent: ({ error }) => (
    <section className="mx-auto max-w-3xl px-4 py-16">
      <p role="alert" className="rounded-md bg-red-50 px-4 py-3 text-red-700">
        Impossible de charger l’équipe : {error instanceof Error ? error.message : String(error)}
      </p>
    </section>
  ),
})

function Equipe() {
  const {
    espace,
    membres,
    invitations,
    mesEspaces,
    notifications,
    etapes,
    nombresParEtape,
    carrieres,
    modeles,
    criteres,
  } = Route.useLoaderData()
  const { user } = useAuth()
  const router = useRouter()
  const [erreur, setErreur] = useState<string | null>(null)
  const [copie, setCopie] = useState<string | null>(null)
  const proprietaire = espace.role === 'proprietaire'

  // Exécute une modification puis recharge la page ; renvoie false en cas d'erreur
  async function executer(action: () => Promise<void>) {
    setErreur(null)
    try {
      await action()
      await router.invalidate()
      return true
    } catch (e) {
      setErreur(e instanceof Error ? e.message : String(e))
      return false
    }
  }

  async function handleRenommage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const nom = String(new FormData(event.currentTarget).get('nom') ?? '').trim()
    if (nom) await executer(() => renommerEspace(espace.id, nom))
  }

  async function copier(jeton: string) {
    try {
      await navigator.clipboard.writeText(lienInvitation(jeton))
      setCopie(jeton)
    } catch {
      setErreur('Copie impossible : sélectionnez le lien et copiez-le à la main.')
    }
  }

  function retirer(email: string | null, userId: string) {
    if (window.confirm(`Retirer ${email ?? 'ce membre'} de l’espace ?`)) {
      executer(() => retirerMembre(espace.id, userId))
    }
  }

  function quitter() {
    if (
      !window.confirm(
        `Quitter l’espace « ${espace.nom} » ? Vous n’aurez plus accès à ses candidatures.`,
      )
    )
      return
    // On revient d'abord à un espace dont on est propriétaire (sinon la base y ramène d'elle-même)
    const personnel = mesEspaces.find((e) => e.role === 'proprietaire' && e.espace_id !== espace.id)
    executer(async () => {
      if (personnel) await choisirEspace(personnel.espace_id)
      await retirerMembre(espace.id, user!.id)
    })
  }

  function transferer(email: string | null, userId: string) {
    const message =
      `Transférer la propriété de l’espace « ${espace.nom} » à ${email ?? 'ce membre'} ?\n\n` +
      'Il pourra inviter et retirer des membres, et c’est son offre (Gratuite ou Pro) qui ' +
      's’appliquera à l’espace. Vous resterez membre, et un nouvel espace personnel vous sera créé.'
    if (window.confirm(message)) executer(() => transfererPropriete(espace.id, userId))
  }

  return (
    <section className="mx-auto max-w-3xl space-y-6 px-4 py-12">
      <h1 className="text-2xl font-bold">Équipe</h1>
      <p className="text-slate-600">
        Les membres d’un espace voient et modifient ses candidatures, notes, offres et entretiens.
        L’offre Pro du propriétaire couvre tout l’espace.
      </p>

      {erreur && (
        <p role="alert" className="rounded-md bg-red-50 px-4 py-3 text-sm text-red-700">
          {erreur}
        </p>
      )}

      <Carte titre={`Espace « ${espace.nom} »`}>
        <p className="text-sm text-slate-600">
          Votre rôle : <strong>{proprietaire ? 'propriétaire' : 'membre'}</strong> · Offre{' '}
          {espace.est_pro ? 'Pro' : 'Gratuite'}
        </p>
        {proprietaire && (
          <form onSubmit={handleRenommage} className="flex flex-wrap items-end gap-3">
            <label className="block min-w-56 flex-1">
              <span className="text-sm font-medium">Nom de l’espace</span>
              <input
                name="nom"
                required
                maxLength={80}
                defaultValue={espace.nom}
                key={espace.nom}
                className={classeChamp}
              />
            </label>
            <button
              type="submit"
              className="rounded-md border border-slate-300 px-4 py-2 text-sm font-medium hover:bg-slate-100"
            >
              Renommer
            </button>
          </form>
        )}
      </Carte>

      {carrieres && (
        <Carte titre="Page carrières">
          <ReglagesPageCarrieres
            espace={espace}
            reglages={carrieres}
            proprietaire={proprietaire}
            executer={executer}
          />
        </Carte>
      )}

      {modeles && (
        <Carte titre="Modèles de réponse">
          <GestionModeles modeles={modeles} executer={executer} />
        </Carte>
      )}

      {criteres && (
        <Carte titre="Critères d’évaluation">
          <GestionCriteres criteres={criteres} proprietaire={proprietaire} executer={executer} />
        </Carte>
      )}

      <Carte titre="Étapes de recrutement">
        <GestionEtapes
          etapes={etapes}
          proprietaire={proprietaire}
          nombres={nombresParEtape}
          executer={executer}
        />
      </Carte>

      {notifications && (
        <Carte titre="Notifications">
          <p className="text-sm text-slate-600">
            E-mails envoyés quand un candidat postule par le formulaire en ligne d’une offre (page «
            Offres »), et la veille de chaque entretien.
          </p>
          <CaseReglage
            libelle="Me prévenir par e-mail des nouvelles candidatures de cet espace"
            valeur={notifications.notifier}
            enregistrer={(valeur) => executer(() => reglerNotifications({ pourMoi: valeur }))}
          />
          {notifications.rappels !== undefined && (
            <CaseReglage
              libelle="Me rappeler la veille les entretiens de cet espace"
              valeur={notifications.rappels}
              enregistrer={(valeur) => executer(() => reglerNotifications({ rappels: valeur }))}
            />
          )}
          {proprietaire && (
            <CaseReglage
              libelle="Envoyer un accusé de réception aux candidats"
              valeur={notifications.accuse_reception}
              enregistrer={(valeur) => executer(() => reglerNotifications({ accuse: valeur }))}
            />
          )}
        </Carte>
      )}

      <Carte titre="Membres">
        <ul className="divide-y divide-slate-100">
          {membres.map((m) => (
            <li key={m.user_id} className="flex flex-wrap items-center justify-between gap-3 py-2">
              <span>
                {m.email ?? 'Compte supprimé'}
                {m.user_id === user?.id && <span className="text-slate-600"> (vous)</span>}
                <span className="ml-2 text-xs text-slate-600">
                  {m.role === 'proprietaire' ? 'Propriétaire' : 'Membre'}
                </span>
              </span>
              {proprietaire && m.user_id !== user?.id && (
                <span className="flex gap-1">
                  <button
                    type="button"
                    onClick={() => transferer(m.email, m.user_id)}
                    className="rounded-md px-2 py-1 text-sm text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                  >
                    Transférer la propriété
                  </button>
                  <button
                    type="button"
                    onClick={() => retirer(m.email, m.user_id)}
                    className="rounded-md px-2 py-1 text-sm text-slate-600 hover:bg-red-50 hover:text-red-700"
                  >
                    Retirer
                  </button>
                </span>
              )}
            </li>
          ))}
        </ul>
        {!proprietaire && (
          <button
            type="button"
            onClick={quitter}
            className="rounded-md border border-slate-300 px-4 py-2 text-sm font-medium hover:bg-slate-100"
          >
            Quitter l’espace
          </button>
        )}
      </Carte>

      {proprietaire && (
        <Carte titre="Inviter des collègues">
          <p className="text-sm text-slate-600">
            Chaque lien sert une seule fois et expire au bout de 7 jours. Envoyez-le à la personne
            invitée : elle se connecte (ou crée un compte), puis rejoint l’espace.
          </p>
          <button
            type="button"
            onClick={() => executer(() => creerInvitation(espace.id))}
            className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500"
          >
            Créer un lien d’invitation
          </button>
          {invitations.length > 0 && (
            <ul className="divide-y divide-slate-100">
              {invitations.map((invitation) => (
                <li key={invitation.id} className="space-y-2 py-3">
                  <label className="block">
                    <span className="text-xs text-slate-600">
                      Lien valable jusqu’au{' '}
                      {new Date(invitation.expire_le).toLocaleString('fr-FR', {
                        dateStyle: 'long',
                        timeStyle: 'short',
                      })}
                    </span>
                    <input
                      readOnly
                      value={lienInvitation(invitation.jeton)}
                      onFocus={(e) => e.currentTarget.select()}
                      className={`${classeChamp} font-mono text-xs`}
                    />
                  </label>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => copier(invitation.jeton)}
                      className="rounded-md border border-slate-300 px-3 py-1 text-sm font-medium hover:bg-slate-100"
                    >
                      {copie === invitation.jeton ? 'Lien copié' : 'Copier le lien'}
                    </button>
                    <button
                      type="button"
                      onClick={() => executer(() => revoquerInvitation(invitation.id))}
                      className="rounded-md px-3 py-1 text-sm text-slate-600 hover:bg-red-50 hover:text-red-700"
                    >
                      Révoquer
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Carte>
      )}

      {mesEspaces.length > 1 && (
        <Carte titre="Vos espaces">
          <ul className="divide-y divide-slate-100">
            {mesEspaces.map((e) => (
              <li
                key={e.espace_id}
                className="flex flex-wrap items-center justify-between gap-3 py-2"
              >
                <span>
                  {e.nom}
                  <span className="ml-2 text-xs text-slate-600">
                    {e.role === 'proprietaire' ? 'Propriétaire' : 'Membre'}
                  </span>
                </span>
                {e.espace_id === espace.id ? (
                  <span className="text-sm text-slate-600">Espace actif</span>
                ) : (
                  <button
                    type="button"
                    onClick={() => executer(() => choisirEspace(e.espace_id))}
                    className="rounded-md border border-slate-300 px-3 py-1 text-sm font-medium hover:bg-slate-100"
                  >
                    Ouvrir
                  </button>
                )}
              </li>
            ))}
          </ul>
        </Carte>
      )}
    </section>
  )
}

// Case à cocher enregistrée aussitôt : cochée tout de suite, décochée si l'enregistrement échoue
function CaseReglage({
  libelle,
  valeur,
  enregistrer,
}: {
  libelle: string
  valeur: boolean
  enregistrer: (valeur: boolean) => Promise<boolean>
}) {
  const [coche, setCoche] = useState(valeur)
  async function basculer(nouvelle: boolean) {
    setCoche(nouvelle)
    if (!(await enregistrer(nouvelle))) setCoche(!nouvelle)
  }
  return (
    <label className="flex items-center gap-2 text-sm">
      <input type="checkbox" checked={coche} onChange={(e) => basculer(e.target.checked)} />
      {libelle}
    </label>
  )
}

function Carte({ titre, children }: { titre: string; children: ReactNode }) {
  return (
    <div className="space-y-4 rounded-lg border border-slate-200 bg-surface p-6">
      <h2 className="text-lg font-semibold">{titre}</h2>
      {children}
    </div>
  )
}
