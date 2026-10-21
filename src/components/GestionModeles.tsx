import { useState, type FormEvent } from 'react'
import { classeChamp } from '@/components/candidatures/styles'
import {
  creerModele,
  modifierModele,
  supprimerModele,
  type Modele,
  type NouveauModele,
} from '@/lib/modeles'

interface Props {
  modeles: Modele[]
  // Exécute la modification puis recharge la page ; renvoie false en cas d'erreur
  executer: (action: () => Promise<void>) => Promise<boolean>
}

const classeBouton =
  'rounded-md px-2 py-1 text-sm text-slate-600 hover:bg-slate-100 hover:text-slate-900'

// Modèles de réponse de l'espace : tous les membres les utilisent et les modifient
export function GestionModeles({ modeles, executer }: Props) {
  // Identifiant du modèle en cours de modification, ou « nouveau »
  const [enEdition, setEnEdition] = useState<string | null>(null)

  function lire(formulaire: HTMLFormElement): NouveauModele {
    const donnees = new FormData(formulaire)
    return {
      nom: String(donnees.get('nom') ?? ''),
      sujet: String(donnees.get('sujet') ?? ''),
      corps: String(donnees.get('corps') ?? ''),
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>, modele?: Modele) {
    event.preventDefault()
    const champs = lire(event.currentTarget)
    const ok = await executer(() =>
      modele ? modifierModele(modele.id, champs) : creerModele(champs),
    )
    if (ok) setEnEdition(null)
  }

  function handleSuppression(modele: Modele) {
    if (window.confirm(`Supprimer le modèle « ${modele.nom} » ?`))
      executer(() => supprimerModele(modele.id))
  }

  const formulaire = (modele?: Modele) => (
    <form onSubmit={(e) => handleSubmit(e, modele)} className="space-y-2">
      <label className="block">
        <span className="text-sm font-medium">Nom du modèle</span>
        <input
          name="nom"
          required
          maxLength={60}
          defaultValue={modele?.nom}
          autoFocus
          className={classeChamp}
        />
      </label>
      <label className="block">
        <span className="text-sm font-medium">Objet de l’e-mail</span>
        <input
          name="sujet"
          required
          maxLength={200}
          defaultValue={modele?.sujet}
          className={classeChamp}
        />
      </label>
      <label className="block">
        <span className="text-sm font-medium">Message</span>
        <textarea
          name="corps"
          required
          maxLength={5000}
          rows={8}
          defaultValue={modele?.corps}
          className={classeChamp}
        />
      </label>
      <div className="flex gap-2">
        <button
          type="submit"
          className="rounded-md bg-indigo-600 px-3 py-2 text-sm font-medium text-white hover:bg-indigo-500"
        >
          Enregistrer le modèle
        </button>
        <button type="button" onClick={() => setEnEdition(null)} className={classeBouton}>
          Annuler
        </button>
      </div>
    </form>
  )

  return (
    <div className="space-y-3">
      <p className="text-sm text-slate-600">
        E-mails types envoyés aux candidats depuis leur fiche (« Répondre au candidat ») ; {'{nom}'}
        , {'{offre}'} et {'{espace}'} y sont remplacés.
      </p>
      {modeles.length > 0 && (
        <ul className="divide-y divide-slate-200 rounded-md border border-slate-200">
          {modeles.map((modele) => (
            <li key={modele.id} className="px-3 py-2">
              {enEdition === modele.id ? (
                formulaire(modele)
              ) : (
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-sm">
                    <span className="font-medium">{modele.nom}</span>
                    <span className="text-slate-600"> · {modele.sujet}</span>
                  </span>
                  <span className="flex gap-1">
                    <button
                      type="button"
                      onClick={() => setEnEdition(modele.id)}
                      aria-label={`Modifier le modèle « ${modele.nom} »`}
                      className={classeBouton}
                    >
                      Modifier
                    </button>
                    <button
                      type="button"
                      onClick={() => handleSuppression(modele)}
                      aria-label={`Supprimer le modèle « ${modele.nom} »`}
                      className={`${classeBouton} hover:bg-red-50 hover:text-red-700`}
                    >
                      Supprimer
                    </button>
                  </span>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
      {enEdition === 'nouveau' ? (
        formulaire()
      ) : (
        <button
          type="button"
          onClick={() => setEnEdition('nouveau')}
          className="rounded-md border border-slate-300 px-3 py-2 text-sm font-medium hover:bg-slate-100"
        >
          Nouveau modèle
        </button>
      )}
    </div>
  )
}
