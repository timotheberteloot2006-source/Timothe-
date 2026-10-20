import { SUPABASE_NON_CONFIGURE, supabase } from './supabase'

// Même valeur que file_size_limit dans supabase/migrations/0005_notes_et_cv.sql
export const TAILLE_MAX_CV = 5 * 1024 * 1024

// Durée de validité du lien de consultation d'un CV
const DUREE_LIEN_SECONDES = 60

function client() {
  if (!supabase) throw new Error(SUPABASE_NON_CONFIGURE)
  return supabase
}

function bucket() {
  return client().storage.from('cv')
}

// Renvoie un message d'erreur si le fichier ne peut pas être déposé
export function verifierFichierCv(fichier: File): string | null {
  if (fichier.type !== 'application/pdf') return 'Le CV doit être un fichier PDF.'
  if (fichier.size > TAILLE_MAX_CV) return 'Le CV ne doit pas dépasser 5 Mo.'
  return null
}

// Dépose le PDF sous <espace_id>/<candidature_id>/… (lisible par les membres de l'espace)
// et remplace l'éventuel CV précédent
export async function deposerCv(
  candidature: { id: string; cv_chemin: string | null; espace_id: string },
  fichier: File,
) {
  const erreur = verifierFichierCv(fichier)
  if (erreur) throw new Error(erreur)

  // Nom unique : évite qu'un ancien fichier reste en cache sous le même nom
  const chemin = `${candidature.espace_id}/${candidature.id}/${crypto.randomUUID()}.pdf`
  const depot = await bucket().upload(chemin, fichier, { contentType: 'application/pdf' })
  if (depot.error) throw new Error(`Dépôt du CV impossible : ${depot.error.message}`)

  const { error } = await client()
    .from('candidatures')
    .update({ cv_chemin: chemin })
    .eq('id', candidature.id)
  if (error) {
    await supprimerFichiersCv([chemin])
    throw new Error(error.message)
  }
  if (candidature.cv_chemin) await supprimerFichiersCv([candidature.cv_chemin])
}

export async function retirerCv(candidature: { id: string; cv_chemin: string | null }) {
  if (!candidature.cv_chemin) return
  const { error } = await client()
    .from('candidatures')
    .update({ cv_chemin: null })
    .eq('id', candidature.id)
  if (error) throw new Error(error.message)
  await supprimerFichiersCv([candidature.cv_chemin])
}

// Ouvre le CV dans un nouvel onglet grâce à un lien temporaire signé
export async function ouvrirCv(chemin: string) {
  // L'onglet est ouvert tout de suite (sinon le navigateur bloque la fenêtre surgissante)
  const onglet = window.open('', '_blank')
  const { data, error } = await bucket().createSignedUrl(chemin, DUREE_LIEN_SECONDES)
  if (error || !data) {
    onglet?.close()
    throw new Error(`Ouverture du CV impossible : ${error?.message ?? 'lien manquant'}`)
  }
  if (onglet) onglet.location.href = data.signedUrl
  else window.location.assign(data.signedUrl)
}

export async function supprimerFichiersCv(chemins: string[]) {
  if (chemins.length === 0) return
  const { error } = await bucket().remove(chemins)
  if (error) throw new Error(`Suppression du CV impossible : ${error.message}`)
}

// Avant la suppression du compte : les fichiers ne sont pas effacés avec l'utilisateur.
// Porte sur l'espace actif : l'appelant choisit d'abord l'espace personnel.
export async function supprimerTousLesCv() {
  const { data, error } = await client()
    .from('candidatures')
    .select('cv_chemin')
    .not('cv_chemin', 'is', null)
  if (error) throw new Error(error.message)
  await supprimerFichiersCv(data.map((c) => c.cv_chemin as string))
}
