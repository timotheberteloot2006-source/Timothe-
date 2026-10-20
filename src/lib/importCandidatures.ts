import { decouperCompetences, normaliser, type NouvelleCandidature } from './candidatures'
import { lireCsv } from './csv'

export const MAX_LIGNES_IMPORT = 1000

type Champ = keyof NouvelleCandidature

// En-têtes acceptés (comparés sans accents ni majuscules)
const ENTETES: Record<Champ, string[]> = {
  nom: ['nom', 'nom complet', 'name', 'candidat'],
  email: ['email', 'e-mail', 'mail', 'courriel'],
  poste: ['poste', 'poste vise', 'job', 'intitule'],
  competences: ['competences', 'skills'],
  experience: ['experience', "annees d'experience", 'annees experience', 'experience (ans)'],
}

export const MODELE_CSV =
  'nom;email;poste;competences;experience\n' +
  'Alice Martin;alice@exemple.fr;Développeuse front;React, TypeScript;5\n'

export interface ResultatImport {
  candidatures: NouvelleCandidature[]
  // Messages d'erreur par ligne (numéro de ligne du fichier)
  erreurs: string[]
}

export function analyserImport(texte: string): ResultatImport {
  const [entete, ...lignes] = lireCsv(texte)
  if (!entete) return { candidatures: [], erreurs: ['Le fichier est vide.'] }

  const colonnes = trouverColonnes(entete)
  if (colonnes.nom === undefined) {
    return {
      candidatures: [],
      erreurs: ['Colonne « nom » introuvable dans la première ligne du fichier.'],
    }
  }
  if (lignes.length > MAX_LIGNES_IMPORT) {
    return {
      candidatures: [],
      erreurs: [
        `Le fichier dépasse ${MAX_LIGNES_IMPORT} lignes : découpez-le en plusieurs fichiers.`,
      ],
    }
  }

  const candidatures: NouvelleCandidature[] = []
  const erreurs: string[] = []
  lignes.forEach((cellules, index) => {
    const numero = index + 2
    const valeur = (champ: Champ) => {
      const colonne = colonnes[champ]
      return colonne === undefined ? '' : (cellules[colonne] ?? '').trim()
    }

    const nom = valeur('nom')
    if (!nom) {
      erreurs.push(`Ligne ${numero} : nom manquant.`)
      return
    }
    const texteExperience = valeur('experience')
    const experience = texteExperience === '' ? 0 : Number(texteExperience.replace(',', '.'))
    if (!Number.isInteger(experience) || experience < 0) {
      erreurs.push(
        `Ligne ${numero} : expérience « ${texteExperience} » invalide (nombre entier attendu).`,
      )
      return
    }
    candidatures.push({
      nom,
      email: valeur('email') || null,
      poste: valeur('poste') || null,
      competences: decouperCompetences(valeur('competences')),
      experience,
    })
  })
  return { candidatures, erreurs }
}

function trouverColonnes(entete: string[]) {
  const colonnes: Partial<Record<Champ, number>> = {}
  entete.forEach((titre, index) => {
    const cle = normaliser(titre)
    for (const [champ, synonymes] of Object.entries(ENTETES) as [Champ, string[]][]) {
      if (colonnes[champ] === undefined && synonymes.includes(cle)) colonnes[champ] = index
    }
  })
  return colonnes
}
