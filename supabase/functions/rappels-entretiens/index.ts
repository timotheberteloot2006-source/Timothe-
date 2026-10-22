// Envoie les rappels d'entretien de la veille. Appelée chaque jour par une tâche planifiée de la
// base (npm run planifier:rappels, voir docs/MISE_EN_LIGNE.md), avec l'en-tête
// x-rappels-secret ; à déployer sans vérification de jeton Supabase.
import { EnvoiInterrompu, envoyerCourriels } from '../_shared/courriel.ts'
import { json, SITE_URL, supabaseAdmin } from '../_shared/http.ts'
import { preparerRappels, type EntretienARappeler } from './rappels.ts'

// Heure affichée dans les rappels
const FUSEAU = Deno.env.get('FUSEAU_HORAIRE') ?? 'Europe/Paris'

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json({ erreur: 'Méthode non autorisée.' }, 405)
  const secret = Deno.env.get('RAPPELS_SECRET') ?? ''
  // Valeur d'exemple (« ... ») ou trop courte : facile à deviner, la fonction reste fermée
  if (secret.length < 24) return json({ erreur: 'RAPPELS_SECRET non configuré.' }, 500)
  if (!egaux(req.headers.get('x-rappels-secret') ?? '', secret))
    return json({ erreur: 'Accès refusé.' }, 401)

  const admin = supabaseAdmin()
  // Entretiens des 30 prochaines heures, marqués « rappelés » par la même opération
  const { data, error } = await admin.rpc('prendre_entretiens_a_rappeler', { dans_les_heures: 30 })
  if (error) return json({ erreur: error.message }, 500)
  const entretiens = (data ?? []) as EntretienARappeler[]
  if (entretiens.length === 0) return json({ entretiens: 0, courriels: 0 })

  const courriels = preparerRappels(entretiens, SITE_URL, FUSEAU)
  let partis = 0
  try {
    if (await envoyerCourriels(courriels)) partis = courriels.length
  } catch (e) {
    partis = e instanceof EnvoiInterrompu ? e.envoyes : 0
    console.error('Rappels non envoyés :', e)
  }
  if (partis === courriels.length) return json({ entretiens: entretiens.length, courriels: partis })

  if (partis > 0) {
    // Envoi interrompu en cours de route : les rappels restent marqués, pour ne pas renvoyer
    // deux fois ceux qui sont partis (quelques destinataires n'auront pas le leur)
    return json({ erreur: `Rappels envoyés en partie (${partis} sur ${courriels.length}).` }, 502)
  }
  // Rien n'est parti (e-mails désactivés ou refusés) : rappels rendus, retentés la fois suivante
  const rendus = await admin.rpc('rendre_entretiens_a_rappeler', {
    ids: entretiens.map((e) => e.entretien),
  })
  if (rendus.error) {
    console.error('Rappels non rendus :', rendus.error.message)
    return json(
      {
        erreur:
          'Rappels non envoyés, et restés marqués comme envoyés : ils ne seront pas retentés.',
      },
      500,
    )
  }
  return json({ erreur: 'Rappels non envoyés (e-mails désactivés ou refusés).' }, 503)
})

// Comparaison en temps constant : la durée ne renseigne pas sur la longueur du préfixe juste
function egaux(a: string, b: string) {
  const [x, y] = [new TextEncoder().encode(a), new TextEncoder().encode(b)]
  let difference = x.length ^ y.length
  for (let i = 0; i < Math.max(x.length, y.length); i++) difference |= (x[i] ?? 0) ^ (y[i] ?? 0)
  return difference === 0
}
