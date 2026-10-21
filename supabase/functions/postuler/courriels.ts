// E-mails envoyés à la réception d'une candidature par le formulaire public (sans dépendance :
// testé par Vitest dans courriels.test.ts)
import type { Courriel } from '../_shared/courriel.ts'

// Ligne renvoyée par deposer_candidature_publique (supabase/migrations/0017_relecture_2.sql)
export interface Depot {
  resultat: 'creee' | 'deja_recue'
  candidature: string
  espace: string
  offre_titre: string
  espace_nom: string
  accuse_reception: boolean
  destinataires: string[]
}

// Texte saisi par le candidat : sur une ligne, d'une longueur raisonnable
function ligne(texte: string, longueur = 100) {
  const propre = texte.replace(/\s+/g, ' ').trim()
  return propre.length > longueur ? `${propre.slice(0, longueur - 1)}…` : propre
}

function echapper(texte: string) {
  return texte.replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!,
  )
}

// Corps HTML minimal : paragraphes, lien éventuel, puis mention de bas de page
function html(paragraphes: string[], lien?: { texte: string; adresse: string }, pied?: string) {
  const p = (texte: string) => `<p>${echapper(texte)}</p>`
  const bouton = lien
    ? `<p><a href="${echapper(lien.adresse)}">${echapper(lien.texte)}</a></p>`
    : ''
  const bas = pied ? `<p style="color:#64748b;font-size:12px">${echapper(pied)}</p>` : ''
  return `<div style="font-family:sans-serif;line-height:1.5">${paragraphes.map(p).join('')}${bouton}${bas}</div>`
}

export function preparerCourriels(
  depot: Depot,
  candidat: { nom: string; email: string },
  site: string,
): Courriel[] {
  const courriels: Courriel[] = []
  const nom = ligne(candidat.nom)
  const fiche = `${site}/candidatures/${depot.candidature}`

  // Équipe : une candidature nouvelle, ou un nouvel envoi d'un candidat déjà présent
  const sujet =
    depot.resultat === 'creee'
      ? `Nouvelle candidature : ${nom} (${depot.offre_titre})`
      : `${nom} a postulé à nouveau (${depot.offre_titre})`
  const paragraphes = [
    depot.resultat === 'creee'
      ? `${nom} a postulé au poste « ${depot.offre_titre} » depuis le formulaire en ligne.`
      : `${nom}, déjà présent dans vos candidatures, a postulé au poste « ${depot.offre_titre} ».`,
    `Espace : ${depot.espace_nom}.`,
  ]
  const pied = 'Pour ne plus recevoir ces e-mails : page « Équipe », rubrique « Notifications ».'
  for (const to of depot.destinataires) {
    courriels.push({
      to,
      subject: sujet,
      text: `${paragraphes.join('\n\n')}\n\nVoir la candidature : ${fiche}\n\n${pied}`,
      html: html(paragraphes, { texte: 'Voir la candidature', adresse: fiche }, pied),
    })
  }

  // Candidat : même accusé de réception qu'il soit nouveau ou déjà présent (rien n'indique qui
  // figure dans la base), sans reprendre ce qu'il a saisi (le formulaire ne doit pas permettre
  // d'envoyer un texte libre à n'importe quelle adresse)
  if (depot.accuse_reception) {
    const message = [
      'Bonjour,',
      `Votre candidature au poste « ${depot.offre_titre} » a bien été transmise à ${depot.espace_nom}. L’équipe de recrutement reviendra vers vous si votre profil correspond.`,
      'Ce message est envoyé automatiquement : merci de ne pas y répondre.',
    ]
    courriels.push({
      to: candidat.email,
      subject: `Candidature reçue : ${depot.offre_titre}`,
      text: message.join('\n\n'),
      html: html(message),
    })
  }
  return courriels
}
