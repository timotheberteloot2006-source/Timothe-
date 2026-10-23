-- Abonnements Stripe : une ligne par utilisateur ayant ouvert un paiement.
-- Seules les fonctions serveur (clé service_role) y écrivent ; l'utilisateur ne fait que lire.
create table public.abonnements (
  user_id uuid primary key references auth.users (id) on delete cascade,
  stripe_customer_id text not null unique,
  stripe_subscription_id text,
  -- Statut Stripe : active, trialing, past_due, canceled, incomplete…
  statut text,
  fin_periode timestamptz,
  updated_at timestamptz not null default now()
);

alter table public.abonnements enable row level security;

create policy "Lecture de son abonnement" on public.abonnements
  for select using (user_id = auth.uid());

-- Offre Pro : abonnement actif ou en période d'essai
create function public.est_pro(uid uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.abonnements
    where user_id = uid and statut in ('active', 'trialing')
  );
$$;

-- Offre Gratuite : 50 candidatures au plus (même valeur que LIMITE_GRATUITE dans src/lib/abonnement.ts).
-- Trigger par ligne : lors d'un import, chaque ligne voit celles insérées avant elle.
create function public.verifier_limite_candidatures()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.est_pro(new.user_id)
    and (select count(*) from public.candidatures where user_id = new.user_id) >= 50 then
    raise exception 'limite_gratuite: 50 candidatures au plus avec l''offre Gratuite';
  end if;
  return new;
end;
$$;

create trigger candidatures_limite_gratuite
  before insert on public.candidatures
  for each row execute function public.verifier_limite_candidatures();

-- Supprimer son compte n'arrête pas l'abonnement chez Stripe : on exige de le résilier d'abord
create or replace function public.supprimer_mon_compte()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if public.est_pro(auth.uid()) then
    raise exception 'abonnement_actif: résiliez votre abonnement avant de supprimer le compte';
  end if;
  delete from auth.users where id = auth.uid();
end;
$$;
