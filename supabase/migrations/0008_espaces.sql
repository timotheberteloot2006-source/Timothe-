-- Travail en équipe : les données appartiennent à un espace, partagé entre ses membres.
--
-- * Chaque compte a un espace personnel dont l'identifiant est celui du compte : les données
--   existantes y sont rattachées sans être déplacées, et les CV, rangés sous <user_id>/…, sont
--   déjà sous <espace_id>/….
-- * Un utilisateur peut être membre de plusieurs espaces ; les tables ne montrent que l'espace
--   actif (profils.espace_actif), et seulement s'il en est membre.
-- * Rôles : le propriétaire invite et retire les membres, gère l'abonnement (qui couvre tout
--   l'espace) ; les membres lisent et modifient candidatures, notes, offres et entretiens.

-- ---------------------------------------------------------------------------------------------
-- Espaces, membres, invitations, profils

create table public.espaces (
  id uuid primary key default gen_random_uuid(),
  nom text not null check (length(trim(nom)) > 0),
  proprietaire_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

create table public.membres (
  espace_id uuid not null references public.espaces (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  -- Copie de l'e-mail du compte, pour l'afficher aux autres membres
  email text,
  role text not null check (role in ('proprietaire', 'membre')),
  created_at timestamptz not null default now(),
  primary key (espace_id, user_id)
);

create index membres_user_id_idx on public.membres (user_id);

-- Lien d'invitation à usage unique, valable 7 jours
create table public.invitations (
  id uuid primary key default gen_random_uuid(),
  espace_id uuid not null references public.espaces (id) on delete cascade,
  jeton uuid not null unique default gen_random_uuid(),
  cree_par uuid not null default auth.uid() references auth.users (id) on delete cascade,
  expire_le timestamptz not null default now() + interval '7 days',
  utilisee_par uuid references auth.users (id) on delete set null,
  utilisee_le timestamptz,
  created_at timestamptz not null default now()
);

create table public.profils (
  user_id uuid primary key references auth.users (id) on delete cascade,
  espace_actif uuid references public.espaces (id) on delete set null
);

-- ---------------------------------------------------------------------------------------------
-- Fonctions d'accès (security definer : utilisables dans les règles sans récursion)

create function public.est_membre(eid uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.membres where espace_id = eid and user_id = auth.uid()
  );
$$;

-- Version texte pour les dossiers du stockage (un nom de dossier invalide ne lève pas d'erreur)
create function public.est_membre_dossier(dossier text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.membres where espace_id::text = dossier and user_id = auth.uid()
  );
$$;

create function public.est_proprietaire(eid uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.espaces where id = eid and proprietaire_id = auth.uid()
  );
$$;

-- Espace actif de l'utilisateur, s'il en est (encore) membre ; sinon son espace personnel
create function public.espace_actif()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (
      select p.espace_actif
      from public.profils p
      join public.membres m on m.espace_id = p.espace_actif and m.user_id = p.user_id
      where p.user_id = auth.uid()
    ),
    auth.uid()
  );
$$;

-- L'offre Pro du propriétaire couvre tout l'espace
create function public.est_pro_espace(eid uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.est_pro((select proprietaire_id from public.espaces where id = eid));
$$;

-- ---------------------------------------------------------------------------------------------
-- Espace personnel créé avec chaque compte, e-mail tenu à jour

create function public.creer_espace_personnel()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.espaces (id, nom, proprietaire_id) values (new.id, 'Mon espace', new.id);
  insert into public.membres (espace_id, user_id, email, role)
    values (new.id, new.id, new.email, 'proprietaire');
  insert into public.profils (user_id, espace_actif) values (new.id, new.id);
  return new;
end;
$$;

create trigger utilisateur_espace_personnel
  after insert on auth.users
  for each row execute function public.creer_espace_personnel();

create function public.synchroniser_email_membre()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.membres set email = new.email where user_id = new.id;
  return new;
end;
$$;

create trigger utilisateur_email_membre
  after update of email on auth.users
  for each row execute function public.synchroniser_email_membre();

-- Comptes existants
insert into public.espaces (id, nom, proprietaire_id)
  select id, 'Mon espace', id from auth.users;
insert into public.membres (espace_id, user_id, email, role)
  select id, id, email, 'proprietaire' from auth.users;
insert into public.profils (user_id, espace_actif)
  select id, id from auth.users;

-- ---------------------------------------------------------------------------------------------
-- Rattachement des données à un espace

alter table public.candidatures add column espace_id uuid references public.espaces (id) on delete cascade;
alter table public.offres add column espace_id uuid references public.espaces (id) on delete cascade;
alter table public.notes add column espace_id uuid references public.espaces (id) on delete cascade;
alter table public.entretiens add column espace_id uuid references public.espaces (id) on delete cascade;

update public.candidatures set espace_id = user_id;
update public.offres set espace_id = user_id;
update public.notes set espace_id = user_id;
update public.entretiens set espace_id = user_id;

alter table public.candidatures alter column espace_id set not null;
alter table public.offres alter column espace_id set not null;
alter table public.notes alter column espace_id set not null;
alter table public.entretiens alter column espace_id set not null;

create index candidatures_espace_id_idx on public.candidatures (espace_id);
create index offres_espace_id_idx on public.offres (espace_id);
create index notes_espace_id_idx on public.notes (espace_id);
create index entretiens_espace_debut_idx on public.entretiens (espace_id, debut);

-- user_id devient « créé par » : supprimer le compte d'un membre ne supprime pas ses ajouts
alter table public.candidatures alter column user_id drop not null;
alter table public.candidatures drop constraint candidatures_user_id_fkey;
alter table public.candidatures add constraint candidatures_user_id_fkey
  foreign key (user_id) references auth.users (id) on delete set null;
alter table public.offres alter column user_id drop not null;
alter table public.offres drop constraint offres_user_id_fkey;
alter table public.offres add constraint offres_user_id_fkey
  foreign key (user_id) references auth.users (id) on delete set null;
alter table public.notes alter column user_id drop not null;
alter table public.notes drop constraint notes_user_id_fkey;
alter table public.notes add constraint notes_user_id_fkey
  foreign key (user_id) references auth.users (id) on delete set null;
alter table public.entretiens alter column user_id drop not null;
alter table public.entretiens drop constraint entretiens_user_id_fkey;
alter table public.entretiens add constraint entretiens_user_id_fkey
  foreign key (user_id) references auth.users (id) on delete set null;

-- Unicités par espace (et non plus par utilisateur)
drop index public.candidatures_user_email_unique;
create unique index candidatures_espace_email_unique
  on public.candidatures (espace_id, lower(email)) where email is not null;
drop index public.offres_user_titre_unique;
create unique index offres_espace_titre_unique on public.offres (espace_id, lower(titre));

-- Une candidature ne vise qu'une offre du même espace
alter table public.candidatures drop constraint candidatures_offre_fk;
alter table public.offres add constraint offres_id_espace_unique unique (id, espace_id);
alter table public.candidatures add constraint candidatures_offre_fk
  foreign key (offre_id, espace_id) references public.offres (id, espace_id)
  on delete set null (offre_id);

-- Espace rempli à l'insertion : l'espace actif (candidatures, offres), ou celui de la
-- candidature (notes, entretiens). Les déclencheurs « avant » passent avant les règles RLS.
create function public.remplir_espace()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- « Créé par » : toujours l'utilisateur connecté (impossible d'écrire au nom d'un autre)
  if auth.uid() is not null then
    new.user_id := auth.uid();
  end if;
  if new.espace_id is null then
    new.espace_id := coalesce(public.espace_actif(), new.user_id);
  end if;
  return new;
end;
$$;

create function public.remplir_espace_candidature()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is not null then
    new.user_id := auth.uid();
  end if;
  new.espace_id := (select espace_id from public.candidatures where id = new.candidature_id);
  return new;
end;
$$;

-- Nom en « candidatures_espace » : s'exécute avant « candidatures_limite_gratuite » (ordre alphabétique)
create trigger candidatures_espace before insert on public.candidatures
  for each row execute function public.remplir_espace();
create trigger offres_espace before insert on public.offres
  for each row execute function public.remplir_espace();
create trigger notes_espace before insert on public.notes
  for each row execute function public.remplir_espace_candidature();
create trigger entretiens_espace before insert on public.entretiens
  for each row execute function public.remplir_espace_candidature();

-- Limite de l'offre Gratuite : 50 candidatures par espace, sauf si son propriétaire est Pro
create or replace function public.verifier_limite_candidatures()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.est_pro_espace(new.espace_id)
    and (select count(*) from public.candidatures where espace_id = new.espace_id) >= 50 then
    raise exception 'limite_gratuite: 50 candidatures au plus avec l''offre Gratuite';
  end if;
  return new;
end;
$$;

-- ---------------------------------------------------------------------------------------------
-- Règles d'accès : l'espace actif, dont l'utilisateur est membre

drop policy "Lecture de ses candidatures" on public.candidatures;
drop policy "Ajout de ses candidatures" on public.candidatures;
drop policy "Modification de ses candidatures" on public.candidatures;
drop policy "Suppression de ses candidatures" on public.candidatures;
create policy "Candidatures de l'espace actif" on public.candidatures
  for all using (espace_id = public.espace_actif()) with check (espace_id = public.espace_actif());

drop policy "Lecture de ses offres" on public.offres;
drop policy "Ajout de ses offres" on public.offres;
drop policy "Modification de ses offres" on public.offres;
drop policy "Suppression de ses offres" on public.offres;
create policy "Offres de l'espace actif" on public.offres
  for all using (espace_id = public.espace_actif()) with check (espace_id = public.espace_actif());

drop policy "Lecture de ses notes" on public.notes;
drop policy "Ajout de notes sur ses candidatures" on public.notes;
drop policy "Suppression de ses notes" on public.notes;
create policy "Notes de l'espace actif" on public.notes
  for all using (espace_id = public.espace_actif()) with check (espace_id = public.espace_actif());

drop policy "Lecture de ses entretiens" on public.entretiens;
drop policy "Ajout d'entretiens sur ses candidatures" on public.entretiens;
drop policy "Suppression de ses entretiens" on public.entretiens;
create policy "Entretiens de l'espace actif" on public.entretiens
  for all using (espace_id = public.espace_actif()) with check (espace_id = public.espace_actif());

alter table public.espaces enable row level security;
create policy "Espaces dont on est membre" on public.espaces
  for select using (public.est_membre(id));
create policy "Renommage par le propriétaire" on public.espaces
  for update using (proprietaire_id = auth.uid()) with check (proprietaire_id = auth.uid());

alter table public.membres enable row level security;
create policy "Membres de ses espaces" on public.membres
  for select using (public.est_membre(espace_id));
-- Le propriétaire retire un membre ; un membre peut quitter l'espace (pas le propriétaire)
create policy "Retrait ou départ" on public.membres
  for delete using (
    (public.est_proprietaire(espace_id) and user_id <> auth.uid())
    or (user_id = auth.uid() and role <> 'proprietaire')
  );

alter table public.invitations enable row level security;
create policy "Invitations gérées par le propriétaire" on public.invitations
  for all using (public.est_proprietaire(espace_id))
  with check (public.est_proprietaire(espace_id) and cree_par = auth.uid());

alter table public.profils enable row level security;
create policy "Lecture de son profil" on public.profils
  for select using (user_id = auth.uid());

-- CV : rangés sous <espace_id>/…, accessibles aux membres de l'espace
drop policy "CV : lecture de ses fichiers" on storage.objects;
drop policy "CV : dépôt dans son dossier" on storage.objects;
drop policy "CV : suppression de ses fichiers" on storage.objects;
create policy "CV : lecture par les membres" on storage.objects
  for select to authenticated
  using (bucket_id = 'cv' and public.est_membre_dossier((storage.foldername(name))[1]));
create policy "CV : dépôt par les membres" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'cv' and public.est_membre_dossier((storage.foldername(name))[1]));
create policy "CV : suppression par les membres" on storage.objects
  for delete to authenticated
  using (bucket_id = 'cv' and public.est_membre_dossier((storage.foldername(name))[1]));

-- ---------------------------------------------------------------------------------------------
-- Fonctions appelées par le site

-- Espace actif : nom, rôle, offre Pro, nombre de membres
create function public.mon_espace()
returns table (id uuid, nom text, role text, est_pro boolean, nb_membres integer)
language sql
stable
security definer
set search_path = ''
as $$
  select e.id, e.nom, m.role, public.est_pro_espace(e.id),
    (select count(*)::integer from public.membres where espace_id = e.id)
  from public.espaces e
  join public.membres m on m.espace_id = e.id and m.user_id = auth.uid()
  where e.id = public.espace_actif();
$$;

create function public.choisir_espace(eid uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.est_membre(eid) then
    raise exception 'espace_inaccessible: vous n''êtes pas membre de cet espace';
  end if;
  insert into public.profils (user_id, espace_actif) values (auth.uid(), eid)
    on conflict (user_id) do update set espace_actif = excluded.espace_actif;
end;
$$;

-- Aperçu d'une invitation avant de l'accepter
create function public.lire_invitation(code uuid)
returns table (
  espace_id uuid, espace_nom text, proprietaire_email text, valide boolean, deja_membre boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  select e.id, e.nom,
    (select email from public.membres m where m.espace_id = e.id and m.role = 'proprietaire'),
    i.utilisee_par is null and i.expire_le > now(),
    public.est_membre(e.id)
  from public.invitations i
  join public.espaces e on e.id = i.espace_id
  where i.jeton = code;
$$;

create function public.accepter_invitation(code uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  invitation public.invitations;
begin
  select * into invitation from public.invitations where jeton = code for update;
  if invitation is null or invitation.utilisee_par is not null or invitation.expire_le <= now() then
    raise exception 'invitation_invalide: lien d''invitation invalide, expiré ou déjà utilisé';
  end if;
  if not public.est_membre(invitation.espace_id) then
    insert into public.membres (espace_id, user_id, email, role)
      values (invitation.espace_id, auth.uid(),
        (select email from auth.users where id = auth.uid()), 'membre');
    update public.invitations set utilisee_par = auth.uid(), utilisee_le = now()
      where id = invitation.id;
  end if;
  perform public.choisir_espace(invitation.espace_id);
  return invitation.espace_id;
end;
$$;

-- Supprimer son compte : refusé tant que l'abonnement est actif ou que l'espace a des membres
create or replace function public.supprimer_mon_compte()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if public.est_pro(auth.uid()) then
    raise exception 'abonnement_actif: résiliez votre abonnement avant de supprimer le compte';
  end if;
  if exists (
    select 1 from public.membres m
    join public.espaces e on e.id = m.espace_id
    where e.proprietaire_id = auth.uid() and m.user_id <> auth.uid()
  ) then
    raise exception 'equipe_non_vide: retirez les membres de votre espace avant de supprimer le compte';
  end if;
  delete from auth.users where id = auth.uid();
end;
$$;

revoke execute on function public.mon_espace() from public, anon;
revoke execute on function public.choisir_espace(uuid) from public, anon;
revoke execute on function public.lire_invitation(uuid) from public, anon;
revoke execute on function public.accepter_invitation(uuid) from public, anon;
grant execute on function public.mon_espace() to authenticated;
grant execute on function public.choisir_espace(uuid) to authenticated;
grant execute on function public.lire_invitation(uuid) to authenticated;
grant execute on function public.accepter_invitation(uuid) to authenticated;
