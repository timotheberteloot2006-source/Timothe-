import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/tableau-de-bord')({
  component: TableauDeBord,
})

function TableauDeBord() {
  return (
    <section className="mx-auto max-w-6xl px-4 py-16">
      <h1 className="text-2xl font-bold">Tableau de bord</h1>
      <div className="mt-8 rounded-lg border border-dashed border-slate-300 bg-white p-12 text-center text-slate-500">
        Rien à afficher pour le moment.
      </div>
    </section>
  )
}
