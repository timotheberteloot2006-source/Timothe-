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
   `http://localhost:5173/compte` pour la confirmation d'un changement d'e-mail ; plus simple :
   `http://localhost:5173/**`, qui couvre aussi le retour aux invitations après l'inscription.

4. Créer la base (candidatures, notes, stockage des CV, abonnements, offres, entretiens,
   espaces d'équipe, historique, suppression de compte) : dans *SQL Editor*, exécuter dans l'ordre les fichiers de
   `supabase/migrations/` (ou `supabase db push` avec la CLI Supabase).

Les pages placées dans `src/routes/_authentifie/` exigent une session :
sans connexion, l'utilisateur est renvoyé vers `/connexion`, puis ramené à la page demandée.

## Travail en équipe

Les données appartiennent à un **espace**. Chaque compte a un espace personnel (même identifiant
que le compte) et peut être invité dans d'autres ; la page **Équipe** permet de choisir l'espace
actif, dont le site affiche les données.

- **Propriétaire** : renomme l'espace, crée des liens d'invitation (à usage unique, valables
  7 jours, à transmettre soi-même), retire des membres, gère l'abonnement.
- **Membres** : voient et modifient candidatures, notes, offres, entretiens et CV de l'espace ;
  peuvent quitter l'espace.
- **Offre Pro par espace** : l'abonnement du propriétaire couvre tous les membres ; en Gratuit,
  la limite de 50 candidatures s'applique à l'espace entier.
- La base n'expose que l'espace actif, et seulement à ses membres
  (`supabase/migrations/0008_espaces.sql`). Supprimer le compte d'un membre conserve ce qu'il a
  ajouté à l'équipe ; un propriétaire doit d'abord retirer ses membres, ou transférer la
  propriété à l'un d'eux (il devient alors membre et reçoit un nouvel espace personnel).
- Une personne invitée qui crée son compte depuis le lien est ramenée à l'invitation par le lien
  de confirmation : ajouter `http://localhost:5173/**` (et l'équivalent en production) aux
  *Redirect URLs* de Supabase.

## Thème clair / sombre

Le site suit le réglage clair ou sombre de l'appareil. Le thème sombre est défini dans
`src/index.css` en redéfinissant les couleurs Tailwind utilisées (échelle de gris inversée, fonds
d'alerte foncés). Deux couleurs sont propres au site : `surface` (fond des cartes et champs, à
utiliser à la place de `bg-white`) et `accent` (liens, à la place de `text-indigo-600`).

## Candidatures

Le tableau de bord liste les candidatures de l'utilisateur connecté (règles RLS : chacun ne voit
que les siennes). Les filtres (recherche, compétences requises, expérience minimum, statut)
s'appliquent dans le navigateur et sont conservés dans l'URL, comme le tri (date, nom, expérience,
statut) et la page (25 candidatures par page ; l'export contient toutes les pages).

**Étapes de recrutement** : le statut d'une candidature est une étape de son espace. Chaque
espace a trois étapes de base, « Nouveau » (toujours la première, où arrivent les candidatures),
« Retenu » et « Écarté », que le propriétaire peut renommer ; il peut aussi en ajouter (12 au
plus, ex. « Présélection », « Entretien RH », « Offre »), les ordonner et les supprimer (page
**Équipe**, « Étapes de recrutement »). Supprimer une étape ramène ses candidatures à la
première ; l'historique garde le nom des étapes au moment de chaque changement
(`supabase/migrations/0015_etapes.sql`). Les étapes servent partout : liste, fiche, filtres, tri
par statut, statistiques, export CSV et tableau.

Le bouton **Tableau** affiche les candidatures en colonnes, une par étape, avec les mêmes filtres
et le même tri, sans pagination (50 cartes par colonne, puis « Afficher les … autres » ; au-delà
de quelques étapes, le tableau défile horizontalement). On change l'étape d'une candidature en
glissant sa carte dans une autre colonne, ou au clavier avec le menu de la carte ; chaque
déplacement est annoncé aux lecteurs d'écran, et une carte revient à sa place si la base refuse
le changement. La vue choisie est gardée dans l'adresse (`?vue=tableau`).

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

La page **Offres** permet de créer des offres d'emploi (postes ouverts) et d'y rattacher les
candidatures (formulaire, ou d'un coup à l'import CSV) ; le tableau de bord filtre par offre, dont
« Sans offre ». La base garantit qu'une candidature ne vise qu'une offre du même utilisateur ;
supprimer une offre conserve ses candidatures, détachées.

Chaque offre peut avoir un **formulaire de candidature public** (page **Offres**, « Formulaire de
candidature ») : une fois en ligne, son lien `/postuler/<lien secret>` permet aux candidats de
postuler sans compte, avec leur CV en PDF. La candidature arrive dans la liste, rattachée à
l'offre, et son historique indique « Candidature reçue par le formulaire en ligne ».

- L'envoi passe par la fonction `supabase/functions/postuler` (déployée avec `--no-verify-jwt`),
  qui contrôle les champs et le PDF, puis par la fonction SQL `deposer_candidature_publique`
  (`supabase/migrations/0013_formulaire_public.sql`), seule autorisée à écrire.
- Contre le spam : champ piège invisible, envoi trop rapide ignoré, 5 envois par heure et par
  connexion (empreinte non réversible de l'adresse IP, gardée un jour).
- Un candidat déjà présent dans l'espace (même e-mail) n'est pas dupliqué : le nouvel envoi est
  noté dans l'historique de sa fiche. Il reçoit le même message de confirmation, pour ne pas
  révéler qui figure dans la base.
- En offre Gratuite, le formulaire indique qu'il n'accepte plus de candidatures quand l'espace
  atteint 50 candidatures.
- « Nouveau lien » désactive l'ancien, s'il a été trop diffusé.
- **Rappels d'entretien** (facultatifs, `supabase/functions/rappels-entretiens`,
  `supabase/migrations/0018_rappels_entretiens.sql`) : chaque jour, une tâche planifiée de la base
  (`npm run planifier:rappels`) appelle la fonction, qui envoie à chaque membre qui le souhaite un
  e-mail reprenant ses entretiens des 30 prochaines heures, à l'heure de `FUSEAU_HORAIRE`. Un
  entretien n'est rappelé qu'une fois, de nouveau s'il est déplacé ; un envoi échoué est retenté
  au passage suivant. La fonction n'accepte que les appels portant son secret (`RAPPELS_SECRET`).
- **Modèles de réponse** (`supabase/migrations/0019_modeles_reponse.sql`,
  `supabase/functions/envoyer-reponse`) : depuis la fiche, « Répondre au candidat » envoie un
  e-mail à partir d'un modèle de l'espace (trois proposés : convocation, réponse négative, demande
  de pièces), retouchable avant l'envoi, avec aperçu ; `{nom}`, `{offre}` et `{espace}` sont
  remplacés. L'e-mail part au nom de l'espace, le candidat répond directement au recruteur, et
  l'envoi est noté dans l'historique. Les membres gèrent les modèles (page **Équipe**) ; la
  fonction applique leurs droits (candidature de leur espace) et limite les envois à 100 par
  heure et par espace. Il faut les e-mails Resend configurés.
- **Page carrières** (`/carrieres/<adresse>`, `supabase/migrations/0016_page_carrieres.sql`) :
  le propriétaire choisit l'adresse (proposée à partir du nom de l'espace), écrit une
  présentation et met la page en ligne (page **Équipe**, « Page carrières »). Elle liste, sans
  compte, les offres dont le formulaire est en ligne, chacune avec un bouton « Postuler ». Seules
  les offres publiées sont exposées, par la fonction `lire_page_carrieres`.
- **Notifications par e-mail** (facultatives, par [Resend](https://resend.com) : secrets
  `RESEND_API_KEY` et `EMAIL_EXPEDITEUR`) : chaque membre est prévenu d'une nouvelle candidature,
  avec le lien vers sa fiche, et le candidat reçoit un accusé de réception. Page **Équipe**,
  rubrique « Notifications » : chaque membre choisit d'être prévenu ou non, le propriétaire active
  ou coupe l'accusé de réception (`supabase/migrations/0014_notifications.sql`). L'accusé ne
  reprend rien de ce que le candidat a saisi, pour que le formulaire ne serve pas à envoyer des
  messages à n'importe qui. Un échec d'envoi ne fait pas perdre la candidature.

Sur la fiche d'une candidature, on planifie des **entretiens** (date, durée, lieu ou lien de
visio) et on les ajoute à son agenda grâce à un fichier `.ics` (Google Agenda, Outlook, Apple
Calendrier…). Le tableau de bord affiche les entretiens à venir et la date du prochain sur chaque
candidature concernée.

La fiche affiche aussi l'**historique** de la candidature : création, changements de statut,
modifications, CV, notes et entretiens, avec l'auteur et la date. Il est enregistré par la base
elle-même (déclencheurs, `supabase/migrations/0010_historique.sql`) : le site peut le lire mais
ni l'écrire, ni le modifier, ni l'effacer.

La « Vue d'ensemble » en haut du tableau de bord résume toutes les candidatures (nombre par statut,
expérience moyenne, CV, compétences les plus fréquentes) ; un clic sur un statut ou une compétence
applique le filtre correspondant, un second clic le retire.

Des cases à cocher permettent d'agir sur plusieurs candidatures de la page à la fois (changer le
statut, supprimer avec notes et CV). La sélection se vide quand les filtres, le tri ou la page
changent.

Chaque candidature a sa fiche (clic sur le nom) : notes internes datées et CV en PDF (5 Mo au
plus), rangé dans le bucket Supabase privé `cv` sous `<espace_id>/…` ; seuls les membres de l'espace y
accèdent. Les fichiers sont supprimés avec la candidature ou le compte.

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
   supabase functions deploy postuler --no-verify-jwt
   ```
   (ou simplement `npm run deployer:supabase`, voir [`docs/MISE_EN_LIGNE.md`](docs/MISE_EN_LIGNE.md))
4. Dans Stripe, *Developers > Webhooks* : ajouter l'adresse
   `https://<id-du-projet>.supabase.co/functions/v1/webhook-stripe` avec les événements
   `customer.subscription.created`, `customer.subscription.updated` et
   `customer.subscription.deleted`, puis copier le secret de signature (`whsec_…`) dans
   `STRIPE_WEBHOOK_SECRET` et relancer `supabase secrets set`.

Carte de test Stripe : `4242 4242 4242 4242`, date future, n'importe quel code.

Un compte dont l'abonnement court encore (y compris résilié jusqu'à la fin de la période, ou avec
un paiement en attente) ne peut pas être supprimé : il faut d'abord résilier (bouton « Gérer mon
abonnement » dans *Mon compte*).

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
- `npm run test:e2e` : parcours dans un vrai navigateur (Playwright) ;
- `deno check` sur les fonctions Supabase.

Les tests des migrations appliquent les fichiers de `supabase/migrations/` sur un Postgres en
mémoire (PGlite) et vérifient la limite Gratuite, les doublons, la suppression de compte, les
notes, le stockage des CV et les règles de sécurité (RLS).

### Performance

`npm run budget` construit le site comme en production et vérifie le poids compressé du code
chargé à l'ouverture d'une page : 140 Ko de JavaScript et 8 Ko de CSS au plus
(`scripts/budget.mjs`, lancé par la vérification automatique). Pour tenir ce budget :

- chaque page est un morceau séparé, chargé à la visite (découpage automatique de TanStack Router) ;
- `src/lib/clientSupabase.ts` assemble un client Supabase sans le temps réel (inutilisé), et ne
  télécharge le stockage des CV et les fonctions de paiement qu'à leur première utilisation.

### Accessibilité

`e2e/accessibilite.e2e.ts` passe chaque page (publique et connectée, panneaux ouverts) à l'audit
**axe-core** (règles WCAG 2.1 A et AA), en thème clair et sombre, et vérifie ce qu'axe ne voit pas :
lien d'évitement « Aller au contenu », connexion entièrement au clavier, focus visible, titre de
l'onglet propre à chaque page (option `head` des routes, `src/lib/titre.ts`). L'audit automatique
ne remplace pas un test avec un lecteur d'écran.

### Tests de bout en bout

`npm run test:e2e` construit le site en le branchant sur un **faux Supabase**
(`e2e/fauxSupabase.ts`, qui simule authentification, base, stockage et fonctions de paiement en
mémoire), puis joue les parcours de `e2e/*.e2e.ts` dans Chromium : connexion, ajout et
modification, doublons, filtres, tri, pagination, actions groupées, vue tableau (Kanban),
statistiques, offres, entretiens, import/export CSV, fiche (notes, CV), équipe, formulaire
public, en-têtes de sécurité et abonnement. En local, installer le navigateur une fois avec
`npx playwright install chromium`.

## Mise en production

Le guide pas à pas est dans [`docs/MISE_EN_LIGNE.md`](docs/MISE_EN_LIGNE.md) : répétition avec
Stripe en mode test, puis passage en réel. Il s'appuie sur deux commandes :

- `npm run verifier:config` contrôle les fichiers `.env` et `supabase/functions/.env` ; avec
  `-- --distant`, il interroge aussi Supabase et Stripe en lecture seule (migrations, fonctions,
  webhook, prix, portail client) ;
- `npm run deployer:supabase` applique les migrations manquantes, envoie les secrets et déploie
  les fonctions.

`vercel.json` et `netlify.toml` déclarent les mêmes en-têtes de sécurité (politique de contenu
stricte, site non intégrable dans une autre page) ; `vite preview` les applique aussi, et un test
de bout en bout vérifie que le site fonctionne sans aucune ressource bloquée.
