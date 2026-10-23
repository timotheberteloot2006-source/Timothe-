-- Corrections de la quatrième relecture (étapes 43 à 46).

-- 1. Chemin du CV : toujours sous <espace_id>/<candidature_id>/ (comme le site et la fonction
--    postuler le rangent). Sans cela, un membre pouvait écrire dans une de ses candidatures le
--    chemin d'un CV d'un autre espace et le faire signer par la fonction cv-partage, qui lit le
--    stockage avec tous les droits. Les lignes existantes ne sont pas revérifiées (not valid) ;
--    les fonctions des partages le vérifient de nouveau.
alter table public.candidatures add constraint candidatures_cv_chemin_check check (
  cv_chemin is null or cv_chemin ~ ('^' || espace_id::text || '/' || id::text || '/[^/]+$')
) not valid;

create or replace function prive.cv_partageable(c public.candidatures)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select c.cv_chemin is not null
    and c.cv_chemin ~ ('^' || c.espace_id::text || '/' || c.id::text || '/[^/]+$');
$$;

revoke execute on function prive.cv_partageable(public.candidatures) from public, anon, authenticated;

-- 2. Un lien ne survit pas au départ de son auteur : il est révoqué quand l'auteur quitte
--    l'espace ou en est retiré (et quand son compte est supprimé), et un lien dont l'auteur n'est
--    plus membre ne montre plus rien.
create or replace function prive.partage_valable(code uuid)
returns public.partages
language sql
stable
security definer
set search_path = ''
as $$
  select p.* from public.partages p
  where p.jeton = code and p.revoque_le is null and p.expire_le > now()
    and exists (
      select 1 from public.membres m where m.espace_id = p.espace_id and m.user_id = p.user_id
    );
$$;

create function prive.revoquer_partages_du_membre()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- user_id null : auteur dont le compte est supprimé (mis à null avant ou après ce déclencheur)
  update public.partages set revoque_le = now()
  where espace_id = old.espace_id and (user_id = old.user_id or user_id is null)
    and revoque_le is null;
  return null;
end;
$$;

revoke execute on function prive.revoquer_partages_du_membre() from public, anon, authenticated;

create trigger membres_partages after delete on public.membres
  for each row execute function prive.revoquer_partages_du_membre();

-- 3. Création d'un partage ou d'une étiquette pour un autre espace : refusée d'emblée, avant de
--    verrouiller ou de compter quoi que ce soit chez lui (le refus des règles d'accès venait
--    après, et le message « trop de… » renseignait sur l'autre espace)
create or replace function prive.controler_partage()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.espace_id := (select espace_id from public.candidatures where id = new.candidature_id);
  if auth.uid() is not null and new.espace_id is distinct from public.espace_actif() then
    raise exception 'candidature_inaccessible: candidature introuvable'
      using errcode = '42501';
  end if;
  new.user_id := auth.uid();
  new.jeton := gen_random_uuid();
  new.created_at := now();
  new.revoque_le := null;
  new.consultations := 0;
  new.derniere_consultation := null;
  new.expire_le := least(coalesce(new.expire_le, now() + interval '30 days'),
    now() + interval '30 days');
  if new.expire_le <= now() then
    raise exception 'duree_invalide: la date d''expiration est déjà passée';
  end if;
  perform 1 from public.candidatures where id = new.candidature_id for update;
  if (select count(*) from public.partages p
      where p.candidature_id = new.candidature_id and p.revoque_le is null
        and p.expire_le > now()) >= prive.limite_partages() then
    raise exception 'trop_de_partages: 10 liens valables au plus par candidature';
  end if;
  return new;
end;
$$;

create or replace function prive.controler_etiquette()
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
    if auth.uid() is not null and new.espace_id is distinct from public.espace_actif() then
      raise exception 'espace_inaccessible: étiquette d''un autre espace' using errcode = '42501';
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

-- 4. Page publique du partage : une consultation comptée par minute au plus (le compteur ne
--    peut plus être gonflé à l'infini, et la ligne n'est plus réécrite à chaque appel) ; notes
--    figées à la création du lien (une note écrite ensuite n'est pas montrée) ; CV seulement à
--    un chemin de la candidature
create or replace function public.lire_partage(code uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  p public.partages;
  c public.candidatures;
begin
  p := prive.partage_valable(code);
  if p.id is null then
    return null;
  end if;
  select * into c from public.candidatures where id = p.candidature_id;
  update public.partages
    set consultations = consultations + 1, derniere_consultation = now()
    where id = p.id
      and (derniere_consultation is null or derniere_consultation < now() - interval '1 minute');
  return jsonb_build_object(
    'nom', c.nom,
    'poste', c.poste,
    'experience', c.experience,
    'competences', to_jsonb(c.competences),
    'recue_le', c.created_at,
    'expire_le', p.expire_le,
    'espace', (select nom from public.espaces where id = c.espace_id),
    'offre', (select titre from public.offres where id = c.offre_id),
    'etape', (select nom from public.etapes where espace_id = c.espace_id and cle = c.statut),
    'etiquettes', coalesce((
      select jsonb_agg(e.nom order by lower(e.nom))
      from public.candidatures_etiquettes ce
      join public.etiquettes e on e.id = ce.etiquette_id
      where ce.candidature_id = c.id), '[]'::jsonb),
    'evaluation', coalesce((
      select jsonb_agg(jsonb_build_object('critere', x.nom, 'moyenne', x.moyenne)
        order by x.position)
      from (
        select cr.nom, cr.position, round(avg(ev.note), 1) as moyenne
        from public.evaluations ev
        join public.criteres cr on cr.id = ev.critere_id
        where ev.candidature_id = c.id
        group by cr.id, cr.nom, cr.position
      ) x), '[]'::jsonb),
    'cv', p.avec_cv and prive.cv_partageable(c),
    'notes', case when p.avec_notes then coalesce((
      select jsonb_agg(jsonb_build_object('contenu', n.contenu, 'le', n.created_at)
        order by n.created_at desc)
      from public.notes n
      where n.candidature_id = c.id and n.created_at <= p.created_at), '[]'::jsonb)
    end
  );
end;
$$;

create or replace function public.cv_du_partage(code uuid)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  p public.partages;
  c public.candidatures;
begin
  p := prive.partage_valable(code);
  if p.id is null or not p.avec_cv then
    return null;
  end if;
  select * into c from public.candidatures where id = p.candidature_id;
  if not prive.cv_partageable(c) then
    return null;
  end if;
  return c.cv_chemin;
end;
$$;

-- 5. Version du schéma, pour que npm run verifier:config sache que cette migration est appliquée
--    (elle n'ajoute ni table ni colonne). Ne révèle rien d'autre ; les migrations suivantes
--    pourront la remplacer.
create function public.version_schema()
returns integer
language sql
immutable
set search_path = ''
as $$ select 24 $$;

revoke execute on function public.version_schema() from public;
grant execute on function public.version_schema() to anon, authenticated;
