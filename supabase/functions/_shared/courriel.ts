// Envoi d'e-mails par Resend (https://resend.com), par simple appel HTTP.
// Facultatif : sans RESEND_API_KEY ni EMAIL_EXPEDITEUR, aucun e-mail n'est envoyé.

export interface Courriel {
  to: string
  subject: string
  text: string
  html: string
}

// L'API d'envoi groupé accepte 100 e-mails par appel
const TAILLE_LOT = 100

// Renvoie false si l'envoi est désactivé ; lève une erreur si Resend refuse
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
    })
    if (!reponse.ok) throw new Error(`Resend : ${reponse.status} ${await reponse.text()}`)
  }
  return true
}
