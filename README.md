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

Les pages placées dans `src/routes/_authentifie/` exigent une session :
sans connexion, l'utilisateur est renvoyé vers `/connexion`, puis ramené à la page demandée.
