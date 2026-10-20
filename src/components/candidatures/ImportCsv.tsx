import { Link } from '@tanstack/react-router'
import { useState, type ChangeEvent } from 'react'
import type { Candidature, NouvelleCandidature } from '@/lib/candidatures'
import { analyserImport, MODELE_CSV, type ResultatImport } from '@/lib/importCandidatures'

const MESSAGES_AFFICHES = 10

const s = (n: number) => (n > 1 ? 's' : '')

interface Props {
  // Candidatures déjà enregistrées, pour écarter les doublons
  existantes: Candidature[]
  // Infinity avec l'offre Pro
  placesRestantes: number
  onImporter: (candidatures: NouvelleCandidature[]) => Promise<void>
  onFermer: () => void
}

export function ImportCsv({ existantes, placesRestantes, onImporter, onFermer }: Props) {
  const [analyse, setAnalyse] = useState<ResultatImport | null>(null)
  const [envoi, setEnvoi] = useState(false)
  const [erreur, setErreur] = useState<string | null>(null)

  async function handleFichier(event: ChangeEvent<HTMLInputElement>) {
    const fichier = event.target.files?.[0]
    setErreur(null)
    setAnalyse(fichier ? analyserImport(await lireTexte(fichier), existantes) : null)
  }

  async function handleImporter() {
    if (!analyse) return
    setEnvoi(true)
    setErreur(null)
    try {
      await onImporter(analyse.candidatures)
    } catch (e) {
      setErreur(e instanceof Error ? e.message : String(e))
      setEnvoi(false)
    }
  }

  const nombre = analyse?.candidatures.length ?? 0
  const depasseQuota = nombre > placesRestantes

  return (
    <div className="space-y-4 rounded-lg border border-slate-200 bg-white p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="font-semibold">Importer un fichier CSV</h2>
        <a
          // Le BOM indique à Excel que le fichier est en UTF-8
          href={`data:text/csv;charset=utf-8,${encodeURIComponent('\uFEFF' + MODELE_CSV)}`}
          download="modele-candidatures.csv"
          className="text-sm text-indigo-600 hover:underline"
        >
          Télécharger un modèle
        </a>
      </div>
      <p className="text-sm text-slate-600">
        Colonnes reconnues : <strong>nom</strong> (obligatoire), email, poste, competences (séparées
        par des virgules), experience. La première ligne doit contenir ces titres.
      </p>
      <input
        type="file"
        accept=".csv,text/csv"
        onChange={handleFichier}
        aria-label="Fichier CSV"
        className="block text-sm file:mr-3 file:rounded-md file:border-0 file:bg-slate-100 file:px-3 file:py-2 file:text-sm file:font-medium hover:file:bg-slate-200"
      />

      {analyse && (
        <div className="space-y-2 text-sm">
          <p>
            {nombre > 0
              ? `${nombre} candidature${s(nombre)} prête${s(nombre)} à importer.`
              : 'Aucune nouvelle candidature à importer.'}
          </p>
          {analyse.doublons.length > 0 && (
            <ListeMessages
              titre={`${analyse.doublons.length} doublon${s(analyse.doublons.length)} ignoré${s(analyse.doublons.length)} :`}
              messages={analyse.doublons}
              className="bg-slate-100 text-slate-700"
            />
          )}
          {analyse.erreurs.length > 0 && (
            <ListeMessages
              titre={`${analyse.erreurs.length} ligne${s(analyse.erreurs.length)} invalide${s(analyse.erreurs.length)} ignorée${s(analyse.erreurs.length)} :`}
              messages={analyse.erreurs}
              className="bg-amber-50 text-amber-800"
            />
          )}
        </div>
      )}

      {depasseQuota && (
        <p role="alert" className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-800">
          L'offre Gratuite permet encore {placesRestantes} candidature{s(placesRestantes)} :
          réduisez le fichier ou{' '}
          <Link to="/tarifs" className="font-medium underline">
            passez à Pro
          </Link>
          .
        </p>
      )}

      {erreur && (
        <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
          {erreur}
        </p>
      )}

      <div className="flex gap-3">
        <button
          type="button"
          onClick={handleImporter}
          disabled={nombre === 0 || depasseQuota || envoi}
          className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-60"
        >
          {envoi ? 'Import…' : `Importer${nombre > 0 ? ` ${nombre}` : ''}`}
        </button>
        <button
          type="button"
          onClick={onFermer}
          className="rounded-md border border-slate-300 px-4 py-2 text-sm font-medium hover:bg-slate-100"
        >
          Fermer
        </button>
      </div>
    </div>
  )
}

function ListeMessages({
  titre,
  messages,
  className,
}: {
  titre: string
  messages: string[]
  className: string
}) {
  return (
    <div className={`rounded-md px-3 py-2 ${className}`}>
      <p className="font-medium">{titre}</p>
      <ul className="mt-1 list-inside list-disc">
        {messages.slice(0, MESSAGES_AFFICHES).map((message) => (
          <li key={message}>{message}</li>
        ))}
      </ul>
      {messages.length > MESSAGES_AFFICHES && (
        <p className="mt-1">… et {messages.length - MESSAGES_AFFICHES} autres.</p>
      )}
    </div>
  )
}

// Excel enregistre souvent les CSV en Windows-1252 : on le tente si l'UTF-8 est invalide
async function lireTexte(fichier: File) {
  const octets = await fichier.arrayBuffer()
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(octets)
  } catch {
    return new TextDecoder('windows-1252').decode(octets)
  }
}
