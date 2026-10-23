import { useNavigate } from '@tanstack/react-router'
import { useState } from 'react'
import type { Candidature } from '@/lib/candidatures'
import { effacerCandidature, exporterCandidature } from '@/lib/rgpd'

// Demandes du candidat sur ses données : accès (export) et effacement, inscrites au registre de
// la page Équipe
export function CarteRgpd({ candidature }: { candidature: Candidature }) {
  const navigate = useNavigate()
  const [enCours, setEnCours] = useState<'export' | 'effacement' | null>(null)
  const [erreur, setErreur] = useState<string | null>(null)
  const [exporte, setExporte] = useState(false)

  async function exporter() {
    setErreur(null)
    setEnCours('export')
    try {
      await exporterCandidature(candidature)
      setExporte(true)
    } catch (e) {
      setErreur(e instanceof Error ? e.message : String(e))
    } finally {
      setEnCours(null)
    }
  }

  async function effacer() {
    if (
      !window.confirm(
        `Effacer définitivement toutes les données de ${candidature.nom} (fiche, CV, notes, entretiens, évaluations, historique, liens de partage) ? Cette action est irréversible.`,
      )
    )
      return
    setErreur(null)
    setEnCours('effacement')
    try {
      const avertissement = await effacerCandidature(candidature)
      if (avertissement) window.alert(avertissement)
      navigate({ to: '/tableau-de-bord' })
    } catch (e) {
      setErreur(e instanceof Error ? e.message : String(e))
      setEnCours(null)
    }
  }

  return (
    <div className="space-y-3 rounded-lg border border-slate-200 bg-surface p-6">
      <div>
        <h2 className="text-lg font-semibold">Données personnelles</h2>
        <p className="text-sm text-slate-600">
          Pour répondre à une demande du candidat (RGPD) : l’export réunit toutes ses données et son
          CV dans une archive ZIP ; l’effacement supprime tout, sans retour possible. Chaque demande
          est inscrite au registre de la page Équipe, sans les données du candidat.
        </p>
      </div>
      <div className="flex flex-wrap gap-3">
        <button
          type="button"
          onClick={exporter}
          disabled={enCours !== null}
          className="rounded-md border border-slate-300 bg-surface px-4 py-2 text-sm font-medium hover:bg-slate-100 disabled:opacity-60"
        >
          {enCours === 'export' ? 'Préparation…' : 'Exporter ses données (ZIP)'}
        </button>
        <button
          type="button"
          onClick={effacer}
          disabled={enCours !== null}
          className="rounded-md px-4 py-2 text-sm font-medium text-red-700 hover:bg-red-50 disabled:opacity-60"
        >
          {enCours === 'effacement' ? 'Effacement…' : 'Effacer définitivement'}
        </button>
      </div>
      {exporte && (
        <p role="status" className="text-sm text-slate-600">
          Archive téléchargée et demande d’accès inscrite au registre.
        </p>
      )}
      {erreur && (
        <p role="alert" className="rounded-md bg-red-50 px-4 py-3 text-sm text-red-700">
          {erreur}
        </p>
      )}
    </div>
  )
}
