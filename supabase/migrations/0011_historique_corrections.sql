-- Corrections de l'historique (relecture de l'étape 30).

-- Actions sans utilisateur connecté (traitement serveur) : distinguées d'un compte supprimé
alter table public.historique add column par_systeme boolean not null default false;
update public.historique set par_systeme = true where user_id is null and email is null;
-- Comptes déjà supprimés avant cette migration : leur e-mail n'a plus à figurer dans l'historique
update public.historique set email = null where user_id is null and email is not null;

-- Index des clés étrangères : suppressions en cascade (espace, compte) sans parcourir la table
create index historique_espace_idx on public.historique (espace_id);
create index historique_user_idx on public.historique (user_id);

create or replace function prive.journaliser(candidature uuid, action text, details jsonb default '{}')
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  espace uuid;
begin
  select espace_id into espace from public.candidatures where id = candidature;
  if espace is null then
    return;
  end if;
  insert into public.historique
    (candidature_id, espace_id, user_id, email, par_systeme, action, details)
  values (
    candidature, espace, auth.uid(),
    (select email from auth.users where id = auth.uid()),
    auth.uid() is null,
    action, details
  );
end;
$$;

-- La suppression d'un compte efface aussi son e-mail de l'historique (user_id passe à null par
-- la clé étrangère) : il n'en reste qu'une trace anonyme « compte supprimé »
create function prive.anonymiser_historique()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.historique set email = null where user_id = old.id;
  return old;
end;
$$;

revoke execute on function prive.anonymiser_historique() from public, anon, authenticated;

create trigger utilisateur_anonymiser_historique
  before delete on auth.users
  for each row execute function prive.anonymiser_historique();

-- Ne journalise pas le détachement automatique de l'offre quand celle-ci est supprimée : cette
-- mise à jour vient de la clé étrangère (on delete set null), pas d'une modification de la fiche.
-- On la reconnaît à ce que l'offre retirée n'existe déjà plus (pg_trigger_depth() ne la
-- distingue pas : il vaut 1 pour les actions de clé étrangère).
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
    perform prive.journaliser(new.id, 'creation');
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
