import { Link } from '@tanstack/react-router'
import { useId, useState, type FormEvent } from 'react'
import { envoyerReponse, type Modele } from '@/lib/modeles'
// Même règle de remplacement que la fonction serveur : l'aperçu est fidèle à l'envoi
import { remplirModele, valeursModele } from '../../../supabase/functions/_shared/modeles.ts'
import { classeChamp } from './styles'

interface Props {
  candidature: { id: string; nom: string; email: string | null; poste: string | null }
  offreTitre: string | null
  espaceNom: string
  modeles: Modele[]
  // Après l'envoi (rechargement de l'historique)
  onEnvoye: () => Promise<void>
}

// Réponse au candidat par e-mail, à partir d'un modèle de l'espace (retouchable avant l'envoi)
export function CarteReponse({ candidature, offreTitre, espaceNom, modeles, onEnvoye }: Props) {
  const [modeleId, setModeleId] = useState('')
  const [sujet, setSujet] = useState('')
  const [corps, setCorps] = useState('')
  const [envoi, setEnvoi] = useState(false)
  const [erreur, setErreur] = useState<string | null>(null)
  const [envoye, setEnvoye] = useState<string | null>(null)
  // Libellés reliés par identifiant : un libellé englobant ferait entrer le contenu du champ
  // (texte du message, options du menu) dans son nom accessible
  const id = useId()

  const valeurs = valeursModele({
    nom: candidature.nom,
    offre_titre: offreTitre,
    poste: candidature.poste,
    espace_nom: espaceNom,
  })

  function choisir(id: string) {
    setModeleId(id)
    setEnvoye(null)
    const modele = modeles.find((m) => m.id === id)
    setSujet(modele?.sujet ?? '')
    setCorps(modele?.corps ?? '')
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setEnvoi(true)
    setErreur(null)
    try {
      await envoyerReponse({
        candidature: candidature.id,
        sujet,
        corps,
        modele: modeles.find((m) => m.id === modeleId)?.nom ?? null,
      })
      // Formulaire vidé d'abord (choisir efface le message de confirmation), puis confirmation
      choisir('')
      setEnvoye(remplirModele(sujet, valeurs))
      await onEnvoye()
    } catch (e) {
      setErreur(e instanceof Error ? e.message : String(e))
    } finally {
      setEnvoi(false)
    }
  }

  return (
    <div className="space-y-3 rounded-lg border border-slate-200 bg-surface p-6">
      <h2 className="text-lg font-semibold">Répondre au candidat</h2>
      {!candidature.email ? (
        <p className="text-sm text-slate-600">
          Ajoutez une adresse e-mail à la fiche pour pouvoir répondre au candidat.
        </p>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-3">
          {envoye && (
            <p role="status" className="rounded-md bg-green-50 px-3 py-2 text-sm text-green-800">
              E-mail « {envoye} » envoyé à {candidature.email}.
            </p>
          )}
          <div>
            <label htmlFor={`${id}-modele`} className="text-sm font-medium">
              Modèle
            </label>
            <select
              id={`${id}-modele`}
              value={modeleId}
              onChange={(e) => choisir(e.target.value)}
              className={classeChamp}
            >
              <option value="">Message libre</option>
              {modeles.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.nom}
                </option>
              ))}
            </select>
          </div>
          <label className="block">
            <span className="text-sm font-medium">Objet</span>
            <input
              value={sujet}
              onChange={(e) => setSujet(e.target.value)}
              required
              maxLength={200}
              className={classeChamp}
            />
          </label>
          <div>
            <label htmlFor={`${id}-message`} className="text-sm font-medium">
              Message
            </label>
            <textarea
              id={`${id}-message`}
              value={corps}
              onChange={(e) => setCorps(e.target.value)}
              required
              maxLength={5000}
              rows={8}
              aria-describedby="aide-variables"
              className={classeChamp}
            />
          </div>
          <p id="aide-variables" className="text-xs text-slate-600">
            {'{nom}'}, {'{offre}'} et {'{espace}'} sont remplacés à l’envoi. Le candidat répondra à
            votre adresse e-mail. Modèles : page{' '}
            <Link to="/equipe" className="text-accent underline underline-offset-2">
              Équipe
            </Link>
            .
          </p>
          {corps.trim() && (
            <details className="rounded-md border border-slate-200 px-3 py-2 text-sm">
              <summary className="cursor-pointer font-medium">Aperçu</summary>
              <p className="mt-2 font-medium">{remplirModele(sujet, valeurs)}</p>
              <p className="mt-1 whitespace-pre-line text-slate-700">
                {remplirModele(corps, valeurs)}
              </p>
            </details>
          )}
          {erreur && (
            <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
              {erreur}
            </p>
          )}
          <button
            type="submit"
            disabled={envoi}
            className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-60"
          >
            {envoi ? 'Envoi…' : `Envoyer à ${candidature.email}`}
          </button>
        </form>
      )}
    </div>
  )
}
