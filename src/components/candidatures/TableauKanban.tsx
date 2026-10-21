import { Link } from '@tanstack/react-router'
import { useState, type DragEvent } from 'react'
import { LIBELLES_STATUT, STATUTS, type Candidature, type Statut } from '@/lib/candidatures'
import { regrouperParStatut } from '@/lib/filtres'

// Cartes affichées d'emblée par colonne (le reste s'affiche à la demande)
const CARTES_PAR_COLONNE = 50

const bordureStatut: Record<Statut, string> = {
  nouveau: 'border-t-slate-400',
  retenu: 'border-t-green-600',
  ecarte: 'border-t-red-600',
}

// Verbe du bouton qui envoie une carte dans la colonne
const ACTIONS: Record<Statut, string> = {
  nouveau: 'Remettre en Nouveau',
  retenu: 'Retenir',
  ecarte: 'Écarter',
}

interface Props {
  // Déjà filtrées et triées ; chaque colonne garde cet ordre
  candidatures: Candidature[]
  // Titre de l'offre de chaque candidature (par identifiant d'offre)
  titresOffres: Map<string, string>
  // Résout une fois le changement enregistré (ou refusé, l'erreur est affichée par la page)
  onChangerStatut: (id: string, statut: Statut) => Promise<void>
}

export function TableauKanban({ candidatures, titresOffres, onChangerStatut }: Props) {
  // Statut affiché tout de suite, le temps que la base confirme
  const [deplacees, setDeplacees] = useState(new Map<string, Statut>())
  const [survolee, setSurvolee] = useState<Statut | null>(null)
  const [annonce, setAnnonce] = useState('')
  const [developpees, setDeveloppees] = useState(new Set<Statut>())

  const affichees = candidatures.map((c) =>
    deplacees.has(c.id) ? { ...c, statut: deplacees.get(c.id)! } : c,
  )
  const colonnes = regrouperParStatut(affichees)

  async function deplacer(candidature: Candidature, statut: Statut) {
    if (candidature.statut === statut) return
    setDeplacees((d) => new Map(d).set(candidature.id, statut))
    setAnnonce(`${candidature.nom} : ${LIBELLES_STATUT[statut]}.`)
    await onChangerStatut(candidature.id, statut)
    // Données rechargées : le statut vient de nouveau de la base (inchangé si refusé)
    setDeplacees((d) => {
      const suivantes = new Map(d)
      suivantes.delete(candidature.id)
      return suivantes
    })
  }

  function deposer(event: DragEvent, statut: Statut) {
    event.preventDefault()
    setSurvolee(null)
    const candidature = affichees.find(
      (c) => c.id === event.dataTransfer.getData('application/x-candidature'),
    )
    if (candidature) deplacer(candidature, statut)
  }

  return (
    <div className="grid gap-4 md:grid-cols-3">
      {/* Annonce des déplacements pour les lecteurs d'écran */}
      <p aria-live="polite" className="sr-only">
        {annonce}
      </p>
      {STATUTS.map((statut) => {
        const cartes = colonnes[statut]
        const visibles = developpees.has(statut) ? cartes : cartes.slice(0, CARTES_PAR_COLONNE)
        return (
          <section
            key={statut}
            aria-labelledby={`colonne-${statut}`}
            onDragOver={(e) => {
              if (!e.dataTransfer.types.includes('application/x-candidature')) return
              e.preventDefault()
              e.dataTransfer.dropEffect = 'move'
              setSurvolee(statut)
            }}
            onDragLeave={(e) => {
              // Quitte la colonne (et non une carte à l'intérieur)
              if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setSurvolee(null)
            }}
            onDrop={(e) => deposer(e, statut)}
            className={`flex min-h-40 flex-col gap-3 rounded-lg border border-t-4 border-slate-200 p-3 ${bordureStatut[statut]} ${survolee === statut ? 'bg-indigo-50' : 'bg-slate-50'}`}
          >
            <h2
              id={`colonne-${statut}`}
              className="flex items-baseline justify-between font-semibold"
            >
              {LIBELLES_STATUT[statut]}
              <span className="text-sm font-normal text-slate-600">{cartes.length}</span>
            </h2>
            {cartes.length === 0 && (
              <p className="py-6 text-center text-sm text-slate-600">Aucune candidature</p>
            )}
            <ul className="flex flex-col gap-2">
              {visibles.map((c) => (
                <li
                  key={c.id}
                  draggable
                  onDragStart={(e) => {
                    e.dataTransfer.setData('application/x-candidature', c.id)
                    e.dataTransfer.effectAllowed = 'move'
                  }}
                  onDragEnd={() => setSurvolee(null)}
                  className="cursor-grab rounded-md border border-slate-200 bg-surface p-3 text-sm shadow-sm active:cursor-grabbing"
                >
                  <Link
                    to="/candidatures/$id"
                    params={{ id: c.id }}
                    className="font-medium hover:text-accent hover:underline"
                  >
                    {c.nom}
                  </Link>
                  <p className="text-xs text-slate-600">
                    {[
                      c.offre_id && titresOffres.get(c.offre_id),
                      c.poste,
                      `${c.experience} an${c.experience > 1 ? 's' : ''}`,
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                  </p>
                  {c.competences.length > 0 && (
                    <p className="mt-1 truncate text-xs text-indigo-700">
                      {c.competences.join(', ')}
                    </p>
                  )}
                  {/* Déplacement au clavier (et sans glisser-déposer) */}
                  <div className="mt-2 flex flex-wrap gap-1">
                    {STATUTS.filter((s) => s !== c.statut).map((s) => (
                      <button
                        key={s}
                        type="button"
                        onClick={() => deplacer(c, s)}
                        aria-label={`${ACTIONS[s]} ${c.nom}`}
                        className="rounded px-1.5 py-0.5 text-xs text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                      >
                        {ACTIONS[s]}
                      </button>
                    ))}
                  </div>
                </li>
              ))}
            </ul>
            {visibles.length < cartes.length && (
              <button
                type="button"
                onClick={() => setDeveloppees((d) => new Set(d).add(statut))}
                className="text-sm text-accent hover:underline"
              >
                Afficher les {cartes.length - visibles.length} autres
              </button>
            )}
          </section>
        )
      })}
    </div>
  )
}
