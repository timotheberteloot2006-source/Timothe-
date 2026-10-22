import { useId, useState, type FormEvent } from 'react'
import {
  classeEtiquette,
  creerEtiquette,
  etiquettesDe,
  NOMBRE_MAX_ETIQUETTES,
  poserEtiquette,
  retirerEtiquette,
  type Etiquette,
} from '@/lib/etiquettes'
import { classeChamp } from './styles'

interface Props {
  candidatureId: string
  nomCandidat: string
  // Étiquettes de l'espace, et identifiants de celles posées sur la candidature
  etiquettes: Etiquette[]
  posees: string[]
  // Exécute la modification puis recharge la fiche ; renvoie false en cas d'erreur
  executer: (action: () => Promise<void>) => Promise<boolean>
}

// Étiquettes de la fiche : retirer, poser une étiquette existante ou en créer une
export function EtiquettesFiche({
  candidatureId,
  nomCandidat,
  etiquettes,
  posees,
  executer,
}: Props) {
  const [creation, setCreation] = useState(false)
  const id = useId()
  const presentes = etiquettesDe(posees, etiquettes)
  const disponibles = etiquettes.filter((e) => !posees.includes(e.id))

  async function handleCreation(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const nom = String(new FormData(event.currentTarget).get('nom') ?? '').trim()
    if (!nom) return
    const ok = await executer(async () => {
      const etiquette = await creerEtiquette(nom)
      await poserEtiquette([candidatureId], etiquette.id)
    })
    if (ok) setCreation(false)
  }

  return (
    <div className="space-y-2">
      <h2 className="sr-only">Étiquettes</h2>
      <div className="flex flex-wrap items-center gap-2">
        {presentes.length > 0 && (
          <ul aria-label="Étiquettes" className="flex flex-wrap gap-1.5">
            {presentes.map((e) => (
              <li
                key={e.id}
                className={`inline-flex items-center gap-1 rounded-full py-0.5 pr-1 pl-2.5 text-sm font-medium ${classeEtiquette(e.couleur)}`}
              >
                {e.nom}
                <button
                  type="button"
                  onClick={() => executer(() => retirerEtiquette([candidatureId], e.id))}
                  aria-label={`Retirer l’étiquette « ${e.nom} » de ${nomCandidat}`}
                  className="rounded-full px-1 leading-none hover:bg-black/10"
                >
                  <span aria-hidden="true">×</span>
                </button>
              </li>
            ))}
          </ul>
        )}
        {disponibles.length > 0 && (
          <select
            value=""
            onChange={(e) =>
              e.target.value && executer(() => poserEtiquette([candidatureId], e.target.value))
            }
            aria-label="Ajouter une étiquette"
            className="rounded-md border border-slate-300 bg-surface px-2 py-1 text-sm"
          >
            <option value="">Ajouter une étiquette…</option>
            {disponibles.map((e) => (
              <option key={e.id} value={e.id}>
                {e.nom}
              </option>
            ))}
          </select>
        )}
        {!creation && etiquettes.length < NOMBRE_MAX_ETIQUETTES && (
          <button
            type="button"
            onClick={() => setCreation(true)}
            className="rounded-md px-2 py-1 text-sm text-accent hover:bg-slate-100"
          >
            Nouvelle étiquette
          </button>
        )}
      </div>
      {creation && (
        <form onSubmit={handleCreation} className="flex flex-wrap items-end gap-2">
          <div className="min-w-48 flex-1">
            <label htmlFor={`${id}-nom`} className="text-sm font-medium">
              Nom de la nouvelle étiquette
            </label>
            <input
              id={`${id}-nom`}
              name="nom"
              required
              maxLength={30}
              autoFocus
              placeholder="Ex. Senior"
              className={classeChamp}
            />
          </div>
          <button
            type="submit"
            className="rounded-md bg-indigo-600 px-3 py-2 text-sm font-medium text-white hover:bg-indigo-500"
          >
            Créer et ajouter
          </button>
          <button
            type="button"
            onClick={() => setCreation(false)}
            className="rounded-md px-2 py-2 text-sm text-slate-600 hover:bg-slate-100"
          >
            Annuler
          </button>
        </form>
      )}
    </div>
  )
}
