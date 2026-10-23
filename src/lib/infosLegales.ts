// Informations affichées dans les pages légales (mentions légales, confidentialité, conditions).
// Tout champ laissé vide apparaît sur le site comme « [À compléter : …] ».
export const INFOS_LEGALES = {
  nomService: 'Filtre',
  // Nom et prénom (entrepreneur individuel) ou raison sociale
  editeur: '',
  // Ex. « Entrepreneur individuel (micro-entreprise) » ou « SAS au capital de 1 000 € »
  formeJuridique: '',
  adresse: '',
  // SIREN, ou RCS + ville d'immatriculation pour une société
  siren: '',
  // Laisser vide si l'activité bénéficie de la franchise en base de TVA
  numeroTva: '',
  email: '',
  directeurPublication: '',
  // Hébergeur du site (Vercel, Netlify…) : nom et adresse postale, à reprendre de ses mentions
  hebergeurNom: '',
  hebergeurAdresse: '',
  // Région du projet Supabase (Project Settings > General), ex. « Union européenne (Francfort) »
  regionDonnees: '',
  // Date de dernière mise à jour des textes
  miseAJour: '20 octobre 2026',
}

export type CleInfoLegale = keyof typeof INFOS_LEGALES

export const LIBELLES_INFOS: Record<CleInfoLegale, string> = {
  nomService: 'nom du service',
  editeur: 'nom ou raison sociale',
  formeJuridique: 'forme juridique',
  adresse: 'adresse postale',
  siren: 'numéro SIREN ou RCS',
  numeroTva: 'numéro de TVA',
  email: 'e-mail de contact',
  directeurPublication: 'directeur de la publication',
  hebergeurNom: 'hébergeur du site',
  hebergeurAdresse: 'adresse de l’hébergeur',
  regionDonnees: 'région d’hébergement des données',
  miseAJour: 'date de mise à jour',
}
