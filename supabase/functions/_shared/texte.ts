// Mise en forme des e-mails (sans dépendance : utilisée par les fonctions et testée par Vitest)

// Texte saisi par le candidat : sur une ligne, d'une longueur raisonnable
export function ligne(texte: string, longueur = 100) {
  const propre = texte.replace(/\s+/g, ' ').trim()
  return propre.length > longueur ? `${propre.slice(0, longueur - 1)}…` : propre
}

export function echapper(texte: string) {
  return texte.replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!,
  )
}

// Corps HTML minimal : paragraphes, lien éventuel, puis mention de bas de page
export function html(
  paragraphes: string[],
  lien?: { texte: string; adresse: string },
  pied?: string,
) {
  const p = (texte: string) => `<p>${echapper(texte)}</p>`
  const bouton = lien
    ? `<p><a href="${echapper(lien.adresse)}">${echapper(lien.texte)}</a></p>`
    : ''
  const bas = pied ? `<p style="color:#64748b;font-size:12px">${echapper(pied)}</p>` : ''
  return `<div style="font-family:sans-serif;line-height:1.5">${paragraphes.map(p).join('')}${bouton}${bas}</div>`
}
