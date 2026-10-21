-- Notifications par e-mail des candidatures reçues par le formulaire public : l'équipe est
-- prévenue (chaque membre peut s'en dispenser), le candidat reçoit un accusé de réception (que le
-- propriétaire peut désactiver). Les e-mails sont envoyés par supabase/functions/postuler.

alter table public.membres add column notifier boolean not null default true;
alter table public.espaces add column accuse_reception boolean not null default true;

-- Réglages de l'espace actif, pour l'utilisateur connecté
create function public.mes_notifications()
returns table (notifier boolean, accuse_reception boolean, proprietaire boolean)
language sql
stable
security definer
set search_path = ''
as $$
  select m.notifier, e.accuse_reception, m.role = 'proprietaire'
  from public.membres m
  join public.espaces e on e.id = m.espace_id
  where m.espace_id = public.espace_actif() and m.user_id = auth.uid();
$$;

-- pour_moi : être prévenu soi-même ; accuse : accusé de réception aux candidats (propriétaire
-- seulement, null pour ne pas le changer)
create function public.regler_notifications(pour_moi boolean, accuse boolean default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  eid uuid := public.espace_actif();
begin
  if eid is null or not public.est_membre(eid) then
    raise exception 'espace_inaccessible: vous n''êtes pas membre de cet espace';
  end if;
  if accuse is not null and not public.est_proprietaire(eid) then
    raise exception 'reserve_proprietaire: seul le propriétaire règle l''accusé de réception';
  end if;
  update public.membres set notifier = pour_moi where espace_id = eid and user_id = auth.uid();
  if accuse is not null then
    update public.espaces set accuse_reception = accuse where id = eid;
  end if;
end;
$$;

revoke execute on function public.mes_notifications() from public, anon;
revoke execute on function public.regler_notifications(boolean, boolean) from public, anon;
grant execute on function public.mes_notifications() to authenticated;
grant execute on function public.regler_notifications(boolean, boolean) to authenticated;

-- Le dépôt renvoie aussi de quoi prévenir : candidature créée ou existante, noms de l'offre et
-- de l'espace, accusé de réception, e-mails des membres qui veulent être prévenus
drop function public.deposer_candidature_publique(uuid, text, uuid, text, text, text[], integer, text);

create function public.deposer_candidature_publique(
  code uuid,
  empreinte_ip text,
  id_candidature uuid,
  nom_candidat text,
  email_candidat text,
  liste_competences text[],
  annees_experience integer,
  chemin_cv text
)
returns table (
  resultat text,
  candidature uuid,
  offre_titre text,
  espace_nom text,
  accuse_reception boolean,
  destinataires text[]
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  offre record;
  existante uuid;
begin
  select o.id, o.espace_id, o.titre, e.nom, e.accuse_reception as accuse into offre
  from public.offres o
  join public.espaces e on e.id = o.espace_id
  where o.jeton_public = code and o.publique;
  if not found then
    raise exception 'offre_fermee: cette offre n''accepte pas de candidatures';
  end if;

  delete from prive.envois_formulaire where created_at < now() - interval '1 day';
  if (select count(*) from prive.envois_formulaire e
      where e.empreinte = empreinte_ip and e.created_at > now() - interval '1 hour')
      >= prive.limite_envois() then
    raise exception 'trop_de_candidatures: trop d''envois depuis cette connexion';
  end if;
  insert into prive.envois_formulaire (empreinte) values (empreinte_ip);

  select c.id into existante from public.candidatures c
  where c.espace_id = offre.espace_id and lower(c.email) = lower(email_candidat);
  if existante is not null then
    perform prive.journaliser(existante, 'nouvelle_postulation',
      jsonb_build_object('offre', offre.titre));
    resultat := 'deja_recue';
    candidature := existante;
  else
    -- Limite Gratuite et historique (« reception ») : par les déclencheurs habituels
    insert into public.candidatures
      (id, user_id, espace_id, offre_id, nom, email, competences, experience, cv_chemin, source)
    values (
      id_candidature, null, offre.espace_id, offre.id, trim(nom_candidat), trim(email_candidat),
      liste_competences, annees_experience, chemin_cv, 'formulaire'
    );
    resultat := 'creee';
    candidature := id_candidature;
  end if;

  offre_titre := offre.titre;
  espace_nom := offre.nom;
  accuse_reception := offre.accuse;
  destinataires := coalesce(
    (select array_agg(m.email order by m.created_at) from public.membres m
     where m.espace_id = offre.espace_id and m.notifier and m.email is not null),
    '{}');
  return next;
end;
$$;

revoke execute on function public.deposer_candidature_publique(uuid, text, uuid, text, text, text[], integer, text)
  from public, anon, authenticated;
grant execute on function public.deposer_candidature_publique(uuid, text, uuid, text, text, text[], integer, text)
  to service_role;
