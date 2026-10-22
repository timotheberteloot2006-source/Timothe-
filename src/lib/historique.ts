import { ETAPES_DE_BASE, nomsEtapes } from './etapes'
import { formaterDate } from './entretiens'
import { SUPABASE_NON_CONFIGURE, supabase } from './supabase'

// Table remplie par la base (supabase/migrations/0010_historique.sql), en lecture seule
export interface Evenement {
  id: number
  user_id: string | null
  email: string | null
  // Action d'un traitement serveur, sans utilisateur connecté
  par_systeme: boolean
  action: string
  details: Record<string, unknown>
  created_at: string
}

// Nombre d'événements affichés sur la fiche
export const LIMITE_HISTORIQUE = 50

// tronque : il existe des actions plus anciennes que celles renvoyées
export async function listerHistorique(
  candidatureId: string,
): Promise<{ evenements: Evenement[]; tronque: boolean }> {
  if (!supabase) throw new Error(SUPABASE_NON_CONFIGURE)
  const { data, error } = await supabase
    .from('historique')
    .select('id, user_id, email, par_systeme, action, details, created_at')
    .eq('candidature_id', candidatureId)
    .order('created_at', { ascending: false })
    .order('id', { ascending: false })
    // Une de plus que la limite : pour savoir s'il en reste au-delà
    .limit(LIMITE_HISTORIQUE + 1)
  if (error) throw new Error(error.message)
  return { evenements: data.slice(0, LIMITE_HISTORIQUE), tronque: data.length > LIMITE_HISTORIQUE }
}

// Auteur affiché : « vous », l'e-mail d'un autre membre, ou ce qu'il en reste
export function auteur(
  evenement: Pick<Evenement, 'user_id' | 'email' | 'par_systeme' | 'action'>,
  userId?: string,
) {
  // Envoyé par le candidat depuis le formulaire public (supabase/functions/postuler)
  if (evenement.par_systeme && ACTIONS_CANDIDAT.has(evenement.action)) return 'le candidat'
  if (evenement.par_systeme) return 'automatique'
  if (evenement.user_id && evenement.user_id === userId) return 'vous'
  // La suppression d'un compte efface son e-mail de l'historique
  return evenement.email ?? 'compte supprimé'
}

const NOMS_DE_BASE = nomsEtapes(ETAPES_DE_BASE)

// cv_ajoute sans utilisateur : le CV joint au formulaire en ligne (supabase/functions/postuler)
const ACTIONS_CANDIDAT = new Set(['reception', 'nouvelle_postulation', 'cv_ajoute'])

const LIBELLES_CHAMPS: Record<string, string> = {
  nom: 'nom',
  email: 'e-mail',
  poste: 'poste',
  competences: 'compétences',
  experience: 'expérience',
  offre: 'offre',
}

// Phrase décrivant l'événement, ex. « Statut : Nouveau → Retenu »
export function decrireEvenement(evenement: Pick<Evenement, 'action' | 'details'>): string {
  const { action, details } = evenement
  switch (action) {
    case 'creation':
      return 'Candidature créée'
    case 'reception':
      return 'Candidature reçue par le formulaire en ligne'
    case 'reponse_envoyee':
      return typeof details.sujet === 'string'
        ? `Réponse envoyée au candidat : « ${details.sujet} »`
        : 'Réponse envoyée au candidat'
    case 'nouvelle_postulation':
      return typeof details.offre === 'string'
        ? `A postulé à nouveau (offre : ${details.offre})`
        : 'A postulé à nouveau'
    case 'statut': {
      // Nom de l'étape au moment du changement (depuis la migration 0015), sinon celui de base
      const libelle = (cle: unknown, nom: unknown) =>
        typeof nom === 'string' ? nom : (NOMS_DE_BASE.get(String(cle)) ?? String(cle))
      return `Statut : ${libelle(details.avant, details.avant_nom)} → ${libelle(details.apres, details.apres_nom)}`
    }
    case 'modification': {
      const champs = Array.isArray(details.champs) ? (details.champs as string[]) : []
      const noms = champs.map((c) => LIBELLES_CHAMPS[c] ?? c)
      return noms.length > 0 ? `Fiche modifiée (${noms.join(', ')})` : 'Fiche modifiée'
    }
    case 'cv_ajoute':
      return 'CV ajouté'
    case 'cv_remplace':
      return 'CV remplacé'
    case 'cv_retire':
      return 'CV supprimé'
    case 'note_ajoutee':
      return 'Note ajoutée'
    case 'note_supprimee':
      return 'Note supprimée'
    case 'etiquette_ajoutee':
      return typeof details.nom === 'string'
        ? `Étiquette « ${details.nom} » ajoutée`
        : 'Étiquette ajoutée'
    case 'etiquette_retiree':
      return typeof details.nom === 'string'
        ? `Étiquette « ${details.nom} » retirée`
        : 'Étiquette retirée'
    case 'entretien_planifie':
      return `Entretien planifié${dateEntretien(details.debut)}`
    case 'entretien_supprime':
      return `Entretien supprimé${dateEntretien(details.debut)}`
    default:
      return action
  }
}

function dateEntretien(debut: unknown) {
  if (typeof debut !== 'string' || Number.isNaN(new Date(debut).getTime())) return ''
  return ` (${formaterDate(debut, { annee: true })})`
}
