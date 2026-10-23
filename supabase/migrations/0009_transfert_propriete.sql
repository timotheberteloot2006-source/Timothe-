-- Transfert de la propriété d'un espace à l'un de ses membres.
--
-- L'ancien propriétaire devient membre de l'espace et reçoit un nouvel espace personnel, vide.
-- L'identifiant d'un espace ne désigne donc plus forcément son propriétaire : le repli de
-- espace_actif() n'est plus « l'identifiant du compte » mais « un espace dont on est
-- propriétaire », toujours vérifié.

create or replace function public.espace_actif()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (
      select p.espace_actif
      from public.profils p
      join public.membres m on m.espace_id = p.espace_actif and m.user_id = p.user_id
      where p.user_id = auth.uid()
    ),
    -- Repli : le plus ancien espace dont l'utilisateur est propriétaire (et membre)
    (
      select e.id
      from public.espaces e
      join public.membres m on m.espace_id = e.id and m.user_id = auth.uid()
      where e.proprietaire_id = auth.uid()
      order by e.created_at
      limit 1
    )
  );
$$;

create function public.transferer_propriete(eid uuid, nouveau uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  nouvel_espace uuid;
begin
  if not public.est_proprietaire(eid) then
    raise exception 'transfert_refuse: seul le propriétaire peut transférer l''espace';
  end if;
  if nouveau = auth.uid()
    or not exists (select 1 from public.membres where espace_id = eid and user_id = nouveau) then
    raise exception 'transfert_refuse: le nouveau propriétaire doit être membre de l''espace';
  end if;

  update public.espaces set proprietaire_id = nouveau where id = eid;
  update public.membres set role = 'membre' where espace_id = eid and user_id = auth.uid();
  update public.membres set role = 'proprietaire' where espace_id = eid and user_id = nouveau;

  -- Nouvel espace personnel pour l'ancien propriétaire (l'espace transféré reste actif)
  insert into public.espaces (nom, proprietaire_id) values ('Mon espace', auth.uid())
    returning id into nouvel_espace;
  insert into public.membres (espace_id, user_id, email, role)
    values (nouvel_espace, auth.uid(), (select email from auth.users where id = auth.uid()), 'proprietaire');
end;
$$;

revoke execute on function public.transferer_propriete(uuid, uuid) from public, anon;
grant execute on function public.transferer_propriete(uuid, uuid) to authenticated;
