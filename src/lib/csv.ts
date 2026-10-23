// Lecteur CSV minimal : guillemets (avec "" échappé), retours à la ligne dans les champs,
// séparateur détecté entre « ; » (Excel français), « , » et tabulation
export function lireCsv(texte: string): string[][] {
  const contenu = texte.replace(/^﻿/, '')
  const separateur = detecterSeparateur(contenu)
  const lignes: string[][] = []
  let ligne: string[] = []
  let champ = ''
  let entreGuillemets = false

  for (let i = 0; i < contenu.length; i++) {
    const car = contenu[i]
    if (entreGuillemets) {
      if (car === '"' && contenu[i + 1] === '"') {
        champ += '"'
        i++
      } else if (car === '"') {
        entreGuillemets = false
      } else {
        champ += car
      }
    } else if (car === '"') {
      entreGuillemets = true
    } else if (car === separateur) {
      ligne.push(champ)
      champ = ''
    } else if (car === '\n' || car === '\r') {
      if (car === '\r' && contenu[i + 1] === '\n') i++
      ligne.push(champ)
      lignes.push(ligne)
      ligne = []
      champ = ''
    } else {
      champ += car
    }
  }
  if (champ !== '' || ligne.length > 0) {
    ligne.push(champ)
    lignes.push(ligne)
  }
  // Ignore les lignes entièrement vides
  return lignes.filter((l) => l.some((c) => c.trim() !== ''))
}

function detecterSeparateur(texte: string) {
  const premiereLigne = texte.split(/\r?\n/, 1)[0].replace(/"[^"]*"/g, '')
  const candidats = [';', ',', '\t']
  const compte = (sep: string) => premiereLigne.split(sep).length - 1
  return candidats.reduce((meilleur, sep) => (compte(sep) > compte(meilleur) ? sep : meilleur))
}
