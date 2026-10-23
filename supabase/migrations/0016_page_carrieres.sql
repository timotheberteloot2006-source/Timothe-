-- Page carrières publique d'un espace (/carrieres/<adresse>) : présentation et liste des offres
-- dont le formulaire est en ligne. Réglée par le propriétaire (règle de modification des
-- espaces) ; lisible sans compte par lire_page_carrieres, qui n'expose que les offres publiées.

alter table public.espaces
  -- Adresse choisie par le propriétaire : minuscules, chiffres et tirets
  add column slug text check (slug ~ '^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$'),
  add column carrieres_publiques boolean not null default false,
  add column presentation text check (presentation is null or length(presentation) <= 2000),
  add constraint espaces_carrieres_adresse check (not carrieres_publiques or slug is not null);

create unique index espaces_slug_unique on public.espaces (slug);

-- null si la page n'existe pas ou n'est pas en ligne
create function public.lire_page_carrieres(adresse text)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'nom', e.nom,
    'presentation', e.presentation,
    'offres', coalesce((
      select jsonb_agg(
        jsonb_build_object('titre', o.titre, 'description', o.description, 'jeton', o.jeton_public)
        order by lower(o.titre))
      from public.offres o
      where o.espace_id = e.id and o.publique
    ), '[]'::jsonb)
  )
  from public.espaces e
  where e.slug = lower(adresse) and e.carrieres_publiques;
$$;

revoke execute on function public.lire_page_carrieres(text) from public;
grant execute on function public.lire_page_carrieres(text) to anon, authenticated;
