import type { Session } from '@supabase/auth-js'
import { useEffect, useState, type ReactNode } from 'react'
import { AuthContext, type ResultatInscription } from '@/lib/auth'
import { supprimerTousLesCv } from '@/lib/cv'
import { SUPABASE_NON_CONFIGURE, supabase } from '@/lib/supabase'

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [chargement, setChargement] = useState(supabase !== null)

  useEffect(() => {
    if (!supabase) return
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      setChargement(false)
    })
    const { data } = supabase.auth.onAuthStateChange((_event, nouvelleSession) => {
      setSession(nouvelleSession)
    })
    return () => data.subscription.unsubscribe()
  }, [])

  // Les fonctions renvoient un message d'erreur en français, ou null en cas de succès
  async function connexion(email: string, motDePasse: string) {
    if (!supabase) return SUPABASE_NON_CONFIGURE
    const { error } = await supabase.auth.signInWithPassword({ email, password: motDePasse })
    return error ? traduireErreur(error.message) : null
  }

  async function inscription(
    email: string,
    motDePasse: string,
    redirection?: string,
  ): Promise<ResultatInscription> {
    if (!supabase) return { erreur: SUPABASE_NON_CONFIGURE }
    const { data, error } = await supabase.auth.signUp({
      email,
      password: motDePasse,
      // Le lien de confirmation ramène à la page demandée (ex. une invitation), déjà connecté
      options: redirection ? { emailRedirectTo: `${window.location.origin}${redirection}` } : {},
    })
    if (error) return { erreur: traduireErreur(error.message) }
    // Sans session, Supabase attend la confirmation de l'adresse e-mail
    return { erreur: null, confirmationRequise: data.session === null }
  }

  async function deconnexion() {
    await supabase?.auth.signOut()
  }

  // Le lien reçu par e-mail ouvre une session temporaire sur /nouveau-mot-de-passe
  async function demanderReinitialisation(email: string) {
    if (!supabase) return SUPABASE_NON_CONFIGURE
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/nouveau-mot-de-passe`,
    })
    return error ? traduireErreur(error.message) : null
  }

  async function changerEmail(email: string) {
    if (!supabase) return SUPABASE_NON_CONFIGURE
    const { error } = await supabase.auth.updateUser(
      { email },
      { emailRedirectTo: `${window.location.origin}/compte` },
    )
    return error ? traduireErreur(error.message) : null
  }

  async function verifierMotDePasse(motDePasse: string) {
    if (!supabase) return SUPABASE_NON_CONFIGURE
    const email = session?.user.email
    if (!email) return 'Aucun utilisateur connecté.'
    const { error } = await supabase.auth.signInWithPassword({ email, password: motDePasse })
    if (error?.message.includes('Invalid login credentials'))
      return 'Mot de passe actuel incorrect.'
    return error ? traduireErreur(error.message) : null
  }

  // Fonctions SQL de supabase/migrations/0012_relecture_securite.sql
  async function supprimerCompte() {
    if (!supabase) return SUPABASE_NON_CONFIGURE
    // Vérifications sans effet de bord (abonnement en cours, membres) avant d'effacer les CV
    const verification = await supabase.rpc('verifier_suppression_compte')
    if (verification.error) return traduireErreur(verification.error.message)
    try {
      // Les fichiers ne sont pas effacés avec l'utilisateur : on supprime d'abord les CV des
      // espaces dont il est propriétaire (supprimés avec lui), jamais ceux d'une autre équipe
      await supprimerTousLesCv()
    } catch (e) {
      return e instanceof Error ? e.message : String(e)
    }
    const { error } = await supabase.rpc('supprimer_mon_compte')
    if (error) return traduireErreur(error.message)
    // Le compte n'existe plus côté serveur : on ne vide que la session locale
    await supabase.auth.signOut({ scope: 'local' })
    return null
  }

  async function changerMotDePasse(motDePasse: string) {
    if (!supabase) return SUPABASE_NON_CONFIGURE
    const { error } = await supabase.auth.updateUser({ password: motDePasse })
    return error ? traduireErreur(error.message) : null
  }

  return (
    <AuthContext.Provider
      value={{
        session,
        user: session?.user ?? null,
        chargement,
        connexion,
        inscription,
        deconnexion,
        demanderReinitialisation,
        changerMotDePasse,
        changerEmail,
        verifierMotDePasse,
        supprimerCompte,
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}

function traduireErreur(message: string) {
  if (message.includes('Invalid login credentials')) return 'E-mail ou mot de passe incorrect.'
  if (message.includes('Email not confirmed'))
    return 'Adresse e-mail non confirmée : cliquez sur le lien reçu par e-mail.'
  if (message.includes('User already registered')) return 'Un compte existe déjà avec cet e-mail.'
  if (message.includes('Password should be at least'))
    return 'Le mot de passe doit contenir au moins 6 caractères.'
  if (message.includes('should be different from the old password'))
    return "Le nouveau mot de passe doit être différent de l'ancien."
  if (message.includes('already been registered'))
    return 'Cette adresse e-mail est déjà utilisée par un autre compte.'
  if (message.startsWith('equipe_non_vide'))
    return 'Retirez d’abord les membres de votre espace (page « Équipe ») avant de supprimer votre compte.'
  if (message.startsWith('abonnement_actif'))
    return 'Résiliez d’abord votre abonnement Pro (bouton « Gérer mon abonnement ») avant de supprimer votre compte.'
  if (message.includes('rate limit') || message.includes('For security purposes'))
    return 'Trop de tentatives : réessayez dans quelques instants.'
  return message
}
