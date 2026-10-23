import { useId, useState, type FormEvent } from 'react'
import { classeChamp } from '@/components/candidatures/styles'
import {
  classeEtiquette,
  COULEURS,
  creerEtiquette,
  modifierEtiquette,
  NOMBRE_MAX_ETIQUETTES,
  supprimerEtiquette,
  type Couleur,
  type Etiquette,
} from '@/lib/etiquettes'

interface Props {
  etiquettes: Etiquette[]
  // Exécute la modification puis recharge la page ; renvoie false en cas d'erreur
  executer: (action: () => Promise<void>) => Promise<boolean>
}

const classeBouton =
  'rounded-md px-2 py-1 text-sm text-slate-600 hover:bg-slate-100 hover:text-slate-900'

function ChoixCouleur({
  id,
  defaut,
  onChange,
}: {
  id: string
  defaut: Couleur
  onChange?: (couleur: Couleur) => void
}) {
  return (
    <select
      id={id}
      name="couleur"
      defaultValue={defaut}
      onChange={(e) => onChange?.(e.target.value as Couleur)}
      className="rounded-md border border-slate-300 bg-surface px-2 py-1.5 text-sm"
    >
      {Object.entries(COULEURS).map(([valeur, { nom }]) => (
        <option key={valeur} value={valeur}>
          {nom}
        </option>
      ))}
    </select>
  )
}

// Tous les membres gèrent les étiquettes de l'espace
export function GestionEtiquettes({ etiquettes, executer }: Props) {
  const [enEdition, setEnEdition] = useState<string | null>(null)
  const id = useId()

  async function handleAjout(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const formulaire = event.currentTarget
    const donnees = new FormData(formulaire)
    const nom = String(donnees.get('nom') ?? '').trim()
    const couleur = String(donnees.get('couleur') ?? 'gris') as Couleur
    if (nom && (await executer(async () => void (await creerEtiquette(nom, couleur)))))
      formulaire.reset()
  }

  async function handleRenommage(event: FormEvent<HTMLFormElement>, etiquette: Etiquette) {
    event.preventDefault()
    const nom = String(new FormData(event.currentTarget).get('nom') ?? '').trim()
    if (nom && (await executer(() => modifierEtiquette(etiquette.id, { nom })))) setEnEdition(null)
  }

  function handleSuppression(etiquette: Etiquette) {
    if (
      window.confirm(
        `Supprimer l’étiquette « ${etiquette.nom} » ? Elle sera retirée de toutes les candidatures.`,
      )
    )
      executer(() => supprimerEtiquette(etiquette.id))
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-slate-600">
        Les étiquettes se posent sur les candidatures, depuis leur fiche ou par lot dans la liste,
        et servent de filtre. Tous les membres de l’espace peuvent les gérer.
      </p>
      {etiquettes.length > 0 && (
        <ul className="divide-y divide-slate-200 rounded-md border border-slate-200">
          {etiquettes.map((etiquette) => (
            <li
              key={etiquette.id}
              className="flex flex-wrap items-center justify-between gap-2 px-3 py-2"
            >
              {enEdition === etiquette.id ? (
                <form
                  onSubmit={(e) => handleRenommage(e, etiquette)}
                  className="flex flex-1 flex-wrap items-end gap-2"
                >
                  <label className="block min-w-48 flex-1">
                    <span className="sr-only">Nouveau nom de l’étiquette « {etiquette.nom} »</span>
                    <input
                      name="nom"
                      required
                      maxLength={30}
                      defaultValue={etiquette.nom}
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
                  <span
                    className={`rounded-full px-2 py-0.5 text-sm font-medium ${classeEtiquette(etiquette.couleur)}`}
                  >
                    {etiquette.nom}
                  </span>
                  <span className="flex flex-wrap items-center gap-1">
                    <label htmlFor={`${id}-${etiquette.id}`} className="sr-only">
                      Couleur de l’étiquette « {etiquette.nom} »
                    </label>
                    <ChoixCouleur
                      // Remis à jour après l'enregistrement
                      key={etiquette.couleur}
                      id={`${id}-${etiquette.id}`}
                      defaut={etiquette.couleur}
                      onChange={(couleur) =>
                        executer(() => modifierEtiquette(etiquette.id, { couleur }))
                      }
                    />
                    <button
                      type="button"
                      onClick={() => setEnEdition(etiquette.id)}
                      aria-label={`Renommer l’étiquette « ${etiquette.nom} »`}
                      className={classeBouton}
                    >
                      Renommer
                    </button>
                    <button
                      type="button"
                      onClick={() => handleSuppression(etiquette)}
                      aria-label={`Supprimer l’étiquette « ${etiquette.nom} »`}
                      className={`${classeBouton} hover:bg-red-50 hover:text-red-700`}
                    >
                      Supprimer
                    </button>
                  </span>
                </>
              )}
            </li>
          ))}
        </ul>
      )}
      {etiquettes.length < NOMBRE_MAX_ETIQUETTES ? (
        <form onSubmit={handleAjout} className="flex flex-wrap items-end gap-2">
          <label className="block min-w-48 flex-1">
            <span className="text-sm font-medium">Nouvelle étiquette</span>
            <input
              name="nom"
              required
              maxLength={30}
              placeholder="Ex. Télétravail"
              className={classeChamp}
            />
          </label>
          <div>
            <label htmlFor={`${id}-nouvelle`} className="block text-sm font-medium">
              Couleur
            </label>
            <div className="mt-1">
              <ChoixCouleur id={`${id}-nouvelle`} defaut="gris" />
            </div>
          </div>
          <button
            type="submit"
            className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500"
          >
            Ajouter l’étiquette
          </button>
        </form>
      ) : (
        <p className="text-sm text-slate-600">
          {NOMBRE_MAX_ETIQUETTES} étiquettes au plus par espace.
        </p>
      )}
    </div>
  )
}
