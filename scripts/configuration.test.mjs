import { describe, expect, it } from 'vitest'
import {
  domaineExpediteur,
  lireEnv,
  lireJwt,
  MIGRATIONS,
  verifierCourriel,
  verifierFonctions,
  verifierResend,
  verifierSite,
  verifierStripe,
  verifierSupabase,
} from './configuration.mjs'

// Jeton au format JWT (signature factice : seul le contenu est lu)
function jwt(contenu) {
  const partie = (objet) => Buffer.from(JSON.stringify(objet)).toString('base64url')
  return `${partie({ alg: 'HS256' })}.${partie(contenu)}.signature`
}

const URL_PROJET = 'https://abcdef.supabase.co'
const SITE = {
  VITE_SUPABASE_URL: URL_PROJET,
  VITE_SUPABASE_ANON_KEY: jwt({ role: 'anon', ref: 'abcdef' }),
}
const FONCTIONS = {
  STRIPE_SECRET_KEY: 'sk_test_123',
  STRIPE_PRICE_PRO: 'price_123',
  STRIPE_WEBHOOK_SECRET: 'whsec_123',
  SITE_URL: 'https://filtre.fr',
}

const niveaux = (resultats) => resultats.map((r) => r.niveau)
const erreurs = (resultats) => resultats.filter((r) => r.niveau === 'erreur').map((r) => r.message)

describe('lireEnv', () => {
  it('lit les valeurs, ignore commentaires et lignes vides, retire les guillemets', () => {
    expect(lireEnv('# commentaire\n\nA=1\nB = "deux"\nexport C=\'trois\'\r\nnimportequoi')).toEqual(
      { A: '1', B: 'deux', C: 'trois' },
    )
  })

  it('lireJwt renvoie null pour une chaîne qui n’est pas un jeton', () => {
    expect(lireJwt('cle-factice')).toBeNull()
    expect(lireJwt(jwt({ role: 'anon' }))).toEqual({ role: 'anon' })
  })
})

describe('verifierSite', () => {
  it('accepte une configuration correcte', () => {
    expect(niveaux(verifierSite(SITE))).toEqual(['ok', 'ok'])
    expect(
      niveaux(verifierSite({ ...SITE, VITE_SUPABASE_ANON_KEY: 'sb_publishable_abc' })),
    ).toEqual(['ok', 'ok'])
  })

  it('refuse les valeurs d’exemple', () => {
    const resultats = verifierSite({
      VITE_SUPABASE_URL: 'https://votre-projet.supabase.co',
      VITE_SUPABASE_ANON_KEY: 'votre-cle-anon',
    })
    expect(niveaux(resultats)).toEqual(['erreur', 'erreur'])
  })

  it('refuse une clé secrète, publiée avec le site', () => {
    expect(
      erreurs(verifierSite({ ...SITE, VITE_SUPABASE_ANON_KEY: jwt({ role: 'service_role' }) })),
    ).toEqual([expect.stringContaining('service_role')])
    expect(
      erreurs(verifierSite({ ...SITE, VITE_SUPABASE_ANON_KEY: 'sb_secret_abc' })),
    ).toHaveLength(1)
    expect(erreurs(verifierSite({ ...SITE, VITE_STRIPE: 'sk_live_abc' }))).toEqual([
      expect.stringContaining('VITE_STRIPE'),
    ])
  })

  it('refuse une clé d’un autre projet et une adresse avec chemin', () => {
    expect(
      erreurs(
        verifierSite({ ...SITE, VITE_SUPABASE_ANON_KEY: jwt({ role: 'anon', ref: 'autre' }) }),
      ),
    ).toEqual([expect.stringContaining('autre')])
    expect(
      erreurs(verifierSite({ ...SITE, VITE_SUPABASE_URL: `${URL_PROJET}/rest/v1` })),
    ).toHaveLength(1)
  })
})

describe('verifierFonctions', () => {
  it('accepte une configuration correcte', () => {
    expect(niveaux(verifierFonctions(FONCTIONS))).toEqual(['ok', 'ok', 'ok', 'ok'])
  })

  it('signale les erreurs courantes', () => {
    const resultats = verifierFonctions({
      STRIPE_SECRET_KEY: 'pk_test_123',
      STRIPE_PRICE_PRO: 'prod_123',
      STRIPE_WEBHOOK_SECRET: 'whsec_...',
      SITE_URL: 'https://filtre.fr/',
    })
    expect(niveaux(resultats)).toEqual(['erreur', 'erreur', 'erreur', 'erreur'])
  })

  it('en production : clé de test signalée, adresse https exigée', () => {
    const resultats = verifierFonctions(
      { ...FONCTIONS, SITE_URL: 'http://localhost:5173' },
      { production: true },
    )
    expect(niveaux(resultats)).toEqual(['attention', 'ok', 'ok', 'erreur'])
  })

  it('clé réelle avec un retour vers une adresse non chiffrée', () => {
    const resultats = verifierFonctions({
      ...FONCTIONS,
      STRIPE_SECRET_KEY: 'sk_live_123',
      SITE_URL: 'http://localhost:5173',
    })
    expect(erreurs(resultats)).toEqual([expect.stringContaining('https')])
  })
})

// Faux fetch : chaque réponse est choisie d'après la méthode et l'adresse
function fauxFetch(repondre) {
  const appels = []
  const fetch = async (url, options = {}) => {
    const methode = options.method ?? 'GET'
    appels.push(`${methode} ${url}`)
    const [status, corps] = repondre(methode, url) ?? [200, {}]
    return { ok: status >= 200 && status < 300, status, json: async () => corps }
  }
  return { fetch, appels }
}

function supabaseComplet(methode, url) {
  if (url.endsWith('/auth/v1/settings')) return [200, { external: { email: true } }]
  if (url.endsWith('/webhook-stripe')) return [400, { erreur: 'Signature manquante.' }]
  if (url.endsWith('/postuler')) return [400, { erreur: 'Formulaire illisible.' }]
  return undefined
}

describe('verifierSupabase', () => {
  it('projet prêt', async () => {
    const { fetch, appels } = fauxFetch(supabaseComplet)
    expect(niveaux(await verifierSupabase(SITE, fetch))).toEqual([
      'ok',
      'ok',
      'ok',
      'ok',
      'ok',
      'ok',
    ])
    // Seulement des lectures, et des appels refusés : fonction de la migration 0017 sans droit
    // ni étape existante, webhook sans signature, formulaire vide
    expect(appels.filter((a) => !a.startsWith('GET ') && !a.startsWith('OPTIONS '))).toEqual([
      `POST ${URL_PROJET}/rest/v1/rpc/deplacer_etape`,
      `POST ${URL_PROJET}/functions/v1/webhook-stripe`,
      `POST ${URL_PROJET}/functions/v1/postuler`,
    ])
  })

  it('table refusée par les droits : la migration est bien appliquée', async () => {
    const { fetch } = fauxFetch((methode, url) =>
      url.includes('/rest/v1/abonnements')
        ? [401, { code: '42501', message: 'permission denied' }]
        : supabaseComplet(methode, url),
    )
    expect(erreurs(await verifierSupabase(SITE, fetch))).toEqual([])
  })

  it('migrations manquantes, webhook protégé par jeton, fonction absente', async () => {
    const { fetch } = fauxFetch((methode, url) => {
      if (url.includes('select=par_systeme')) return [400, { code: '42703' }]
      if (url.includes('select=stripe_evenement_le')) return [400, { code: '42703' }]
      if (url.includes('/offres?select=jeton_public')) return [400, { code: '42703' }]
      if (url.includes('/membres?select=notifier')) return [400, { code: '42703' }]
      if (url.includes('/etapes?select=cle')) return [404, { code: 'PGRST205' }]
      if (url.includes('/espaces?select=slug')) return [400, { code: '42703' }]
      if (url.endsWith('/rpc/deplacer_etape')) return [404, { code: 'PGRST202' }]
      if (url.endsWith('/portail-client')) return [404, {}]
      if (url.endsWith('/webhook-stripe')) return [401, { msg: 'Missing authorization header' }]
      if (url.endsWith('/postuler')) return [401, { msg: 'Missing authorization header' }]
      if (url.endsWith('/auth/v1/settings'))
        return [200, { external: { email: true }, mailer_autoconfirm: true }]
      return undefined
    })
    const resultats = await verifierSupabase(SITE, fetch)
    expect(erreurs(resultats)).toEqual([
      expect.stringContaining(
        'à partir de 0011 : 0011, 0012, 0013, 0014, 0015, 0016, 0017 manquent',
      ),
      'Fonction portail-client non déployée.',
      expect.stringContaining('webhook-stripe refuse'),
      expect.stringContaining('postuler refuse'),
    ])
    expect(resultats.find((r) => r.niveau === 'attention')?.message).toContain('Confirm email')
  })

  it('projet injoignable', async () => {
    const fetch = async () => {
      throw new Error('getaddrinfo ENOTFOUND')
    }
    expect(erreurs(await verifierSupabase(SITE, fetch))).toEqual([
      expect.stringContaining('injoignable'),
    ])
  })

  it('une table est testée pour chaque migration la plus récente', () => {
    expect(MIGRATIONS.at(-1).numero).toBe('0017')
  })
})

function stripeComplet(_methode, url) {
  if (url.includes('/prices/'))
    return [
      200,
      { active: true, currency: 'eur', unit_amount: 1900, recurring: { interval: 'month' } },
    ]
  if (url.includes('/webhook_endpoints'))
    return [
      200,
      {
        data: [
          {
            url: `${URL_PROJET}/functions/v1/webhook-stripe`,
            status: 'enabled',
            enabled_events: [
              'customer.subscription.created',
              'customer.subscription.updated',
              'customer.subscription.deleted',
            ],
          },
        ],
      },
    ]
  if (url.includes('/billing_portal/'))
    return [200, { data: [{ features: { subscription_cancel: { enabled: true } } }] }]
  return undefined
}

describe('verifierStripe', () => {
  it('compte prêt', async () => {
    const { fetch, appels } = fauxFetch(stripeComplet)
    const resultats = await verifierStripe(FONCTIONS, URL_PROJET, fetch)
    expect(niveaux(resultats)).toEqual(['ok', 'ok', 'ok'])
    expect(resultats[0].message).toBe('Prix Pro : 19 EUR par mois.')
    expect(appels.every((a) => a.startsWith('GET https://api.stripe.com/'))).toBe(true)
  })

  it('Stripe injoignable', async () => {
    const fetch = async () => {
      throw new Error('getaddrinfo ENOTFOUND api.stripe.com')
    }
    expect(erreurs(await verifierStripe(FONCTIONS, URL_PROJET, fetch))).toEqual([
      'Stripe injoignable : getaddrinfo ENOTFOUND api.stripe.com',
    ])
  })

  it('clé refusée', async () => {
    const { fetch } = fauxFetch(() => [401, {}])
    expect(erreurs(await verifierStripe(FONCTIONS, URL_PROJET, fetch))).toEqual([
      expect.stringContaining('Clé Stripe refusée'),
    ])
  })

  it('prix d’un autre mode, webhook incomplet, portail sans résiliation', async () => {
    const { fetch } = fauxFetch((methode, url) => {
      if (url.includes('/prices/')) return [404, {}]
      if (url.includes('/webhook_endpoints'))
        return [
          200,
          {
            data: [
              {
                url: `${URL_PROJET}/functions/v1/webhook-stripe`,
                status: 'enabled',
                enabled_events: ['customer.subscription.created'],
              },
            ],
          },
        ]
      if (url.includes('/billing_portal/'))
        return [200, { data: [{ features: { subscription_cancel: { enabled: false } } }] }]
      return stripeComplet(methode, url)
    })
    const resultats = await verifierStripe(FONCTIONS, URL_PROJET, fetch)
    expect(niveaux(resultats)).toEqual(['erreur', 'erreur', 'attention'])
    expect(resultats[1].message).toContain(
      'customer.subscription.updated, customer.subscription.deleted',
    )
  })

  it('webhook vers une autre adresse', async () => {
    const { fetch } = fauxFetch((methode, url) =>
      url.includes('/webhook_endpoints')
        ? [
            200,
            {
              data: [{ url: 'https://ailleurs.fr/hook', status: 'enabled', enabled_events: ['*'] }],
            },
          ]
        : stripeComplet(methode, url),
    )
    expect(erreurs(await verifierStripe(FONCTIONS, URL_PROJET, fetch))).toEqual([
      expect.stringContaining('Aucun webhook Stripe actif'),
    ])
  })
})

describe('verifierCourriel', () => {
  const COURRIEL = {
    RESEND_API_KEY: 're_123',
    EMAIL_EXPEDITEUR: 'Filtre <notifications@filtre.fr>',
  }

  it('désactivé : simple point d’attention', () => {
    expect(niveaux(verifierCourriel({}))).toEqual(['attention'])
    expect(
      niveaux(
        verifierCourriel({
          RESEND_API_KEY: 're_...',
          EMAIL_EXPEDITEUR: 'Filtre <notifications@votre-domaine.fr>',
        }),
      ),
    ).toEqual(['attention'])
  })

  it('configuration correcte', () => {
    expect(niveaux(verifierCourriel(COURRIEL))).toEqual(['ok', 'ok'])
    expect(domaineExpediteur('notifications@filtre.fr')).toBe('filtre.fr')
    expect(domaineExpediteur('Filtre <notifications@mail.filtre.fr>')).toBe('mail.filtre.fr')
  })

  it('valeur manquante ou mal formée', () => {
    expect(niveaux(verifierCourriel({ RESEND_API_KEY: 're_123' }))).toEqual(['ok', 'erreur'])
    expect(niveaux(verifierCourriel({ ...COURRIEL, RESEND_API_KEY: 'sk_123' }))).toEqual([
      'erreur',
      'ok',
    ])
    expect(niveaux(verifierCourriel({ ...COURRIEL, EMAIL_EXPEDITEUR: 'Filtre' }))).toEqual([
      'ok',
      'erreur',
    ])
  })

  it('domaine de test resend.dev : refusé en production', () => {
    const essai = { ...COURRIEL, EMAIL_EXPEDITEUR: 'onboarding@resend.dev' }
    expect(niveaux(verifierCourriel(essai))).toEqual(['ok', 'attention'])
    expect(niveaux(verifierCourriel(essai, { production: true }))).toEqual(['ok', 'erreur'])
  })
})

describe('verifierResend', () => {
  const COURRIEL = {
    RESEND_API_KEY: 're_123',
    EMAIL_EXPEDITEUR: 'Filtre <notifications@filtre.fr>',
  }
  const domaines = (data) => fauxFetch(() => [200, { data }]).fetch

  it('domaine vérifié', async () => {
    const resultats = await verifierResend(
      COURRIEL,
      domaines([{ name: 'filtre.fr', status: 'verified' }]),
    )
    expect(resultats).toEqual([{ niveau: 'ok', message: 'Domaine filtre.fr vérifié chez Resend.' }])
  })

  it('domaine absent ou en attente de vérification DNS', async () => {
    expect(erreurs(await verifierResend(COURRIEL, domaines([])))).toEqual([
      expect.stringContaining('absent du compte Resend'),
    ])
    expect(
      erreurs(await verifierResend(COURRIEL, domaines([{ name: 'filtre.fr', status: 'pending' }]))),
    ).toEqual([expect.stringContaining('pas encore vérifié')])
  })

  it('clé refusée, clé limitée à l’envoi, Resend injoignable', async () => {
    expect(erreurs(await verifierResend(COURRIEL, fauxFetch(() => [401, {}]).fetch))).toEqual([
      'Clé Resend refusée (RESEND_API_KEY).',
    ])
    expect(niveaux(await verifierResend(COURRIEL, fauxFetch(() => [403, {}]).fetch))).toEqual([
      'attention',
    ])
    const enPanne = async () => {
      throw new Error('ENOTFOUND')
    }
    expect(erreurs(await verifierResend(COURRIEL, enPanne))).toEqual([
      'Resend injoignable : ENOTFOUND',
    ])
  })
})
