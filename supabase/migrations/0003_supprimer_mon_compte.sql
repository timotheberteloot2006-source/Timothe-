-- Permet à un utilisateur connecté de supprimer son propre compte.
-- security definer : la fonction s'exécute avec les droits de son propriétaire, seul habilité
-- à écrire dans auth.users ; elle ne supprime que l'utilisateur appelant (auth.uid()).
-- Ses candidatures sont supprimées en cascade (on delete cascade).
create function public.supprimer_mon_compte()
returns void
language sql
security definer
set search_path = ''
as $$
  delete from auth.users where id = auth.uid();
$$;

revoke execute on function public.supprimer_mon_compte() from public, anon;
grant execute on function public.supprimer_mon_compte() to authenticated;
