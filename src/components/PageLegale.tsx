import type { ReactNode } from 'react'
import { INFOS_LEGALES, LIBELLES_INFOS, type CleInfoLegale } from '@/lib/infosLegales'

export function PageLegale({ titre, children }: { titre: string; children: ReactNode }) {
  return (
    <article className="mx-auto max-w-3xl px-4 py-12 text-slate-700 [&_a]:text-indigo-600 [&_a]:underline [&_h2]:mt-10 [&_h2]:mb-3 [&_h2]:text-xl [&_h2]:font-semibold [&_h2]:text-slate-900 [&_li]:mt-1 [&_p]:mt-3 [&_ul]:mt-3 [&_ul]:list-disc [&_ul]:pl-6">
      <h1 className="text-3xl font-bold text-slate-900">{titre}</h1>
      <p className="text-sm text-slate-500">
        Dernière mise à jour : <Info cle="miseAJour" />
      </p>
      {children}
    </article>
  )
}

// Valeur de src/lib/infosLegales.ts, signalée en orange tant qu'elle n'est pas renseignée
export function Info({ cle }: { cle: CleInfoLegale }) {
  const valeur = INFOS_LEGALES[cle]
  if (valeur) return <>{valeur}</>
  return (
    <mark className="rounded bg-amber-100 px-1 text-amber-900">
      [À compléter : {LIBELLES_INFOS[cle]}]
    </mark>
  )
}

export function EmailContact() {
  const email = INFOS_LEGALES.email
  return email ? <a href={`mailto:${email}`}>{email}</a> : <Info cle="email" />
}
