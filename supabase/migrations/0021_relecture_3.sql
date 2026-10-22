-- Corrections de la troisième relecture (étapes 39 à 41).

-- 1. Réponses aux candidats : la limite d'envois se compte sur des réservations prises au moment
--    de la préparation (sérialisées par espace), et non sur l'historique écrit après l'envoi ;
--    la trace « reponse_envoyee » exige le jeton de la réservation (impossible d'en écrire une
--    fausse en appelant directement noter_reponse_envoyee).
create table prive.envois_reponses (
  jeton uuid primary key default gen_random_uuid(),
  espace_id uuid not null,
  candidature_id uuid not null,
  user_id uuid not null,
  utilise boolean not null default false,
  created_at timestamptz not null default now()
);
create index envois_reponses_espace_idx on prive.envois_reponses (espace_id, created_at);

drop function public.preparer_reponse(uuid);
create function public.preparer_reponse(id_candidature uuid)
returns table (
  email text,
  nom text,
  offre_titre text,
  poste text,
  espace_nom text,
  envoyeur text,
  jeton uuid
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  c record;
  reservation uuid;
begin
  select ca.id, ca.email, ca.nom, ca.poste, ca.espace_id, o.titre, e.nom as espace into c
  from public.candidatures ca
  join public.espaces e on e.id = ca.espace_id
  left join public.offres o on o.id = ca.offre_id
  where ca.id = id_candidature;
  if not found or not public.est_membre(c.espace_id) then
    raise exception 'candidature_inaccessible: candidature introuvable';
  end if;
  if c.email is null then
    raise exception 'sans_email: cette candidature n''a pas d''adresse e-mail';
  end if;

  -- Envois simultanés du même espace : l'un après l'autre, pour que le décompte tienne
  perform 1 from public.espaces where id = c.espace_id for update;
  delete from prive.envois_reponses where created_at < now() - interval '1 day';
  if (select count(*) from prive.envois_reponses r
      where r.espace_id = c.espace_id and r.created_at > now() - interval '1 hour')
      >= prive.limite_reponses() then
    raise exception 'trop_de_reponses: trop d''e-mails envoyés depuis cet espace, réessayez plus tard';
  end if;
  insert into prive.envois_reponses (espace_id, candidature_id, user_id)
    values (c.espace_id, c.id, auth.uid())
    returning envois_reponses.jeton into reservation;

  return query select c.email, c.nom, c.titre, c.poste, c.espace,
    (select u.email::text from auth.users u where u.id = auth.uid()), reservation;
end;
$$;

drop function public.noter_reponse_envoyee(uuid, text, text);
create function public.noter_reponse_envoyee(
  id_candidature uuid,
  reservation uuid,
  sujet text,
  modele text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Réservation de cet utilisateur, pour cette candidature, récente et pas encore utilisée
  update prive.envois_reponses r set utilise = true
  where r.jeton = reservation and r.candidature_id = id_candidature and r.user_id = auth.uid()
    and not r.utilise and r.created_at > now() - interval '15 minutes';
  if not found then
    raise exception 'reservation_invalide: aucun envoi en cours pour cette candidature';
  end if;
  perform prive.journaliser(id_candidature, 'reponse_envoyee',
    jsonb_strip_nulls(jsonb_build_object('sujet', left(sujet, 200), 'modele', left(modele, 60))));
end;
$$;

revoke execute on function public.preparer_reponse(uuid) from public, anon;
revoke execute on function public.noter_reponse_envoyee(uuid, uuid, text, text) from public, anon;
grant execute on function public.preparer_reponse(uuid) to authenticated;
grant execute on function public.noter_reponse_envoyee(uuid, uuid, text, text) to authenticated;

-- 2. Évaluateurs : les notes de comptes supprimés comptent pour un seul évaluateur (même règle
--    que la fiche, src/lib/evaluations.ts)
create or replace function public.moyennes_evaluations()
returns table (candidature_id uuid, moyenne numeric, evaluateurs integer)
language sql
stable
security invoker
set search_path = ''
as $$
  select e.candidature_id, round(avg(e.note), 1),
    (count(distinct e.user_id) + case when bool_or(e.user_id is null) then 1 else 0 end)::integer
  from public.evaluations e
  where e.espace_id = public.espace_actif()
  group by e.candidature_id;
$$;
