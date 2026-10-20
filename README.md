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
   et ajouter dans *Redirect URLs* (puis l'équivalent en production) :
   `http://localhost:5173/nouveau-mot-de-passe` pour le lien « mot de passe oublié » et
   `http://localhost:5173/compte` pour la confirmation d'un changement d'e-mail.

4. Créer la base (table des candidatures, suppression de compte) : dans *SQL Editor*, exécuter dans l'ordre les fichiers de
   `supabase/migrations/` (ou `supabase db push` avec la CLI Supabase).

Les pages placées dans `src/routes/_authentifie/` exigent une session :
sans connexion, l'utilisateur est renvoyé vers `/connexion`, puis ramené à la page demandée.

## Candidatures

Le tableau de bord liste les candidatures de l'utilisateur connecté (règles RLS : chacun ne voit
que les siennes). Les filtres (recherche, compétences requises, expérience minimum, statut)
s'appliquent dans le navigateur et sont conservés dans l'URL.

Les candidatures peuvent aussi être importées depuis un fichier CSV (bouton « Importer un CSV »,
jusqu'à 1000 lignes) : colonnes `nom` (obligatoire), `email`, `poste`, `competences`, `experience`.
Le séparateur (`;`, `,` ou tabulation) et l'encodage (UTF-8 ou celui d'Excel) sont détectés.

Doublons : deux candidatures avec le même e-mail (sans tenir compte des majuscules) sont refusées
par la base. À l'import, une ligne sans e-mail est aussi écartée si une candidature porte déjà le
même nom (sans accents ni majuscules), dans la base ou plus haut dans le fichier.

```bash
npm test   # tests du filtrage et de l'import CSV (Vitest)
```
