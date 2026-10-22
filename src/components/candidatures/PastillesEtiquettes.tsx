import { classeEtiquette, type Etiquette } from '@/lib/etiquettes'

// Étiquettes posées sur une candidature (liste, tableau)
export function PastillesEtiquettes({
  etiquettes,
  petites = false,
}: {
  etiquettes: Etiquette[]
  petites?: boolean
}) {
  if (etiquettes.length === 0) return null
  return (
    <ul aria-label="Étiquettes" className={`flex flex-wrap gap-1 ${petites ? 'mt-1' : 'mt-2'}`}>
      {etiquettes.map((e) => (
        <li
          key={e.id}
          className={`rounded-full px-2 py-0.5 text-xs font-medium ${classeEtiquette(e.couleur)}`}
        >
          {e.nom}
        </li>
      ))}
    </ul>
  )
}
