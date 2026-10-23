-- Rappels d'entretien par e-mail, la veille : la fonction supabase/functions/rappels-entretiens,
-- lancée chaque jour par une tâche planifiée (docs/MISE_EN_LIGNE.md), envoie à chaque membre qui
-- le souhaite la liste des entretiens à venir de ses espaces.

-- Chaque membre choisit d'être rappelé ou non (comme pour les nouvelles candidatures)
alter table public.membres add column rappels boolean not null default true;

-- Rappel déjà envoyé ; remis à zéro si l'entretien est déplacé
alter table public.entretiens add column rappel_envoye_le timestamptz;
create index entretiens_a_rappeler_idx on public.entretiens (debut) where rappel_envoye_le is null;

create function prive.oublier_rappel()
returns trigger
language plpgsql
as $$
begin
  if new.debut is distinct from old.debut then
    new.rappel_envoye_le := null;
  end if;
  return new;
end;
$$;

revoke execute on function prive.oublier_rappel() from public, anon, authenticated;

create trigger entretiens_oublier_rappel before update of debut on public.entretiens
  for each row execute function prive.oublier_rappel();

-- Réglages : ajout du rappel d'entretien (null : inchangé)
drop function public.mes_notifications();
create function public.mes_notifications()
returns table (notifier boolean, rappels boolean, accuse_reception boolean, proprietaire boolean)
language sql
stable
security definer
set search_path = ''
as $$
  select m.notifier, m.rappels, e.accuse_reception, m.role = 'proprietaire'
  from public.membres m
  join public.espaces e on e.id = m.espace_id
  where m.espace_id = public.espace_actif() and m.user_id = auth.uid();
$$;

drop function public.regler_notifications(boolean, boolean);
create function public.regler_notifications(
  pour_moi boolean default null,
  accuse boolean default null,
  rappels boolean default null
)
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
  update public.membres m set
    notifier = coalesce(pour_moi, m.notifier),
    rappels = coalesce(regler_notifications.rappels, m.rappels)
  where m.espace_id = eid and m.user_id = auth.uid();
  if accuse is not null then
    update public.espaces set accuse_reception = accuse where id = eid;
  end if;
end;
$$;

revoke execute on function public.mes_notifications() from public, anon;
grant execute on function public.mes_notifications() to authenticated;
revoke execute on function public.regler_notifications(boolean, boolean, boolean) from public, anon;
grant execute on function public.regler_notifications(boolean, boolean, boolean) to authenticated;

-- Entretiens qui commencent dans les prochaines heures et n'ont pas encore été rappelés, marqués
-- comme rappelés dans la même opération (deux exécutions simultanées ne rappellent pas deux
-- fois). destinataires : membres de l'espace qui veulent les rappels. Réservée à la fonction
-- serveur.
create function public.prendre_entretiens_a_rappeler(dans_les_heures integer default 30)
returns table (
  entretien uuid,
  debut timestamptz,
  duree_minutes integer,
  lieu text,
  candidature uuid,
  candidat text,
  offre_titre text,
  espace_nom text,
  destinataires text[]
)
language sql
security definer
set search_path = ''
as $$
  with pris as (
    update public.entretiens en set rappel_envoye_le = now()
    where en.id in (
      select e.id from public.entretiens e
      where e.rappel_envoye_le is null
        and e.debut > now()
        and e.debut <= now() + make_interval(hours => dans_les_heures)
      for update skip locked
    )
    returning en.id, en.debut, en.duree_minutes, en.lieu, en.candidature_id, en.espace_id
  )
  select p.id, p.debut, p.duree_minutes, p.lieu, c.id, c.nom, o.titre, es.nom,
    coalesce(
      (select array_agg(m.email order by m.created_at) from public.membres m
       where m.espace_id = p.espace_id and m.rappels and m.email is not null),
      '{}')
  from pris p
  join public.candidatures c on c.id = p.candidature_id
  join public.espaces es on es.id = p.espace_id
  left join public.offres o on o.id = c.offre_id
  order by p.debut;
$$;

-- Envoi échoué : les rappels seront retentés à l'exécution suivante
create function public.rendre_entretiens_a_rappeler(ids uuid[])
returns void
language sql
security definer
set search_path = ''
as $$
  update public.entretiens set rappel_envoye_le = null where id = any(ids);
$$;

revoke execute on function public.prendre_entretiens_a_rappeler(integer) from public, anon, authenticated;
revoke execute on function public.rendre_entretiens_a_rappeler(uuid[]) from public, anon, authenticated;
grant execute on function public.prendre_entretiens_a_rappeler(integer) to service_role;
grant execute on function public.rendre_entretiens_a_rappeler(uuid[]) to service_role;
