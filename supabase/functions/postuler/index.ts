// Reçoit le formulaire de candidature public d'une offre (page /postuler/<jeton> du site).
// À déployer sans vérification de jeton Supabase : le candidat n'a pas de compte.
// Le dépôt lui-même (offre publiée, limites d'envois, doublons, limite Gratuite) est fait par la
// fonction SQL deposer_candidature_publique (supabase/migrations/0017_relecture_2.sql).
import { envoyerCourriels } from '../_shared/courriel.ts'
import { corsHeaders, json, SITE_URL, supabaseAdmin } from '../_shared/http.ts'
import { preparerCourriels, type Depot } from './courriels.ts'
import { adresseIp, estRobot, lireFormulaire, traduireErreur, verifierCv } from './validation.ts'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json({ erreur: 'Méthode non autorisée.' }, 405)

  let formulaire: FormData
  try {
    formulaire = await req.formData()
  } catch {
    return json({ erreur: 'Formulaire illisible.' }, 400)
  }
  const champs: Record<string, string> = {}
  for (const [cle, valeur] of formulaire.entries()) {
    if (typeof valeur === 'string') champs[cle] = valeur
  }

  // Robot probable : même réponse qu'un succès, rien n'est enregistré
  if (estRobot(champs, Date.now())) return json({ recu: true })

  const lu = lireFormulaire(champs)
  if ('erreur' in lu) return json({ erreur: lu.erreur }, 400)
  const { candidature } = lu

  const fichier = formulaire.get('cv')
  let cv: Uint8Array | null = null
  if (fichier instanceof File && fichier.size > 0) {
    cv = new Uint8Array(await fichier.arrayBuffer())
    const erreurCv = verifierCv(cv)
    if (erreurCv) return json({ erreur: erreurCv }, 400)
  }

  const admin = supabaseAdmin()
  const id = crypto.randomUUID()
  const { data, error } = await admin.rpc('deposer_candidature_publique', {
    code: candidature.jeton,
    empreinte_ip: await empreinte(req),
    id_candidature: id,
    nom_candidat: candidature.nom,
    email_candidat: candidature.email,
    liste_competences: candidature.competences,
    annees_experience: candidature.experience,
  })
  const depot = (data as Depot[] | null)?.[0]
  if (error || !depot) {
    const { erreur, status } = traduireErreur(error?.message ?? '')
    return json({ erreur }, status)
  }

  // CV joint seulement à une candidature créée (refus, ou candidat déjà présent : aucun fichier),
  // rangé comme ceux déposés par l'équipe : <espace_id>/<candidature_id>/<fichier>.pdf. Un échec
  // ici laisse la candidature, sans CV : elle n'est pas perdue.
  if (cv && depot.resultat === 'creee') {
    const chemin = `${depot.espace}/${id}/${crypto.randomUUID()}.pdf`
    const envoi = await admin.storage
      .from('cv')
      .upload(chemin, cv, { contentType: 'application/pdf' })
    const lien = envoi.error
      ? envoi
      : await admin.from('candidatures').update({ cv_chemin: chemin }).eq('id', id)
    if (lien.error) {
      console.error('CV non joint :', lien.error.message)
      if (!envoi.error) await admin.storage.from('cv').remove([chemin])
    }
  }

  // Équipe et accusé de réception : un échec d'envoi ne doit pas faire échouer la candidature
  try {
    await envoyerCourriels(preparerCourriels(depot, candidature, SITE_URL))
  } catch (e) {
    console.error('Notifications non envoyées :', e)
  }
  // Même réponse si le candidat était déjà présent : rien n'indique qui figure dans la base
  return json({ recu: true })
})

// Empreinte de l'adresse IP, non réversible (salée par un secret du projet) : seule cette valeur
// est conservée, une journée au plus, pour limiter les envois répétés
async function empreinte(req: Request) {
  const ip = adresseIp(req.headers)
  const sel = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  const octets = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`${sel}:${ip}`))
  return Array.from(new Uint8Array(octets), (o) => o.toString(16).padStart(2, '0')).join('')
}
