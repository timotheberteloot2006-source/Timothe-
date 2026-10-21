import type { Etape } from '@/lib/etapes'
import { TRIS, type Filtres, type Tri } from '@/lib/filtres'
import type { Offre } from '@/lib/offres'
import { classeChamp } from './styles'

interface Props {
  filtres: Filtres
  onChange: (filtres: Filtres) => void
  offres: Offre[]
  etapes: Etape[]
}

export function BarreFiltres({ filtres, onChange, offres, etapes }: Props) {
  function modifier(champs: Partial<Filtres>) {
    onChange({ ...filtres, ...champs })
  }

  // La page et la vue ne sont pas des filtres : elles seules ne justifient pas de « Réinitialiser »
  const { page: _page, vue, ...criteres } = filtres
  const actif = Object.values(criteres).some((v) => v !== undefined)

  return (
    <div className="grid gap-4 rounded-lg border border-slate-200 bg-surface p-4 sm:grid-cols-2 lg:grid-cols-4">
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
          onChange={(e) => modifier({ statut: e.target.value || undefined })}
          className={classeChamp}
        >
          <option value="">Tous</option>
          {etapes.map((etape) => (
            <option key={etape.cle} value={etape.cle}>
              {etape.nom}
            </option>
          ))}
        </select>
      </label>
      {offres.length > 0 && (
        <label className="block">
          <span className="text-sm font-medium">Offre</span>
          <select
            value={filtres.offre ?? ''}
            onChange={(e) => modifier({ offre: e.target.value || undefined })}
            className={classeChamp}
          >
            <option value="">Toutes</option>
            <option value="aucune">Sans offre</option>
            {offres.map((offre) => (
              <option key={offre.id} value={offre.id}>
                {offre.titre}
              </option>
            ))}
          </select>
        </label>
      )}
      <label className="block">
        <span className="text-sm font-medium">Trier par</span>
        <select
          value={filtres.tri ?? 'recent'}
          onChange={(e) => {
            const tri = e.target.value as Tri
            modifier({ tri: tri === 'recent' ? undefined : tri })
          }}
          className={classeChamp}
        >
          {Object.entries(TRIS).map(([valeur, libelle]) => (
            <option key={valeur} value={valeur}>
              {libelle}
            </option>
          ))}
        </select>
      </label>
      {actif && (
        <button
          type="button"
          onClick={() => onChange({ vue })}
          className="justify-self-start text-sm text-accent hover:underline sm:col-span-2 lg:col-span-4"
        >
          Réinitialiser les filtres
        </button>
      )}
    </div>
  )
}
