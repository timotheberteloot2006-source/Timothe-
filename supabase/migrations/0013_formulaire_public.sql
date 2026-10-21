-- Formulaire de candidature public, par offre : les candidats postulent eux-mêmes depuis un lien
-- secret. L'envoi passe par la fonction supabase/functions/postuler (clé service_role), seule
-- autorisée à appeler deposer_candidature_publique ; un visiteur ne peut que lire l'offre publiée.

alter table public.offres
  add column description text check (description is null or length(description) <= 5000),
  add column publique boolean not null default false,
  -- Lien difficile à deviner ; le régénérer désactive l'ancien
  add column jeton_public uuid not null unique default gen_random_uuid();

-- Candidature déposée par le candidat lui-même
alter table public.candidatures
  add column source text check (source in ('formulaire'));

alter table public.historique drop constraint historique_action_check;
alter table public.historique add constraint historique_action_check check (action in (
  'creation', 'statut', 'modification', 'cv_ajoute', 'cv_remplace', 'cv_retire',
  'note_ajoutee', 'note_supprimee', 'entretien_planifie', 'entretien_supprime',
  -- Reçue par le formulaire ; nouvel envoi d'un candidat déjà présent dans l'espace
  'reception', 'nouvelle_postulation'
));

-- Envois récents par connexion (empreinte non réversible de l'adresse IP), contre le spam
create table prive.envois_formulaire (
  empreinte text not null,
  created_at timestamptz not null default now()
);
create index envois_formulaire_idx on prive.envois_formulaire (empreinte, created_at);

-- Envois acceptés par connexion et par heure
create function prive.limite_envois() returns integer language sql immutable as $$ select 5 $$;

-- Offre publiée, lisible sans compte. ouverte : faux si l'espace a atteint la limite Gratuite
-- (le formulaire l'indique au lieu d'échouer à l'envoi)
create function public.lire_offre_publique(code uuid)
returns table (titre text, description text, espace_nom text, ouverte boolean)
language sql
stable
security definer
set search_path = ''
as $$
  select o.titre, o.description, e.nom,
    public.est_pro_espace(o.espace_id)
      or (select count(*) from public.candidatures c where c.espace_id = o.espace_id) < 50
  from public.offres o
  join public.espaces e on e.id = o.espace_id
  where o.jeton_public = code and o.publique;
$$;

-- Dépôt d'une candidature : renvoie 'creee', ou 'deja_recue' si l'e-mail est déjà dans l'espace
-- (l'envoi est alors noté dans l'historique de la candidature existante, sans rien écraser)
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
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  offre record;
  existante uuid;
begin
  select o.id, o.espace_id, o.titre into offre
  from public.offres o where o.jeton_public = code and o.publique;
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
    return 'deja_recue';
  end if;

  -- Limite Gratuite et historique (« reception ») : par les déclencheurs habituels
  insert into public.candidatures
    (id, user_id, espace_id, offre_id, nom, email, competences, experience, cv_chemin, source)
  values (
    id_candidature, null, offre.espace_id, offre.id, trim(nom_candidat), trim(email_candidat),
    liste_competences, annees_experience, chemin_cv, 'formulaire'
  );
  return 'creee';
end;
$$;

revoke execute on function prive.limite_envois() from public, anon, authenticated;
revoke execute on function public.lire_offre_publique(uuid) from public;
grant execute on function public.lire_offre_publique(uuid) to anon, authenticated;
revoke execute on function public.deposer_candidature_publique(uuid, text, uuid, text, text, text[], integer, text)
  from public, anon, authenticated;
grant execute on function public.deposer_candidature_publique(uuid, text, uuid, text, text, text[], integer, text)
  to service_role;

-- Historique : une candidature reçue par le formulaire est notée « reception »
create or replace function public.historique_candidature()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  champs text[] := '{}';
begin
  if tg_op = 'INSERT' then
    perform prive.journaliser(new.id,
      case when new.source = 'formulaire' then 'reception' else 'creation' end);
    return null;
  end if;

  if new.offre_id is null and old.offre_id is not null
    and not exists (select 1 from public.offres where id = old.offre_id)
    and (to_jsonb(new) - 'offre_id') = (to_jsonb(old) - 'offre_id') then
    return null;
  end if;

  if new.statut is distinct from old.statut then
    perform prive.journaliser(new.id, 'statut',
      jsonb_build_object('avant', old.statut, 'apres', new.statut));
  end if;

  if new.cv_chemin is distinct from old.cv_chemin then
    perform prive.journaliser(new.id,
      case
        when old.cv_chemin is null then 'cv_ajoute'
        when new.cv_chemin is null then 'cv_retire'
        else 'cv_remplace'
      end);
  end if;

  if new.nom is distinct from old.nom then champs := array_append(champs, 'nom'); end if;
  if new.email is distinct from old.email then champs := array_append(champs, 'email'); end if;
  if new.poste is distinct from old.poste then champs := array_append(champs, 'poste'); end if;
  if new.competences is distinct from old.competences then champs := array_append(champs, 'competences'); end if;
  if new.experience is distinct from old.experience then champs := array_append(champs, 'experience'); end if;
  if new.offre_id is distinct from old.offre_id then champs := array_append(champs, 'offre'); end if;
  if cardinality(champs) > 0 then
    perform prive.journaliser(new.id, 'modification', jsonb_build_object('champs', champs));
  end if;
  return null;
end;
$$;
