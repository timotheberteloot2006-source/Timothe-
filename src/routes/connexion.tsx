import { createFileRoute } from '@tanstack/react-router'
import type { FormEvent } from 'react'

export const Route = createFileRoute('/connexion')({
  component: Connexion,
})

function Connexion() {
  // L'authentification sera branchée à une étape ultérieure
  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
  }

  return (
    <section className="mx-auto max-w-sm px-4 py-16">
      <h1 className="text-2xl font-bold">Connexion</h1>
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
            autoComplete="current-password"
            className="mt-1 block w-full rounded-md border border-slate-300 bg-white px-3 py-2 focus:border-indigo-500 focus:outline-none"
          />
        </label>
        <button
          type="submit"
          className="w-full rounded-md bg-indigo-600 px-4 py-2 font-medium text-white hover:bg-indigo-500"
        >
          Se connecter
        </button>
      </form>
    </section>
  )
}
