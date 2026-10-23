-- Droits des candidats (RGPD) : export de toutes les données d'une candidature (droit d'accès et
-- de portabilité) et registre des demandes traitées (accès, effacement), qui ne garde aucune
-- donnée du candidat : seulement la date, le membre et le type de demande.

-- Toutes les données d'une candidature de l'espace actif, avec les droits de l'utilisateur
-- (règles d'accès appliquées) : null si elle n'est pas accessible. Les membres de l'équipe n'y
-- figurent pas (auteurs des notes, évaluateurs) : seules les données du candidat sont exportées.
create function public.exporter_candidature(id_candidature uuid)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select jsonb_build_object(
    'candidature', jsonb_build_object(
      'nom', c.nom,
      'email', c.email,
      'poste', c.poste,
      'competences', to_jsonb(c.competences),
      'experience', c.experience,
      'recue_le', c.created_at,
      'source', coalesce(c.source, 'saisie par l’équipe'),
      'offre', (select o.titre from public.offres o where o.id = c.offre_id),
      'etape', (select e.nom from public.etapes e where e.espace_id = c.espace_id and e.cle = c.statut),
      'cv', c.cv_chemin is not null
    ),
    'responsable', (select e.nom from public.espaces e where e.id = c.espace_id),
    'etiquettes', coalesce((
      select jsonb_agg(e.nom order by lower(e.nom))
      from public.candidatures_etiquettes ce join public.etiquettes e on e.id = ce.etiquette_id
      where ce.candidature_id = c.id), '[]'::jsonb),
    'notes', coalesce((
      select jsonb_agg(jsonb_build_object('le', n.created_at, 'contenu', n.contenu)
        order by n.created_at)
      from public.notes n where n.candidature_id = c.id), '[]'::jsonb),
    'entretiens', coalesce((
      select jsonb_agg(jsonb_build_object(
          'debut', x.debut, 'duree_minutes', x.duree_minutes, 'lieu', x.lieu)
        order by x.debut)
      from public.entretiens x where x.candidature_id = c.id), '[]'::jsonb),
    'evaluations', coalesce((
      select jsonb_agg(jsonb_build_object('critere', cr.nom, 'note', v.note, 'le', v.updated_at)
        order by cr.position, v.updated_at)
      from public.evaluations v join public.criteres cr on cr.id = v.critere_id
      where v.candidature_id = c.id), '[]'::jsonb),
    'historique', coalesce((
      select jsonb_agg(jsonb_build_object('le', h.created_at, 'action', h.action,
          'details', h.details)
        order by h.id)
      from public.historique h where h.candidature_id = c.id), '[]'::jsonb),
    'partages', coalesce((
      select jsonb_agg(jsonb_build_object('cree_le', p.created_at, 'expire_le', p.expire_le,
          'revoque_le', p.revoque_le, 'avec_cv', p.avec_cv, 'avec_notes', p.avec_notes,
          'consultations', p.consultations)
        order by p.created_at)
      from public.partages p where p.candidature_id = c.id), '[]'::jsonb)
  )
  from public.candidatures c
  where c.id = id_candidature and c.espace_id = public.espace_actif();
$$;

revoke execute on function public.exporter_candidature(uuid) from public, anon;
grant execute on function public.exporter_candidature(uuid) to authenticated;

create table public.demandes_rgpd (
  id bigint generated always as identity primary key,
  espace_id uuid not null references public.espaces (id) on delete cascade,
  -- Membre qui a traité la demande (anonyme si son compte est supprimé)
  user_id uuid references auth.users (id) on delete set null,
  -- Copie de l'e-mail du membre, comme dans l'historique
  email text,
  action text not null check (action in ('acces', 'effacement')),
  created_at timestamptz not null default now()
);

create index demandes_rgpd_espace_idx on public.demandes_rgpd (espace_id, created_at desc);

-- Lecture par les membres de l'espace actif ; écriture seulement par noter_demande_rgpd
alter table public.demandes_rgpd enable row level security;
create policy "Demandes de l'espace actif" on public.demandes_rgpd
  for select using (espace_id = public.espace_actif());

create function public.noter_demande_rgpd(type_demande text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if public.espace_actif() is null then
    raise exception 'espace_inaccessible: aucun espace actif';
  end if;
  insert into public.demandes_rgpd (espace_id, user_id, email, action)
  values (public.espace_actif(), auth.uid(),
    (select email from auth.users where id = auth.uid()), type_demande);
end;
$$;

revoke execute on function public.noter_demande_rgpd(text) from public, anon;
grant execute on function public.noter_demande_rgpd(text) to authenticated;

-- À la suppression d'un compte, son e-mail est retiré du registre (comme de l'historique)
create function prive.oublier_email_registre()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.demandes_rgpd set email = null where user_id = old.id;
  return old;
end;
$$;

revoke execute on function prive.oublier_email_registre() from public, anon, authenticated;

create trigger utilisateurs_registre_rgpd before delete on auth.users
  for each row execute function prive.oublier_email_registre();

create or replace function public.version_schema()
returns integer
language sql
immutable
set search_path = ''
as $$ select 26 $$;
