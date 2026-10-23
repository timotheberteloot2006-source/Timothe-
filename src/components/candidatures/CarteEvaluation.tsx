import { Link } from '@tanstack/react-router'
import { useState } from 'react'
import {
  effacerNote,
  formaterNote,
  noter,
  resumerEvaluations,
  type Critere,
  type Evaluation,
} from '@/lib/evaluations'

interface Props {
  candidatureId: string
  criteres: Critere[]
  evaluations: Evaluation[]
  userId: string | undefined
  // Exécute la modification puis recharge la fiche ; renvoie false en cas d'erreur
  executer: (action: () => Promise<void>) => Promise<boolean>
}

const NOTES = [1, 2, 3, 4, 5]

// Note de 1 à 5 par critère, celle de l'utilisateur ; moyennes de l'équipe
export function CarteEvaluation({ candidatureId, criteres, evaluations, userId, executer }: Props) {
  const resume = resumerEvaluations(evaluations, criteres, userId)
  // Note affichée tout de suite, remise à l'état précédent si l'enregistrement échoue
  const [mesNotes, setMesNotes] = useState(
    () => new Map(resume.parCritere.map((c) => [c.critere.id, c.mienne])),
  )

  async function changer(critere: Critere, note: number | null) {
    const avant = mesNotes.get(critere.id) ?? null
    setMesNotes((m) => new Map(m).set(critere.id, note))
    const ok = await executer(() =>
      note === null
        ? effacerNote(candidatureId, critere.id, userId!)
        : noter(candidatureId, critere.id, note),
    )
    if (!ok) setMesNotes((m) => new Map(m).set(critere.id, avant))
  }

  return (
    <div className="space-y-4 rounded-lg border border-slate-200 bg-surface p-6">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-lg font-semibold">Évaluation</h2>
        {resume.moyenne !== null && (
          <p className="text-sm text-slate-600">
            Moyenne de l’équipe :{' '}
            <strong className="text-slate-900">{formaterNote(resume.moyenne)} sur 5</strong> ·{' '}
            {resume.evaluateurs} évaluateur{resume.evaluateurs > 1 ? 's' : ''}
          </p>
        )}
      </div>
      {criteres.length === 0 ? (
        <p className="text-sm text-slate-600">
          Aucun critère d’évaluation : le propriétaire de l’espace peut en ajouter depuis la page{' '}
          <Link to="/equipe" className="text-accent underline underline-offset-2">
            Équipe
          </Link>
          .
        </p>
      ) : (
        <ul className="space-y-3">
          {resume.parCritere.map(({ critere, moyenne, nombre }) => {
            const mienne = mesNotes.get(critere.id) ?? null
            return (
              <li key={critere.id}>
                <fieldset className="flex flex-wrap items-center gap-x-4 gap-y-1">
                  <legend className="float-left mr-2 w-48 text-sm font-medium">
                    {critere.nom}
                  </legend>
                  <span className="flex gap-1">
                    {NOTES.map((n) => (
                      <label key={n} className="cursor-pointer">
                        <input
                          type="radio"
                          name={`note-${critere.id}`}
                          value={n}
                          checked={mienne === n}
                          onChange={() => changer(critere, n)}
                          className="peer sr-only"
                        />
                        <span
                          aria-hidden="true"
                          className="flex size-8 items-center justify-center rounded-md border border-slate-300 text-sm peer-checked:border-indigo-600 peer-checked:bg-indigo-600 peer-checked:text-white peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-indigo-600"
                        >
                          {n}
                        </span>
                        <span className="sr-only">{n} sur 5</span>
                      </label>
                    ))}
                  </span>
                  {mienne !== null && (
                    <button
                      type="button"
                      onClick={() => changer(critere, null)}
                      className="text-xs text-slate-600 underline underline-offset-2 hover:text-slate-900"
                    >
                      Effacer ma note
                    </button>
                  )}
                  {moyenne !== null && (
                    <span className="text-xs text-slate-600">
                      Équipe : {formaterNote(moyenne)} ({nombre} note{nombre > 1 ? 's' : ''})
                    </span>
                  )}
                </fieldset>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
