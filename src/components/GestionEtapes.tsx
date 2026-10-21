import { useState, type FormEvent } from 'react'
import { classeChamp } from '@/components/candidatures/styles'
import {
  creerEtape,
  deplacerEtape,
  estDeBase,
  NOMBRE_MAX_ETAPES,
  renommerEtape,
  supprimerEtape,
  type Etape,
} from '@/lib/etapes'

interface Props {
  etapes: Etape[]
  // Seul le propriétaire modifie les étapes ; les membres les voient
  proprietaire: boolean
  // Nombre de candidatures par étape (clé), pour prévenir avant une suppression
  nombres: Record<string, number>
  // Exécute la modification puis recharge la page ; renvoie false en cas d'erreur
  executer: (action: () => Promise<void>) => Promise<boolean>
}

const classeBouton =
  'rounded-md px-2 py-1 text-sm text-slate-600 hover:bg-slate-100 hover:text-slate-900 disabled:opacity-40 disabled:hover:bg-transparent'

export function GestionEtapes({ etapes, proprietaire, nombres, executer }: Props) {
  const [enEdition, setEnEdition] = useState<string | null>(null)

  async function handleAjout(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const formulaire = event.currentTarget
    const nom = String(new FormData(formulaire).get('nom') ?? '').trim()
    if (nom && (await executer(() => creerEtape(nom)))) formulaire.reset()
  }

  async function handleRenommage(event: FormEvent<HTMLFormElement>, etape: Etape) {
    event.preventDefault()
    const nom = String(new FormData(event.currentTarget).get('nom') ?? '').trim()
    if (nom && (await executer(() => renommerEtape(etape.id, nom)))) setEnEdition(null)
  }

  function handleSuppression(etape: Etape) {
    const n = nombres[etape.cle] ?? 0
    const message =
      n > 0
        ? `Supprimer l’étape « ${etape.nom} » ? Ses ${n} candidature${n > 1 ? 's' : ''} ${n > 1 ? 'reviendront' : 'reviendra'} à « ${etapes[0].nom} ».`
        : `Supprimer l’étape « ${etape.nom} » ?`
    if (window.confirm(message)) executer(async () => void (await supprimerEtape(etape.id)))
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-slate-600">
        Les colonnes du tableau et les statuts proposés pour chaque candidature.
        {proprietaire
          ? ' La première étape reçoit les nouvelles candidatures ; les trois étapes de base peuvent être renommées, pas supprimées.'
          : ' Seul le propriétaire de l’espace peut les modifier.'}
      </p>
      <ol className="divide-y divide-slate-200 rounded-md border border-slate-200">
        {etapes.map((etape, i) => (
          <li
            key={etape.id}
            className="flex flex-wrap items-center justify-between gap-2 px-3 py-2"
          >
            {enEdition === etape.id ? (
              <form
                onSubmit={(e) => handleRenommage(e, etape)}
                className="flex flex-1 flex-wrap items-end gap-2"
              >
                <label className="block min-w-48 flex-1">
                  <span className="sr-only">Nouveau nom de l’étape « {etape.nom} »</span>
                  <input
                    name="nom"
                    required
                    maxLength={40}
                    defaultValue={etape.nom}
                    autoFocus
                    className={classeChamp}
                  />
                </label>
                <button
                  type="submit"
                  className="rounded-md bg-indigo-600 px-3 py-2 text-sm font-medium text-white hover:bg-indigo-500"
                >
                  Enregistrer
                </button>
                <button type="button" onClick={() => setEnEdition(null)} className={classeBouton}>
                  Annuler
                </button>
              </form>
            ) : (
              <>
                <span className="text-sm">
                  <span className="font-medium">{etape.nom}</span>
                  <span className="text-slate-600">
                    {' '}
                    · {nombres[etape.cle] ?? 0} candidature
                    {(nombres[etape.cle] ?? 0) > 1 ? 's' : ''}
                  </span>
                </span>
                {proprietaire && (
                  <span className="flex flex-wrap gap-1">
                    {/* « Nouveau » reste la première étape */}
                    <button
                      type="button"
                      disabled={i <= 1}
                      onClick={() => executer(() => deplacerEtape(etape.id, -1))}
                      aria-label={`Monter l’étape « ${etape.nom} »`}
                      className={classeBouton}
                    >
                      ↑
                    </button>
                    <button
                      type="button"
                      disabled={i === 0 || i === etapes.length - 1}
                      onClick={() => executer(() => deplacerEtape(etape.id, 1))}
                      aria-label={`Descendre l’étape « ${etape.nom} »`}
                      className={classeBouton}
                    >
                      ↓
                    </button>
                    <button
                      type="button"
                      onClick={() => setEnEdition(etape.id)}
                      aria-label={`Renommer l’étape « ${etape.nom} »`}
                      className={classeBouton}
                    >
                      Renommer
                    </button>
                    {!estDeBase(etape.cle) && (
                      <button
                        type="button"
                        onClick={() => handleSuppression(etape)}
                        aria-label={`Supprimer l’étape « ${etape.nom} »`}
                        className={`${classeBouton} hover:bg-red-50 hover:text-red-700`}
                      >
                        Supprimer
                      </button>
                    )}
                  </span>
                )}
              </>
            )}
          </li>
        ))}
      </ol>
      {proprietaire &&
        (etapes.length < NOMBRE_MAX_ETAPES ? (
          <form onSubmit={handleAjout} className="flex flex-wrap items-end gap-2">
            <label className="block min-w-48 flex-1">
              <span className="text-sm font-medium">Nouvelle étape</span>
              <input
                name="nom"
                required
                maxLength={40}
                placeholder="Ex. Entretien RH"
                className={classeChamp}
              />
            </label>
            <button
              type="submit"
              className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500"
            >
              Ajouter l’étape
            </button>
          </form>
        ) : (
          <p className="text-sm text-slate-600">{NOMBRE_MAX_ETAPES} étapes au plus par espace.</p>
        ))}
    </div>
  )
}
