-- Une seule candidature par e-mail (sans tenir compte des majuscules) pour un même utilisateur.
-- Échoue si des doublons existent déjà : les supprimer avant d'appliquer la migration.
create unique index candidatures_user_email_unique
  on public.candidatures (user_id, lower(email))
  where email is not null;
