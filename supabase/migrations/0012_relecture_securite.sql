-- Corrections de sécurité issues de la relecture complète.

-- 1. Notes et entretiens : leur espace suit toujours celui de leur candidature, y compris en
--    modification. Sans cela, un membre pouvait rattacher sa note à une candidature d'un autre
--    espace (la règle ne vérifiait que l'espace, inchangé) et écrire dans son historique.
create or replace function public.remplir_espace_candidature()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is not null then
    new.user_id := auth.uid();
  end if;
  new.espace_id := (select espace_id from public.candidatures where id = new.candidature_id);
  return new;
end;
$$;

-- En modification, l'auteur d'origine est conservé ; seul l'espace est recalculé
create function public.recalculer_espace_candidature()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.user_id := old.user_id;
  new.espace_id := (select espace_id from public.candidatures where id = new.candidature_id);
  return new;
end;
$$;

create trigger notes_espace_modification before update on public.notes
  for each row execute function public.recalculer_espace_candidature();
create trigger entretiens_espace_modification before update on public.entretiens
  for each row execute function public.recalculer_espace_candidature();

-- 2. Abonnement « en cours » : actif, en essai, mais aussi en défaut de paiement (Stripe continue
--    alors de prélever). Il empêche de supprimer le compte et d'ouvrir un second abonnement.
create function public.abonnement_en_cours(uid uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.abonnements
    where user_id = uid and statut in ('active', 'trialing', 'past_due', 'unpaid', 'incomplete')
  );
$$;

-- 3. Suppression du compte : vérifications sans effet de bord, appelables avant d'effacer les CV
create function public.verifier_suppression_compte()
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if public.abonnement_en_cours(auth.uid()) then
    raise exception 'abonnement_actif: résiliez votre abonnement avant de supprimer le compte';
  end if;
  if exists (
    select 1 from public.membres m
    join public.espaces e on e.id = m.espace_id
    where e.proprietaire_id = auth.uid() and m.user_id <> auth.uid()
  ) then
    raise exception 'equipe_non_vide: retirez les membres de votre espace avant de supprimer le compte';
  end if;
end;
$$;

create or replace function public.supprimer_mon_compte()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.verifier_suppression_compte();
  delete from auth.users where id = auth.uid();
end;
$$;

-- Chemins des CV des espaces possédés (supprimés avec le compte), sans changer d'espace actif.
-- Un tableau (une seule valeur) n'est pas soumis à la limite de lignes de l'API.
create function public.cv_de_mes_espaces()
returns text[]
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(array_agg(c.cv_chemin), '{}')
  from public.candidatures c
  join public.espaces e on e.id = c.espace_id
  where e.proprietaire_id = auth.uid() and c.cv_chemin is not null;
$$;

-- 4. Ordre des notifications Stripe : date du dernier événement appliqué
alter table public.abonnements add column stripe_evenement_le timestamptz;

-- 5. Droits d'exécution : aucune fonction n'est appelable sans compte ; celles qui révèlent la
--    situation d'un autre utilisateur ne sont appelables que par la base elle-même.
revoke execute on function public.est_pro(uuid) from public, anon, authenticated;
revoke execute on function public.est_pro_espace(uuid) from public, anon, authenticated;
revoke execute on function public.abonnement_en_cours(uuid) from public, anon, authenticated;

-- Utilisées par les règles d'accès (évaluées avec les droits de l'utilisateur connecté) et ne
-- renseignant que sur l'utilisateur lui-même
revoke execute on function public.est_membre(uuid) from public, anon;
revoke execute on function public.est_membre_dossier(text) from public, anon;
revoke execute on function public.est_proprietaire(uuid) from public, anon;
revoke execute on function public.espace_actif() from public, anon;
grant execute on function public.est_membre(uuid) to authenticated;
grant execute on function public.est_membre_dossier(text) to authenticated;
grant execute on function public.est_proprietaire(uuid) to authenticated;
grant execute on function public.espace_actif() to authenticated;

revoke execute on function public.verifier_suppression_compte() from public, anon;
revoke execute on function public.cv_de_mes_espaces() from public, anon;
revoke execute on function public.supprimer_mon_compte() from anon;
grant execute on function public.verifier_suppression_compte() to authenticated;
grant execute on function public.cv_de_mes_espaces() to authenticated;
