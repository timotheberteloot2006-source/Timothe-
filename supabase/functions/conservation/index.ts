// Durée de conservation : supprime chaque jour les candidatures arrivées au terme de la durée
// réglée par leur espace (supabase/migrations/0027_conservation.sql), puis leurs CV du stockage.
// Appelée par une tâche planifiée de la base (npm run planifier:rappels, voir
// docs/MISE_EN_LIGNE.md), avec l'en-tête x-rappels-secret ; à déployer sans vérification de jeton
// Supabase.
import { json, supabaseAdmin } from '../_shared/http.ts'
import { refuserSansSecret } from '../_shared/taches.ts'

// Candidatures supprimées par passage de la base, et passages au plus par appel
const LOT = 200
const PASSAGES_MAX = 10

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json({ erreur: 'Méthode non autorisée.' }, 405)
  const refus = refuserSansSecret(req)
  if (refus) return refus

  const admin = supabaseAdmin()
  let supprimees = 0
  let fichiers = 0
  let echecs = 0
  for (let passage = 0; passage < PASSAGES_MAX; passage++) {
    // Les lignes sont supprimées et notées au registre par la base ; elle rend les chemins des CV
    const { data, error } = await admin.rpc('supprimer_candidatures_expirees', { limite: LOT })
    if (error) return json({ erreur: error.message }, 500)
    const lignes = (data ?? []) as { cv_chemin: string | null }[]
    supprimees += lignes.length
    const chemins = lignes.flatMap((l) => (l.cv_chemin ? [l.cv_chemin] : []))
    if (chemins.length > 0) {
      const { error: erreurStockage } = await admin.storage.from('cv').remove(chemins)
      // Fichiers restés sans candidature : plus rattachés à rien, ils ne sont plus lisibles
      // depuis le site ; signalés dans les journaux de la fonction
      if (erreurStockage) {
        echecs += chemins.length
        console.error('CV non supprimés :', erreurStockage.message, chemins)
      } else fichiers += chemins.length
    }
    // Lot incomplet : il n'en reste plus (le suivant passera demain)
    if (lignes.length < LOT) break
  }
  if (echecs > 0) return json({ erreur: `${echecs} CV non supprimés du stockage.` }, 502)
  return json({ candidatures: supprimees, cv_supprimes: fichiers })
})
