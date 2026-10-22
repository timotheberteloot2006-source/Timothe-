import { useId, useState, type FormEvent } from 'react'
import { formaterDate } from '@/lib/entretiens'
import {
  creerPartage,
  DUREES,
  etatPartage,
  lienPartage,
  NOMBRE_MAX_PARTAGES,
  revoquerPartage,
  type Duree,
  type Partage,
} from '@/lib/partages'
import { classeChamp } from './styles'

interface Props {
  candidatureId: string
  avecCv: boolean
  partages: Partage[]
  // Heure du dernier chargement de la fiche (rafraîchie avec elle) : distingue les liens expirés
  maintenant: number
  // Exécute une modification puis recharge la fiche ; renvoie false en cas d'erreur
  executer: (action: () => Promise<void>) => Promise<boolean>
}

// Liens en lecture seule pour montrer la candidature à quelqu'un sans compte
export function CartePartage({ candidatureId, avecCv, partages, maintenant, executer }: Props) {
  const id = useId()
  const [envoi, setEnvoi] = useState(false)
  const [copie, setCopie] = useState<string | null>(null)
  const valables = partages.filter((p) => etatPartage(p, maintenant) === 'valable')
  const anciens = partages.length - valables.length

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const donnees = new FormData(event.currentTarget)
    setEnvoi(true)
    await executer(async () => {
      await creerPartage(candidatureId, {
        jours: Number(donnees.get('duree')) as Duree,
        avecCv: donnees.get('cv') === 'on',
        avecNotes: donnees.get('notes') === 'on',
      })
    })
    setEnvoi(false)
  }

  async function copier(partage: Partage) {
    try {
      await navigator.clipboard.writeText(lienPartage(partage.jeton))
      setCopie(partage.id)
    } catch {
      // Presse-papiers refusé : le lien reste sélectionnable dans le champ
      setCopie(null)
    }
  }

  function handleRevoquer(partage: Partage) {
    if (!window.confirm('Révoquer ce lien ? Il ne montrera plus la candidature.')) return
    executer(() => revoquerPartage(partage.id))
  }

  return (
    <div className="space-y-4 rounded-lg border border-slate-200 bg-surface p-6">
      <div>
        <h2 className="text-lg font-semibold">Partage</h2>
        <p className="text-sm text-slate-600">
          Un lien en lecture seule montre la candidature à quelqu’un sans compte (un manager, par
          exemple) : profil, étape, étiquettes et évaluation de l’équipe, jamais l’e-mail du
          candidat.
        </p>
      </div>

      {valables.length > 0 && (
        <ul className="divide-y divide-slate-100">
          {valables.map((partage) => (
            <li key={partage.id} className="space-y-2 py-3">
              <div className="flex flex-wrap gap-2">
                <input
                  readOnly
                  value={lienPartage(partage.jeton)}
                  aria-label="Lien de partage"
                  onFocus={(e) => e.currentTarget.select()}
                  className="min-w-0 flex-1 rounded-md border border-slate-300 bg-slate-50 px-3 py-1.5 text-sm"
                />
                <button
                  type="button"
                  onClick={() => copier(partage)}
                  className="rounded-md border border-slate-300 px-3 py-1.5 text-sm font-medium hover:bg-slate-100"
                >
                  {copie === partage.id ? 'Lien copié' : 'Copier le lien'}
                </button>
                <button
                  type="button"
                  onClick={() => handleRevoquer(partage)}
                  className="rounded-md px-3 py-1.5 text-sm text-slate-600 hover:bg-red-50 hover:text-red-700"
                >
                  Révoquer
                </button>
              </div>
              <p className="text-xs text-slate-600">
                Valable jusqu’au {formaterDate(partage.expire_le, { annee: true })}
                {' · '}
                {[partage.avec_cv && 'CV inclus', partage.avec_notes && 'notes incluses']
                  .filter(Boolean)
                  .join(', ') || 'sans CV ni notes'}
                {' · '}
                {partage.consultations === 0
                  ? 'jamais ouvert'
                  : `ouvert ${partage.consultations} fois, dernière fois le ${formaterDate(partage.derniere_consultation!)}`}
              </p>
            </li>
          ))}
        </ul>
      )}
      {anciens > 0 && (
        <p className="text-xs text-slate-600">
          {anciens} ancien{anciens > 1 ? 's' : ''} lien{anciens > 1 ? 's' : ''} expiré
          {anciens > 1 ? 's' : ''} ou révoqué{anciens > 1 ? 's' : ''}.
        </p>
      )}

      {valables.length < NOMBRE_MAX_PARTAGES ? (
        <form onSubmit={handleSubmit} className="flex flex-wrap items-end gap-x-4 gap-y-3">
          <div>
            <label htmlFor={`${id}-duree`} className="text-sm font-medium">
              Valable
            </label>
            <select id={`${id}-duree`} name="duree" defaultValue={7} className={classeChamp}>
              {Object.entries(DUREES).map(([jours, libelle]) => (
                <option key={jours} value={jours}>
                  {libelle}
                </option>
              ))}
            </select>
          </div>
          <label className="flex items-center gap-2 py-2 text-sm">
            <input
              type="checkbox"
              name="cv"
              disabled={!avecCv}
              defaultChecked={avecCv}
              className="size-4 accent-indigo-600"
            />
            Inclure le CV{!avecCv && ' (aucun CV)'}
          </label>
          <label className="flex items-center gap-2 py-2 text-sm">
            <input type="checkbox" name="notes" className="size-4 accent-indigo-600" />
            Inclure les notes internes déjà écrites
          </label>
          <button
            type="submit"
            disabled={envoi}
            className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-60"
          >
            {envoi ? 'Création…' : 'Créer un lien'}
          </button>
        </form>
      ) : (
        <p className="text-sm text-slate-600">
          {NOMBRE_MAX_PARTAGES} liens valables au plus : révoquez-en un pour en créer un autre.
        </p>
      )}
    </div>
  )
}
