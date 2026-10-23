-- Partage d'une candidature : lien en lecture seule, valable au plus 30 jours et révocable, pour
-- montrer un profil à une personne sans compte (un manager). Le lien montre le profil sans les
-- coordonnées du candidat ; le CV et les notes internes seulement si on les inclut. Le CV
-- s'ouvre par la fonction serveur cv-partage (supabase/functions/cv-partage).

create table public.partages (
  id uuid primary key default gen_random_uuid(),
  -- Identifiant aléatoire du lien (/partage/<jeton>)
  jeton uuid not null unique default gen_random_uuid(),
  candidature_id uuid not null references public.candidatures (id) on delete cascade,
  espace_id uuid not null references public.espaces (id) on delete cascade,
  -- Membre qui a créé le lien
  user_id uuid default auth.uid() references auth.users (id) on delete set null,
  avec_cv boolean not null default false,
  avec_notes boolean not null default false,
  expire_le timestamptz not null,
  revoque_le timestamptz,
  consultations integer not null default 0,
  derniere_consultation timestamptz,
  created_at timestamptz not null default now()
);

create index partages_candidature_idx on public.partages (candidature_id);

-- Liens encore valables d'une candidature, au plus
create function prive.limite_partages() returns integer language sql immutable as $$ select 10 $$;
revoke execute on function prive.limite_partages() from public, anon, authenticated;

-- Création : espace de la candidature, auteur imposé, compteurs à zéro, durée ramenée à 30 jours
-- au plus ; 10 liens valables au plus par candidature (créations simultanées sérialisées)
create function prive.controler_partage()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.espace_id := (select espace_id from public.candidatures where id = new.candidature_id);
  new.user_id := auth.uid();
  new.jeton := gen_random_uuid();
  new.created_at := now();
  new.revoque_le := null;
  new.consultations := 0;
  new.derniere_consultation := null;
  new.expire_le := least(new.expire_le, now() + interval '30 days');
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

revoke execute on function prive.controler_partage() from public, anon, authenticated;

create trigger partages_controle before insert on public.partages
  for each row execute function prive.controler_partage();

-- Lecture et création par les membres de l'espace actif ; ni modification ni suppression
-- directes (révocation par revoquer_partage, consultations comptées par lire_partage)
alter table public.partages enable row level security;
create policy "Partages de l'espace actif" on public.partages
  for select using (espace_id = public.espace_actif());
create policy "Créer un partage" on public.partages
  for insert with check (espace_id = public.espace_actif());

-- Historique : lien créé ou révoqué
alter table public.historique drop constraint historique_action_check;
alter table public.historique add constraint historique_action_check check (action in (
  'creation', 'statut', 'modification', 'cv_ajoute', 'cv_remplace', 'cv_retire',
  'note_ajoutee', 'note_supprimee', 'entretien_planifie', 'entretien_supprime',
  'reception', 'nouvelle_postulation', 'reponse_envoyee',
  'etiquette_ajoutee', 'etiquette_retiree',
  'partage_cree', 'partage_revoque'
));

create function prive.historique_partage()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform prive.journaliser(new.candidature_id, 'partage_cree', jsonb_build_object(
    'expire_le', new.expire_le, 'avec_cv', new.avec_cv, 'avec_notes', new.avec_notes));
  return null;
end;
$$;

revoke execute on function prive.historique_partage() from public, anon, authenticated;

create trigger partages_historique after insert on public.partages
  for each row execute function prive.historique_partage();

-- Révoque un lien de l'espace actif ; renvoie faux s'il n'y avait rien à révoquer
create function public.revoquer_partage(id_partage uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  candidature uuid;
begin
  update public.partages set revoque_le = now()
  where id = id_partage and espace_id = public.espace_actif() and revoque_le is null
  returning candidature_id into candidature;
  if not found then
    return false;
  end if;
  perform prive.journaliser(candidature, 'partage_revoque');
  return true;
end;
$$;

-- Partage valable (ni révoqué ni expiré) d'après son jeton
create function prive.partage_valable(code uuid)
returns public.partages
language sql
stable
security definer
set search_path = ''
as $$
  select * from public.partages
  where jeton = code and revoque_le is null and expire_le > now();
$$;

revoke execute on function prive.partage_valable(uuid) from public, anon, authenticated;

-- Page publique du partage : null si le lien est inconnu, révoqué ou expiré. Compte la
-- consultation. Ni e-mail ni chemin du CV : seulement s'il y en a un à ouvrir.
create function public.lire_partage(code uuid)
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
    where id = p.id;
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
    -- Moyenne de l'équipe par critère (critères notés seulement)
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
    'cv', p.avec_cv and c.cv_chemin is not null,
    'notes', case when p.avec_notes then coalesce((
      select jsonb_agg(jsonb_build_object('contenu', n.contenu, 'le', n.created_at)
        order by n.created_at desc)
      from public.notes n where n.candidature_id = c.id), '[]'::jsonb)
    end
  );
end;
$$;

-- Chemin du CV d'un partage valable qui l'inclut (fonction serveur cv-partage seulement)
create function public.cv_du_partage(code uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select c.cv_chemin
  from public.candidatures c
  where c.id = (prive.partage_valable(code)).candidature_id
    and (prive.partage_valable(code)).avec_cv;
$$;

revoke execute on function public.revoquer_partage(uuid) from public, anon;
grant execute on function public.revoquer_partage(uuid) to authenticated;
revoke execute on function public.lire_partage(uuid) from public;
grant execute on function public.lire_partage(uuid) to anon, authenticated;
revoke execute on function public.cv_du_partage(uuid) from public, anon, authenticated;
grant execute on function public.cv_du_partage(uuid) to service_role;
