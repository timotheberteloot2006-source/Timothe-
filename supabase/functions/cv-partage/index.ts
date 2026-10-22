// Ouvre le CV d'une candidature partagée (page /partage/<jeton> du site) : renvoie un lien signé
// de 60 secondes. À déployer sans vérification de jeton Supabase : le visiteur n'a pas de compte.
// Seul un partage valable (ni révoqué ni expiré) qui inclut le CV donne un lien
// (fonction SQL cv_du_partage, supabase/migrations/0023_partages.sql).
import { corsHeaders, json, supabaseAdmin } from '../_shared/http.ts'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json({ erreur: 'Méthode non autorisée.' }, 405)

  const { jeton } = await req.json().catch(() => ({}))
  if (typeof jeton !== 'string' || !UUID.test(jeton))
    return json({ erreur: 'Lien de partage invalide.' }, 400)

  const admin = supabaseAdmin()
  const { data: chemin, error } = await admin.rpc('cv_du_partage', { code: jeton })
  if (error) return json({ erreur: 'Le CV ne peut pas être ouvert pour le moment.' }, 500)
  if (typeof chemin !== 'string' || !chemin)
    return json({ erreur: 'Ce partage n’inclut pas de CV, ou il a expiré.' }, 404)

  const { data, error: erreurLien } = await admin.storage.from('cv').createSignedUrl(chemin, 60)
  if (erreurLien || !data)
    return json({ erreur: 'Le CV ne peut pas être ouvert pour le moment.' }, 500)
  return json({ url: data.signedUrl })
})
