import { useEffect, useRef } from 'react'
import { LIBELLES_STATUT, STATUTS, type Statut } from '@/lib/candidatures'

interface Props {
  // Nombre de candidatures cochées et de candidatures sur la page
  nombre: number
  total: number
  onToutBasculer: () => void
  onChangerStatut: (statut: Statut) => void
  onSupprimer: () => void
  onAnnuler: () => void
}

// Case « tout sélectionner » de la page et actions sur les candidatures cochées
export function BarreSelection({
  nombre,
  total,
  onToutBasculer,
  onChangerStatut,
  onSupprimer,
  onAnnuler,
}: Props) {
  const caseTout = useRef<HTMLInputElement>(null)

  // L'état « partiel » d'une case à cocher n'existe qu'en JavaScript
  useEffect(() => {
    if (caseTout.current) caseTout.current.indeterminate = nombre > 0 && nombre < total
  }, [nombre, total])

  return (
    <div
      className={`flex min-h-12 flex-wrap items-center gap-x-4 gap-y-2 rounded-lg px-4 py-2 ${nombre > 0 ? 'bg-indigo-50' : ''}`}
    >
      <label className="flex items-center gap-3 text-sm">
        <input
          ref={caseTout}
          type="checkbox"
          checked={nombre > 0 && nombre === total}
          onChange={onToutBasculer}
          className="size-4 accent-indigo-600"
        />
        {nombre > 0
          ? `${nombre} sélectionnée${nombre > 1 ? 's' : ''}`
          : 'Tout sélectionner sur cette page'}
      </label>
      {nombre > 0 && (
        <>
          <select
            value=""
            onChange={(e) => e.target.value && onChangerStatut(e.target.value as Statut)}
            aria-label="Changer le statut de la sélection"
            className="rounded-md border border-slate-300 bg-surface px-2 py-1 text-sm"
          >
            <option value="">Changer le statut…</option>
            {STATUTS.map((statut) => (
              <option key={statut} value={statut}>
                {LIBELLES_STATUT[statut]}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={onSupprimer}
            className="rounded-md px-2 py-1 text-sm font-medium text-red-700 hover:bg-red-50"
          >
            Supprimer
          </button>
          <button
            type="button"
            onClick={onAnnuler}
            className="rounded-md px-2 py-1 text-sm text-slate-600 hover:bg-slate-100"
          >
            Annuler la sélection
          </button>
        </>
      )}
    </div>
  )
}
