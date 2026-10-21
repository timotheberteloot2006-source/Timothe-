import { useState, type FormEvent } from 'react'
import { classeChamp } from '@/components/candidatures/styles'
import {
  creerCritere,
  NOMBRE_MAX_CRITERES,
  renommerCritere,
  supprimerCritere,
  type Critere,
} from '@/lib/evaluations'

interface Props {
  criteres: Critere[]
  // Seul le propriétaire modifie la grille ; les membres la voient
  proprietaire: boolean
  // Exécute la modification puis recharge la page ; renvoie false en cas d'erreur
  executer: (action: () => Promise<void>) => Promise<boolean>
}

const classeBouton =
  'rounded-md px-2 py-1 text-sm text-slate-600 hover:bg-slate-100 hover:text-slate-900'

export function GestionCriteres({ criteres, proprietaire, executer }: Props) {
  const [enEdition, setEnEdition] = useState<string | null>(null)

  async function handleAjout(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const formulaire = event.currentTarget
    const nom = String(new FormData(formulaire).get('nom') ?? '').trim()
    if (nom && (await executer(() => creerCritere(nom)))) formulaire.reset()
  }

  async function handleRenommage(event: FormEvent<HTMLFormElement>, critere: Critere) {
    event.preventDefault()
    const nom = String(new FormData(event.currentTarget).get('nom') ?? '').trim()
    if (nom && (await executer(() => renommerCritere(critere.id, nom)))) setEnEdition(null)
  }

  function handleSuppression(critere: Critere) {
    if (
      window.confirm(
        `Supprimer le critère « ${critere.nom} » ? Les notes données sur ce critère seront effacées.`,
      )
    )
      executer(() => supprimerCritere(critere.id))
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-slate-600">
        Chaque membre note les candidats de 1 à 5 sur ces critères, depuis leur fiche ; la liste
        affiche la moyenne de l’équipe.
        {!proprietaire && ' Seul le propriétaire de l’espace peut modifier la grille.'}
      </p>
      {criteres.length > 0 && (
        <ol className="divide-y divide-slate-200 rounded-md border border-slate-200">
          {criteres.map((critere) => (
            <li
              key={critere.id}
              className="flex flex-wrap items-center justify-between gap-2 px-3 py-2"
            >
              {enEdition === critere.id ? (
                <form
                  onSubmit={(e) => handleRenommage(e, critere)}
                  className="flex flex-1 flex-wrap items-end gap-2"
                >
                  <label className="block min-w-48 flex-1">
                    <span className="sr-only">Nouveau nom du critère « {critere.nom} »</span>
                    <input
                      name="nom"
                      required
                      maxLength={40}
                      defaultValue={critere.nom}
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
                  <span className="text-sm font-medium">{critere.nom}</span>
                  {proprietaire && (
                    <span className="flex gap-1">
                      <button
                        type="button"
                        onClick={() => setEnEdition(critere.id)}
                        aria-label={`Renommer le critère « ${critere.nom} »`}
                        className={classeBouton}
                      >
                        Renommer
                      </button>
                      <button
                        type="button"
                        onClick={() => handleSuppression(critere)}
                        aria-label={`Supprimer le critère « ${critere.nom} »`}
                        className={`${classeBouton} hover:bg-red-50 hover:text-red-700`}
                      >
                        Supprimer
                      </button>
                    </span>
                  )}
                </>
              )}
            </li>
          ))}
        </ol>
      )}
      {proprietaire &&
        (criteres.length < NOMBRE_MAX_CRITERES ? (
          <form onSubmit={handleAjout} className="flex flex-wrap items-end gap-2">
            <label className="block min-w-48 flex-1">
              <span className="text-sm font-medium">Nouveau critère</span>
              <input
                name="nom"
                required
                maxLength={40}
                placeholder="Ex. Esprit d’équipe"
                className={classeChamp}
              />
            </label>
            <button
              type="submit"
              className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500"
            >
              Ajouter le critère
            </button>
          </form>
        ) : (
          <p className="text-sm text-slate-600">
            {NOMBRE_MAX_CRITERES} critères au plus par espace.
          </p>
        ))}
    </div>
  )
}
