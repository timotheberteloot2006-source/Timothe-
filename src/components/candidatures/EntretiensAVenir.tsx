import { Link } from '@tanstack/react-router'
import { formaterDate, NOMBRE_A_VENIR, type EntretienAVenir } from '@/lib/entretiens'

// Encadré du tableau de bord : les prochains entretiens, tous candidats confondus
export function EntretiensAVenir({ entretiens }: { entretiens: EntretienAVenir[] }) {
  if (entretiens.length === 0) return null
  const affiches = entretiens.slice(0, NOMBRE_A_VENIR)
  const autres = entretiens.length - affiches.length

  return (
    <section
      aria-labelledby="titre-entretiens"
      className="rounded-lg border border-slate-200 bg-surface p-4"
    >
      <h2 id="titre-entretiens" className="text-sm font-medium text-slate-600">
        Entretiens à venir
      </h2>
      <ul className="mt-2 divide-y divide-slate-100">
        {affiches.map((e) => (
          <li key={e.id} className="flex flex-wrap items-baseline justify-between gap-x-4 py-2">
            <Link
              to="/candidatures/$id"
              params={{ id: e.candidature_id }}
              className="font-medium hover:text-accent hover:underline"
            >
              {e.nom_candidat}
            </Link>
            <span className="text-sm text-slate-600 first-letter:uppercase">
              {formaterDate(e.debut)}
              {e.lieu && ` · ${e.lieu}`}
            </span>
          </li>
        ))}
      </ul>
      {autres > 0 && (
        <p className="mt-1 text-xs text-slate-500">
          et {autres} autre{autres > 1 ? 's' : ''} plus tard
        </p>
      )}
    </section>
  )
}
