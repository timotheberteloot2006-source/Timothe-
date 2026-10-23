-- Corrections de la deuxième relecture (étapes 31 à 37).

-- 1. Les règles d'accès appellent espace_actif() et est_membre() aussi pour les requêtes sans
--    compte : sans droit d'exécution, celles-ci échouaient (« permission denied ») au lieu de ne
--    rien renvoyer. Sans compte, ces fonctions ne révèlent rien (auth.uid() est null).
grant execute on function public.espace_actif() to anon;
grant execute on function public.est_membre(uuid) to anon;
grant execute on function public.est_membre_dossier(text) to anon;
grant execute on function public.est_proprietaire(uuid) to anon;

-- 2. Correction de données de 0011, reprise ici pour les bases qui avaient déjà appliqué 0011 :
--    e-mails des comptes supprimés retirés de l'historique
update public.historique set email = null where user_id is null and email is not null;

-- 3. Une note ou un entretien reste attaché à sa candidature (un déplacement échapperait aux
--    historiques des deux candidatures)
create or replace function public.recalculer_espace_candidature()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.candidature_id is distinct from old.candidature_id then
    raise exception 'candidature_figee: une note ou un entretien ne change pas de candidature';
  end if;
  new.user_id := old.user_id;
  new.espace_id := (select espace_id from public.candidatures where id = new.candidature_id);
  return new;
end;
$$;

-- 4. Formulaire public : limite aussi par espace (indépendante de l'adresse IP, que l'appelant
--    peut maquiller), et dépôt sans CV ; le CV est joint ensuite par la fonction postuler,
--    seulement pour une candidature créée (pas de fichier envoyé pour rien)
alter table prive.envois_formulaire add column espace_id uuid;
create index envois_formulaire_espace_idx on prive.envois_formulaire (espace_id, created_at);

-- Envois acceptés par espace et par heure, toutes connexions confondues
create function prive.limite_envois_espace() returns integer language sql immutable as $$ select 60 $$;
revoke execute on function prive.limite_envois_espace() from public, anon, authenticated;

drop function public.deposer_candidature_publique(uuid, text, uuid, text, text, text[], integer, text);

create function public.deposer_candidature_publique(
  code uuid,
  empreinte_ip text,
  id_candidature uuid,
  nom_candidat text,
  email_candidat text,
  liste_competences text[],
  annees_experience integer
)
returns table (
  resultat text,
  candidature uuid,
  espace uuid,
  offre_titre text,
  espace_nom text,
  accuse_reception boolean,
  destinataires text[]
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  offre record;
  existante uuid;
begin
  select o.id, o.espace_id, o.titre, e.nom, e.accuse_reception as accuse into offre
  from public.offres o
  join public.espaces e on e.id = o.espace_id
  where o.jeton_public = code and o.publique;
  if not found then
    raise exception 'offre_fermee: cette offre n''accepte pas de candidatures';
  end if;

  delete from prive.envois_formulaire where created_at < now() - interval '1 day';
  if (select count(*) from prive.envois_formulaire e
      where e.empreinte = empreinte_ip and e.created_at > now() - interval '1 hour')
      >= prive.limite_envois()
    or (select count(*) from prive.envois_formulaire e
      where e.espace_id = offre.espace_id and e.created_at > now() - interval '1 hour')
      >= prive.limite_envois_espace() then
    raise exception 'trop_de_candidatures: trop d''envois, réessayez plus tard';
  end if;
  insert into prive.envois_formulaire (empreinte, espace_id) values (empreinte_ip, offre.espace_id);

  select c.id into existante from public.candidatures c
  where c.espace_id = offre.espace_id and lower(c.email) = lower(email_candidat);
  if existante is not null then
    perform prive.journaliser(existante, 'nouvelle_postulation',
      jsonb_build_object('offre', offre.titre));
    resultat := 'deja_recue';
    candidature := existante;
  else
    -- Limite Gratuite et historique (« reception ») : par les déclencheurs habituels
    insert into public.candidatures
      (id, user_id, espace_id, offre_id, nom, email, competences, experience, source)
    values (
      id_candidature, null, offre.espace_id, offre.id, trim(nom_candidat), trim(email_candidat),
      liste_competences, annees_experience, 'formulaire'
    );
    resultat := 'creee';
    candidature := id_candidature;
  end if;

  espace := offre.espace_id;
  offre_titre := offre.titre;
  espace_nom := offre.nom;
  accuse_reception := offre.accuse;
  destinataires := coalesce(
    (select array_agg(m.email order by m.created_at) from public.membres m
     where m.espace_id = offre.espace_id and m.notifier and m.email is not null),
    '{}');
  return next;
end;
$$;

revoke execute on function public.deposer_candidature_publique(uuid, text, uuid, text, text, text[], integer)
  from public, anon, authenticated;
grant execute on function public.deposer_candidature_publique(uuid, text, uuid, text, text, text[], integer)
  to service_role;

-- 5. Notifications : chaque réglage s'enregistre seul (null : inchangé), pour qu'un réglage ne
--    renvoie pas l'ancienne valeur de l'autre
drop function public.regler_notifications(boolean, boolean);

create function public.regler_notifications(pour_moi boolean default null, accuse boolean default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  eid uuid := public.espace_actif();
begin
  if eid is null or not public.est_membre(eid) then
    raise exception 'espace_inaccessible: vous n''êtes pas membre de cet espace';
  end if;
  if accuse is not null and not public.est_proprietaire(eid) then
    raise exception 'reserve_proprietaire: seul le propriétaire règle l''accusé de réception';
  end if;
  if pour_moi is not null then
    update public.membres set notifier = pour_moi where espace_id = eid and user_id = auth.uid();
  end if;
  if accuse is not null then
    update public.espaces set accuse_reception = accuse where id = eid;
  end if;
end;
$$;

revoke execute on function public.regler_notifications(boolean, boolean) from public, anon;
grant execute on function public.regler_notifications(boolean, boolean) to authenticated;

-- 6. Étapes : une nouvelle étape prend la place de « Retenu » (qui recule d'un cran avec les
--    suivantes), même après réordonnancement ; ajouts simultanés sérialisés par espace, pour que
--    la limite de 12 tienne
create or replace function prive.controler_etape()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  place integer;
begin
  if tg_op = 'INSERT' then
    if new.espace_id is null then
      new.espace_id := public.espace_actif();
    end if;
    perform 1 from public.espaces where id = new.espace_id for update;
    if (select count(*) from public.etapes where espace_id = new.espace_id) >= 12 then
      raise exception 'trop_d_etapes: 12 étapes au plus';
    end if;
    if new.position is null then
      select position into place from public.etapes
      where espace_id = new.espace_id and cle = 'retenu';
      update public.etapes set position = position + 1
      where espace_id = new.espace_id and position >= place;
      new.position := place;
    end if;
  elsif new.cle is distinct from old.cle or new.espace_id is distinct from old.espace_id then
    raise exception 'etape_figee: la clé et l''espace d''une étape ne changent pas';
  end if;
  new.nom := trim(new.nom);
  return new;
end;
$$;

-- Échange une étape avec sa voisine, en une seule opération (« Nouveau » reste la première)
create function public.deplacer_etape(eid uuid, sens integer)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  etape record;
  voisine record;
begin
  select e.id, e.espace_id, e.cle, e.position into etape from public.etapes e where e.id = eid;
  if not found or etape.espace_id is distinct from public.espace_actif()
    or not public.est_proprietaire(etape.espace_id) then
    raise exception 'etape_introuvable: rechargez la page';
  end if;
  perform 1 from public.espaces where id = etape.espace_id for update;
  select e.id, e.cle, e.position into voisine from public.etapes e
  where e.espace_id = etape.espace_id
    and case when sens < 0 then e.position < etape.position else e.position > etape.position end
  order by case when sens < 0 then -e.position else e.position end
  limit 1;
  if not found or etape.cle = 'nouveau' or voisine.cle = 'nouveau' then
    return;
  end if;
  update public.etapes set position = voisine.position where id = etape.id;
  update public.etapes set position = etape.position where id = voisine.id;
end;
$$;

revoke execute on function public.deplacer_etape(uuid, integer) from public, anon;
grant execute on function public.deplacer_etape(uuid, integer) to authenticated;

-- Suppression : message clair si l'étape n'est pas (ou plus) dans l'espace actif
create or replace function public.supprimer_etape(eid uuid)
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
  if not found then
    raise exception 'etape_introuvable: rechargez la page';
  end if;
  if not public.est_proprietaire(etape.espace_id) or etape.cle in ('nouveau', 'retenu', 'ecarte') then
    raise exception 'etape_protegee: seul le propriétaire supprime une étape ajoutée';
  end if;
  update public.candidatures set statut = 'nouveau'
  where espace_id = etape.espace_id and statut = etape.cle;
  get diagnostics deplacees = row_count;
  delete from public.etapes where id = eid;
  return deplacees;
end;
$$;
