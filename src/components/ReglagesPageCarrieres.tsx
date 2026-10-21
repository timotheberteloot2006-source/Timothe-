import { Link } from '@tanstack/react-router'
import { useState, type FormEvent } from 'react'
import { classeChamp } from '@/components/candidatures/styles'
import {
  lienCarrieres,
  proposerAdresse,
  reglerCarrieres,
  type ReglagesCarrieres,
} from '@/lib/carrieres'

interface Props {
  espace: { id: string; nom: string }
  reglages: ReglagesCarrieres
  // Seul le propriétaire règle la page ; les membres voient son lien quand elle est en ligne
  proprietaire: boolean
  // Exécute la modification puis recharge la page ; renvoie false en cas d'erreur
  executer: (action: () => Promise<void>) => Promise<boolean>
}

export function ReglagesPageCarrieres({ espace, reglages, proprietaire, executer }: Props) {
  const [copie, setCopie] = useState(false)
  const lien = reglages.slug ? lienCarrieres(reglages.slug) : null

  async function copier() {
    if (!lien) return
    try {
      await navigator.clipboard.writeText(lien)
      setCopie(true)
    } catch {
      // Presse-papiers refusé : le lien reste lisible et sélectionnable
      setCopie(false)
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const donnees = new FormData(event.currentTarget)
    setCopie(false)
    await executer(() =>
      reglerCarrieres(espace.id, {
        slug: String(donnees.get('slug') ?? '').toLowerCase(),
        carrieres_publiques: donnees.get('carrieres_publiques') === 'oui',
        presentation: String(donnees.get('presentation') ?? ''),
      }),
    )
  }

  const lienEnLigne = reglages.carrieres_publiques && lien && (
    <p className="flex flex-wrap items-center gap-2 text-sm">
      <span>En ligne :</span>
      <Link
        to="/carrieres/$adresse"
        params={{ adresse: reglages.slug! }}
        className="break-all text-accent underline underline-offset-2"
      >
        {lien}
      </Link>
      {proprietaire && (
        <button
          type="button"
          onClick={copier}
          className="rounded-md border border-slate-300 px-2 py-1 font-medium hover:bg-slate-100"
        >
          {copie ? 'Lien copié' : 'Copier le lien'}
        </button>
      )}
    </p>
  )

  if (!proprietaire) {
    return (
      <div className="space-y-2 text-sm text-slate-600">
        {lienEnLigne || <p>La page carrières de l’espace n’est pas en ligne.</p>}
        <p>Seul le propriétaire de l’espace peut la régler.</p>
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <p className="text-sm text-slate-600">
        Une page publique qui présente l’espace « {espace.nom} » et liste les offres dont le
        formulaire est en ligne (page « Offres »), avec un bouton « Postuler » pour chacune.
      </p>
      {lienEnLigne}
      <label className="block">
        <span className="text-sm font-medium">Adresse de la page</span>
        <span className="mt-1 flex items-center gap-1 text-sm">
          <span className="shrink-0 text-slate-600">{lienCarrieres('')}</span>
          <input
            name="slug"
            required
            minLength={3}
            maxLength={40}
            pattern="[a-z0-9][a-z0-9\-]{1,38}[a-z0-9]"
            defaultValue={reglages.slug ?? proposerAdresse(espace.nom)}
            aria-describedby="aide-slug"
            className={`${classeChamp} mt-0`}
          />
        </span>
        <span id="aide-slug" className="mt-1 block text-xs text-slate-600">
          Minuscules sans accent, chiffres et tirets, ex. agence-rh-lyon
        </span>
      </label>
      <label className="block">
        <span className="text-sm font-medium">Présentation</span>
        <textarea
          name="presentation"
          rows={3}
          maxLength={2000}
          defaultValue={reglages.presentation ?? ''}
          placeholder="Qui vous êtes, ce que vous proposez, où vous travaillez…"
          className={classeChamp}
        />
      </label>
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          name="carrieres_publiques"
          value="oui"
          defaultChecked={reglages.carrieres_publiques}
        />
        Page en ligne
      </label>
      <button
        type="submit"
        className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500"
      >
        Enregistrer la page carrières
      </button>
    </form>
  )
}
