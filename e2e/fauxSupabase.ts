// Faux Supabase pour les tests de bout en bout : intercepte les appels du navigateur vers
// l'URL configurée au build (VITE_SUPABASE_URL) et répond depuis un état en mémoire.
// Seules les requêtes réellement émises par le site sont simulées.
import type { BrowserContext, Page, Request, Route } from '@playwright/test'

export const URL_SUPABASE = 'http://faux-supabase.test'
export const MOT_DE_PASSE = 'motdepasse'

export interface CandidatureFaux {
  id: string
  user_id: string
  nom: string
  email: string | null
  poste: string | null
  competences: string[]
  experience: number
  statut: string
  created_at: string
  cv_chemin: string | null
  offre_id: string | null
  espace_id: string
}

interface EspaceFaux {
  id: string
  nom: string
  proprietaire_email: string
  // Offre Pro d'un espace dont l'utilisateur n'est pas propriétaire
  pro?: boolean
}

interface MembreFaux {
  espace_id: string
  user_id: string
  email: string
  role: 'proprietaire' | 'membre'
  created_at: string
}

interface InvitationFaux {
  id: string
  espace_id: string
  jeton: string
  expire_le: string
  utilisee: boolean
}

interface EntretienFaux {
  id: string
  candidature_id: string
  user_id: string
  debut: string
  duree_minutes: number
  lieu: string | null
}

interface OffreFaux {
  id: string
  user_id: string
  espace_id: string
  titre: string
  created_at: string
}

interface NoteFaux {
  id: string
  candidature_id: string
  contenu: string
  created_at: string
}

const UTILISATEUR = {
  id: '00000000-0000-0000-0000-00000000000a',
  aud: 'authenticated',
  role: 'authenticated',
  email: 'rh@exemple.fr',
  app_metadata: {},
  user_metadata: {},
  created_at: '2026-01-01T00:00:00Z',
}

const ENTETES = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': '*',
  'access-control-allow-methods': '*',
  'access-control-expose-headers': '*',
  'content-type': 'application/json',
}

export class FauxSupabase {
  utilisateur = UTILISATEUR
  candidatures: CandidatureFaux[] = []
  notes: NoteFaux[] = []
  offres: OffreFaux[] = []
  entretiens: EntretienFaux[] = []
  fichiers = new Set<string>()
  abonnement: { statut: string; fin_periode: string | null } | null = null
  compteSupprime = false
  // Fonctions de paiement appelées (creer-checkout, portail-client)
  fonctionsAppelees: string[] = []
  // Espace personnel : même identifiant que le compte (supabase/migrations/0008_espaces.sql)
  espaces: EspaceFaux[] = [
    { id: UTILISATEUR.id, nom: 'Mon espace', proprietaire_email: UTILISATEUR.email },
  ]
  membres: MembreFaux[] = [
    {
      espace_id: UTILISATEUR.id,
      user_id: UTILISATEUR.id,
      email: UTILISATEUR.email,
      role: 'proprietaire',
      created_at: '2026-01-01T00:00:00Z',
    },
  ]
  invitations: InvitationFaux[] = []
  // Imite les déclencheurs de supabase/migrations/0010_historique.sql
  historique: {
    id: number
    candidature_id: string
    user_id: string | null
    email: string | null
    action: string
    details: Record<string, unknown>
    created_at: string
  }[] = []
  espaceActif = UTILISATEUR.id
  // Adresse de retour demandée à l'inscription (lien de confirmation de l'e-mail)
  redirectionInscription: string | null = null
  private compteur = 0

  // Espace d'une autre personne, avec une invitation pour l'utilisateur ; renvoie le jeton
  ajouterEspaceInvitant(nom: string, proprietaireEmail: string, champs: Partial<EspaceFaux> = {}) {
    const espace = {
      id: crypto.randomUUID(),
      nom,
      proprietaire_email: proprietaireEmail,
      ...champs,
    }
    this.espaces.push(espace)
    this.membres.push({
      espace_id: espace.id,
      user_id: crypto.randomUUID(),
      email: proprietaireEmail,
      role: 'proprietaire',
      created_at: '2026-01-01T00:00:00Z',
    })
    const jeton = crypto.randomUUID()
    this.invitations.push({
      id: crypto.randomUUID(),
      espace_id: espace.id,
      jeton,
      expire_le: new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString(),
      utilisee: false,
    })
    return { espace, jeton }
  }

  // Ajoute un membre (autre compte) à l'espace personnel ; renvoie son identifiant
  ajouterMembre(email: string) {
    const userId = crypto.randomUUID()
    this.membres.push({
      espace_id: this.utilisateur.id,
      user_id: userId,
      email,
      role: 'membre',
      created_at: new Date().toISOString(),
    })
    return userId
  }

  journaliser(candidatureId: string, action: string, details: Record<string, unknown> = {}) {
    this.historique.push({
      id: this.historique.length + 1,
      candidature_id: candidatureId,
      user_id: this.utilisateur.id,
      email: this.utilisateur.email,
      action,
      details,
      created_at: new Date().toISOString(),
    })
  }

  private estMembre(espaceId: string) {
    return this.membres.some((m) => m.espace_id === espaceId && m.user_id === this.utilisateur.id)
  }

  // Ajoute des candidatures ; les dates croissent avec l'ordre d'ajout
  ajouter(...champs: Partial<CandidatureFaux>[]) {
    for (const c of champs) {
      this.compteur++
      this.candidatures.push({
        id: `c${this.compteur}`,
        user_id: this.utilisateur.id,
        nom: `Candidat ${this.compteur}`,
        email: null,
        poste: null,
        competences: [],
        experience: 0,
        statut: 'nouveau',
        created_at: new Date(Date.UTC(2026, 0, 1, 0, this.compteur)).toISOString(),
        cv_chemin: null,
        offre_id: null,
        espace_id: this.espaceActif,
        ...c,
      })
    }
    return this
  }

  ajouterOffre(titre: string) {
    this.compteur++
    const offre = {
      id: crypto.randomUUID(),
      user_id: this.utilisateur.id,
      espace_id: this.espaceActif,
      titre,
      created_at: new Date(Date.UTC(2026, 0, 1, 0, this.compteur)).toISOString(),
    }
    this.offres.push(offre)
    return offre
  }

  ajouterEntretien(candidatureId: string, debut: Date, champs: Partial<EntretienFaux> = {}) {
    this.compteur++
    this.entretiens.push({
      id: crypto.randomUUID(),
      candidature_id: candidatureId,
      user_id: this.utilisateur.id,
      debut: debut.toISOString(),
      duree_minutes: 60,
      lieu: null,
      ...champs,
    })
  }

  offre(titre: string) {
    return this.offres.find((o) => o.titre === titre)
  }

  candidature(nom: string) {
    return this.candidatures.find((c) => c.nom === nom)
  }

  async installer(cible: Page | BrowserContext) {
    await cible.route(`${URL_SUPABASE}/**`, (route) => this.repondre(route))
  }

  private async repondre(route: Route) {
    const requete = route.request()
    const url = new URL(requete.url())
    const chemin = decodeURIComponent(url.pathname)
    const methode = requete.method()
    const json = (corps: unknown, status = 200) =>
      route.fulfill({
        status,
        headers: ENTETES,
        body: corps === undefined ? '' : JSON.stringify(corps),
      })

    if (methode === 'OPTIONS') return route.fulfill({ status: 204, headers: ENTETES })

    // Authentification
    if (chemin === '/auth/v1/token') {
      const { email, password } = corps(requete)
      if (email !== this.utilisateur.email || password !== MOT_DE_PASSE || this.compteSupprime) {
        return json(
          { code: 400, error_code: 'invalid_credentials', msg: 'Invalid login credentials' },
          400,
        )
      }
      return json(this.session())
    }
    if (chemin === '/auth/v1/logout') return json(undefined, 204)
    if (chemin === '/auth/v1/user') return json(this.utilisateur)
    if (chemin === '/auth/v1/signup') {
      this.redirectionInscription = url.searchParams.get('redirect_to')
      return json({ ...this.utilisateur, email: corps(requete).email })
    }
    if (chemin === '/auth/v1/recover') return json({})

    // Base de données
    if (chemin === '/rest/v1/candidatures') return this.candidaturesRest(route, url, json)
    if (chemin === '/rest/v1/notes') return this.notesRest(route, url, json)
    if (chemin === '/rest/v1/offres') return this.offresRest(route, url, json)
    if (chemin === '/rest/v1/entretiens') return this.entretiensRest(route, url, json)
    if (chemin === '/rest/v1/historique') {
      const id = url.searchParams.get('candidature_id')?.replace(/^eq[.]/, '')
      return json(
        this.historique
          .filter((h) => h.candidature_id === id)
          .sort((a, b) => b.id - a.id)
          .map(({ candidature_id: _c, ...h }) => h),
      )
    }
    if (chemin === '/rest/v1/abonnements') {
      const objet = (requete.headers()['accept'] ?? '').includes('vnd.pgrst.object')
      return json(objet ? this.abonnement : this.abonnement ? [this.abonnement] : [])
    }
    if (
      chemin.startsWith('/rest/v1/rpc/') ||
      chemin === '/rest/v1/membres' ||
      chemin === '/rest/v1/espaces' ||
      chemin === '/rest/v1/invitations'
    ) {
      const reponse = this.espacesRest(route, url, chemin)
      if (reponse) return json(reponse.corps, reponse.status)
    }
    if (chemin === '/rest/v1/rpc/supprimer_mon_compte') {
      this.compteSupprime = true
      return json(undefined, 204)
    }

    // Stockage des CV
    const prefixeCv = '/storage/v1/object/cv/'
    const prefixeSigne = '/storage/v1/object/sign/cv/'
    if (chemin.startsWith(prefixeCv) && methode === 'POST') {
      const fichier = chemin.slice(prefixeCv.length)
      this.fichiers.add(fichier)
      return json({ Key: `cv/${fichier}` })
    }
    if (chemin.startsWith(prefixeSigne) && methode === 'POST') {
      const fichier = chemin.slice(prefixeSigne.length)
      return json({ signedURL: `/object/sign/cv/${fichier}?token=jeton` })
    }
    if (chemin === '/storage/v1/object/cv' && methode === 'DELETE') {
      const { prefixes } = corps(requete) as { prefixes: string[] }
      prefixes.forEach((p) => this.fichiers.delete(p))
      return json(prefixes.map((name) => ({ name })))
    }
    if (chemin.startsWith('/storage/v1/object/sign/')) {
      return route.fulfill({ status: 200, contentType: 'application/pdf', body: '%PDF-1.4' })
    }

    // Fonctions de paiement
    if (chemin.startsWith('/functions/v1/')) {
      const nom = chemin.split('/').pop()!
      this.fonctionsAppelees.push(nom)
      return json({ url: `https://stripe.test/${nom}` })
    }

    return json({ message: `Non simulé : ${methode} ${chemin}` }, 404)
  }

  private candidaturesRest(route: Route, url: URL, json: Repondre) {
    const requete = route.request()
    const methode = requete.method()
    const ids = idsFiltres(url)

    if (methode === 'GET') {
      // Règle RLS : seulement l'espace actif
      let lignes = this.candidatures.filter((c) => c.espace_id === this.espaceActif)
      if (ids) lignes = lignes.filter((c) => ids.includes(c.id))
      if (url.searchParams.get('cv_chemin') === 'not.is.null')
        lignes = lignes.filter((c) => c.cv_chemin)
      lignes = [...lignes].sort((a, b) => b.created_at.localeCompare(a.created_at))
      const select = url.searchParams.get('select') ?? '*'
      const resultat = lignes.map((c) =>
        select === 'cv_chemin'
          ? { cv_chemin: c.cv_chemin }
          : select.includes('notes(count)')
            ? {
                ...c,
                notes: [{ count: this.notes.filter((n) => n.candidature_id === c.id).length }],
              }
            : c,
      )
      const objet = (requete.headers()['accept'] ?? '').includes('vnd.pgrst.object')
      return json(objet ? (resultat[0] ?? null) : resultat)
    }

    if (methode === 'POST') {
      const nouvelles = [corps(requete)].flat() as Partial<CandidatureFaux>[]
      if (this.emailPris(nouvelles)) return json(violationUnicite(), 409)
      const pro = this.abonnement?.statut === 'active'
      if (!pro && this.candidatures.length + nouvelles.length > 50) {
        return json({ code: 'P0001', message: 'limite_gratuite: 50 candidatures au plus' }, 400)
      }
      const avant = this.candidatures.length
      this.ajouter(...nouvelles)
      this.candidatures.slice(avant).forEach((c) => this.journaliser(c.id, 'creation'))
      return json(undefined, 201)
    }

    if (methode === 'PATCH') {
      const champs = corps(requete) as Partial<CandidatureFaux>
      const cibles = this.candidatures.filter((c) => ids?.includes(c.id))
      if (
        champs.email &&
        this.emailPris(
          [champs],
          cibles.map((c) => c.id),
        )
      ) {
        return json(violationUnicite(), 409)
      }
      for (const c of cibles) {
        if (champs.statut !== undefined && champs.statut !== c.statut) {
          this.journaliser(c.id, 'statut', { avant: c.statut, apres: champs.statut })
        }
        if (champs.cv_chemin !== undefined && champs.cv_chemin !== c.cv_chemin) {
          this.journaliser(
            c.id,
            !c.cv_chemin ? 'cv_ajoute' : !champs.cv_chemin ? 'cv_retire' : 'cv_remplace',
          )
        }
        const modifies = (
          ['nom', 'email', 'poste', 'competences', 'experience', 'offre_id'] as const
        )
          .filter((k) => k in champs && JSON.stringify(champs[k]) !== JSON.stringify(c[k]))
          .map((k) => (k === 'offre_id' ? 'offre' : k))
        if (modifies.length > 0) this.journaliser(c.id, 'modification', { champs: modifies })
        Object.assign(c, champs)
      }
      return json(undefined, 204)
    }

    if (methode === 'DELETE') {
      this.candidatures = this.candidatures.filter((c) => !ids?.includes(c.id))
      this.notes = this.notes.filter((n) => !ids?.includes(n.candidature_id))
      this.entretiens = this.entretiens.filter((e) => !ids?.includes(e.candidature_id))
      return json(undefined, 204)
    }
    return json({}, 405)
  }

  private notesRest(route: Route, url: URL, json: Repondre) {
    const requete = route.request()
    const methode = requete.method()
    if (methode === 'GET') {
      const id = url.searchParams.get('candidature_id')?.replace(/^eq\./, '')
      const notes = this.notes
        .filter((n) => n.candidature_id === id)
        .sort((a, b) => b.created_at.localeCompare(a.created_at))
        .map(({ id, contenu, created_at }) => ({ id, contenu, created_at }))
      return json(notes)
    }
    if (methode === 'POST') {
      this.compteur++
      this.journaliser(
        (corps(requete) as { candidature_id: string }).candidature_id,
        'note_ajoutee',
      )
      this.notes.push({
        id: `n${this.compteur}`,
        created_at: new Date(Date.UTC(2026, 1, 1, 0, this.compteur)).toISOString(),
        ...(corps(requete) as { candidature_id: string; contenu: string }),
      })
      return json(undefined, 201)
    }
    if (methode === 'DELETE') {
      const ids = idsFiltres(url)
      this.notes
        .filter((n) => ids?.includes(n.id))
        .forEach((n) => this.journaliser(n.candidature_id, 'note_supprimee'))
      this.notes = this.notes.filter((n) => !ids?.includes(n.id))
      return json(undefined, 204)
    }
    return json({}, 405)
  }

  private entretiensRest(route: Route, url: URL, json: Repondre) {
    const requete = route.request()
    const methode = requete.method()
    if (methode === 'GET') {
      const candidature = url.searchParams.get('candidature_id')?.replace(/^eq\./, '')
      const depuis = url.searchParams.get('debut')?.replace(/^gte\./, '')
      const avecNom = (url.searchParams.get('select') ?? '').includes('candidatures(nom)')
      const entretiens = this.entretiens
        .filter((e) => !candidature || e.candidature_id === candidature)
        .filter((e) => !depuis || new Date(e.debut) >= new Date(depuis))
        .sort((a, b) => a.debut.localeCompare(b.debut))
        .map(({ user_id: _u, ...e }) => ({
          ...e,
          ...(avecNom && {
            candidatures: { nom: this.candidatures.find((c) => c.id === e.candidature_id)?.nom },
          }),
        }))
      return json(entretiens)
    }
    if (methode === 'POST') {
      const champs = corps(requete) as Omit<EntretienFaux, 'id' | 'user_id'>
      this.ajouterEntretien(champs.candidature_id, new Date(champs.debut), champs)
      this.journaliser(champs.candidature_id, 'entretien_planifie', { debut: champs.debut })
      return json(undefined, 201)
    }
    if (methode === 'DELETE') {
      const ids = idsFiltres(url)
      this.entretiens
        .filter((e) => ids?.includes(e.id))
        .forEach((e) =>
          this.journaliser(e.candidature_id, 'entretien_supprime', { debut: e.debut }),
        )
      this.entretiens = this.entretiens.filter((e) => !ids?.includes(e.id))
      return json(undefined, 204)
    }
    return json({}, 405)
  }

  // Espaces, membres, invitations et fonctions associées ; null si la requête n'est pas gérée ici
  private espacesRest(route: Route, url: URL, chemin: string) {
    const requete = route.request()
    const methode = requete.method()
    const parametres = (corps(requete) ?? {}) as Record<string, string>
    const filtre = (cle: string) => url.searchParams.get(cle)?.replace(/^eq[.]/, '')

    if (chemin === '/rest/v1/rpc/mon_espace') {
      const espace = this.espaces.find((e) => e.id === this.espaceActif)!
      const role = this.membres.find(
        (m) => m.espace_id === espace.id && m.user_id === this.utilisateur.id,
      )!.role
      const pro = role === 'proprietaire' ? this.abonnement?.statut === 'active' : !!espace.pro
      const nb = this.membres.filter((m) => m.espace_id === espace.id).length
      return {
        corps: [{ id: espace.id, nom: espace.nom, role, est_pro: pro, nb_membres: nb }],
        status: 200,
      }
    }
    if (chemin === '/rest/v1/rpc/choisir_espace') {
      if (!this.estMembre(parametres.eid)) {
        return { corps: { code: 'P0001', message: 'espace_inaccessible: non membre' }, status: 400 }
      }
      this.espaceActif = parametres.eid
      return { corps: undefined, status: 204 }
    }
    if (chemin === '/rest/v1/rpc/lire_invitation') {
      const invitation = this.invitations.find((i) => i.jeton === parametres.code)
      if (!invitation) return { corps: [], status: 200 }
      const espace = this.espaces.find((e) => e.id === invitation.espace_id)!
      const valide = !invitation.utilisee && new Date(invitation.expire_le) > new Date()
      return {
        corps: [
          {
            espace_id: espace.id,
            espace_nom: espace.nom,
            proprietaire_email: espace.proprietaire_email,
            valide,
            deja_membre: this.estMembre(espace.id),
          },
        ],
        status: 200,
      }
    }
    if (chemin === '/rest/v1/rpc/accepter_invitation') {
      const invitation = this.invitations.find((i) => i.jeton === parametres.code)
      if (!invitation || invitation.utilisee || new Date(invitation.expire_le) <= new Date()) {
        return {
          corps: { code: 'P0001', message: 'invitation_invalide: lien invalide' },
          status: 400,
        }
      }
      if (!this.estMembre(invitation.espace_id)) {
        this.membres.push({
          espace_id: invitation.espace_id,
          user_id: this.utilisateur.id,
          email: this.utilisateur.email,
          role: 'membre',
          created_at: new Date().toISOString(),
        })
        invitation.utilisee = true
      }
      this.espaceActif = invitation.espace_id
      return { corps: invitation.espace_id, status: 200 }
    }

    if (chemin === '/rest/v1/rpc/transferer_propriete') {
      const dans = (userId: string) =>
        this.membres.find((m) => m.espace_id === parametres.eid && m.user_id === userId)
      const moi = dans(this.utilisateur.id)
      const nouveau = dans(parametres.nouveau)
      if (moi?.role !== 'proprietaire' || !nouveau || nouveau === moi) {
        return { corps: { code: 'P0001', message: 'transfert_refuse: refusé' }, status: 400 }
      }
      moi.role = 'membre'
      nouveau.role = 'proprietaire'
      const espace = this.espaces.find((e) => e.id === parametres.eid)!
      espace.proprietaire_email = nouveau.email
      espace.pro = false
      // Nouvel espace personnel pour l'ancien propriétaire
      const personnel = {
        id: crypto.randomUUID(),
        nom: 'Mon espace',
        proprietaire_email: this.utilisateur.email,
      }
      this.espaces.push(personnel)
      this.membres.push({
        espace_id: personnel.id,
        user_id: this.utilisateur.id,
        email: this.utilisateur.email,
        role: 'proprietaire',
        created_at: new Date().toISOString(),
      })
      return { corps: undefined, status: 204 }
    }

    if (chemin === '/rest/v1/membres') {
      const espaceId = filtre('espace_id')
      const userId = filtre('user_id')
      if (methode === 'GET') {
        const lignes = this.membres
          .filter((m) => this.estMembre(m.espace_id))
          .filter((m) => !espaceId || m.espace_id === espaceId)
          .filter((m) => !userId || m.user_id === userId)
          .map((m) => ({
            ...m,
            espaces: { nom: this.espaces.find((e) => e.id === m.espace_id)?.nom },
          }))
        return { corps: lignes, status: 200 }
      }
      if (methode === 'DELETE') {
        this.membres = this.membres.filter(
          (m) => !(m.espace_id === espaceId && m.user_id === userId),
        )
        if (!this.estMembre(this.espaceActif)) this.espaceActif = this.utilisateur.id
        return { corps: undefined, status: 204 }
      }
    }
    if (chemin === '/rest/v1/espaces' && methode === 'PATCH') {
      const espace = this.espaces.find((e) => e.id === filtre('id'))
      if (espace) espace.nom = parametres.nom
      return { corps: undefined, status: 204 }
    }
    if (chemin === '/rest/v1/invitations') {
      if (methode === 'GET') {
        const lignes = this.invitations
          .filter((i) => i.espace_id === filtre('espace_id') && !i.utilisee)
          .map(({ id, jeton, expire_le }) => ({ id, jeton, expire_le }))
        return { corps: lignes, status: 200 }
      }
      if (methode === 'POST') {
        this.invitations.push({
          id: crypto.randomUUID(),
          espace_id: parametres.espace_id,
          jeton: crypto.randomUUID(),
          expire_le: new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString(),
          utilisee: false,
        })
        return { corps: undefined, status: 201 }
      }
      if (methode === 'DELETE') {
        this.invitations = this.invitations.filter((i) => i.id !== filtre('id'))
        return { corps: undefined, status: 204 }
      }
    }
    return null
  }

  private offresRest(route: Route, url: URL, json: Repondre) {
    const requete = route.request()
    const methode = requete.method()
    const ids = idsFiltres(url)
    // Simule l'index unique (utilisateur, lower(titre))
    const titrePris = (titre: string, sauf?: string) =>
      this.offres.some((o) => o.id !== sauf && o.titre.toLowerCase() === titre.toLowerCase())
    const doublon = {
      code: '23505',
      message: 'duplicate key value violates "offres_user_titre_unique"',
    }

    if (methode === 'GET') {
      const offres = this.offres
        .filter((o) => o.espace_id === this.espaceActif)
        .sort((a, b) => a.titre.localeCompare(b.titre))
        .map((o) => ({
          ...o,
          candidatures: [{ count: this.candidatures.filter((c) => c.offre_id === o.id).length }],
        }))
      return json(offres)
    }
    if (methode === 'POST') {
      const { titre } = corps(requete) as { titre: string }
      if (titrePris(titre)) return json(doublon, 409)
      this.ajouterOffre(titre)
      return json(undefined, 201)
    }
    if (methode === 'PATCH') {
      const { titre } = corps(requete) as { titre: string }
      if (titrePris(titre, ids?.[0])) return json(doublon, 409)
      this.offres.filter((o) => ids?.includes(o.id)).forEach((o) => (o.titre = titre))
      return json(undefined, 204)
    }
    if (methode === 'DELETE') {
      // on delete set null (offre_id)
      this.candidatures
        .filter((c) => ids?.includes(c.offre_id ?? ''))
        .forEach((c) => (c.offre_id = null))
      this.offres = this.offres.filter((o) => !ids?.includes(o.id))
      return json(undefined, 204)
    }
    return json({}, 405)
  }

  // Simule l'index unique (utilisateur, lower(email))
  private emailPris(nouvelles: Partial<CandidatureFaux>[], idsExclus: string[] = []) {
    const existants = this.candidatures
      .filter((c) => c.email && !idsExclus.includes(c.id))
      .map((c) => c.email!.toLowerCase())
    return nouvelles.some((n) => n.email && existants.includes(n.email.toLowerCase()))
  }

  private session() {
    return {
      access_token: 'a.b.c',
      token_type: 'bearer',
      expires_in: 3600,
      expires_at: Math.floor(Date.now() / 1000) + 3600,
      refresh_token: 'r',
      user: this.utilisateur,
    }
  }
}

type Repondre = (corps: unknown, status?: number) => Promise<void>

function corps(requete: Request) {
  return JSON.parse(requete.postData() ?? 'null')
}

// id=eq.x ou id=in.(x,y)
function idsFiltres(url: URL) {
  const valeur = url.searchParams.get('id')
  if (!valeur) return null
  if (valeur.startsWith('in.(')) return valeur.slice(4, -1).split(',')
  return [valeur.replace(/^eq\./, '')]
}

function violationUnicite() {
  return {
    code: '23505',
    message: 'duplicate key value violates unique constraint "candidatures_user_email_unique"',
  }
}

// Ouvre la page de connexion et se connecte avec le compte simulé
export async function seConnecter(page: Page, faux: FauxSupabase) {
  await page.goto('/connexion')
  await page.getByLabel('E-mail').fill(faux.utilisateur.email)
  await page.getByLabel('Mot de passe').fill(MOT_DE_PASSE)
  await page.getByRole('button', { name: 'Se connecter' }).click()
  await page.waitForURL('**/tableau-de-bord')
}
