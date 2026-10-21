// Tâche planifiée qui lance les rappels d'entretien chaque jour (pg_cron et pg_net, fournis par
// Supabase). Utilisé par scripts/planifier-rappels.mjs.
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
  const adresse = `${urlSupabase.replace(/\/$/, '')}/functions/v1/rappels-entretiens`
  if (!/^https:\/\/[^\s'$]+$/.test(adresse)) throw new Error('Adresse du projet invalide.')
  return `-- Rappels d'entretien : chaque jour à ${heureUtc} h UTC (à exécuter une fois, SQL Editor)
create extension if not exists pg_cron;
create extension if not exists pg_net;

-- Même nom : remplace la tâche si elle existe déjà
select cron.schedule(
  'rappels-entretiens',
  '0 ${heureUtc} * * *',
  $$
  select net.http_post(
    url := '${adresse}',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-rappels-secret', '${secret}'),
    body := '{}'::jsonb
  );
  $$
);

-- Pour vérifier : select * from cron.job; puis, après le premier passage,
-- select * from cron.job_run_details order by start_time desc limit 5;
-- Pour arrêter : select cron.unschedule('rappels-entretiens');
`
}
