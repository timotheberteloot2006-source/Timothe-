import { useId } from 'react'
import { DUREES_CONSERVATION, reglerConservation } from '@/lib/rgpd'

interface Props {
  espaceId: string
  // null : pas de suppression automatique
  mois: number | null
  proprietaire: boolean
  // Exécute la modification puis recharge la page ; renvoie false en cas d'erreur
  executer: (action: () => Promise<void>) => Promise<boolean>
}

// Durée de conservation des candidatures (RGPD), réglée par le propriétaire
export function ReglageConservation({ espaceId, mois, proprietaire, executer }: Props) {
  const id = useId()
  return (
    <div className="space-y-3">
      <p className="text-sm text-slate-600">
        Au-delà de cette durée sans aucune activité (modification, changement d’étape, note,
        entretien…), une candidature est supprimée automatiquement, CV compris, et la suppression
        est notée au registre ci-dessous. Les candidatures concernées sont signalées dans la liste
        30 jours avant ; toute activité les garde.
      </p>
      {proprietaire ? (
        <div>
          <label htmlFor={id} className="text-sm font-medium">
            Supprimer les candidatures inactives depuis
          </label>
          <select
            id={id}
            // Remis à jour après l'enregistrement
            key={String(mois)}
            defaultValue={mois ?? ''}
            onChange={(e) => {
              const valeur = e.target.value ? Number(e.target.value) : null
              if (
                valeur !== null &&
                !window.confirm(
                  `Supprimer automatiquement les candidatures sans activité depuis ${valeur} mois ? Celles qui le sont déjà seront supprimées dès la nuit prochaine.`,
                )
              ) {
                e.target.value = mois === null ? '' : String(mois)
                return
              }
              executer(() => reglerConservation(espaceId, valeur))
            }}
            className="mt-1 block rounded-md border border-slate-300 bg-surface px-3 py-2 text-sm"
          >
            <option value="">Jamais (pas de suppression automatique)</option>
            {DUREES_CONSERVATION.map((d) => (
              <option key={d} value={d}>
                {d} mois
              </option>
            ))}
          </select>
        </div>
      ) : (
        <p className="text-sm">
          {mois === null
            ? 'Pas de suppression automatique.'
            : `Suppression des candidatures inactives depuis ${mois} mois.`}{' '}
          Seul le propriétaire de l’espace peut régler cette durée.
        </p>
      )}
    </div>
  )
}
