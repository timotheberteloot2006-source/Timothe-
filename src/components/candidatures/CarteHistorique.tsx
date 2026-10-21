import { decrireEvenement, LIMITE_HISTORIQUE, type Evenement } from '@/lib/historique'

interface Props {
  // Du plus récent au plus ancien
  evenements: Evenement[]
  // Utilisateur connecté, affiché « Vous »
  userId: string | undefined
}

export function CarteHistorique({ evenements, userId }: Props) {
  return (
    <div className="space-y-3 rounded-lg border border-slate-200 bg-surface p-6">
      <h2 className="text-lg font-semibold">Historique</h2>
      {evenements.length === 0 ? (
        <p className="text-sm text-slate-600">Aucune action enregistrée.</p>
      ) : (
        <ol className="space-y-2">
          {evenements.map((e) => (
            <li key={e.id} className="flex flex-wrap justify-between gap-x-4 text-sm">
              <span>
                {decrireEvenement(e)}
                <span className="text-slate-600">
                  {' · '}
                  {e.user_id && e.user_id === userId ? 'vous' : (e.email ?? 'compte supprimé')}
                </span>
              </span>
              <time dateTime={e.created_at} className="text-slate-600">
                {new Date(e.created_at).toLocaleString('fr-FR', {
                  dateStyle: 'medium',
                  timeStyle: 'short',
                })}
              </time>
            </li>
          ))}
        </ol>
      )}
      {evenements.length === LIMITE_HISTORIQUE && (
        <p className="text-xs text-slate-600">
          Seules les {LIMITE_HISTORIQUE} actions les plus récentes sont affichées.
        </p>
      )}
    </div>
  )
}
