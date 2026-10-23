# Mise en ligne de Filtre, pas à pas

Ce guide mène du dépôt GitHub à un site en ligne. Il se fait en deux temps :

1. **Répétition** : tout est branché pour de vrai (Supabase, hébergement), mais Stripe reste en
   mode test. On vérifie le parcours complet avec une carte de test.
2. **Passage en réel** : Stripe passe en mode réel, avec l'adresse définitive du site.

Deux commandes accompagnent le guide :

| Commande | Rôle |
|---|---|
| `npm run verifier:config` | Contrôle les fichiers `.env` et `supabase/functions/.env` : valeurs manquantes, clé secrète publiée par erreur, clé d'un autre projet… |
| `npm run verifier:config -- --distant` | Interroge aussi Supabase et Stripe, en lecture seule : migrations appliquées, fonctions déployées, webhook, prix, portail client |
| `npm run deployer:supabase` | Applique les migrations manquantes, envoie les secrets et déploie les sept fonctions (paiement, webhook, formulaire public, réponses aux candidats, rappels d'entretien, CV partagés). Peut être relancée sans risque |
| `npm run planifier:rappels` | Affiche la requête qui planifie les rappels d'entretien, à exécuter une fois dans le *SQL Editor* |

Elles s'utilisent depuis le dossier du projet, avec Node 22 (`npm install` fait une fois).
Sous Windows, lancer `deployer:supabase` depuis Git Bash ou WSL, ou taper ses commandes à la main
(elles sont listées dans `scripts/deployer-supabase.sh`).

Comptez environ deux heures pour la répétition, hors délai de validation du compte Stripe.

---

## Étape 1 — Projet Supabase

1. Sur [supabase.com](https://supabase.com), créer une organisation puis un projet.
   - **Région** : une région européenne (Paris `eu-west-3` ou Francfort), à reporter dans
     `src/lib/infosLegales.ts` (données hébergées dans l'UE, RGPD).
   - **Mot de passe de la base** : le noter dans un gestionnaire de mots de passe, la CLI le
     demandera.
2. *Project Settings > API Keys* : copier l'**URL du projet** et la **clé publique**
   (`sb_publishable_…`, ou la clé `anon` des anciens projets). Jamais la clé secrète ou
   `service_role`.
3. Dans le dossier du projet :
   ```bash
   cp .env.example .env     # puis y coller l'URL et la clé publique
   npm run verifier:config
   ```
   La partie « Site » doit être entièrement cochée (✓). La partie « Fonctions » est en erreur
   pour l'instant, c'est normal.

## Étape 2 — Authentification

Dans le tableau de bord Supabase, menu *Authentication* :

1. *Sign In / Providers* : **Email** activé, **Confirm email** activé (sans quoi n'importe qui
   peut s'inscrire avec l'adresse d'un autre).
2. *URL Configuration* :
   - *Site URL* : l'adresse du site. Pour la répétition, l'adresse donnée par l'hébergeur à
     l'étape 5 (on y reviendra) ; en attendant `http://localhost:5173`.
   - *Redirect URLs* : ajouter `http://localhost:5173/**` et, plus tard,
     `https://<adresse-du-site>/**`. Cette ligne couvre la confirmation d'inscription, le mot de
     passe oublié, le changement d'e-mail et le retour aux invitations.
3. *Emails > SMTP Settings* : brancher un service d'envoi (Brevo, Resend, Postmark…).
   **Indispensable** : sans SMTP personnalisé, Supabase n'envoie qu'un très petit nombre
   d'e-mails par heure, et seulement aux adresses des membres de l'organisation Supabase.
   Les inscriptions de vrais utilisateurs ne recevraient jamais leur lien de confirmation.
4. *Emails > Templates* : traduire en français au moins « Confirm signup », « Reset password »
   et « Change email address ». Garder la variable `{{ .ConfirmationURL }}` dans le lien.

## Étape 3 — Base de données et fonctions

### 3a. Stripe en mode test

Sur [dashboard.stripe.com](https://dashboard.stripe.com), activer le **mode test** (bouton en
haut à droite) :

1. *Catalogue de produits* : créer le produit « Filtre Pro » avec un **prix récurrent mensuel**.
   Copier l'identifiant du prix (`price_…`, pas `prod_…`).
2. *Paramètres > Facturation > Portail client* : activer le portail, autoriser la
   **résiliation à la fin de la période** (c'est ce que disent les conditions générales), le
   changement de moyen de paiement et l'historique des factures.
3. *Développeurs > Clés API* : copier la **clé secrète** (`sk_test_…`).

### 3b. Secrets des fonctions

```bash
cp supabase/functions/.env.example supabase/functions/.env
```

Renseigner `STRIPE_SECRET_KEY`, `STRIPE_PRICE_PRO` et `SITE_URL` (pour l'instant
`http://localhost:5173`). `STRIPE_WEBHOOK_SECRET` viendra à l'étape 4 : laisser `whsec_...`.
Ce fichier ne doit jamais être envoyé sur GitHub (il est dans `.gitignore`).

**E-mails de notification (facultatif).** Quand un candidat postule par le formulaire en ligne,
l'équipe est prévenue et le candidat reçoit un accusé de réception. Ces e-mails passent par
[Resend](https://resend.com) :

1. Créer un compte Resend, puis *Domains > Add domain* : ajouter le domaine d'envoi (ex.
   `filtre.fr`, ou un sous-domaine `mail.filtre.fr`) et créer chez votre registraire les
   enregistrements DNS indiqués. La vérification prend de quelques minutes à quelques heures.
2. *API Keys* : créer une clé (`re_…`). Une clé « Full access » permet à `verifier:config` de
   contrôler le domaine ; une clé « Sending access » suffit pour envoyer.
3. Renseigner `RESEND_API_KEY` et `EMAIL_EXPEDITEUR` (ex. `Filtre <notifications@filtre.fr>`)
   dans `supabase/functions/.env`.

Sans ces deux valeurs, tout fonctionne mais aucun e-mail n'est envoyé. Un échec d'envoi ne fait
jamais perdre une candidature : il est seulement noté dans les journaux de la fonction
(*Edge Functions > postuler > Logs*). Le domaine de test `resend.dev` n'envoie qu'à l'adresse
du compte Resend : il ne convient pas en production.

### 3c. Déploiement

```bash
npx supabase login                               # ouvre le navigateur
npx supabase link --project-ref <id-du-projet>   # l'id est dans l'URL du projet
npm run deployer:supabase
```

Le script affiche les migrations qu'il va appliquer et demande confirmation.

> **Migrations déjà exécutées à la main ?** Si les fichiers `0001` à `0010` ont été passés dans
> le *SQL Editor*, la CLI ne le sait pas et voudrait tout rejouer (elle échouerait dès `0001`,
> sans rien casser). Déclarer d'abord ce qui est déjà en place, puis relancer le script :
> ```bash
> npx supabase migration repair --status applied 0001 0002 0003 0004 0005 0006 0007 0008 0009 0010
> npm run deployer:supabase    # n'applique plus que les migrations suivantes (0011…)
> ```
> Sans la CLI, on peut aussi exécuter les fichiers suivants (`0011_…`, `0012_…`, etc.) un par un,
> dans l'ordre, dans le *SQL Editor* : les deux méthodes ne doivent simplement pas être mélangées
> par la suite.

## Étape 4 — Webhook Stripe

1. Stripe (mode test), *Développeurs > Webhooks > Ajouter une destination* :
   - adresse : `https://<id-du-projet>.supabase.co/functions/v1/webhook-stripe` ;
   - événements : `customer.subscription.created`, `customer.subscription.updated`,
     `customer.subscription.deleted`.
2. Copier le **secret de signature** (`whsec_…`) dans `STRIPE_WEBHOOK_SECRET` de
   `supabase/functions/.env`, puis renvoyer les secrets :
   ```bash
   npm run deployer:supabase    # « N » aux migrations s'il n'y en a plus à appliquer
   ```
3. Contrôle complet :
   ```bash
   npm run verifier:config -- --distant
   ```
   Tout doit être coché, en particulier « Migrations appliquées jusqu'à 0026 »,
   « webhook-stripe déployée et joignable par Stripe », « postuler déployée et ouverte aux
   candidats » et « cv-partage déployée et ouverte aux liens de partage », puis, si les e-mails sont configurés, « Domaine … vérifié chez Resend ». Si une
   fonction « refuse les appels sans jeton », elle a été déployée sans
   `--no-verify-jwt` : relancer le script.

### 4b. Rappels d'entretien (facultatif)

La veille de chaque entretien, les membres de l'espace qui le souhaitent reçoivent un e-mail de
rappel (un seul par personne, qui reprend tous ses entretiens). Il faut les e-mails de
l'étape 3b, puis :

1. `npm run planifier:rappels` : sans secret, la commande en propose un. Le copier dans
   `RAPPELS_SECRET` de `supabase/functions/.env` (et, au besoin, régler `FUSEAU_HORAIRE`,
   `Europe/Paris` par défaut), puis `npm run deployer:supabase`.
2. Relancer `npm run planifier:rappels` : la commande affiche une requête SQL. L'exécuter une
   fois dans le *SQL Editor* de Supabase. Elle active les extensions `pg_cron` et `pg_net` et
   planifie l'appel de la fonction chaque jour à 16 h UTC (17 h à Paris en hiver, 18 h en été ;
   autre heure : `npm run planifier:rappels -- --heure 6`).
3. `npm run verifier:config -- --distant` : « rappels-entretiens déployée, protégée par son
   secret ». Le lendemain, `select * from cron.job_run_details order by start_time desc limit 5;`
   montre les passages.

Un entretien n'est rappelé qu'une fois ; déplacé, il l'est de nouveau. Si l'envoi échoue, il
sera retenté au passage suivant. Chaque membre peut couper ses rappels (*Équipe >
Notifications*).

## Étape 5 — Hébergement

Le site est une application statique (`npm run build` produit `dist/`). `vercel.json` et
`netlify.toml` contiennent déjà les redirections et les en-têtes de sécurité.

1. Sur [vercel.com](https://vercel.com) (ou [netlify.com](https://netlify.com)) : importer le
   dépôt GitHub. Commande `npm run build`, dossier `dist` (détectés automatiquement).
2. Variables d'environnement : `VITE_SUPABASE_URL` et `VITE_SUPABASE_ANON_KEY`, les mêmes que
   dans `.env`. Rien d'autre : tout ce qui commence par `VITE_` est publié avec le site.
3. Déployer, puis noter l'adresse obtenue (ex. `https://filtre.vercel.app`) et la reporter :
   - Supabase, *Authentication > URL Configuration* : *Site URL* et `https://<adresse>/**` dans
     les *Redirect URLs* ;
   - `SITE_URL` de `supabase/functions/.env`, puis `npm run deployer:supabase` (retour après
     paiement).

> **Domaine Supabase personnalisé ?** La politique de sécurité du contenu n'autorise que
> `https://*.supabase.co`. Ajouter le domaine à `connect-src` dans `vercel.json` **et**
> `netlify.toml` (un test vérifie qu'ils restent identiques).

## Étape 6 — Répétition générale

Avec une vraie adresse e-mail, sur le site en ligne :

- [ ] Inscription, réception de l'e-mail de confirmation (en français), clic sur le lien :
      on arrive connecté sur le site en ligne (pas sur `localhost`).
- [ ] Ajout d'une candidature, dépôt d'un CV en PDF, ouverture du CV.
- [ ] Mot de passe oublié : e-mail reçu, nouveau mot de passe accepté.
- [ ] *Tarifs > Passer à Pro*, carte `4242 4242 4242 4242`, date future, code quelconque :
      retour sur *Mon compte*, « Votre offre Pro est active » en quelques secondes.
- [ ] Paiement refusé : dans le portail, remplacer la carte par `4000 0000 0000 0341`
      (acceptée à l'enregistrement, refusée au prélèvement), puis avancer le temps avec une
      horloge de test Stripe (*Test clocks*) jusqu'au renouvellement. *Mon compte* signale le
      paiement en attente, et *Tarifs* propose « Gérer mon abonnement » au lieu d'un second
      abonnement.
- [ ] Formulaire public : sur *Offres*, ouvrir « Formulaire de candidature », cocher
      « Formulaire en ligne », copier le lien et l'ouvrir dans une fenêtre privée. Postuler avec
      un CV : la candidature apparaît dans la liste, avec son CV, rattachée à l'offre. Les
      membres reçoivent l'e-mail « Nouvelle candidature », le candidat l'accusé de réception
      (vérifier qu'ils n'arrivent pas en indésirables) ; *Équipe > Notifications* permet de les
      couper.
- [ ] Réponse au candidat : sur la fiche d'une candidature reçue à votre adresse, « Répondre au
      candidat », modèle « Convocation à un entretien », envoyer. L'e-mail arrive au nom de
      l'espace ; y répondre arrive dans votre boîte, et l'envoi figure dans l'historique.
- [ ] Page carrières : sur *Équipe*, « Page carrières », choisir l'adresse, cocher « Page en
      ligne » et ouvrir le lien dans une fenêtre privée : l'offre en ligne y figure, avec son
      bouton « Postuler ».
- [ ] Invitation : depuis *Équipe*, créer un lien, l'ouvrir dans une fenêtre privée, créer un
      second compte depuis ce lien : on revient à l'invitation après confirmation.
- [ ] *Gérer mon abonnement > Résilier* : l'offre reste Pro jusqu'à la fin de la période, et la
      suppression du compte reste refusée jusque-là.
- [ ] Dans Stripe, annuler l'abonnement immédiatement : *Mon compte* repasse en Gratuit, la
      suppression du compte est acceptée et le CV a disparu de *Storage > cv*.
- [ ] Stripe, *Webhooks* : aucune livraison en échec.

## Étape 7 — Passage en réel

1. **Pages légales** : compléter `src/lib/infosLegales.ts` (éditeur, SIREN, adresse, contact,
   hébergeur, région Supabase), remplacer `PRIX_PRO` dans `src/lib/abonnement.ts` par le prix
   réel, puis faire relire mentions légales, confidentialité et conditions par un
   professionnel.
2. **Domaine** : le brancher chez l'hébergeur, puis mettre à jour *Site URL*, *Redirect URLs*
   et `SITE_URL` comme à l'étape 5.
3. **Stripe en mode réel** : activer le compte (identité, compte bancaire), puis refaire en mode
   réel les étapes 3a et 4 : produit et prix, portail client, webhook. Les objets du mode test
   ne sont pas repris. Mettre `sk_live_…`, le nouveau `price_…` et le nouveau `whsec_…` dans
   `supabase/functions/.env`.
4. ```bash
   npm run deployer:supabase
   npm run verifier:config -- --distant --production
   ```
   Aucune erreur ni point d'attention ne doit rester.
5. Refaire la répétition générale avec une vraie carte, puis se rembourser depuis Stripe.

## Après la mise en ligne

- **Plan Supabase gratuit** : un projet sans activité pendant une semaine est mis en pause, et
  les sauvegardes quotidiennes ne sont proposées qu'à partir du plan payant. Pour des clients
  réels, passer au plan Pro de Supabase.
- **Nouvelles migrations** : elles s'appliquent avec `npm run deployer:supabase` (ou dans le
  *SQL Editor*, toujours dans l'ordre et toujours par la même méthode).
- **Fonctions** : toute modification de `supabase/functions/` demande de relancer
  `npm run deployer:supabase` ; le site, lui, est redéployé par l'hébergeur à chaque envoi sur
  la branche principale.
- **Clés** : en cas de fuite d'une clé secrète (Stripe ou Supabase), la révoquer dans le
  tableau de bord concerné, en créer une nouvelle et relancer le déploiement.
