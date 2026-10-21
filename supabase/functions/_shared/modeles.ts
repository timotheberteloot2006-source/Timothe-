// Modèles de réponse aux candidats (sans dépendance : utilisé par la fonction envoyer-reponse et
// par le site pour l'aperçu, testé par Vitest dans modeles.test.ts)
import { echapper, ligne } from './texte.ts'

export interface ValeursModele {
  nom: string
  offre: string
  espace: string
}

// Variables proposées dans les modèles
export const VARIABLES_MODELE = ['nom', 'offre', 'espace'] as const

// Remplace {nom}, {offre} et {espace} ; toute autre accolade reste telle quelle
export function remplirModele(texte: string, valeurs: ValeursModele) {
  return texte.replace(/\{(nom|offre|espace)\}/g, (_, cle: keyof ValeursModele) => valeurs[cle])
}

// Valeurs d'une candidature : son offre, à défaut son poste
export function valeursModele(c: {
  nom: string
  offre_titre: string | null
  poste: string | null
  espace_nom: string
}): ValeursModele {
  return {
    nom: ligne(c.nom),
    offre: ligne(c.offre_titre ?? c.poste ?? 'à pourvoir'),
    espace: ligne(c.espace_nom),
  }
}

// Expéditeur affiché au nom de l'espace : « Agence RH via Filtre <notifications@filtre.fr> »
export function expediteurPour(espace: string, expediteur: string) {
  const adresse = expediteur.match(/<([^<>]+)>\s*$/)?.[1] ?? expediteur.trim()
  const nom = ligne(espace, 60).replace(/["<>\\]/g, '')
  return `"${nom} via Filtre" <${adresse}>`
}

// Corps HTML : un paragraphe par bloc séparé d'une ligne vide, retours à la ligne conservés
export function corpsHtml(texte: string) {
  const paragraphes = texte
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => `<p>${echapper(p).replace(/\n/g, '<br>')}</p>`)
  return `<div style="font-family:sans-serif;line-height:1.5">${paragraphes.join('')}</div>`
}
