-- Durée de conservation (RGPD) : le propriétaire d'un espace règle une durée (6 à 60 mois) au-delà
-- de laquelle une candidature sans activité est supprimée automatiquement, CV compris. Les membres
-- voient 30 jours à l'avance celles qui vont l'être ; toute activité (modification, note,
-- entretien, changement d'étape…) repart de zéro. Chaque suppression est notée au registre des
-- demandes RGPD, sans donnée du candidat. La suppression elle-même est faite chaque jour par la
-- fonction serveur conservation (fichiers des CV compris), lancée par une tâche planifiée.

-- null : pas de suppression automatique (réglage par défaut)
alter table public.espaces add column conservation_mois integer
  check (conservation_mois between 6 and 60);

-- Dernière activité d'une candidature : sa réception ou la dernière action de son historique
create function prive.derniere_activite(c public.candidatures)
returns timestamptz
language sql
stable
security definer
set search_path = ''
as $$
  select greatest(c.created_at,
    (select max(h.created_at) from public.historique h where h.candidature_id = c.id));
$$;

revoke execute on function prive.derniere_activite(public.candidatures) from public, anon, authenticated;

-- Candidatures de l'espace actif qui seront supprimées dans les 30 jours (ou aussitôt), la plus
-- proche d'abord ; vide quand la durée n'est pas réglée
create function public.candidatures_a_expirer()
returns table (id uuid, nom text, expire_le timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select c.id, c.nom, prive.derniere_activite(c) + make_interval(months => e.conservation_mois)
  from public.candidatures c
  join public.espaces e on e.id = c.espace_id
  where c.espace_id = public.espace_actif()
    and e.conservation_mois is not null
    and prive.derniere_activite(c) + make_interval(months => e.conservation_mois)
      < now() + interval '30 days'
  order by 3, c.nom;
$$;

revoke execute on function public.candidatures_a_expirer() from public, anon;
grant execute on function public.candidatures_a_expirer() to authenticated;

-- Registre : suppression automatique au terme de la durée de conservation
alter table public.demandes_rgpd drop constraint demandes_rgpd_action_check;
alter table public.demandes_rgpd add constraint demandes_rgpd_action_check
  check (action in ('acces', 'effacement', 'expiration'));

-- Supprime (au plus « limite » à la fois) les candidatures arrivées au terme de leur durée de
-- conservation, note chaque suppression au registre de son espace, et renvoie une ligne par
-- candidature supprimée avec le chemin de son CV à effacer du stockage (null sans CV).
-- Réservée à la fonction serveur conservation.
create function public.supprimer_candidatures_expirees(limite integer default 200)
returns table (cv_chemin text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  supprimees record;
begin
  for supprimees in
    with expirees as (
      select c.id
      from public.candidatures c
      join public.espaces e on e.id = c.espace_id
      where e.conservation_mois is not null
        and prive.derniere_activite(c) + make_interval(months => e.conservation_mois) <= now()
      order by c.created_at
      limit greatest(1, least(limite, 1000))
      for update of c skip locked
    )
    delete from public.candidatures c using expirees
    where c.id = expirees.id
    returning c.espace_id, c.cv_chemin
  loop
    insert into public.demandes_rgpd (espace_id, action) values (supprimees.espace_id, 'expiration');
    -- Une ligne par candidature supprimée (chemin null : pas de CV), pour compter les lots
    cv_chemin := supprimees.cv_chemin;
    return next;
  end loop;
end;
$$;

revoke execute on function public.supprimer_candidatures_expirees(integer) from public, anon, authenticated;
grant execute on function public.supprimer_candidatures_expirees(integer) to service_role;

create or replace function public.version_schema()
returns integer
language sql
immutable
set search_path = ''
as $$ select 27 $$;
