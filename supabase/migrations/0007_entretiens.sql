-- Entretiens planifiés sur une candidature (plusieurs possibles)
create table public.entretiens (
  id uuid primary key default gen_random_uuid(),
  candidature_id uuid not null references public.candidatures (id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  debut timestamptz not null,
  duree_minutes integer not null default 60 check (duree_minutes between 5 and 480),
  -- Adresse ou lien de visioconférence
  lieu text,
  created_at timestamptz not null default now()
);

create index entretiens_user_debut_idx on public.entretiens (user_id, debut);
create index entretiens_candidature_id_idx on public.entretiens (candidature_id);

alter table public.entretiens enable row level security;

create policy "Lecture de ses entretiens" on public.entretiens
  for select using (user_id = auth.uid());

-- On ne planifie que sur ses propres candidatures
create policy "Ajout d'entretiens sur ses candidatures" on public.entretiens
  for insert with check (
    user_id = auth.uid()
    and exists (
      select 1 from public.candidatures c
      where c.id = candidature_id and c.user_id = auth.uid()
    )
  );

create policy "Suppression de ses entretiens" on public.entretiens
  for delete using (user_id = auth.uid());
