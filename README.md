# Timothe-
Dépôts Claude 

## Démarrage

```bash
npm install
cp .env.example .env   # puis renseigner les clés Supabase
npm run dev
```

## Authentification (Supabase)

1. Créer un projet sur [supabase.com](https://supabase.com).
2. Dans *Project Settings > API*, copier l'URL du projet et la clé `anon` dans `.env`
   (`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`).
3. Dans *Authentication > URL Configuration*, mettre l'adresse du site dans *Site URL*
   (ex. `http://localhost:5173`) pour que les liens de confirmation y renvoient,
   et ajouter `http://localhost:5173/nouveau-mot-de-passe` (puis l'équivalent en production)
   dans *Redirect URLs* pour le lien « mot de passe oublié ».

4. Créer la table des candidatures : dans *SQL Editor*, exécuter le contenu de
   `supabase/migrations/0001_candidatures.sql` (ou `supabase db push` avec la CLI Supabase).

Les pages placées dans `src/routes/_authentifie/` exigent une session :
sans connexion, l'utilisateur est renvoyé vers `/connexion`, puis ramené à la page demandée.

## Candidatures

Le tableau de bord liste les candidatures de l'utilisateur connecté (règles RLS : chacun ne voit
que les siennes). Les filtres (recherche, compétences requises, expérience minimum, statut)
s'appliquent dans le navigateur et sont conservés dans l'URL.

```bash
npm test   # tests de la logique de filtrage (Vitest)
```
