// Reçoit le formulaire de candidature public d'une offre (page /postuler/<jeton> du site).
// À déployer sans vérification de jeton Supabase : le candidat n'a pas de compte.
// Le dépôt lui-même (offre publiée, limite d'envois, doublons, limite Gratuite) est fait par la
// fonction SQL deposer_candidature_publique (supabase/migrations/0013_formulaire_public.sql).
import { corsHeaders, json, supabaseAdmin } from '../_shared/http.ts'
import { estRobot, lireFormulaire, traduireErreur, verifierCv } from './validation.ts'

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
  const { data: offre } = await admin
    .from('offres')
    .select('espace_id')
    .eq('jeton_public', candidature.jeton)
    .eq('publique', true)
    .maybeSingle()
  if (!offre) {
    const { erreur, status } = traduireErreur('offre_fermee')
    return json({ erreur }, status)
  }

  // CV rangé comme ceux déposés par l'équipe : <espace_id>/<candidature_id>/<fichier>.pdf
  const id = crypto.randomUUID()
  const chemin = cv ? `${offre.espace_id}/${id}/${crypto.randomUUID()}.pdf` : null
  if (cv && chemin) {
    const depot = await admin.storage
      .from('cv')
      .upload(chemin, cv, { contentType: 'application/pdf' })
    if (depot.error) return json({ erreur: traduireErreur(depot.error.message).erreur }, 500)
  }

  const { data: resultat, error } = await admin.rpc('deposer_candidature_publique', {
    code: candidature.jeton,
    empreinte_ip: await empreinte(req),
    id_candidature: id,
    nom_candidat: candidature.nom,
    email_candidat: candidature.email,
    liste_competences: candidature.competences,
    annees_experience: candidature.experience,
    chemin_cv: chemin,
  })
  // CV inutile si la candidature n'a pas été créée (refus, ou candidat déjà présent)
  if (chemin && (error || resultat !== 'creee')) await admin.storage.from('cv').remove([chemin])
  if (error) {
    const { erreur, status } = traduireErreur(error.message)
    return json({ erreur }, status)
  }
  // Même réponse si le candidat était déjà présent : rien n'indique qui figure dans la base
  return json({ recu: true })
})

// Empreinte de l'adresse IP, non réversible (salée par un secret du projet) : seule cette valeur
// est conservée, une journée au plus, pour limiter les envois répétés
async function empreinte(req: Request) {
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0].trim() ?? 'inconnue'
  const sel = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  const octets = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`${sel}:${ip}`))
  return Array.from(new Uint8Array(octets), (o) => o.toString(16).padStart(2, '0')).join('')
}
