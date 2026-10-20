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

4. Créer la base (candidatures, notes, stockage des CV, abonnements, suppression de compte) : dans *SQL Editor*, exécuter dans l'ordre les fichiers de
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

Le bouton « Exporter en CSV » télécharge les candidatures affichées (filtres compris), au même
format que l'import (plus le statut et la date d'ajout) : un export peut être réimporté. Les
cellules qui commencent par `=`, `+`, `-` ou `@` sont précédées d'une apostrophe pour qu'Excel ne
les exécute pas comme des formules.

Doublons : deux candidatures avec le même e-mail (sans tenir compte des majuscules) sont refusées
par la base. À l'import, une ligne sans e-mail est aussi écartée si une candidature porte déjà le
même nom (sans accents ni majuscules), dans la base ou plus haut dans le fichier.

```bash
npm test   # tests du filtrage, de l'import/export CSV et des règles SQL (Vitest + PGlite)
```

Chaque candidature a sa fiche (clic sur le nom) : notes internes datées et CV en PDF (5 Mo au
plus), rangé dans le bucket Supabase privé `cv` sous `<user_id>/…` ; chaque utilisateur n'accède
qu'à ses fichiers. Les fichiers sont supprimés avec la candidature ou le compte.

## Abonnements (Stripe)

Deux offres : **Gratuite** (50 candidatures au plus, limite imposée par la base) et **Pro**
(illimitée, abonnement Stripe). Le prix affiché sur la page Tarifs est `PRIX_PRO` dans
`src/lib/abonnement.ts` ; le prix réellement facturé est celui configuré dans Stripe.

1. Dans Stripe (mode test pour commencer) : créer un produit « Pro » avec un prix récurrent
   mensuel et noter son identifiant `price_…`.
2. Dans *Settings > Billing > Customer portal*, activer le portail client (résiliation,
   changement de carte, factures).
3. Installer la [CLI Supabase](https://supabase.com/docs/guides/cli), puis :
   ```bash
   supabase login
   supabase link --project-ref <id-du-projet>
   cp supabase/functions/.env.example supabase/functions/.env   # puis renseigner les valeurs
   supabase secrets set --env-file supabase/functions/.env
   supabase functions deploy creer-checkout
   supabase functions deploy portail-client
   supabase functions deploy webhook-stripe --no-verify-jwt
   ```
4. Dans Stripe, *Developers > Webhooks* : ajouter l'adresse
   `https://<id-du-projet>.supabase.co/functions/v1/webhook-stripe` avec les événements
   `customer.subscription.created`, `customer.subscription.updated` et
   `customer.subscription.deleted`, puis copier le secret de signature (`whsec_…`) dans
   `STRIPE_WEBHOOK_SECRET` et relancer `supabase secrets set`.

Carte de test Stripe : `4242 4242 4242 4242`, date future, n'importe quel code.

Un compte avec un abonnement actif ne peut pas être supprimé : il faut d'abord résilier
(bouton « Gérer mon abonnement » dans *Mon compte*).

## Pages légales

`/mentions-legales`, `/confidentialite` et `/conditions` (liens en pied de page et à
l'inscription) sont des **modèles** décrivant le fonctionnement réel du service. Avant la mise en
ligne :

- renseigner `src/lib/infosLegales.ts` (éditeur, adresse, SIREN, contact, hébergeur, région
  Supabase…) : tout champ vide s'affiche « [À compléter : …] » sur le site ;
- dans le portail client Stripe, régler la résiliation « à la fin de la période de facturation »,
  comme l'indiquent les conditions ;
- faire relire les textes par un professionnel (statut, TVA, clientèle professionnelle ou
  particuliers, médiateur de la consommation…).

## Vérifications automatiques

À chaque envoi sur GitHub (et sur chaque pull request), `.github/workflows/ci.yml` lance :

- `npm run lint`, `npm test` et `npm run build` ;
- `deno check` sur les fonctions Supabase.

Les tests des migrations appliquent les fichiers de `supabase/migrations/` sur un Postgres en
mémoire (PGlite) et vérifient la limite Gratuite, les doublons, la suppression de compte, les
notes, le stockage des CV et les règles de sécurité (RLS).

## Mise en production

Le site est une application monopage statique (`npm run build` produit `dist/`).
`vercel.json` et `netlify.toml` renvoient toutes les adresses vers `index.html`.

1. **Hébergement** (Vercel ou Netlify) : importer le dépôt GitHub. Commande `npm run build`,
   dossier `dist` (détectés automatiquement). Ajouter les variables d'environnement
   `VITE_SUPABASE_URL` et `VITE_SUPABASE_ANON_KEY`.
2. **Supabase**, *Authentication > URL Configuration* : *Site URL* = l'adresse de production
   (ex. `https://filtre.fr`), et ajouter `https://filtre.fr/nouveau-mot-de-passe` et
   `https://filtre.fr/compte` aux *Redirect URLs*.
3. **Supabase**, base : exécuter les migrations de `supabase/migrations/` dans l'ordre
   (ou `supabase db push`).
4. **Stripe** en mode réel (*live*) : recréer le produit et le prix Pro, activer le portail
   client, créer le webhook vers `https://<id-du-projet>.supabase.co/functions/v1/webhook-stripe`.
5. **Secrets des fonctions** : `STRIPE_SECRET_KEY` (clé live), `STRIPE_PRICE_PRO`,
   `STRIPE_WEBHOOK_SECRET` (celui du webhook live) et `SITE_URL` = l'adresse de production, puis
   `supabase secrets set --env-file supabase/functions/.env` et redéployer les fonctions.
6. **Vérifier** : inscription, confirmation par e-mail, connexion, ajout d'une candidature,
   passage à Pro avec une vraie carte, puis résiliation depuis *Mon compte*.

