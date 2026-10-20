-- Candidatures : chaque utilisateur ne voit et ne modifie que les siennes
create table public.candidatures (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  nom text not null check (length(trim(nom)) > 0),
  email text,
  poste text,
  competences text[] not null default '{}',
  experience integer not null default 0 check (experience >= 0),
  statut text not null default 'nouveau' check (statut in ('nouveau', 'retenu', 'ecarte')),
  created_at timestamptz not null default now()
);

create index candidatures_user_id_idx on public.candidatures (user_id);

alter table public.candidatures enable row level security;

create policy "Lecture de ses candidatures" on public.candidatures
  for select using (user_id = auth.uid());

create policy "Ajout de ses candidatures" on public.candidatures
  for insert with check (user_id = auth.uid());

create policy "Modification de ses candidatures" on public.candidatures
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy "Suppression de ses candidatures" on public.candidatures
  for delete using (user_id = auth.uid());
