// Contenu des rappels d'entretien (sans dépendance : testé par Vitest dans rappels.test.ts)
import type { Courriel } from '../_shared/courriel.ts'
import { html, ligne } from '../_shared/texte.ts'

// Ligne renvoyée par prendre_entretiens_a_rappeler (supabase/migrations/0018_rappels_entretiens.sql)
export interface EntretienARappeler {
  entretien: string
  debut: string
  duree_minutes: number
  lieu: string | null
  candidature: string
  candidat: string
  offre_titre: string | null
  espace_nom: string
  destinataires: string[]
}

// Jour (AAAA-MM-JJ) d'une date dans le fuseau donné
function jour(date: Date, fuseau: string) {
  return date.toLocaleDateString('en-CA', { timeZone: fuseau })
}

// « aujourd'hui à 15:00 », « demain à 09:30 », sinon « mardi 3 novembre à 15:00 »
export function quand(debut: Date, fuseau: string, maintenant = new Date()) {
  const heure = debut.toLocaleTimeString('fr-FR', {
    timeZone: fuseau,
    hour: '2-digit',
    minute: '2-digit',
  })
  const lendemain = new Date(maintenant.getTime() + 24 * 60 * 60 * 1000)
  if (jour(debut, fuseau) === jour(maintenant, fuseau)) return `aujourd’hui à ${heure}`
  if (jour(debut, fuseau) === jour(lendemain, fuseau)) return `demain à ${heure}`
  const date = debut.toLocaleDateString('fr-FR', {
    timeZone: fuseau,
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  })
  return `${date} à ${heure}`
}

// Un e-mail par destinataire, qui reprend tous ses entretiens (de tous ses espaces), dans l'ordre
export function preparerRappels(
  entretiens: EntretienARappeler[],
  site: string,
  fuseau: string,
  maintenant = new Date(),
): Courriel[] {
  const parDestinataire = new Map<string, EntretienARappeler[]>()
  for (const e of entretiens) {
    for (const destinataire of e.destinataires) {
      parDestinataire.set(destinataire, [...(parDestinataire.get(destinataire) ?? []), e])
    }
  }

  const pied =
    'Pour ne plus recevoir ces rappels : page « Équipe », rubrique « Notifications », dans chaque espace.'
  return [...parDestinataire].map(([to, liste]) => {
    const tries = [...liste].sort((a, b) => a.debut.localeCompare(b.debut))
    const lignes = tries.map((e) => {
      const details = [
        e.offre_titre && ligne(e.offre_titre),
        `${e.duree_minutes} min`,
        e.lieu && `lieu : ${ligne(e.lieu, 200)}`,
        `espace « ${ligne(e.espace_nom)} »`,
      ].filter(Boolean)
      return {
        texte: `${quand(new Date(e.debut), fuseau, maintenant)} : ${ligne(e.candidat)} (${details.join(', ')})`,
        fiche: `${site}/candidatures/${e.candidature}`,
      }
    })
    const premier = tries[0]
    const subject =
      tries.length === 1
        ? `Rappel : entretien avec ${ligne(premier.candidat)} ${quand(new Date(premier.debut), fuseau, maintenant)}`
        : `Rappel : ${tries.length} entretiens à venir`
    const intro =
      tries.length === 1 ? 'Un entretien est prévu :' : `${tries.length} entretiens sont prévus :`
    return {
      to,
      subject,
      text: [intro, ...lignes.map((l) => `- ${l.texte}\n  ${l.fiche}`), pied].join('\n\n'),
      html:
        html([intro]) +
        lignes
          .map((l) => html([l.texte], { texte: 'Voir la candidature', adresse: l.fiche }))
          .join('') +
        html([], undefined, pied),
    }
  })
}
