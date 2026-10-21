import type { Session, User } from '@supabase/auth-js'
import { createContext, useContext } from 'react'

export interface AuthState {
  session: Session | null
  user: User | null
  // true tant que la session initiale n'a pas été lue
  chargement: boolean
}

export interface AuthContextValue extends AuthState {
  connexion: (email: string, motDePasse: string) => Promise<string | null>
  // redirection : page (chemin interne) où ramener après la confirmation de l'e-mail
  inscription: (
    email: string,
    motDePasse: string,
    redirection?: string,
  ) => Promise<ResultatInscription>
  deconnexion: () => Promise<void>
  demanderReinitialisation: (email: string) => Promise<string | null>
  changerMotDePasse: (motDePasse: string) => Promise<string | null>
  // Envoie un lien de confirmation à la nouvelle adresse ; l'e-mail change après le clic
  changerEmail: (email: string) => Promise<string | null>
  // Vérifie le mot de passe actuel avant une opération sensible
  verifierMotDePasse: (motDePasse: string) => Promise<string | null>
  supprimerCompte: () => Promise<string | null>
}

export type ResultatInscription =
  { erreur: string } | { erreur: null; confirmationRequise: boolean }

export const AuthContext = createContext<AuthContextValue | null>(null)

export function useAuth() {
  const contexte = useContext(AuthContext)
  if (!contexte) throw new Error('useAuth doit être utilisé dans un AuthProvider')
  return contexte
}
