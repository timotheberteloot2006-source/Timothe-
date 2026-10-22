-- Étiquettes : libellés libres par espace (« Senior », « Télétravail »…), posés sur les
-- candidatures. Tous les membres les créent, les renomment, les suppriment et les posent ; la
-- pose et le retrait sont inscrits dans l'historique.

create table public.etiquettes (
  id uuid primary key default gen_random_uuid(),
  espace_id uuid not null references public.espaces (id) on delete cascade,
  nom text not null check (length(trim(nom)) between 1 and 30),
  couleur text not null default 'gris'
    check (couleur in ('gris', 'rouge', 'ambre', 'vert', 'indigo')),
  created_at timestamptz not null default now(),
  -- Cible de la clé étrangère composite des attributions (même espace garanti)
  unique (id, espace_id)
);

create unique index etiquettes_nom_unique on public.etiquettes (espace_id, lower(trim(nom)));

create table public.candidatures_etiquettes (
  candidature_id uuid not null references public.candidatures (id) on delete cascade,
  etiquette_id uuid not null,
  espace_id uuid not null references public.espaces (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (candidature_id, etiquette_id),
  foreign key (etiquette_id, espace_id) references public.etiquettes (id, espace_id)
    on delete cascade
);

create index candidatures_etiquettes_espace_idx on public.candidatures_etiquettes (espace_id);
create index candidatures_etiquettes_etiquette_idx on public.candidatures_etiquettes (etiquette_id);

-- Étiquette : espace actif ; 30 au plus par espace (ajouts simultanés sérialisés)
create function prive.controler_etiquette()
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
    if (select count(*) from public.etiquettes where espace_id = new.espace_id) >= 30 then
      raise exception 'trop_d_etiquettes: 30 étiquettes au plus';
    end if;
  elsif new.espace_id is distinct from old.espace_id then
    raise exception 'etiquette_figee: une étiquette ne change pas d''espace';
  end if;
  new.nom := trim(new.nom);
  return new;
end;
$$;

-- Attribution : espace de la candidature (la clé étrangère refuse alors l'étiquette d'un autre
-- espace) ; on la pose ou on la retire, on ne la modifie pas
create function prive.controler_attribution()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' then
    raise exception 'attribution_figee: retirez l''étiquette puis posez-en une autre';
  end if;
  new.espace_id := (select espace_id from public.candidatures where id = new.candidature_id);
  return new;
end;
$$;

revoke execute on function prive.controler_etiquette() from public, anon, authenticated;
revoke execute on function prive.controler_attribution() from public, anon, authenticated;

create trigger etiquettes_controle before insert or update on public.etiquettes
  for each row execute function prive.controler_etiquette();
create trigger candidatures_etiquettes_controle before insert or update
  on public.candidatures_etiquettes
  for each row execute function prive.controler_attribution();

alter table public.etiquettes enable row level security;
create policy "Étiquettes de l'espace actif" on public.etiquettes
  for all using (espace_id = public.espace_actif())
  with check (espace_id = public.espace_actif());

alter table public.candidatures_etiquettes enable row level security;
create policy "Étiquettes posées dans l'espace actif" on public.candidatures_etiquettes
  for select using (espace_id = public.espace_actif());
create policy "Poser une étiquette" on public.candidatures_etiquettes
  for insert with check (espace_id = public.espace_actif());
create policy "Retirer une étiquette" on public.candidatures_etiquettes
  for delete using (espace_id = public.espace_actif());

-- Historique : étiquette posée ou retirée, avec son nom du moment
alter table public.historique drop constraint historique_action_check;
alter table public.historique add constraint historique_action_check check (action in (
  'creation', 'statut', 'modification', 'cv_ajoute', 'cv_remplace', 'cv_retire',
  'note_ajoutee', 'note_supprimee', 'entretien_planifie', 'entretien_supprime',
  'reception', 'nouvelle_postulation', 'reponse_envoyee',
  'etiquette_ajoutee', 'etiquette_retiree'
));

create function prive.historique_etiquette()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  nom_etiquette text;
begin
  if tg_op = 'INSERT' then
    select nom into nom_etiquette from public.etiquettes where id = new.etiquette_id;
    perform prive.journaliser(new.candidature_id, 'etiquette_ajoutee',
      jsonb_build_object('nom', nom_etiquette));
  else
    -- Étiquette supprimée (retrait en cascade) : rien à inscrire sur chaque candidature ;
    -- candidature supprimée : journaliser ne fait rien
    select nom into nom_etiquette from public.etiquettes where id = old.etiquette_id;
    if nom_etiquette is not null then
      perform prive.journaliser(old.candidature_id, 'etiquette_retiree',
        jsonb_build_object('nom', nom_etiquette));
    end if;
  end if;
  return null;
end;
$$;

revoke execute on function prive.historique_etiquette() from public, anon, authenticated;

create trigger candidatures_etiquettes_historique after insert or delete
  on public.candidatures_etiquettes
  for each row execute function prive.historique_etiquette();
