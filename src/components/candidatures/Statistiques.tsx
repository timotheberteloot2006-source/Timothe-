import type { Candidature } from '@/lib/candidatures'
import { couleurEtape, type Etape } from '@/lib/etapes'
import type { Filtres } from '@/lib/filtres'
import { basculerCompetence, calculerStatistiques, competenceDansFiltre } from '@/lib/statistiques'

interface Props {
  // Toutes les candidatures : vue d'ensemble indépendante des filtres
  candidatures: Candidature[]
  filtres: Filtres
  onChange: (filtres: Filtres) => void
  // Une tuile par étape, même code couleur que la liste, toujours accompagné du nom
  etapes: Etape[]
}

export function Statistiques({ candidatures, filtres, onChange, etapes }: Props) {
  const stats = calculerStatistiques(candidatures)

  return (
    <section aria-labelledby="titre-statistiques" className="space-y-3">
      <h2 id="titre-statistiques" className="text-sm font-medium text-slate-600">
        Vue d’ensemble
      </h2>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <Tuile libelle="Candidatures" valeur={stats.total} />
        {etapes.map(({ cle: statut, nom }) => {
          const actif = filtres.statut === statut
          return (
            <button
              key={statut}
              type="button"
              aria-pressed={actif}
              title={actif ? 'Retirer ce filtre' : `Afficher les candidatures « ${nom} »`}
              onClick={() => onChange({ ...filtres, statut: actif ? undefined : statut })}
              className={`rounded-lg border p-3 text-left transition-colors hover:border-indigo-500 ${actif ? 'border-indigo-500 bg-indigo-50' : 'border-slate-200 bg-surface'}`}
            >
              <span className="flex items-center gap-1.5 text-xs text-slate-600">
                <span
                  aria-hidden="true"
                  className={`size-2 rounded-full ${couleurEtape(statut).pastille}`}
                />
                {nom}
              </span>
              <span className="mt-1 block text-2xl font-semibold tabular-nums">
                {stats.parStatut[statut] ?? 0}
              </span>
            </button>
          )
        })}
        <Tuile
          libelle="Expérience moyenne"
          valeur={
            stats.experienceMoyenne === null
              ? '—'
              : `${stats.experienceMoyenne.toLocaleString('fr-FR')} an${stats.experienceMoyenne >= 2 ? 's' : ''}`
          }
        />
        <Tuile libelle="Avec CV" valeur={stats.avecCv} />
      </div>

      {stats.competences.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm text-slate-600">Compétences fréquentes :</span>
          {stats.competences.map(({ nom, nombre }) => {
            const actif = competenceDansFiltre(filtres.competences, nom)
            return (
              <button
                key={nom}
                type="button"
                aria-pressed={actif}
                title={
                  actif
                    ? 'Retirer de « Compétences requises »'
                    : 'Ajouter à « Compétences requises »'
                }
                onClick={() =>
                  onChange({
                    ...filtres,
                    competences: basculerCompetence(filtres.competences, nom),
                  })
                }
                className={`rounded-full border px-2.5 py-0.5 text-sm transition-colors hover:border-indigo-500 ${actif ? 'border-indigo-500 bg-indigo-50 text-indigo-700' : 'border-slate-200 bg-surface text-slate-700'}`}
              >
                {nom} <span className="text-slate-500 tabular-nums">· {nombre}</span>
              </button>
            )
          })}
        </div>
      )}
    </section>
  )
}

function Tuile({ libelle, valeur }: { libelle: string; valeur: string | number }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-surface p-3">
      <span className="block text-xs text-slate-600">{libelle}</span>
      <span className="mt-1 block text-2xl font-semibold tabular-nums">{valeur}</span>
    </div>
  )
}
