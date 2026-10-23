import { Link } from '@tanstack/react-router'
import type { Candidature, NouvelleCandidature, Statut } from '@/lib/candidatures'
import { couleurEtape, type Etape } from '@/lib/etapes'
import { formaterNote, type Moyenne } from '@/lib/evaluations'
import type { EntretienAVenir } from '@/lib/entretiens'
import type { Offre } from '@/lib/offres'
import type { Etiquette } from '@/lib/etiquettes'
import { FormulaireCandidature } from './FormulaireCandidature'
import { PastillesEtiquettes } from './PastillesEtiquettes'

interface Props {
  candidatures: Candidature[]
  // Candidature affichée sous forme de formulaire, ou null
  idEnEdition: string | null
  onChangerStatut: (id: string, statut: Statut) => void
  onModifier: (candidature: Candidature) => void
  onEnregistrer: (id: string, champs: NouvelleCandidature) => Promise<void>
  onAnnulerEdition: () => void
  onSupprimer: (candidature: Candidature) => void
  // Identifiants cochés pour les actions groupées
  selection: Set<string>
  onBasculerSelection: (id: string) => void
  offres: Offre[]
  // Prochain entretien de chaque candidature (par identifiant)
  prochainsEntretiens: Map<string, EntretienAVenir>
  etapes: Etape[]
  // Note moyenne de chaque candidature évaluée
  moyennes?: Map<string, Moyenne>
  // Étiquettes posées sur chaque candidature
  etiquettesDe?: (id: string) => Etiquette[]
}

export function ListeCandidatures({
  candidatures,
  idEnEdition,
  onChangerStatut,
  onModifier,
  onEnregistrer,
  onAnnulerEdition,
  onSupprimer,
  selection,
  onBasculerSelection,
  offres,
  prochainsEntretiens,
  etapes,
  moyennes = new Map(),
  etiquettesDe = () => [],
}: Props) {
  const titres = new Map(offres.map((o) => [o.id, o.titre]))
  return (
    <ul className="divide-y divide-slate-200 rounded-lg border border-slate-200 bg-surface">
      {candidatures.map((c) =>
        c.id === idEnEdition ? (
          <li key={c.id} className="bg-slate-50 p-2">
            <FormulaireCandidature
              initiale={c}
              offres={offres}
              onEnregistrer={(champs) => onEnregistrer(c.id, champs)}
              onAnnuler={onAnnulerEdition}
            />
          </li>
        ) : (
          <li
            key={c.id}
            className={`flex items-start gap-3 p-4 ${selection.has(c.id) ? 'bg-indigo-50' : ''}`}
          >
            <input
              type="checkbox"
              checked={selection.has(c.id)}
              onChange={() => onBasculerSelection(c.id)}
              aria-label={`Sélectionner ${c.nom}`}
              className="mt-1.5 size-4 shrink-0 accent-indigo-600"
            />
            <div className="flex min-w-0 flex-1 flex-wrap items-start justify-between gap-4">
              <div className="min-w-0">
                <p className="flex flex-wrap items-center gap-2">
                  <Link
                    to="/candidatures/$id"
                    params={{ id: c.id }}
                    className="font-medium hover:text-accent hover:underline"
                  >
                    {c.nom}
                  </Link>
                  {moyennes.has(c.id) && (
                    <span className="rounded bg-amber-50 px-1.5 py-0.5 text-xs text-amber-800">
                      <span aria-hidden="true">★ {formaterNote(moyennes.get(c.id)!.moyenne)}</span>
                      <span className="sr-only">
                        Note moyenne {formaterNote(moyennes.get(c.id)!.moyenne)} sur 5,{' '}
                        {moyennes.get(c.id)!.evaluateurs} évaluateur
                        {moyennes.get(c.id)!.evaluateurs > 1 ? 's' : ''}
                      </span>
                    </span>
                  )}
                  {c.cv_chemin && (
                    <span className="rounded bg-slate-100 px-1.5 py-0.5 text-xs text-slate-600">
                      CV
                    </span>
                  )}
                  {prochainsEntretiens.has(c.id) && (
                    <span className="rounded bg-indigo-50 px-1.5 py-0.5 text-xs text-indigo-700">
                      Entretien le{' '}
                      {new Date(prochainsEntretiens.get(c.id)!.debut).toLocaleString('fr-FR', {
                        day: 'numeric',
                        month: 'short',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </span>
                  )}
                  {!!c.nb_notes && (
                    <span className="text-xs text-slate-600">
                      {c.nb_notes} note{c.nb_notes > 1 ? 's' : ''}
                    </span>
                  )}
                </p>
                <p className="text-sm text-slate-600">
                  {[
                    c.offre_id && titres.has(c.offre_id) && `Offre : ${titres.get(c.offre_id)}`,
                    c.poste,
                    `${c.experience} an${c.experience > 1 ? 's' : ''} d'expérience`,
                    c.email,
                  ]
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
                <PastillesEtiquettes etiquettes={etiquettesDe(c.id)} />
              </div>
              <div className="flex items-center gap-2">
                <select
                  value={c.statut}
                  onChange={(e) => onChangerStatut(c.id, e.target.value as Statut)}
                  aria-label={`Statut de ${c.nom}`}
                  className={`rounded-md border-0 px-2 py-1 text-sm font-medium ${couleurEtape(c.statut).badge}`}
                >
                  {etapes.map((etape) => (
                    <option key={etape.cle} value={etape.cle}>
                      {etape.nom}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={() => onModifier(c)}
                  className="rounded-md px-2 py-1 text-sm text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                >
                  Modifier
                </button>
                <button
                  type="button"
                  onClick={() => onSupprimer(c)}
                  className="rounded-md px-2 py-1 text-sm text-slate-600 hover:bg-red-50 hover:text-red-700"
                >
                  Supprimer
                </button>
              </div>
            </div>
          </li>
        ),
      )}
    </ul>
  )
}
