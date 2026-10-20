import { createFileRoute, Link } from '@tanstack/react-router'
import { EmailContact, Info, PageLegale } from '@/components/PageLegale'
import { LIMITE_GRATUITE } from '@/lib/abonnement'
import { titrePage } from '@/lib/titre'

export const Route = createFileRoute('/conditions')({
  head: () => titrePage('Conditions générales'),
  component: Conditions,
})

function Conditions() {
  return (
    <PageLegale titre="Conditions générales d’utilisation et de vente">
      <h2>1. Objet</h2>
      <p>
        Les présentes conditions encadrent l’utilisation du service <Info cle="nomService" />, édité
        par <Info cle="editeur" />, qui permet d’enregistrer, de trier et de filtrer des
        candidatures. Créer un compte vaut acceptation de ces conditions.
      </p>

      <h2>2. Compte</h2>
      <p>
        L’inscription nécessite une adresse e-mail valide et un mot de passe. Vous êtes responsable
        de la confidentialité de votre mot de passe et de l’usage fait de votre compte.
      </p>

      <h2>3. Offres</h2>
      <ul>
        <li>
          <strong>Gratuite</strong> : jusqu’à {LIMITE_GRATUITE} candidatures, sans limite de durée ;
        </li>
        <li>
          <strong>Pro</strong> : candidatures illimitées, au prix indiqué sur la page{' '}
          <Link to="/tarifs">Tarifs</Link> au moment de la souscription.
        </li>
      </ul>

      <h2>4. Paiement, renouvellement et résiliation</h2>
      <p>
        L’offre Pro est un abonnement mensuel payé par carte via Stripe. Il est renouvelé
        automatiquement chaque mois jusqu’à sa résiliation. Vous pouvez résilier à tout moment
        depuis <Link to="/compte">Mon compte</Link> (« Gérer mon abonnement ») : la résiliation
        prend effet à la fin de la période déjà payée, sans remboursement de la période en cours. Au
        retour à l’offre Gratuite, vos candidatures sont conservées, mais vous ne pouvez plus en
        ajouter au-delà de {LIMITE_GRATUITE}.
      </p>
      <p>
        Le service est destiné aux professionnels du recrutement. Si vous agissez en tant que
        consommateur, vous disposez d’un droit de rétractation de 14 jours à compter de la
        souscription ; en demandant à utiliser l’offre Pro immédiatement, vous acceptez que le
        service commence avant la fin de ce délai.
      </p>

      <h2>5. Vos données et celles des candidats</h2>
      <p>
        Vous restez propriétaire des données que vous saisissez. Vous vous engagez à ne traiter les
        données des candidats que dans le respect du RGPD (information des candidats, durée de
        conservation adaptée, données pertinentes). Le traitement par l’éditeur est décrit dans la{' '}
        <Link to="/confidentialite">politique de confidentialité</Link>. Vous pouvez exporter vos
        candidatures à tout moment.
      </p>

      <h2>6. Disponibilité et responsabilité</h2>
      <p>
        L’éditeur s’efforce d’assurer l’accès au service en continu, sans pouvoir le garantir
        (maintenance, panne d’un prestataire). Il n’est pas responsable des décisions de recrutement
        prises à l’aide du service, ni de la perte de données résultant d’une suppression effectuée
        par l’utilisateur.
      </p>

      <h2>7. Suspension</h2>
      <p>
        L’éditeur peut suspendre un compte utilisé de manière frauduleuse ou contraire à la loi,
        après en avoir informé l’utilisateur sauf urgence.
      </p>

      <h2>8. Modification des conditions</h2>
      <p>
        Les conditions peuvent évoluer. Toute modification importante est signalée par e-mail au
        moins 30 jours avant son entrée en vigueur ; vous pouvez alors résilier sans frais.
      </p>

      <h2>9. Droit applicable et litiges</h2>
      <p>
        Les présentes conditions sont soumises au droit français. En cas de litige, contactez
        d’abord l’éditeur : <EmailContact />. Un consommateur peut aussi recourir gratuitement à un
        médiateur de la consommation.
      </p>
    </PageLegale>
  )
}
