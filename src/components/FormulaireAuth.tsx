import { useState, type FormEvent, type ReactNode } from 'react'

interface Props {
  titre: string
  libelleBouton: string
  autoCompleteMotDePasse: 'current-password' | 'new-password'
  // Renvoie un message d'erreur, ou null en cas de succès
  onSubmit: (email: string, motDePasse: string) => Promise<string | null>
  children?: ReactNode
}

export function FormulaireAuth({
  titre,
  libelleBouton,
  autoCompleteMotDePasse,
  onSubmit,
  children,
}: Props) {
  const [erreur, setErreur] = useState<string | null>(null)
  const [envoi, setEnvoi] = useState(false)

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const donnees = new FormData(event.currentTarget)
    setEnvoi(true)
    setErreur(null)
    const message = await onSubmit(String(donnees.get('email')), String(donnees.get('password')))
    setErreur(message)
    setEnvoi(false)
  }

  return (
    <section className="mx-auto max-w-sm px-4 py-16">
      <h1 className="text-2xl font-bold">{titre}</h1>
      <form onSubmit={handleSubmit} className="mt-8 space-y-4">
        <label className="block">
          <span className="text-sm font-medium">E-mail</span>
          <input
            type="email"
            name="email"
            required
            autoComplete="email"
            className="mt-1 block w-full rounded-md border border-slate-300 bg-white px-3 py-2 focus:border-indigo-500 focus:outline-none"
          />
        </label>
        <label className="block">
          <span className="text-sm font-medium">Mot de passe</span>
          <input
            type="password"
            name="password"
            required
            minLength={6}
            autoComplete={autoCompleteMotDePasse}
            className="mt-1 block w-full rounded-md border border-slate-300 bg-white px-3 py-2 focus:border-indigo-500 focus:outline-none"
          />
        </label>
        {erreur && (
          <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
            {erreur}
          </p>
        )}
        <button
          type="submit"
          disabled={envoi}
          className="w-full rounded-md bg-indigo-600 px-4 py-2 font-medium text-white hover:bg-indigo-500 disabled:opacity-60"
        >
          {envoi ? 'Patientez…' : libelleBouton}
        </button>
      </form>
      {children}
    </section>
  )
}
