-- Historique des actions sur chaque candidature : qui a fait quoi, et quand.
-- Rempli uniquement par des déclencheurs de la base ; le site peut le lire, jamais l'écrire,
-- le modifier ou l'effacer (aucune règle d'écriture). Supprimé avec la candidature.

create table public.historique (
  id bigint generated always as identity primary key,
  candidature_id uuid not null references public.candidatures (id) on delete cascade,
  espace_id uuid not null references public.espaces (id) on delete cascade,
  user_id uuid references auth.users (id) on delete set null,
  -- E-mail de l'auteur au moment de l'action (reste lisible si le compte est supprimé)
  email text,
  action text not null check (action in (
    'creation', 'statut', 'modification', 'cv_ajoute', 'cv_remplace', 'cv_retire',
    'note_ajoutee', 'note_supprimee', 'entretien_planifie', 'entretien_supprime'
  )),
  details jsonb not null default '{}',
  created_at timestamptz not null default now()
);

create index historique_candidature_idx on public.historique (candidature_id, created_at desc);

alter table public.historique enable row level security;

create policy "Historique de l'espace actif" on public.historique
  for select using (espace_id = public.espace_actif());

-- Schéma privé : ni l'API ni les utilisateurs n'y ont accès, même si des droits trop larges sont
-- accordés sur « public ». Seuls les déclencheurs (security definer) appellent ses fonctions.
create schema prive;
revoke all on schema prive from public, anon, authenticated;

-- Enregistre une action, sauf si la candidature n'existe plus (suppressions en cascade)
create function prive.journaliser(candidature uuid, action text, details jsonb default '{}')
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
  insert into public.historique (candidature_id, espace_id, user_id, email, action, details)
  values (
    candidature, espace, auth.uid(),
    (select email from auth.users where id = auth.uid()),
    action, details
  );
end;
$$;

revoke execute on function prive.journaliser(uuid, text, jsonb) from public, anon, authenticated;

create function public.historique_candidature()
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

create trigger candidatures_historique
  after insert or update on public.candidatures
  for each row execute function public.historique_candidature();

create function public.historique_note()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    perform prive.journaliser(new.candidature_id, 'note_ajoutee');
  else
    perform prive.journaliser(old.candidature_id, 'note_supprimee');
  end if;
  return null;
end;
$$;

create trigger notes_historique
  after insert or delete on public.notes
  for each row execute function public.historique_note();

-- La date est enregistrée en UTC (ISO 8601), quel que soit le fuseau du serveur
create function public.historique_entretien()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    perform prive.journaliser(new.candidature_id, 'entretien_planifie',
      jsonb_build_object('debut', to_char(new.debut at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')));
  else
    perform prive.journaliser(old.candidature_id, 'entretien_supprime',
      jsonb_build_object('debut', to_char(old.debut at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')));
  end if;
  return null;
end;
$$;

create trigger entretiens_historique
  after insert or delete on public.entretiens
  for each row execute function public.historique_entretien();
