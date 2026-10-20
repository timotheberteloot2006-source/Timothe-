// Aperçu statique du tableau de bord pour la page d'accueil (données d'exemple)
const exemples = [
  {
    nom: 'Alice Martin',
    detail: 'Développeuse front · 5 ans',
    competences: ['React', 'TypeScript', 'SQL'],
    statut: 'Retenu',
    couleur: 'bg-green-100 text-green-800',
  },
  {
    nom: 'Chloé Petit',
    detail: 'Développeuse fullstack · 8 ans',
    competences: ['React', 'Node.js', 'SQL'],
    statut: 'Nouveau',
    couleur: 'bg-slate-100 text-slate-700',
  },
]

export function ApercuProduit() {
  return (
    <div
      role="img"
      aria-label="Aperçu du tableau de bord : deux candidatures correspondant aux filtres React et SQL, 3 ans d'expérience minimum"
      className="mx-auto max-w-3xl rounded-xl border border-slate-200 bg-surface p-4 text-left shadow-lg sm:p-6"
    >
      <div aria-hidden="true">
        <div className="flex flex-wrap gap-2 text-xs sm:text-sm">
          <Filtre libelle="Compétences" valeur="React, SQL" />
          <Filtre libelle="Expérience min." valeur="3 ans" />
          <Filtre libelle="Statut" valeur="Tous" />
        </div>
        <p className="mt-4 text-xs text-slate-500 sm:text-sm">2 candidatures sur 37</p>
        <ul className="mt-2 divide-y divide-slate-100 rounded-lg border border-slate-200">
          {exemples.map((c) => (
            <li key={c.nom} className="flex items-start justify-between gap-3 p-3">
              <div className="min-w-0">
                <p className="text-sm font-medium">{c.nom}</p>
                <p className="text-xs text-slate-500">{c.detail}</p>
                <div className="mt-1.5 flex flex-wrap gap-1">
                  {c.competences.map((competence) => (
                    <span
                      key={competence}
                      className="rounded-full bg-indigo-50 px-2 py-0.5 text-xs text-indigo-700"
                    >
                      {competence}
                    </span>
                  ))}
                </div>
              </div>
              <span className={`shrink-0 rounded-md px-2 py-1 text-xs font-medium ${c.couleur}`}>
                {c.statut}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}

function Filtre({ libelle, valeur }: { libelle: string; valeur: string }) {
  return (
    <span className="rounded-md border border-slate-200 bg-slate-50 px-2.5 py-1">
      <span className="text-slate-500">{libelle} : </span>
      <span className="font-medium">{valeur}</span>
    </span>
  )
}
