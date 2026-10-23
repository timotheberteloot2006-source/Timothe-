-- Notes internes sur une candidature (visibles uniquement par leur auteur)
create table public.notes (
  id uuid primary key default gen_random_uuid(),
  candidature_id uuid not null references public.candidatures (id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  contenu text not null check (length(trim(contenu)) > 0),
  created_at timestamptz not null default now()
);

create index notes_candidature_id_idx on public.notes (candidature_id);

alter table public.notes enable row level security;

create policy "Lecture de ses notes" on public.notes
  for select using (user_id = auth.uid());

-- On ne peut annoter que ses propres candidatures
create policy "Ajout de notes sur ses candidatures" on public.notes
  for insert with check (
    user_id = auth.uid()
    and exists (
      select 1 from public.candidatures c
      where c.id = candidature_id and c.user_id = auth.uid()
    )
  );

create policy "Suppression de ses notes" on public.notes
  for delete using (user_id = auth.uid());

-- CV : chemin du fichier dans le bucket « cv » (null si aucun CV)
alter table public.candidatures add column cv_chemin text;

-- Bucket privé : PDF uniquement, 5 Mo au plus (même valeur que TAILLE_MAX_CV dans src/lib/cv.ts)
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('cv', 'cv', false, 5242880, array['application/pdf']);

-- Chaque fichier est rangé sous <user_id>/… : un utilisateur n'accède qu'à son dossier
create policy "CV : lecture de ses fichiers" on storage.objects
  for select to authenticated
  using (bucket_id = 'cv' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "CV : dépôt dans son dossier" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'cv' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "CV : suppression de ses fichiers" on storage.objects
  for delete to authenticated
  using (bucket_id = 'cv' and (storage.foldername(name))[1] = auth.uid()::text);
