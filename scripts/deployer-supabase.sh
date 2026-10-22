#!/usr/bin/env bash
# Déploie la partie serveur sur le projet Supabase lié : migrations, secrets des fonctions et
# fonctions de paiement. Peut être relancé sans risque (seul ce qui manque est appliqué).
# Prérequis (une fois) : npx supabase login && npx supabase link --project-ref <id-du-projet>
# Usage : npm run deployer:supabase          (voir docs/MISE_EN_LIGNE.md, étape 3)
set -euo pipefail
cd "$(dirname "$0")/.."

# CLI Supabase installée, sinon téléchargée par npx
if command -v supabase >/dev/null; then
  SUPABASE=(supabase)
else
  SUPABASE=(npx --yes supabase@2)
fi

if [[ ! -f supabase/.temp/project-ref ]]; then
  echo "Projet Supabase non lié. Lancez d'abord :"
  echo "  npx supabase login"
  echo "  npx supabase link --project-ref <id-du-projet>"
  exit 1
fi
if [[ ! -f supabase/functions/.env ]]; then
  echo "Fichier supabase/functions/.env manquant :"
  echo "  cp supabase/functions/.env.example supabase/functions/.env   # puis le remplir"
  exit 1
fi
echo "Projet : $(cat supabase/.temp/project-ref)"

echo
echo "1/3 Migrations de la base"
"${SUPABASE[@]}" db push --dry-run
read -r -p "Appliquer ces migrations ? [o/N] " reponse
if [[ "$reponse" =~ ^[oOyY]$ ]]; then
  "${SUPABASE[@]}" db push --yes
else
  echo "Migrations non appliquées."
fi

echo
echo "2/3 Secrets des fonctions (supabase/functions/.env)"
"${SUPABASE[@]}" secrets set --env-file supabase/functions/.env
if grep -q '\.\.\.' supabase/functions/.env; then
  echo "Attention : des valeurs d'exemple (…) restent dans supabase/functions/.env."
  echo "Normal au premier passage pour STRIPE_WEBHOOK_SECRET : relancez ce script une fois le webhook créé."
  echo "RAPPELS_SECRET laissé à « ... » : les rappels d'entretien restent désactivés."
fi

echo
echo "3/3 Fonctions (sans Docker)"
"${SUPABASE[@]}" functions deploy creer-checkout --use-api
"${SUPABASE[@]}" functions deploy portail-client --use-api
# Réponses aux candidats : appelée par un membre connecté (jeton vérifié)
"${SUPABASE[@]}" functions deploy envoyer-reponse --use-api
# Stripe n'envoie pas de jeton Supabase : l'authenticité vient de la signature du webhook
"${SUPABASE[@]}" functions deploy webhook-stripe --no-verify-jwt --use-api
# Formulaire public : le candidat n'a pas de compte (contrôles faits par la fonction et la base)
"${SUPABASE[@]}" functions deploy postuler --no-verify-jwt --use-api
# CV d'une candidature partagée : le visiteur du lien n'a pas de compte (le lien est vérifié par
# la base)
"${SUPABASE[@]}" functions deploy cv-partage --no-verify-jwt --use-api
# Rappels d'entretien : appelée par la tâche planifiée avec son propre secret (x-rappels-secret)
"${SUPABASE[@]}" functions deploy rappels-entretiens --no-verify-jwt --use-api

echo
echo "Terminé. Vérifiez avec : npm run verifier:config -- --distant"
echo "Rappels d'entretien : npm run planifier:rappels affiche la tâche planifiée à créer (une fois)."
