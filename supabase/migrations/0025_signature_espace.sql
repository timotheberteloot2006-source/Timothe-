-- Rafraîchissement économe : plutôt que de relire toutes les données de la page chaque minute,
-- le site demande d'abord une signature de l'espace actif, qui change dès que quelque chose y
-- est modifié, et ne recharge la page que si elle a changé (src/lib/rafraichissement.ts).
--
-- Les candidatures et tout ce qui s'y rattache (statut, champs, CV, notes, entretiens, étiquettes
-- posées, partages, réponses) laissent une trace dans l'historique : son dernier numéro suffit,
-- avec le nombre de candidatures pour les suppressions (l'historique part avec elles). Les
-- évaluations et les réglages de l'espace (petites tables) sont résumés directement.

-- Dernier numéro d'historique d'un espace : remplace l'index sur espace_id seul (migration 0011),
-- qu'il couvre aussi
drop index public.historique_espace_idx;
create index historique_espace_idx on public.historique (espace_id, id desc);

create function public.signature_espace()
returns text
language sql
stable
security invoker
set search_path = ''
as $$
  with e as (select public.espace_actif() as id)
  select md5(concat_ws('|',
    e.id,
    (select max(h.id) from public.historique h where h.espace_id = e.id),
    (select count(*) from public.candidatures c where c.espace_id = e.id),
    (select count(*) || ':' || coalesce(max(v.updated_at)::text, '')
      from public.evaluations v where v.espace_id = e.id),
    (select count(*) || ':' || coalesce(max(coalesce(p.revoque_le, p.created_at))::text, '')
        || ':' || coalesce(sum(p.consultations), 0)
      from public.partages p where p.espace_id = e.id),
    (select md5(x::text) from public.espaces x where x.id = e.id),
    (select md5(coalesce(string_agg(x::text, ',' order by x.user_id), ''))
      from public.membres x where x.espace_id = e.id),
    (select md5(coalesce(string_agg(x::text, ',' order by x.id), ''))
      from public.invitations x where x.espace_id = e.id),
    (select md5(coalesce(string_agg(x::text, ',' order by x.id), ''))
      from public.offres x where x.espace_id = e.id),
    (select md5(coalesce(string_agg(x::text, ',' order by x.id), ''))
      from public.etapes x where x.espace_id = e.id),
    (select md5(coalesce(string_agg(x::text, ',' order by x.id), ''))
      from public.etiquettes x where x.espace_id = e.id),
    (select md5(coalesce(string_agg(x::text, ',' order by x.id), ''))
      from public.criteres x where x.espace_id = e.id),
    (select md5(coalesce(string_agg(x::text, ',' order by x.id), ''))
      from public.modeles_reponse x where x.espace_id = e.id)
  ))
  from e;
$$;

revoke execute on function public.signature_espace() from public, anon;
grant execute on function public.signature_espace() to authenticated;

create or replace function public.version_schema()
returns integer
language sql
immutable
set search_path = ''
as $$ select 25 $$;
