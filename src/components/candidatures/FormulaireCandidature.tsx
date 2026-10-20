import { useState, type FormEvent } from 'react'
import { decouperCompetences, type NouvelleCandidature } from '@/lib/candidatures'
import { classeChamp } from './styles'

interface Props {
  // Valeurs pré-remplies en modification ; absent pour un ajout
  initiale?: NouvelleCandidature
  onEnregistrer: (candidature: NouvelleCandidature) => Promise<void>
  onAnnuler: () => void
}

export function FormulaireCandidature({ initiale, onEnregistrer, onAnnuler }: Props) {
  const [envoi, setEnvoi] = useState(false)
  const [erreur, setErreur] = useState<string | null>(null)

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const formulaire = event.currentTarget
    const donnees = new FormData(formulaire)
    const texte = (champ: string) => String(donnees.get(champ) ?? '').trim()

    setEnvoi(true)
    setErreur(null)
    try {
      await onEnregistrer({
        nom: texte('nom'),
        email: texte('email') || null,
        poste: texte('poste') || null,
        competences: decouperCompetences(texte('competences')),
        experience: Number.parseInt(texte('experience'), 10) || 0,
      })
      // En ajout, vider le formulaire pour enchaîner la saisie suivante
      if (!initiale) formulaire.reset()
    } catch (e) {
      setErreur(e instanceof Error ? e.message : String(e))
    } finally {
      setEnvoi(false)
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="grid gap-4 rounded-lg border border-slate-200 bg-white p-4 sm:grid-cols-2"
    >
      <label className="block">
        <span className="text-sm font-medium">Nom *</span>
        <input name="nom" required defaultValue={initiale?.nom} className={classeChamp} />
      </label>
      <label className="block">
        <span className="text-sm font-medium">E-mail</span>
        <input
          name="email"
          type="email"
          defaultValue={initiale?.email ?? ''}
          className={classeChamp}
        />
      </label>
      <label className="block">
        <span className="text-sm font-medium">Poste visé</span>
        <input name="poste" defaultValue={initiale?.poste ?? ''} className={classeChamp} />
      </label>
      <label className="block">
        <span className="text-sm font-medium">Années d'expérience</span>
        <input
          name="experience"
          type="number"
          min={0}
          defaultValue={initiale?.experience ?? 0}
          className={classeChamp}
        />
      </label>
      <label className="block sm:col-span-2">
        <span className="text-sm font-medium">Compétences</span>
        <input
          name="competences"
          defaultValue={initiale?.competences.join(', ')}
          placeholder="Séparées par des virgules : React, TypeScript, SQL"
          className={classeChamp}
        />
      </label>
      {erreur && (
        <p
          role="alert"
          className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 sm:col-span-2"
        >
          {erreur}
        </p>
      )}
      <div className="flex gap-3 sm:col-span-2">
        <button
          type="submit"
          disabled={envoi}
          className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-60"
        >
          {envoi ? 'Enregistrement…' : initiale ? 'Enregistrer' : 'Ajouter'}
        </button>
        <button
          type="button"
          onClick={onAnnuler}
          className="rounded-md border border-slate-300 px-4 py-2 text-sm font-medium hover:bg-slate-100"
        >
          {initiale ? 'Annuler' : 'Fermer'}
        </button>
      </div>
    </form>
  )
}
