import { createFileRoute } from '@tanstack/react-router'
import { useAuth } from '@/lib/auth'

export const Route = createFileRoute('/_authentifie/tableau-de-bord')({
  component: TableauDeBord,
})

function TableauDeBord() {
  const { user } = useAuth()

  return (
    <section className="mx-auto max-w-6xl px-4 py-16">
      <h1 className="text-2xl font-bold">Tableau de bord</h1>
      <p className="mt-2 text-slate-600">Connecté en tant que {user?.email}</p>
      <div className="mt-8 rounded-lg border border-dashed border-slate-300 bg-white p-12 text-center text-slate-500">
        Rien à afficher pour le moment.
      </div>
    </section>
  )
}
