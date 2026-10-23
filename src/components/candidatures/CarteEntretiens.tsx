import { useState, type FormEvent } from 'react'
import {
  DUREES,
  finEntretien,
  formaterDate,
  genererIcs,
  planifierEntretien,
  supprimerEntretien,
  type Entretien,
} from '@/lib/entretiens'
import { telechargerFichier } from '@/lib/telechargement'
import { classeChamp } from './styles'

interface Props {
  candidatureId: string
  nomCandidat: string
  // Triés du plus ancien au plus récent
  entretiens: Entretien[]
  // Exécute une modification puis recharge la fiche ; renvoie false en cas d'erreur
  executer: (action: () => Promise<void>) => Promise<boolean>
}

export function CarteEntretiens({ candidatureId, nomCandidat, entretiens, executer }: Props) {
  const [envoi, setEnvoi] = useState(false)
  // Heure fixée à l'affichage de la fiche : sert à distinguer les entretiens passés
  const [maintenant] = useState(() => new Date())

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const formulaire = event.currentTarget
    const donnees = new FormData(formulaire)
    // datetime-local donne l'heure locale du navigateur, convertie ici en UTC
    const debut = new Date(String(donnees.get('debut')))
    if (Number.isNaN(debut.getTime())) return
    setEnvoi(true)
    const ok = await executer(() =>
      planifierEntretien(candidatureId, {
        debut: debut.toISOString(),
        duree_minutes: Number(donnees.get('duree')),
        lieu: String(donnees.get('lieu') ?? '').trim() || null,
      }),
    )
    if (ok) formulaire.reset()
    setEnvoi(false)
  }

  function handleSupprimer(entretien: Entretien) {
    if (!window.confirm(`Supprimer l’entretien du ${formaterDate(entretien.debut)} ?`)) return
    executer(() => supprimerEntretien(entretien.id))
  }

  function telechargerIcs(entretien: Entretien) {
    telechargerFichier(
      genererIcs(entretien, nomCandidat),
      `entretien-${entretien.debut.slice(0, 10)}.ics`,
      'text/calendar;charset=utf-8',
    )
  }

  return (
    <div className="space-y-4 rounded-lg border border-slate-200 bg-surface p-6">
      <h2 className="text-lg font-semibold">Entretiens</h2>
      <form
        onSubmit={handleSubmit}
        className="grid gap-3 sm:grid-cols-[1fr_auto_1fr_auto] sm:items-end"
      >
        <label className="block">
          <span className="text-sm font-medium">Date et heure</span>
          <input
            type="datetime-local"
            name="debut"
            required
            min={heureLocale(maintenant)}
            className={classeChamp}
          />
        </label>
        <label className="block">
          <span className="text-sm font-medium">Durée</span>
          <select name="duree" defaultValue={60} className={classeChamp}>
            {DUREES.map((minutes) => (
              <option key={minutes} value={minutes}>
                {minutes} min
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="text-sm font-medium">Lieu ou lien de visio</span>
          <input name="lieu" maxLength={300} className={classeChamp} />
        </label>
        <button
          type="submit"
          disabled={envoi}
          className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-60"
        >
          {envoi ? 'Ajout…' : 'Planifier'}
        </button>
      </form>

      {entretiens.length === 0 ? (
        <p className="text-sm text-slate-500">Aucun entretien planifié.</p>
      ) : (
        <ul className="divide-y divide-slate-100">
          {entretiens.map((entretien) => {
            const passe = finEntretien(entretien) <= maintenant
            return (
              <li
                key={entretien.id}
                className={`flex flex-wrap items-start justify-between gap-3 py-3 ${passe ? 'text-slate-500' : ''}`}
              >
                <div className="min-w-0">
                  <p className="font-medium first-letter:uppercase">
                    {formaterDate(entretien.debut)}
                    {passe && <span className="ml-2 text-xs font-normal">(passé)</span>}
                  </p>
                  <p className="text-sm text-slate-600">
                    {entretien.duree_minutes} min
                    {entretien.lieu && ` · ${entretien.lieu}`}
                  </p>
                </div>
                <div className="flex gap-2">
                  {!passe && (
                    <button
                      type="button"
                      onClick={() => telechargerIcs(entretien)}
                      className="rounded-md px-2 py-1 text-sm text-accent hover:bg-slate-100"
                    >
                      Ajouter à l’agenda (.ics)
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => handleSupprimer(entretien)}
                    className="rounded-md px-2 py-1 text-sm text-slate-500 hover:bg-red-50 hover:text-red-700"
                  >
                    Supprimer
                  </button>
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}

// Format attendu par datetime-local (heure locale) : 2026-11-03T15:00
function heureLocale(date: Date) {
  const decalage = date.getTimezoneOffset() * 60 * 1000
  return new Date(date.getTime() - decalage).toISOString().slice(0, 16)
}
