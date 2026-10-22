// Envoi d'e-mails par Resend (https://resend.com), par simple appel HTTP.
// Facultatif : sans RESEND_API_KEY ni EMAIL_EXPEDITEUR, aucun e-mail n'est envoyé.

export interface Courriel {
  to: string
  subject: string
  text: string
  html: string
  // Expéditeur affiché (sinon EMAIL_EXPEDITEUR) et adresse de réponse
  from?: string
  reply_to?: string
}

// Envoi possible : clé et expéditeur configurés
export function courrielsActives() {
  return !!Deno.env.get('RESEND_API_KEY') && !!Deno.env.get('EMAIL_EXPEDITEUR')
}

// L'API d'envoi groupé accepte 100 e-mails par appel
const TAILLE_LOT = 100

// Échec d'envoi : envoyes indique combien d'e-mails étaient déjà partis (lots précédents)
export class EnvoiInterrompu extends Error {
  constructor(
    message: string,
    readonly envoyes: number,
  ) {
    super(message)
  }
}

// Renvoie false si l'envoi est désactivé ; lève EnvoiInterrompu si Resend refuse ou ne répond pas
export async function envoyerCourriels(courriels: Courriel[]): Promise<boolean> {
  const cle = Deno.env.get('RESEND_API_KEY')
  const expediteur = Deno.env.get('EMAIL_EXPEDITEUR')
  if (!cle || !expediteur) return false
  for (let debut = 0; debut < courriels.length; debut += TAILLE_LOT) {
    const reponse = await fetch('https://api.resend.com/emails/batch', {
      method: 'POST',
      headers: { Authorization: `Bearer ${cle}`, 'Content-Type': 'application/json' },
      // Le candidat attend la réponse du formulaire : on n'attend pas Resend indéfiniment
      signal: AbortSignal.timeout(10_000),
      body: JSON.stringify(
        courriels.slice(debut, debut + TAILLE_LOT).map((c) => ({ from: expediteur, ...c })),
      ),
    }).catch((e) => {
      throw new EnvoiInterrompu(`Resend injoignable : ${e instanceof Error ? e.message : e}`, debut)
    })
    if (!reponse.ok)
      throw new EnvoiInterrompu(`Resend : ${reponse.status} ${await reponse.text()}`, debut)
  }
  return true
}
