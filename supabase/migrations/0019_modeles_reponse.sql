-- Modèles de réponse aux candidats (convocation, refus…), par espace. L'envoi passe par la
-- fonction supabase/functions/envoyer-reponse, qui s'appuie sur preparer_reponse et
-- noter_reponse_envoyee ; il est noté dans l'historique de la candidature.

create table public.modeles_reponse (
  id uuid primary key default gen_random_uuid(),
  espace_id uuid not null references public.espaces (id) on delete cascade,
  nom text not null check (length(trim(nom)) between 1 and 60),
  sujet text not null check (length(trim(sujet)) between 1 and 200),
  -- Variables remplacées à l'envoi : {nom}, {offre}, {espace}
  corps text not null check (length(trim(corps)) between 1 and 5000),
  created_at timestamptz not null default now()
);

create unique index modeles_reponse_nom_unique on public.modeles_reponse (espace_id, lower(trim(nom)));

-- Espace actif à la création (comme les offres)
create function prive.remplir_espace_modele()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.espace_id is null then
    new.espace_id := public.espace_actif();
  end if;
  return new;
end;
$$;

revoke execute on function prive.remplir_espace_modele() from public, anon, authenticated;

create trigger modeles_reponse_espace before insert on public.modeles_reponse
  for each row execute function prive.remplir_espace_modele();

-- Les membres gèrent les modèles de l'espace actif (comme les offres)
alter table public.modeles_reponse enable row level security;
create policy "Modèles de l'espace actif" on public.modeles_reponse
  for all using (espace_id = public.espace_actif())
  with check (espace_id = public.espace_actif() and public.est_membre(espace_id));

-- Modèles proposés, pour les espaces existants et nouveaux
create function prive.creer_modeles_proposes(eid uuid) returns void language sql as $$
  insert into public.modeles_reponse (espace_id, nom, sujet, corps) values
    (eid, 'Convocation à un entretien', 'Votre candidature : proposition d''entretien',
     e'Bonjour {nom},\n\nVotre candidature au poste « {offre} » a retenu notre attention et nous aimerions vous rencontrer.\n\nPouvez-vous nous indiquer vos disponibilités pour un entretien ?\n\nBien cordialement,\n{espace}'),
    (eid, 'Réponse négative', 'Votre candidature au poste « {offre} »',
     e'Bonjour {nom},\n\nNous vous remercions de l''intérêt que vous portez à {espace}. Après examen attentif de votre candidature au poste « {offre} », nous ne sommes malheureusement pas en mesure d''y donner une suite favorable.\n\nNous vous souhaitons pleine réussite dans vos recherches.\n\nBien cordialement,\n{espace}'),
    (eid, 'Demande de pièces', 'Votre candidature : documents complémentaires',
     e'Bonjour {nom},\n\nPour poursuivre l''examen de votre candidature au poste « {offre} », pourriez-vous nous transmettre en réponse à cet e-mail :\n\n- \n\nBien cordialement,\n{espace}')
  on conflict do nothing;
$$;

select prive.creer_modeles_proposes(id) from public.espaces;

create function prive.modeles_nouvel_espace()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform prive.creer_modeles_proposes(new.id);
  return null;
end;
$$;

revoke execute on function prive.creer_modeles_proposes(uuid) from public, anon, authenticated;
revoke execute on function prive.modeles_nouvel_espace() from public, anon, authenticated;

create trigger espaces_modeles after insert on public.espaces
  for each row execute function prive.modeles_nouvel_espace();

-- Historique : réponse envoyée au candidat
alter table public.historique drop constraint historique_action_check;
alter table public.historique add constraint historique_action_check check (action in (
  'creation', 'statut', 'modification', 'cv_ajoute', 'cv_remplace', 'cv_retire',
  'note_ajoutee', 'note_supprimee', 'entretien_planifie', 'entretien_supprime',
  'reception', 'nouvelle_postulation', 'reponse_envoyee'
));

-- Réponses envoyées par espace et par heure (contre un envoi en masse depuis un compte)
create function prive.limite_reponses() returns integer language sql immutable as $$ select 100 $$;
revoke execute on function prive.limite_reponses() from public, anon, authenticated;

-- Avant l'envoi : la candidature est dans un espace dont l'appelant est membre, elle a un e-mail,
-- et la limite d'envois n'est pas atteinte. Renvoie de quoi remplir le modèle. Appelée par la
-- fonction serveur avec le jeton de l'utilisateur (ses droits, pas ceux de service_role).
create function public.preparer_reponse(id_candidature uuid)
returns table (email text, nom text, offre_titre text, poste text, espace_nom text, envoyeur text)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  c record;
begin
  select ca.id, ca.email, ca.nom, ca.poste, ca.espace_id, o.titre, e.nom as espace into c
  from public.candidatures ca
  join public.espaces e on e.id = ca.espace_id
  left join public.offres o on o.id = ca.offre_id
  where ca.id = id_candidature;
  if not found or not public.est_membre(c.espace_id) then
    raise exception 'candidature_inaccessible: candidature introuvable';
  end if;
  if c.email is null then
    raise exception 'sans_email: cette candidature n''a pas d''adresse e-mail';
  end if;
  if (select count(*) from public.historique h
      where h.espace_id = c.espace_id and h.action = 'reponse_envoyee'
        and h.created_at > now() - interval '1 hour') >= prive.limite_reponses() then
    raise exception 'trop_de_reponses: trop d''e-mails envoyés depuis cet espace, réessayez plus tard';
  end if;
  return query select c.email, c.nom, c.titre, c.poste, c.espace,
    (select u.email::text from auth.users u where u.id = auth.uid());
end;
$$;

-- Après l'envoi : trace dans l'historique (auteur : l'utilisateur connecté)
create function public.noter_reponse_envoyee(id_candidature uuid, sujet text, modele text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  espace uuid;
begin
  select ca.espace_id into espace from public.candidatures ca where ca.id = id_candidature;
  if espace is null or not public.est_membre(espace) then
    raise exception 'candidature_inaccessible: candidature introuvable';
  end if;
  perform prive.journaliser(id_candidature, 'reponse_envoyee',
    jsonb_strip_nulls(jsonb_build_object('sujet', left(sujet, 200), 'modele', left(modele, 60))));
end;
$$;

revoke execute on function public.preparer_reponse(uuid) from public, anon;
revoke execute on function public.noter_reponse_envoyee(uuid, text, text) from public, anon;
grant execute on function public.preparer_reponse(uuid) to authenticated;
grant execute on function public.noter_reponse_envoyee(uuid, text, text) to authenticated;
