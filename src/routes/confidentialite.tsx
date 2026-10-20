import { createFileRoute, Link } from '@tanstack/react-router'
import { EmailContact, Info, PageLegale } from '@/components/PageLegale'

export const Route = createFileRoute('/confidentialite')({
  component: Confidentialite,
})

function Confidentialite() {
  return (
    <PageLegale titre="Politique de confidentialité">
      <p>
        Cette page explique quelles données personnelles <Info cle="nomService" /> traite, pourquoi,
        et comment exercer vos droits, conformément au Règlement général sur la protection des
        données (RGPD).
      </p>

      <h2>Deux rôles différents</h2>
      <ul>
        <li>
          <strong>Pour les données de votre compte</strong> (e-mail, mot de passe, abonnement),
          l’éditeur, <Info cle="editeur" />, est responsable du traitement.
        </li>
        <li>
          <strong>Pour les candidatures que vous enregistrez</strong> (nom, e-mail, poste,
          compétences, expérience, notes, CV des candidats), c’est vous, utilisateur, qui êtes
          responsable du traitement : l’éditeur agit comme sous-traitant et ne traite ces données
          que pour vous fournir le service. Il vous appartient d’informer les candidats et de
          disposer d’une base légale pour traiter leurs données.
        </li>
      </ul>

      <h2>Données collectées sur votre compte</h2>
      <ul>
        <li>
          Adresse e-mail et mot de passe (conservé uniquement sous forme hachée, illisible même par
          l’éditeur) ;
        </li>
        <li>
          Si vous souscrivez à l’offre Pro : identifiant client et statut de l’abonnement. Les
          données de carte bancaire sont saisies et conservées par Stripe ; l’éditeur n’y a pas
          accès.
        </li>
      </ul>

      <h2>Finalités et bases légales</h2>
      <ul>
        <li>Fournir le service et gérer votre compte : exécution du contrat ;</li>
        <li>
          Gérer l’abonnement et la facturation : exécution du contrat et obligations légales ;
        </li>
        <li>
          Vous envoyer les e-mails nécessaires au service (confirmation d’adresse, réinitialisation
          du mot de passe) : exécution du contrat.
        </li>
      </ul>
      <p>Aucune donnée n’est vendue ni utilisée à des fins publicitaires.</p>

      <h2>Durées de conservation</h2>
      <ul>
        <li>
          Compte, candidatures, notes et CV : jusqu’à la suppression par vous (suppression d’une
          candidature ou de votre compte depuis « Mon compte »), effacement immédiat ;
        </li>
        <li>
          Données de facturation : conservées par Stripe et l’éditeur pendant la durée imposée par
          les obligations comptables (10 ans).
        </li>
      </ul>

      <h2>Sous-traitants et destinataires</h2>
      <ul>
        <li>
          Supabase (base de données, authentification, stockage des CV), région{' '}
          <Info cle="regionDonnees" /> ;
        </li>
        <li>Stripe (paiement des abonnements) ;</li>
        <li>
          <Info cle="hebergeurNom" /> (hébergement du site).
        </li>
      </ul>
      <p>
        Certains de ces prestataires sont établis hors de l’Union européenne (notamment aux
        États-Unis). Les transferts sont encadrés par les garanties prévues par le RGPD (décision
        d’adéquation ou clauses contractuelles types de la Commission européenne).
      </p>

      <h2>Sécurité</h2>
      <p>
        Chaque compte n’a accès qu’à ses propres données, règle appliquée directement par la base de
        données. Les CV sont stockés dans un espace privé et ne sont accessibles que par des liens
        temporaires.
      </p>

      <h2>Cookies et stockage local</h2>
      <p>
        Le site n’utilise ni cookie publicitaire ni outil de mesure d’audience. Il conserve
        uniquement votre session de connexion dans le stockage local de votre navigateur, ce qui est
        indispensable au fonctionnement du service et ne nécessite pas de consentement. Le paiement
        a lieu sur les pages de Stripe, qui appliquent leur propre politique.
      </p>

      <h2>Vos droits</h2>
      <p>
        Vous disposez d’un droit d’accès, de rectification, d’effacement, de limitation, de
        portabilité et d’opposition. Vous pouvez à tout moment :
      </p>
      <ul>
        <li>
          modifier votre e-mail ou supprimer votre compte depuis{' '}
          <Link to="/compte">Mon compte</Link> ;
        </li>
        <li>exporter vos candidatures en CSV depuis le tableau de bord.</li>
      </ul>
      <p>
        Pour toute autre demande : <EmailContact />. Si vous estimez que vos droits ne sont pas
        respectés, vous pouvez adresser une réclamation à la CNIL (
        <a href="https://www.cnil.fr" target="_blank" rel="noreferrer">
          cnil.fr
        </a>
        ).
      </p>
    </PageLegale>
  )
}
