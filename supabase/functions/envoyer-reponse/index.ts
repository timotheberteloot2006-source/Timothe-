// Envoie au candidat une réponse (modèle de l'espace, retouché ou non) depuis sa fiche, puis la
// note dans l'historique. Appelée par un membre connecté : ses droits s'appliquent (fonctions SQL
// preparer_reponse et noter_reponse_envoyee, supabase/migrations/0021_relecture_3.sql). La
// préparation réserve l'envoi (limite par espace) et donne le jeton qu'exige la trace.
import { courrielsActives, envoyerCourriels } from '../_shared/courriel.ts'
import { clientUtilisateur, corsHeaders, json } from '../_shared/http.ts'
import { corpsHtml, expediteurPour, remplirModele, valeursModele } from '../_shared/modeles.ts'
import { ligne } from '../_shared/texte.ts'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

interface Preparation {
  email: string
  nom: string
  offre_titre: string | null
  poste: string | null
  espace_nom: string
  envoyeur: string | null
  jeton: string
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json({ erreur: 'Méthode non autorisée.' }, 405)

  const demande = (await req.json().catch(() => null)) as {
    candidature?: unknown
    sujet?: unknown
    corps?: unknown
    modele?: unknown
  } | null
  const candidature = String(demande?.candidature ?? '')
  const sujet = String(demande?.sujet ?? '').trim()
  const corps = String(demande?.corps ?? '').trim()
  const modele = typeof demande?.modele === 'string' ? demande.modele : null
  if (!UUID.test(candidature)) return json({ erreur: 'Candidature invalide.' }, 400)
  if (!sujet || sujet.length > 200) return json({ erreur: 'Objet vide ou trop long.' }, 400)
  if (!corps || corps.length > 5000) return json({ erreur: 'Message vide ou trop long.' }, 400)
  if (!courrielsActives())
    return json({ erreur: 'L’envoi d’e-mails n’est pas configuré sur ce site.' }, 503)

  const client = clientUtilisateur(req)
  const { data, error } = await client
    .rpc('preparer_reponse', { id_candidature: candidature })
    .maybeSingle()
  if (error) {
    if (error.message.startsWith('sans_email'))
      return json({ erreur: 'Cette candidature n’a pas d’adresse e-mail.' }, 400)
    if (error.message.startsWith('trop_de_reponses'))
      return json(
        { erreur: 'Trop d’e-mails envoyés depuis cet espace : réessayez dans une heure.' },
        429,
      )
    return json({ erreur: 'Candidature introuvable.' }, 404)
  }
  const c = data as Preparation | null
  if (!c) return json({ erreur: 'Candidature introuvable.' }, 404)

  const valeurs = valeursModele(c)
  const texte = remplirModele(corps, valeurs)
  try {
    await envoyerCourriels([
      {
        to: c.email,
        subject: ligne(remplirModele(sujet, valeurs), 200),
        text: texte,
        html: corpsHtml(texte),
        from: expediteurPour(c.espace_nom, Deno.env.get('EMAIL_EXPEDITEUR') ?? ''),
        // Le candidat répond directement au recruteur
        ...(c.envoyeur && { reply_to: c.envoyeur }),
      },
    ])
  } catch (e) {
    console.error('Réponse non envoyée :', e)
    return json({ erreur: 'L’e-mail n’a pas pu être envoyé : réessayez plus tard.' }, 502)
  }

  const trace = await client.rpc('noter_reponse_envoyee', {
    id_candidature: candidature,
    reservation: c.jeton,
    sujet: ligne(remplirModele(sujet, valeurs), 200),
    modele,
  })
  // L'e-mail est parti : on le dit, même si la trace n'a pas pu être écrite
  if (trace.error) console.error('Réponse non notée :', trace.error.message)
  return json({ envoye: true })
})
