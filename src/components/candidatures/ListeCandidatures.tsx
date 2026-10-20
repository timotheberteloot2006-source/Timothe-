import { LIBELLES_STATUT, STATUTS, type Candidature, type Statut } from '@/lib/candidatures'

const couleursStatut: Record<Statut, string> = {
  nouveau: 'bg-slate-100 text-slate-700',
  retenu: 'bg-green-100 text-green-800',
  ecarte: 'bg-red-100 text-red-800',
}

interface Props {
  candidatures: Candidature[]
  onChangerStatut: (id: string, statut: Statut) => void
  onSupprimer: (candidature: Candidature) => void
}

export function ListeCandidatures({ candidatures, onChangerStatut, onSupprimer }: Props) {
  return (
    <ul className="divide-y divide-slate-200 rounded-lg border border-slate-200 bg-white">
      {candidatures.map((c) => (
        <li key={c.id} className="flex flex-wrap items-start justify-between gap-4 p-4">
          <div className="min-w-0">
            <p className="font-medium">{c.nom}</p>
            <p className="text-sm text-slate-600">
              {[c.poste, `${c.experience} an${c.experience > 1 ? 's' : ''} d'expérience`, c.email]
                .filter(Boolean)
                .join(' · ')}
            </p>
            {c.competences.length > 0 && (
              <ul className="mt-2 flex flex-wrap gap-1.5">
                {c.competences.map((competence) => (
                  <li
                    key={competence}
                    className="rounded-full bg-indigo-50 px-2 py-0.5 text-xs text-indigo-700"
                  >
                    {competence}
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div className="flex items-center gap-2">
            <select
              value={c.statut}
              onChange={(e) => onChangerStatut(c.id, e.target.value as Statut)}
              aria-label={`Statut de ${c.nom}`}
              className={`rounded-md border-0 px-2 py-1 text-sm font-medium ${couleursStatut[c.statut]}`}
            >
              {STATUTS.map((statut) => (
                <option key={statut} value={statut}>
                  {LIBELLES_STATUT[statut]}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={() => onSupprimer(c)}
              className="rounded-md px-2 py-1 text-sm text-slate-500 hover:bg-red-50 hover:text-red-700"
            >
              Supprimer
            </button>
          </div>
        </li>
      ))}
    </ul>
  )
}
