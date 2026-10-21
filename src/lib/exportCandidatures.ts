import { telechargerFichier } from './telechargement'
import type { Candidature } from './candidatures'
import { ETAPES_DE_BASE, nomsEtapes } from './etapes'

const SEPARATEUR = ';'

// Colonnes compatibles avec l'import (analyserImport) ; statut et date sont ignorés à l'import
const ENTETE = [
  'nom',
  'email',
  'poste',
  'competences',
  'experience',
  'statut',
  'ajoutee le',
  'offre',
]

// titresOffres : titre de chaque offre par identifiant, pour la colonne « offre » ; etapes : nom
// de chaque étape par clé, pour la colonne « statut »
export function genererCsv(
  candidatures: Candidature[],
  titresOffres: Map<string, string> = new Map(),
  etapes: Map<string, string> = nomsEtapes(ETAPES_DE_BASE),
): string {
  const lignes = candidatures.map((c) =>
    [
      texte(c.nom),
      texte(c.email ?? ''),
      texte(c.poste ?? ''),
      texte(c.competences.join(', ')),
      String(c.experience),
      texte(etapes.get(c.statut) ?? c.statut),
      new Date(c.created_at).toLocaleDateString('fr-FR'),
      texte((c.offre_id && titresOffres.get(c.offre_id)) || ''),
    ].map(echapper),
  )
  // Le BOM indique à Excel que le fichier est en UTF-8 ; CRLF est la fin de ligne attendue en CSV
  return '﻿' + [ENTETE, ...lignes].map((l) => l.join(SEPARATEUR)).join('\r\n') + '\r\n'
}

// Un tableur exécuterait une cellule commençant par = + - @ comme une formule : on la neutralise
function texte(valeur: string) {
  return /^[=+\-@\t\r]/.test(valeur) ? `'${valeur}` : valeur
}

function echapper(valeur: string) {
  return /[";\r\n]/.test(valeur) ? `"${valeur.replace(/"/g, '""')}"` : valeur
}

export function nomFichierExport(date = new Date()) {
  const jour = [date.getFullYear(), date.getMonth() + 1, date.getDate()]
    .map((n) => String(n).padStart(2, '0'))
    .join('-')
  return `candidatures-${jour}.csv`
}

export function telechargerCsv(contenu: string, nomFichier: string) {
  telechargerFichier(contenu, nomFichier, 'text/csv;charset=utf-8')
}
