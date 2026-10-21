// Contrôle des champs envoyés par le formulaire public (sans dépendance : testé par Vitest dans
// validation.test.ts, exécuté par Deno dans index.ts)

export interface CandidaturePublique {
  jeton: string
  nom: string
  email: string
  competences: string[]
  experience: number
}

// Même valeur que file_size_limit dans supabase/migrations/0005_notes_et_cv.sql
export const TAILLE_MAX_CV = 5 * 1024 * 1024

// Un humain met plus de quelques secondes à remplir le formulaire
export const DUREE_MIN_REMPLISSAGE_MS = 3000

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
// Volontairement simple : une adresse plausible, vérifiée ensuite par le recruteur
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export function lireFormulaire(
  champs: Record<string, string>,
): { candidature: CandidaturePublique } | { erreur: string } {
  const texte = (cle: string) => (champs[cle] ?? '').trim()
  const jeton = texte('jeton')
  if (!UUID.test(jeton)) return { erreur: 'Lien de candidature invalide.' }

  const nom = texte('nom')
  if (!nom) return { erreur: 'Indiquez votre nom.' }
  if (nom.length > 200) return { erreur: 'Le nom est trop long.' }

  const email = texte('email')
  if (!EMAIL.test(email) || email.length > 320) return { erreur: 'Adresse e-mail invalide.' }

  const experienceTexte = texte('experience') || '0'
  const experience = Number(experienceTexte)
  if (!/^\d+$/.test(experienceTexte) || experience > 60)
    return { erreur: 'Les années d’expérience doivent être un nombre entre 0 et 60.' }

  // Séparées par des virgules, points-virgules ou retours à la ligne ; doublons retirés sans
  // tenir compte des majuscules
  const vues = new Set<string>()
  const competences = texte('competences')
    .split(/[,;\n]/)
    .map((c) => c.trim())
    .filter((c) => c && !vues.has(c.toLowerCase()) && vues.add(c.toLowerCase()))
  if (competences.length > 30 || competences.some((c) => c.length > 60))
    return { erreur: 'Trop de compétences, ou compétence trop longue.' }

  if (champs.consentement !== 'oui')
    return { erreur: 'Votre accord est nécessaire pour transmettre votre candidature.' }

  return { candidature: { jeton, nom, email, competences, experience } }
}

// Envoi automatique probable : champ piège rempli (invisible pour un humain) ou envoi trop rapide.
// On répond alors comme si tout s'était bien passé, sans rien enregistrer.
export function estRobot(champs: Record<string, string>, maintenant: number) {
  if ((champs.site_web ?? '') !== '') return true
  const ouvertLe = Number(champs.ouvert_le)
  return !Number.isFinite(ouvertLe) || maintenant - ouvertLe < DUREE_MIN_REMPLISSAGE_MS
}

// Un vrai PDF commence par « %PDF- », quel que soit le type annoncé par le navigateur
export function verifierCv(octets: Uint8Array): string | null {
  if (octets.length > TAILLE_MAX_CV) return 'Le CV ne doit pas dépasser 5 Mo.'
  const entete = String.fromCharCode(...octets.subarray(0, 5))
  if (entete !== '%PDF-') return 'Le CV doit être un fichier PDF.'
  return null
}

// Message affiché au candidat selon l'erreur de la base (sans révéler l'offre Gratuite)
export function traduireErreur(message: string): { erreur: string; status: number } {
  if (message.startsWith('offre_fermee') || message.startsWith('limite_gratuite'))
    return { erreur: 'Cette offre n’accepte plus de candidatures.', status: 409 }
  if (message.startsWith('trop_de_candidatures'))
    return {
      erreur: 'Trop de candidatures envoyées depuis cette connexion : réessayez dans une heure.',
      status: 429,
    }
  return { erreur: 'Envoi impossible pour le moment : réessayez plus tard.', status: 500 }
}
