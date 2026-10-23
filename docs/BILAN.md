# Bilan avant mise en ligne

Point d'étape sur Filtre après 50 étapes de développement (du 20 au 23 octobre 2026) : ce que
fait le service, comment il est vérifié, ce qui n'a jamais tourné en conditions réelles, les
risques connus et les choix qui restent à valider. Le déroulé technique de la mise en ligne est
dans [`MISE_EN_LIGNE.md`](MISE_EN_LIGNE.md) ; le détail de chaque étape, dans la description de
la pull request.

## En bref

- **Le code est complet pour un lancement**, et toute la vérification automatique est au vert :
  254 tests unitaires et de base de données, 122 tests dans le navigateur, contrôle des types
  des 7 fonctions serveur, budget de poids respecté.
- **Rien n'a encore tourné contre de vrais services** (projet Supabase, compte Stripe, compte
  Resend). C'est le principal risque restant : la répétition générale du guide de mise en ligne
  sert à le lever.
- **Il reste du travail non technique** : informations légales de l'éditeur, prix de l'offre Pro,
  domaine, et quelques choix de produit listés plus bas.

## Ce que fait Filtre

| Domaine | Fonctions |
|---|---|
| Comptes et équipes | Inscription, connexion, mot de passe oublié ; espaces partagés, invitations par lien, rôles propriétaire / membre, transfert de propriété ; suppression du compte |
| Candidatures | Ajout, modification, import et export CSV, doublons, CV en PDF, notes internes, historique inviolable ; liste filtrée et triée (filtres gardés dans l'adresse), pagination, actions groupées, vue tableau par étape avec glisser-déposer |
| Recrutement | Offres d'emploi, étapes personnalisables, entretiens (export agenda, rappel par e-mail la veille), modèles de réponse envoyés au candidat, évaluation par critères, étiquettes |
| Côté candidats | Formulaire public par offre (avec CV), page carrières de l'espace, accusé de réception |
| Pilotage | Vue d'ensemble de la liste, page Statistiques (période, délai jusqu'à « Retenu », répartitions) |
| Collaboration | Rafraîchissement automatique économe, lien de partage en lecture seule pour un manager |
| Conformité | Export ZIP des données d'un candidat, effacement, registre des demandes ; pages légales à compléter |
| Abonnement | Offre Gratuite (50 candidatures, limite imposée par la base) et Pro par Stripe, portail client |

## Architecture

- **Site** : application React (Vite, TanStack Router, Tailwind), servie comme fichiers statiques
  (Vercel ou Netlify), avec des en-têtes de sécurité stricts. Chaque page et le chargement de
  ses données sont téléchargés à la visite : 129,8 Ko compressés au démarrage, pour un budget de
  135 Ko vérifié à chaque modification.
- **Base** : Supabase (Postgres), 26 migrations. La sécurité repose sur la base elle-même :
  règles d'accès (RLS) par espace, auteurs et limites imposés par des déclencheurs, fonctions
  sensibles réservées au serveur.
- **Fonctions serveur** (7) : paiement (`creer-checkout`, `portail-client`, `webhook-stripe`),
  formulaire public (`postuler`), réponses aux candidats (`envoyer-reponse`), rappels d'entretien
  (`rappels-entretiens`, tâche planifiée), CV partagé (`cv-partage`).
- **Services externes** : Supabase (base, authentification, stockage des CV, fonctions), Stripe
  (paiement), Resend (e-mails, facultatif).

## Comment c'est vérifié

- **Vérification GitHub à chaque modification** : lint, tests unitaires, construction, budget de
  poids, tests dans le navigateur, contrôle des types des fonctions serveur.
- **Base de données** : les 26 migrations sont appliquées sur un vrai Postgres en mémoire (PGlite)
  et chaque règle de sécurité est testée, y compris les tentatives d'accès à un autre espace ou
  sans compte.
- **Parcours dans le navigateur** : tous les parcours importants, sur un faux Supabase, sous la
  même politique de sécurité qu'en production. 50 de ces tests passent chaque page à l'audit
  d'accessibilité (WCAG 2.1 AA) en thème clair et sombre.
- **Quatre relectures complètes** (étapes 31, 38, 42 et 47) ont trouvé et corrigé des défauts
  de sécurité et de robustesse : la plus récente a fermé un accès possible au CV d'un autre
  espace par le lien de partage.

## Ce qui n'a jamais tourné en conditions réelles

C'est la liste à lever pendant la répétition générale (étape 6 du guide de mise en ligne).

| Élément | Vérifié jusqu'ici par | À vérifier en vrai |
|---|---|---|
| Migrations 0001 à 0012 | Un vrai Postgres 16 (`supabase db push`) | — |
| Migrations 0013 à 0026 | PGlite seulement | Application sur le projet Supabase |
| Paiement Stripe et webhook | Tests sur des réponses simulées | Abonnement, échec de paiement, résiliation en mode test |
| E-mails (notifications, accusés, réponses, rappels) | Fonctions lancées face à un faux Supabase | Réception réelle, domaine vérifié chez Resend, indésirables |
| Rappels d'entretien (`pg_cron`, `pg_net`) | Requête générée, jamais exécutée | Tâche planifiée créée et rappel reçu |
| `cv-partage` | Contrôle des types et faux Supabase | Ouverture d'un vrai CV par un lien de partage |
| Authentification (confirmation, SMTP) | Faux Supabase | E-mails de confirmation et de mot de passe reçus |
| Rafraîchissement entre deux comptes | Horloge simulée | Deux navigateurs, deux membres d'un même espace |

`npm run verifier:config -- --distant` contrôle ensuite automatiquement la plupart des réglages
(migrations appliquées, fonctions déployées et joignables, webhook, domaine d'envoi).

## Risques connus et limites

- **Volume** : la liste et les statistiques chargent toutes les candidatures de l'espace dans le
  navigateur, puis filtrent et calculent sur place. C'est adapté à quelques milliers de
  candidatures par espace ; au-delà, l'ouverture de ces pages s'allongera et il faudra filtrer et
  compter côté base. Aucun test de charge n'a été fait.
- **Rafraîchissement** : une petite requête par minute et par onglet ouvert. Les données ne sont
  relues que si l'espace a changé, mais la première vérification sur chaque page relit tout une
  fois. Les modifications d'un collègue apparaissent en une minute au plus, pas instantanément.
- **E-mails** : sans SMTP personnalisé, Supabase n'envoie qu'un très petit nombre d'e-mails
  d'authentification par heure ; le SMTP est indispensable avant d'ouvrir les inscriptions. Les e-mails
  envoyés par Resend dépendent de la vérification du domaine d'envoi.
- **Différences PGlite / Supabase** : les migrations récentes n'ont tourné que sur PGlite. Une
  différence de comportement (droits par défaut, schéma `auth`, extensions) est possible ;
  `supabase db push` le dira dès la première application.
- **Sauvegardes** : elles dépendent de l'offre Supabase choisie ; vérifier, avant d'accueillir
  des clients, la fréquence des sauvegardes de l'offre retenue et la façon de restaurer.
- **Outillage** : les tests dans le navigateur tournent sur Ubuntu 24.04, car Playwright 1.56 ne
  sait pas encore s'installer sur Ubuntu 26.04 ; à repasser sur `ubuntu-latest` quand une version
  de Playwright le permettra.

## Choix à valider

Ces réglages ont été fixés pendant le développement ; ils se changent facilement.

| Choix | Valeur actuelle | Où le changer |
|---|---|---|
| Limite de l'offre Gratuite | 50 candidatures par espace | `src/lib/abonnement.ts` et migration (valeur imposée par la base) |
| Prix de l'offre Pro | « Prix à définir » | `PRIX_PRO`, `src/lib/abonnement.ts`, et le prix Stripe |
| Budget de poids au démarrage | 135 Ko (129,8 Ko aujourd'hui) | `scripts/budget.mjs` |
| Rafraîchissement | Toutes les minutes, et au retour sur un onglet caché plus de 30 s | `src/lib/rafraichissement.ts` |
| Liens de partage | 24 h, 7 ou 30 jours ; 10 liens valables par candidature ; notes non incluses par défaut | `src/lib/partages.ts`, migration 0023 |
| Étiquettes | Gérées par tous les membres, 30 par espace, 5 couleurs | migration 0022 |
| Critères d'évaluation | Réglés par le propriétaire seul, 10 au plus | migration 0020 |
| Étapes | Réglées par le propriétaire seul, 12 au plus | migration 0015 |
| Formulaire public | 5 envois par heure et par connexion, 60 par heure et par espace | migrations 0013 et 0017 |
| Réponses aux candidats | 100 envois par heure et par espace | migration 0019 |
| Effacement RGPD | Immédiat et définitif, sans corbeille | `src/lib/rgpd.ts` |

## Avant le lancement

1. **Suivre le guide de mise en ligne** ([`MISE_EN_LIGNE.md`](MISE_EN_LIGNE.md)) jusqu'à la
   répétition générale, en cochant le tableau « jamais tourné en conditions réelles » ci-dessus.
2. **Compléter les informations légales** dans `src/lib/infosLegales.ts` : éditeur, forme
   juridique, adresse, SIREN, contact, hébergeur, région des données. Tant qu'un champ est vide,
   le site affiche « [À compléter : …] ».
3. **Relire les pages légales** (de préférence avec un conseil) :
   - **Conditions** : Filtre est sous-traitant des données des candidats pour le compte de ses
     clients ; les conditions devraient intégrer un accord de traitement des données (article 28
     du RGPD) ;
   - **Confidentialité** : y mentionner le partage de profils par lien, l'export et
     l'effacement, et la façon dont un candidat exerce ses droits ;
   - **Durée de conservation** : aucune suppression automatique n'existe aujourd'hui ; chaque
     client doit définir et appliquer la sienne (une suppression automatique des candidatures
     anciennes pourrait faire l'objet d'une prochaine étape).
4. **Fixer le prix** de l'offre Pro, passer Stripe en mode réel, puis lancer
   `npm run verifier:config -- --distant --production`.

## Après le lancement

- Surveiller les journaux des fonctions (*Edge Functions > Logs*) et les tableaux de bord Stripe
  et Resend la première semaine.
- Relancer `npm run deployer:supabase` à chaque nouvelle migration ; `npm run verifier:config --
  --distant` signale toute migration manquante.
- Faire une restauration de sauvegarde à blanc une fois, pour savoir qu'elle fonctionne.
