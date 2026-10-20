import { LIBELLES_STATUT, STATUTS, type Statut } from '@/lib/candidatures'
import type { Filtres } from '@/lib/filtres'
import { classeChamp } from './styles'

interface Props {
  filtres: Filtres
  onChange: (filtres: Filtres) => void
}

export function BarreFiltres({ filtres, onChange }: Props) {
  function modifier(champs: Partial<Filtres>) {
    onChange({ ...filtres, ...champs })
  }

  const actif = Object.values(filtres).some((v) => v !== undefined)

  return (
    <div className="grid gap-4 rounded-lg border border-slate-200 bg-white p-4 sm:grid-cols-2 lg:grid-cols-5">
      <label className="block lg:col-span-2">
        <span className="text-sm font-medium">Recherche</span>
        <input
          type="search"
          value={filtres.q ?? ''}
          onChange={(e) => modifier({ q: e.target.value || undefined })}
          placeholder="Nom, e-mail ou poste"
          className={classeChamp}
        />
      </label>
      <label className="block">
        <span className="text-sm font-medium">Compétences requises</span>
        <input
          type="text"
          value={filtres.competences ?? ''}
          onChange={(e) => modifier({ competences: e.target.value || undefined })}
          placeholder="React, SQL"
          className={classeChamp}
        />
      </label>
      <label className="block">
        <span className="text-sm font-medium">Expérience min. (ans)</span>
        <input
          type="number"
          min={0}
          value={filtres.experienceMin ?? ''}
          onChange={(e) => {
            const valeur = Number.parseInt(e.target.value, 10)
            modifier({ experienceMin: valeur > 0 ? valeur : undefined })
          }}
          className={classeChamp}
        />
      </label>
      <label className="block">
        <span className="text-sm font-medium">Statut</span>
        <select
          value={filtres.statut ?? ''}
          onChange={(e) => modifier({ statut: (e.target.value || undefined) as Statut | undefined })}
          className={classeChamp}
        >
          <option value="">Tous</option>
          {STATUTS.map((statut) => (
            <option key={statut} value={statut}>
              {LIBELLES_STATUT[statut]}
            </option>
          ))}
        </select>
      </label>
      {actif && (
        <button
          type="button"
          onClick={() => onChange({})}
          className="justify-self-start text-sm text-indigo-600 hover:underline sm:col-span-2 lg:col-span-5"
        >
          Réinitialiser les filtres
        </button>
      )}
    </div>
  )
}
