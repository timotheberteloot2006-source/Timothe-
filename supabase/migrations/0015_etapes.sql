-- Étapes de recrutement propres à chaque espace (ex. Présélection, Entretien RH, Offre), qui
-- remplacent les trois statuts fixes. Les trois étapes de base restent : « nouveau » (première,
-- où arrivent les candidatures), « retenu » et « ecarte » ; on peut les renommer, pas les
-- supprimer. candidatures.statut contient la clé de l'étape.

create table public.etapes (
  id uuid primary key default gen_random_uuid(),
  espace_id uuid not null references public.espaces (id) on delete cascade,
  -- Clé stable (jamais modifiée) : celle des étapes de base, ou générée
  cle text not null default ('e_' || replace(gen_random_uuid()::text, '-', ''))
    check (cle ~ '^[a-z0-9_]{1,40}$'),
  nom text not null check (length(trim(nom)) between 1 and 40),
  position integer not null,
  created_at timestamptz not null default now(),
  unique (espace_id, cle)
);

create unique index etapes_espace_nom_unique on public.etapes (espace_id, lower(trim(nom)));
create index etapes_espace_position_idx on public.etapes (espace_id, position);

-- Étapes de base, aux positions extrêmes : les nouvelles étapes s'insèrent entre « nouveau » et
-- « retenu »
create function prive.creer_etapes_de_base(eid uuid) returns void language sql as $$
  insert into public.etapes (espace_id, cle, nom, position) values
    (eid, 'nouveau', 'Nouveau', 0),
    (eid, 'retenu', 'Retenu', 1000000),
    (eid, 'ecarte', 'Écarté', 2000000)
  on conflict (espace_id, cle) do nothing;
$$;

select prive.creer_etapes_de_base(id) from public.espaces;

create function prive.etapes_nouvel_espace()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform prive.creer_etapes_de_base(new.id);
  return null;
end;
$$;

revoke execute on function prive.creer_etapes_de_base(uuid) from public, anon, authenticated;
revoke execute on function prive.etapes_nouvel_espace() from public, anon, authenticated;

create trigger espaces_etapes after insert on public.espaces
  for each row execute function prive.etapes_nouvel_espace();

-- Le statut d'une candidature est une étape de son espace
alter table public.candidatures drop constraint candidatures_statut_check;
alter table public.candidatures add constraint candidatures_etape_fk
  foreign key (espace_id, statut) references public.etapes (espace_id, cle);

-- Ajout dans l'espace actif, avant « retenu » ; clé et espace jamais modifiés ; 12 étapes au plus
create function prive.controler_etape()
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
    if (select count(*) from public.etapes where espace_id = new.espace_id) >= 12 then
      raise exception 'trop_d_etapes: 12 étapes au plus';
    end if;
    if new.position is null then
      new.position := coalesce(
        (select max(position) + 1 from public.etapes
         where espace_id = new.espace_id and cle not in ('retenu', 'ecarte')),
        1);
    end if;
  elsif new.cle is distinct from old.cle or new.espace_id is distinct from old.espace_id then
    raise exception 'etape_figee: la clé et l''espace d''une étape ne changent pas';
  end if;
  new.nom := trim(new.nom);
  return new;
end;
$$;

revoke execute on function prive.controler_etape() from public, anon, authenticated;

create trigger etapes_controle before insert or update on public.etapes
  for each row execute function prive.controler_etape();

-- Lecture par les membres de l'espace actif ; ajout, renommage et ordre par le propriétaire.
-- Les étapes de base ne se suppriment pas, et « nouveau » reste la première.
alter table public.etapes enable row level security;
create policy "Étapes de l'espace actif" on public.etapes
  for select using (espace_id = public.espace_actif());
create policy "Ajout par le propriétaire" on public.etapes
  for insert with check (
    espace_id = public.espace_actif() and public.est_proprietaire(espace_id)
    and cle not in ('nouveau', 'retenu', 'ecarte') and position > 0
  );
create policy "Modification par le propriétaire" on public.etapes
  for update using (espace_id = public.espace_actif() and public.est_proprietaire(espace_id))
  with check (
    public.est_proprietaire(espace_id)
    and (cle = 'nouveau') = (position = 0)
    and (cle = 'nouveau' or position > 0)
  );
create policy "Suppression par le propriétaire" on public.etapes
  for delete using (
    espace_id = public.espace_actif() and public.est_proprietaire(espace_id)
    and cle not in ('nouveau', 'retenu', 'ecarte')
  );

-- Supprime une étape : ses candidatures reviennent à « nouveau » (noté dans leur historique)
create function public.supprimer_etape(eid uuid)
returns integer
language plpgsql
security invoker
set search_path = ''
as $$
declare
  etape record;
  deplacees integer;
begin
  select e.espace_id, e.cle into etape from public.etapes e where e.id = eid;
  if not found or not public.est_proprietaire(etape.espace_id)
    or etape.cle in ('nouveau', 'retenu', 'ecarte') then
    raise exception 'etape_protegee: seul le propriétaire supprime une étape ajoutée';
  end if;
  update public.candidatures set statut = 'nouveau'
  where espace_id = etape.espace_id and statut = etape.cle;
  get diagnostics deplacees = row_count;
  delete from public.etapes where id = eid;
  return deplacees;
end;
$$;

revoke execute on function public.supprimer_etape(uuid) from public, anon;
grant execute on function public.supprimer_etape(uuid) to authenticated;

-- Historique : le nom des étapes au moment du changement (il reste lisible si l'étape est
-- renommée ou supprimée)
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
    perform prive.journaliser(new.id, 'statut', jsonb_build_object(
      'avant', old.statut,
      'apres', new.statut,
      'avant_nom', (select nom from public.etapes where espace_id = old.espace_id and cle = old.statut),
      'apres_nom', (select nom from public.etapes where espace_id = new.espace_id and cle = new.statut)
    ));
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
