import { createFileRoute, Link } from '@tanstack/react-router'
import { EmailContact, Info, PageLegale } from '@/components/PageLegale'
import { INFOS_LEGALES } from '@/lib/infosLegales'
import { titrePage } from '@/lib/titre'

export const Route = createFileRoute('/mentions-legales')({
  head: () => titrePage('Mentions légales'),
  component: MentionsLegales,
})

function MentionsLegales() {
  return (
    <PageLegale titre="Mentions légales">
      <h2>Éditeur du site</h2>
      <p>
        Le service <Info cle="nomService" /> est édité par <Info cle="editeur" />,{' '}
        <Info cle="formeJuridique" />.
      </p>
      <ul>
        <li>
          Adresse : <Info cle="adresse" />
        </li>
        <li>
          SIREN / RCS : <Info cle="siren" />
        </li>
        {INFOS_LEGALES.numeroTva && (
          <li>
            TVA intracommunautaire : <Info cle="numeroTva" />
          </li>
        )}
        <li>
          Contact : <EmailContact />
        </li>
        <li>
          Directeur de la publication : <Info cle="directeurPublication" />
        </li>
      </ul>

      <h2>Hébergement</h2>
      <p>
        Le site est hébergé par <Info cle="hebergeurNom" />, <Info cle="hebergeurAdresse" />.
      </p>
      <p>
        Les comptes, les candidatures et les fichiers sont hébergés par Supabase (Supabase, Inc.),
        région <Info cle="regionDonnees" />.
      </p>

      <h2>Propriété intellectuelle</h2>
      <p>
        Les textes, éléments graphiques et le code du site sont la propriété de l’éditeur, sauf
        mention contraire. Toute reproduction sans autorisation est interdite. Les données saisies
        par les utilisateurs restent leur propriété.
      </p>

      <h2>Données personnelles</h2>
      <p>
        Le traitement des données personnelles est décrit dans la{' '}
        <Link to="/confidentialite">politique de confidentialité</Link>.
      </p>
    </PageLegale>
  )
}
