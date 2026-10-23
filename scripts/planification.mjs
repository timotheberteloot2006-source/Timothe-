// Tâches planifiées (pg_cron et pg_net, fournis par Supabase) : rappels d'entretien chaque jour, et
// suppression des candidatures arrivées au terme de leur durée de conservation chaque nuit à 3 h
// UTC. Utilisé par scripts/planifier-rappels.mjs.
import { randomBytes } from 'node:crypto'

// Lettres, chiffres, - et _ : sans caractère qui casserait la requête SQL
export const SECRET_VALIDE = /^[A-Za-z0-9_-]{24,200}$/

export function genererSecret() {
  return randomBytes(32).toString('base64url')
}

// heureUtc : heure de l'envoi en temps universel (16 h = 17 h à Paris en hiver, 18 h en été)
export function sqlPlanification(urlSupabase, secret, heureUtc = 16) {
  if (!SECRET_VALIDE.test(secret)) throw new Error('RAPPELS_SECRET invalide.')
  if (!Number.isInteger(heureUtc) || heureUtc < 0 || heureUtc > 23)
    throw new Error('Heure invalide (0 à 23).')
  const base = `${urlSupabase.replace(/\/$/, '')}/functions/v1`
  if (!/^https:\/\/[^\s'$]+$/.test(base)) throw new Error('Adresse du projet invalide.')
  const appel = (nom, horaire) => `select cron.schedule(
  '${nom}',
  '${horaire}',
  $$
  select net.http_post(
    url := '${base}/${nom}',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-rappels-secret', '${secret}'),
    body := '{}'::jsonb
  );
  $$
);`
  return `-- Tâches planifiées (à exécuter une fois, SQL Editor)
create extension if not exists pg_cron;
create extension if not exists pg_net;

-- Même nom : remplace la tâche si elle existe déjà

-- Rappels d'entretien : chaque jour à ${heureUtc} h UTC
${appel('rappels-entretiens', `0 ${heureUtc} * * *`)}

-- Durée de conservation : chaque nuit à 3 h UTC (sans effet tant qu'aucun espace ne l'a réglée)
${appel('conservation', '0 3 * * *')}

-- Pour vérifier : select * from cron.job; puis, après le premier passage,
-- select * from cron.job_run_details order by start_time desc limit 5;
-- Pour arrêter : select cron.unschedule('rappels-entretiens'); select cron.unschedule('conservation');
`
}
