-- Offres d'emploi (postes ouverts) auxquelles rattacher les candidatures
create table public.offres (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  titre text not null check (length(trim(titre)) > 0),
  created_at timestamptz not null default now(),
  -- Cible de la clé étrangère composite de candidatures (même propriétaire garanti)
  unique (id, user_id)
);

-- Un même titre une seule fois par utilisateur (sans tenir compte des majuscules)
create unique index offres_user_titre_unique on public.offres (user_id, lower(titre));

alter table public.offres enable row level security;

create policy "Lecture de ses offres" on public.offres
  for select using (user_id = auth.uid());

create policy "Ajout de ses offres" on public.offres
  for insert with check (user_id = auth.uid());

create policy "Modification de ses offres" on public.offres
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy "Suppression de ses offres" on public.offres
  for delete using (user_id = auth.uid());

-- Une candidature ne peut viser qu'une offre du même utilisateur ; supprimer l'offre
-- détache ses candidatures (seule la colonne offre_id est remise à null)
alter table public.candidatures
  add column offre_id uuid,
  add constraint candidatures_offre_fk foreign key (offre_id, user_id)
    references public.offres (id, user_id) on delete set null (offre_id);

create index candidatures_offre_id_idx on public.candidatures (offre_id);
