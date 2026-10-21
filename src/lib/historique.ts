import { LIBELLES_STATUT, type Statut } from './candidatures'
import { SUPABASE_NON_CONFIGURE, supabase } from './supabase'

// Table remplie par la base (supabase/migrations/0010_historique.sql), en lecture seule
export interface Evenement {
  id: number
  user_id: string | null
  email: string | null
  action: string
  details: Record<string, unknown>
  created_at: string
}

// Nombre d'événements affichés sur la fiche
export const LIMITE_HISTORIQUE = 50

export async function listerHistorique(candidatureId: string): Promise<Evenement[]> {
  if (!supabase) throw new Error(SUPABASE_NON_CONFIGURE)
  const { data, error } = await supabase
    .from('historique')
    .select('id, user_id, email, action, details, created_at')
    .eq('candidature_id', candidatureId)
    .order('created_at', { ascending: false })
    .order('id', { ascending: false })
    .limit(LIMITE_HISTORIQUE)
  if (error) throw new Error(error.message)
  return data
}

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
    case 'statut': {
      const libelle = (s: unknown) => LIBELLES_STATUT[s as Statut] ?? String(s)
      return `Statut : ${libelle(details.avant)} → ${libelle(details.apres)}`
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
    case 'entretien_planifie':
      return `Entretien planifié${dateEntretien(details.debut)}`
    case 'entretien_supprime':
      return `Entretien supprimé${dateEntretien(details.debut)}`
    default:
      return action
  }
}

function dateEntretien(debut: unknown) {
  if (typeof debut !== 'string') return ''
  const date = new Date(debut)
  if (Number.isNaN(date.getTime())) return ''
  return ` (${date.toLocaleString('fr-FR', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })})`
}
