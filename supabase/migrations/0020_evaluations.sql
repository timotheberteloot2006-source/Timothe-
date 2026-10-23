-- Évaluation des candidats : grille de critères par espace (réglée par le propriétaire), note de
-- 1 à 5 par critère et par membre. Chacun ne modifie que ses notes ; tous voient les moyennes.

create table public.criteres (
  id uuid primary key default gen_random_uuid(),
  espace_id uuid not null references public.espaces (id) on delete cascade,
  nom text not null check (length(trim(nom)) between 1 and 40),
  position integer not null default 0,
  created_at timestamptz not null default now(),
  -- Cible de la clé étrangère composite des évaluations (même espace garanti)
  unique (id, espace_id)
);

create unique index criteres_nom_unique on public.criteres (espace_id, lower(trim(nom)));

create table public.evaluations (
  id uuid primary key default gen_random_uuid(),
  candidature_id uuid not null references public.candidatures (id) on delete cascade,
  critere_id uuid not null,
  espace_id uuid not null references public.espaces (id) on delete cascade,
  -- Évaluateur ; ses notes restent (anonymes) si son compte est supprimé
  user_id uuid default auth.uid() references auth.users (id) on delete set null,
  note smallint not null check (note between 1 and 5),
  updated_at timestamptz not null default now(),
  foreign key (critere_id, espace_id) references public.criteres (id, espace_id) on delete cascade,
  unique (candidature_id, critere_id, user_id)
);

create index evaluations_candidature_idx on public.evaluations (candidature_id);
create index evaluations_espace_idx on public.evaluations (espace_id);

-- Critère : espace actif, placé à la fin ; 10 au plus (ajouts simultanés sérialisés)
create function prive.controler_critere()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    if new.espace_id is null then
      new.espace_id := public.espace_actif();
    end if;
    perform 1 from public.espaces where id = new.espace_id for update;
    if (select count(*) from public.criteres where espace_id = new.espace_id) >= 10 then
      raise exception 'trop_de_criteres: 10 critères au plus';
    end if;
    new.position := coalesce(
      (select max(position) + 1 from public.criteres where espace_id = new.espace_id), 0);
  elsif new.espace_id is distinct from old.espace_id then
    raise exception 'critere_fige: un critère ne change pas d''espace';
  end if;
  new.nom := trim(new.nom);
  return new;
end;
$$;

-- Évaluation : espace de la candidature, auteur imposé, date de mise à jour
create function prive.controler_evaluation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' and (new.candidature_id is distinct from old.candidature_id
    or new.critere_id is distinct from old.critere_id) then
    raise exception 'evaluation_figee: seule la note change';
  end if;
  new.espace_id := (select espace_id from public.candidatures where id = new.candidature_id);
  if tg_op = 'INSERT' then
    if auth.uid() is not null then
      new.user_id := auth.uid();
    end if;
  else
    new.user_id := old.user_id;
  end if;
  new.updated_at := now();
  return new;
end;
$$;

revoke execute on function prive.controler_critere() from public, anon, authenticated;
revoke execute on function prive.controler_evaluation() from public, anon, authenticated;

create trigger criteres_controle before insert or update on public.criteres
  for each row execute function prive.controler_critere();
create trigger evaluations_controle before insert or update on public.evaluations
  for each row execute function prive.controler_evaluation();

alter table public.criteres enable row level security;
create policy "Critères de l'espace actif" on public.criteres
  for select using (espace_id = public.espace_actif());
create policy "Critères gérés par le propriétaire" on public.criteres
  for all using (espace_id = public.espace_actif() and public.est_proprietaire(espace_id))
  with check (espace_id = public.espace_actif() and public.est_proprietaire(espace_id));

alter table public.evaluations enable row level security;
create policy "Évaluations de l'espace actif" on public.evaluations
  for select using (espace_id = public.espace_actif());
create policy "Ses propres notes" on public.evaluations
  for insert with check (espace_id = public.espace_actif() and user_id = auth.uid());
create policy "Modifier ses notes" on public.evaluations
  for update using (espace_id = public.espace_actif() and user_id = auth.uid())
  with check (user_id = auth.uid());
create policy "Effacer ses notes" on public.evaluations
  for delete using (espace_id = public.espace_actif() and user_id = auth.uid());

-- Critères proposés, pour les espaces existants et nouveaux
create function prive.creer_criteres_proposes(eid uuid) returns void language sql as $$
  insert into public.criteres (espace_id, nom) values
    (eid, 'Compétences techniques'), (eid, 'Communication'), (eid, 'Motivation')
  on conflict do nothing;
$$;

select prive.creer_criteres_proposes(id) from public.espaces;

create function prive.criteres_nouvel_espace()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform prive.creer_criteres_proposes(new.id);
  return null;
end;
$$;

revoke execute on function prive.creer_criteres_proposes(uuid) from public, anon, authenticated;
revoke execute on function prive.criteres_nouvel_espace() from public, anon, authenticated;

create trigger espaces_criteres after insert on public.espaces
  for each row execute function prive.criteres_nouvel_espace();

-- Note moyenne de chaque candidature évaluée de l'espace actif (règles d'accès appliquées) :
-- moyenne de toutes les notes, et nombre d'évaluateurs
create function public.moyennes_evaluations()
returns table (candidature_id uuid, moyenne numeric, evaluateurs integer)
language sql
stable
security invoker
set search_path = ''
as $$
  select e.candidature_id, round(avg(e.note), 1), count(distinct coalesce(e.user_id::text, e.id::text))::integer
  from public.evaluations e
  where e.espace_id = public.espace_actif()
  group by e.candidature_id;
$$;

revoke execute on function public.moyennes_evaluations() from public, anon;
grant execute on function public.moyennes_evaluations() to authenticated;
