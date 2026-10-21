// Applique les migrations sur un vrai Postgres (PGlite, en mémoire) et vérifie leurs règles.
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { PGlite } from '@electric-sql/pglite'
import { beforeAll, beforeEach, describe, expect, it } from 'vitest'

const DOSSIER = join(import.meta.dirname, '../migrations')
const A = '00000000-0000-0000-0000-00000000000a'
const B = '00000000-0000-0000-0000-00000000000b'

// Simulacre minimal de Supabase : rôles, schéma auth et auth.uid() lu dans un réglage de session,
// schéma storage (buckets, objects avec RLS active, storage.foldername)
const SIMULACRE_SUPABASE = `
  create role anon;
  create role authenticated;
  create role service_role;
  create schema auth;
  create table auth.users (id uuid primary key, email text);
  create function auth.uid() returns uuid language sql stable as
    $$ select nullif(current_setting('test.uid', true), '')::uuid $$;
  create schema storage;
  create table storage.buckets (
    id text primary key, name text, public boolean,
    file_size_limit bigint, allowed_mime_types text[]
  );
  create table storage.objects (
    id uuid primary key default gen_random_uuid(),
    bucket_id text references storage.buckets (id), name text
  );
  alter table storage.objects enable row level security;
  create function storage.foldername(name text) returns text[] language sql immutable as
    $$ select (string_to_array(name, '/'))[1:array_length(string_to_array(name, '/'), 1) - 1] $$;
  grant usage on schema storage to authenticated;
  grant select, insert, delete on storage.objects to authenticated;
`

// Base migrée une seule fois, puis vidée avant chaque test (plus rapide que tout rejouer)
let db: PGlite

beforeAll(async () => {
  db = new PGlite()
  await db.exec(SIMULACRE_SUPABASE)
  for (const fichier of readdirSync(DOSSIER).sort()) {
    await db.exec(readFileSync(join(DOSSIER, fichier), 'utf8'))
  }
  // Démarrage de PGlite et 13 migrations : plusieurs secondes sur une machine chargée
}, 60_000)

beforeEach(async () => {
  await db.exec(`
    reset role;
    select set_config('test.uid', '', false);
    delete from auth.users;
    delete from storage.objects;
    insert into auth.users values ('${A}', 'a@x.fr'), ('${B}', 'b@x.fr');
  `)
})

function ajouter(uid: string, noms: string[]) {
  const valeurs = noms.map((nom) => `('${uid}', '${nom}')`).join(', ')
  return db.exec(`insert into public.candidatures (user_id, nom) values ${valeurs}`)
}

const noms = (debut: number, n: number) => Array.from({ length: n }, (_, i) => `C${debut + i}`)

async function nombre(table: string, uid: string) {
  const { rows } = await db.query<{ n: number }>(
    `select count(*)::int as n from public.${table} where user_id = $1`,
    [uid],
  )
  return rows[0].n
}

function passerPro(uid: string, statut = 'active') {
  return db.exec(
    `insert into public.abonnements (user_id, stripe_customer_id, statut)
     values ('${uid}', 'cus_${uid}', '${statut}')
     on conflict (user_id) do update set statut = excluded.statut`,
  )
}

function enTantQue(uid: string) {
  return db.exec(`select set_config('test.uid', '${uid}', false)`)
}

describe('limite de l’offre Gratuite', () => {
  it('bloque la 51e candidature', async () => {
    await ajouter(A, noms(1, 50))
    await expect(ajouter(A, ['C51'])).rejects.toThrow(/^limite_gratuite/)
    expect(await nombre('candidatures', A)).toBe(50)
  })

  it('annule en entier un import qui dépasserait la limite', async () => {
    await ajouter(A, noms(1, 49))
    await expect(ajouter(A, noms(50, 3))).rejects.toThrow(/^limite_gratuite/)
    expect(await nombre('candidatures', A)).toBe(49)
  })

  it('ne s’applique pas en Pro, et revient après résiliation', async () => {
    await ajouter(A, noms(1, 50))
    await passerPro(A)
    await ajouter(A, ['C51'])
    await passerPro(A, 'canceled')
    await expect(ajouter(A, ['C52'])).rejects.toThrow(/^limite_gratuite/)
  })

  it('compte séparément chaque utilisateur', async () => {
    await ajouter(A, noms(1, 50))
    await ajouter(B, ['C1'])
    expect(await nombre('candidatures', B)).toBe(1)
  })
})

describe('doublons', () => {
  it('refuse deux candidatures avec le même e-mail, sans tenir compte des majuscules', async () => {
    await db.exec(
      `insert into public.candidatures (user_id, nom, email) values ('${A}', 'Alice', 'alice@x.fr')`,
    )
    await expect(
      db.exec(
        `insert into public.candidatures (user_id, nom, email) values ('${A}', 'Alice 2', 'ALICE@x.fr')`,
      ),
    ).rejects.toThrow(/candidatures_espace_email_unique/)
  })

  it('accepte le même e-mail chez deux utilisateurs différents', async () => {
    await db.exec(
      `insert into public.candidatures (user_id, nom, email) values ('${A}', 'Alice', 'alice@x.fr')`,
    )
    await db.exec(
      `insert into public.candidatures (user_id, nom, email) values ('${B}', 'Alice', 'alice@x.fr')`,
    )
  })
})

describe('suppression de compte', () => {
  it('supprime le compte, ses candidatures et son abonnement résilié', async () => {
    await ajouter(A, ['C1'])
    await passerPro(A, 'canceled')
    await enTantQue(A)
    await db.exec('select public.supprimer_mon_compte()')
    expect(await nombre('candidatures', A)).toBe(0)
    expect(await nombre('abonnements', A)).toBe(0)
    const { rows } = await db.query('select id from auth.users')
    expect(rows).toEqual([{ id: B }])
  })

  it('est refusée tant que l’abonnement est actif', async () => {
    await passerPro(A)
    await enTantQue(A)
    await expect(db.exec('select public.supprimer_mon_compte()')).rejects.toThrow(
      /^abonnement_actif/,
    )
  })
})

describe('sécurité (RLS)', () => {
  beforeEach(async () => {
    await ajouter(A, ['Candidat de A'])
    await ajouter(B, ['Candidat de B'])
    await passerPro(A)
    await passerPro(B)
    await db.exec(`
      grant usage on schema public to authenticated;
      grant select, insert, update, delete on public.candidatures, public.abonnements to authenticated;
    `)
    await enTantQue(A)
    await db.exec('set role authenticated')
  })

  it('ne montre que ses propres candidatures et son abonnement', async () => {
    const candidatures = await db.query<{ nom: string }>('select nom from public.candidatures')
    expect(candidatures.rows).toEqual([{ nom: 'Candidat de A' }])
    const abonnements = await db.query<{ user_id: string }>(
      'select user_id from public.abonnements',
    )
    expect(abonnements.rows).toEqual([{ user_id: A }])
  })

  it('empêche de modifier ou supprimer les candidatures d’un autre', async () => {
    await db.exec(`update public.candidatures set nom = 'piraté' where user_id = '${B}'`)
    await db.exec(`delete from public.candidatures where user_id = '${B}'`)
    await db.exec('reset role')
    const { rows } = await db.query<{ nom: string }>(
      `select nom from public.candidatures where user_id = '${B}'`,
    )
    expect(rows).toEqual([{ nom: 'Candidat de B' }])
  })

  it('empêche de s’attribuer ou de modifier un abonnement', async () => {
    await expect(
      db.exec(
        `insert into public.abonnements (user_id, stripe_customer_id, statut) values ('${A}', 'cus_x', 'active')`,
      ),
    ).rejects.toThrow(/row-level security/)
    await db.exec(`update public.abonnements set statut = 'canceled' where user_id = '${A}'`)
    await db.exec('reset role')
    const { rows } = await db.query<{ statut: string }>(
      `select statut from public.abonnements where user_id = '${A}'`,
    )
    expect(rows).toEqual([{ statut: 'active' }])
  })

  it('empêche d’écrire dans l’espace d’un autre ou en son nom', async () => {
    await expect(
      db.exec(`insert into public.candidatures (espace_id, nom) values ('${B}', 'Intrus')`),
    ).rejects.toThrow(/row-level security/)
    // Un user_id usurpé est remplacé par l'utilisateur connecté, dans son propre espace
    await db.exec(`insert into public.candidatures (user_id, nom) values ('${B}', 'Moi')`)
    await db.exec('reset role')
    const { rows } = await db.query(
      `select user_id, espace_id from public.candidatures where nom = 'Moi'`,
    )
    expect(rows).toEqual([{ user_id: A, espace_id: A }])
  })
})

describe('notes et CV', () => {
  let candidatureA: string
  let candidatureB: string

  beforeEach(async () => {
    const { rows } = await db.query<{ id: string; user_id: string }>(
      `insert into public.candidatures (user_id, nom) values ('${A}', 'De A'), ('${B}', 'De B')
       returning id, user_id`,
    )
    candidatureA = rows.find((r) => r.user_id === A)!.id
    candidatureB = rows.find((r) => r.user_id === B)!.id
    await db.exec(`
      grant usage on schema public to authenticated;
      grant select, insert, delete on public.notes to authenticated;
      grant select on public.candidatures to authenticated;
    `)
    await enTantQue(A)
    await db.exec('set role authenticated')
  })

  it('permet d’annoter ses candidatures, pas celles des autres', async () => {
    await db.exec(
      `insert into public.notes (candidature_id, contenu) values ('${candidatureA}', 'Bon profil')`,
    )
    await expect(
      db.exec(
        `insert into public.notes (candidature_id, contenu) values ('${candidatureB}', 'Intrus')`,
      ),
    ).rejects.toThrow(/row-level security/)
    const { rows } = await db.query('select contenu from public.notes')
    expect(rows).toEqual([{ contenu: 'Bon profil' }])
  })

  it('supprime les notes avec la candidature', async () => {
    await db.exec(
      `insert into public.notes (candidature_id, contenu) values ('${candidatureA}', 'Note')`,
    )
    await db.exec('reset role')
    await db.exec(`delete from public.candidatures where id = '${candidatureA}'`)
    const { rows } = await db.query('select count(*)::int as n from public.notes')
    expect(rows).toEqual([{ n: 0 }])
  })

  it('limite les CV au dossier de l’utilisateur', async () => {
    await db.exec(
      `insert into storage.objects (bucket_id, name) values ('cv', '${A}/${candidatureA}/cv.pdf')`,
    )
    await expect(
      db.exec(
        `insert into storage.objects (bucket_id, name) values ('cv', '${B}/${candidatureB}/cv.pdf')`,
      ),
    ).rejects.toThrow(/row-level security/)
    await db.exec('reset role')
    await db.exec(
      `insert into storage.objects (bucket_id, name) values ('cv', '${B}/${candidatureB}/cv.pdf')`,
    )
    await db.exec('set role authenticated')
    const { rows } = await db.query<{ name: string }>('select name from storage.objects')
    expect(rows).toEqual([{ name: `${A}/${candidatureA}/cv.pdf` }])
  })

  it('crée un bucket privé limité aux PDF de 5 Mo', async () => {
    await db.exec('reset role')
    const { rows } = await db.query(
      'select public, file_size_limit, allowed_mime_types from storage.buckets',
    )
    expect(rows).toEqual([
      { public: false, file_size_limit: 5242880, allowed_mime_types: ['application/pdf'] },
    ])
  })
})

describe('offres', () => {
  async function creerOffre(uid: string, titre: string) {
    const { rows } = await db.query<{ id: string }>(
      `insert into public.offres (user_id, titre) values ($1, $2) returning id`,
      [uid, titre],
    )
    return rows[0].id
  }

  it('rattache une candidature à une offre du même utilisateur', async () => {
    const offre = await creerOffre(A, 'Développeur front')
    await db.exec(
      `insert into public.candidatures (user_id, nom, offre_id) values ('${A}', 'C1', '${offre}')`,
    )
    const { rows } = await db.query('select offre_id from public.candidatures')
    expect(rows).toEqual([{ offre_id: offre }])
  })

  it('refuse l’offre d’un autre utilisateur', async () => {
    const offreDeB = await creerOffre(B, 'Poste de B')
    await expect(
      db.exec(
        `insert into public.candidatures (user_id, nom, offre_id) values ('${A}', 'C1', '${offreDeB}')`,
      ),
    ).rejects.toThrow(/candidatures_offre_fk/)
  })

  it('détache les candidatures quand l’offre est supprimée', async () => {
    const offre = await creerOffre(A, 'Temporaire')
    await db.exec(
      `insert into public.candidatures (user_id, nom, offre_id) values ('${A}', 'C1', '${offre}')`,
    )
    await db.exec(`delete from public.offres where id = '${offre}'`)
    const { rows } = await db.query('select nom, user_id, offre_id from public.candidatures')
    expect(rows).toEqual([{ nom: 'C1', user_id: A, offre_id: null }])
  })

  it('refuse deux offres de même titre dans un espace', async () => {
    await creerOffre(A, 'Data analyst')
    await expect(creerOffre(A, 'DATA ANALYST')).rejects.toThrow(/offres_espace_titre_unique/)
    await creerOffre(B, 'Data analyst')
  })

  it('ne montre que ses propres offres', async () => {
    await creerOffre(A, 'Offre de A')
    await creerOffre(B, 'Offre de B')
    await db.exec(
      `grant select, insert on public.offres to authenticated; grant usage on schema public to authenticated;`,
    )
    await enTantQue(A)
    await db.exec('set role authenticated')
    const { rows } = await db.query('select titre from public.offres')
    expect(rows).toEqual([{ titre: 'Offre de A' }])
    await expect(
      db.exec(`insert into public.offres (espace_id, titre) values ('${B}', 'Intrus')`),
    ).rejects.toThrow(/row-level security/)
  })
})

describe('entretiens', () => {
  let candidatureA: string
  let candidatureB: string

  beforeEach(async () => {
    const { rows } = await db.query<{ id: string; user_id: string }>(
      `insert into public.candidatures (user_id, nom) values ('${A}', 'De A'), ('${B}', 'De B')
       returning id, user_id`,
    )
    candidatureA = rows.find((r) => r.user_id === A)!.id
    candidatureB = rows.find((r) => r.user_id === B)!.id
    await db.exec(`
      grant usage on schema public to authenticated;
      grant select, insert, delete on public.entretiens to authenticated;
      grant select on public.candidatures to authenticated;
    `)
    await enTantQue(A)
    await db.exec('set role authenticated')
  })

  const planifier = (candidature: string, champs = '') =>
    db.exec(
      `insert into public.entretiens (candidature_id, debut${champs ? ', duree_minutes' : ''})
       values ('${candidature}', '2026-11-03T14:00:00Z'${champs ? `, ${champs}` : ''})`,
    )

  it('planifie sur ses candidatures, pas sur celles des autres', async () => {
    await planifier(candidatureA)
    await expect(planifier(candidatureB)).rejects.toThrow(/row-level security/)
    const { rows } = await db.query('select duree_minutes from public.entretiens')
    expect(rows).toEqual([{ duree_minutes: 60 }])
  })

  it('refuse une durée hors limites', async () => {
    await expect(planifier(candidatureA, '0')).rejects.toThrow(/duree_minutes/)
    await expect(planifier(candidatureA, '600')).rejects.toThrow(/duree_minutes/)
  })

  it('supprime les entretiens avec la candidature', async () => {
    await planifier(candidatureA)
    await db.exec('reset role')
    await db.exec(`delete from public.candidatures where id = '${candidatureA}'`)
    const { rows } = await db.query('select count(*)::int as n from public.entretiens')
    expect(rows).toEqual([{ n: 0 }])
  })
})

describe('travail en équipe', () => {
  const C = '00000000-0000-0000-0000-00000000000c'

  beforeEach(async () => {
    await db.exec(`insert into auth.users values ('${C}', 'c@x.fr')`)
    // Droits par défaut de Supabase sur le schéma public
    await db.exec(`
      grant usage on schema public to authenticated;
      grant select, insert, update, delete on all tables in schema public to authenticated;
    `)
  })

  // Exécute des requêtes en tant qu'utilisateur connecté (rôle authenticated + auth.uid())
  async function enTant<T>(uid: string, action: () => Promise<T>) {
    await enTantQue(uid)
    await db.exec('set role authenticated')
    try {
      return await action()
    } finally {
      await db.exec('reset role')
      await db.exec(`select set_config('test.uid', '', false)`)
    }
  }

  async function inviter(espace: string, par = espace) {
    return enTant(par, async () => {
      const { rows } = await db.query<{ jeton: string }>(
        `insert into public.invitations (espace_id) values ($1) returning jeton`,
        [espace],
      )
      return rows[0].jeton
    })
  }

  const accepter = (uid: string, jeton: string) =>
    enTant(uid, () => db.query(`select public.accepter_invitation($1)`, [jeton]))

  const noms = (uid: string) =>
    enTant(uid, async () =>
      (
        await db.query<{ nom: string }>('select nom from public.candidatures order by nom')
      ).rows.map((r) => r.nom),
    )

  it('crée un espace personnel avec chaque compte', async () => {
    const { rows } = await db.query(
      `select e.id, e.nom, m.role, m.email from public.espaces e
       join public.membres m on m.espace_id = e.id where e.id = '${C}'`,
    )
    expect(rows).toEqual([{ id: C, nom: 'Mon espace', role: 'proprietaire', email: 'c@x.fr' }])
  })

  it('une invitation acceptée donne accès aux candidatures de l’espace', async () => {
    await ajouter(A, ['Candidat de A'])
    await ajouter(B, ['Candidat de B'])
    const jeton = await inviter(A)

    const apercu = await enTant(B, () =>
      db.query(`select * from public.lire_invitation($1)`, [jeton]),
    )
    expect(apercu.rows).toEqual([
      {
        espace_id: A,
        espace_nom: 'Mon espace',
        proprietaire_email: 'a@x.fr',
        valide: true,
        deja_membre: false,
      },
    ])

    await accepter(B, jeton)
    expect(await noms(B)).toEqual(['Candidat de A'])
    const espace = await enTant(B, () => db.query('select * from public.mon_espace()'))
    expect(espace.rows).toEqual([
      { id: A, nom: 'Mon espace', role: 'membre', est_pro: false, nb_membres: 2 },
    ])

    // Ce que B ajoute arrive dans l'espace de A, avec B comme auteur
    await enTant(B, () => db.exec(`insert into public.candidatures (nom) values ('Ajout de B')`))
    const { rows } = await db.query(
      `select espace_id, user_id from public.candidatures where nom = 'Ajout de B'`,
    )
    expect(rows).toEqual([{ espace_id: A, user_id: B }])
    expect(await noms(A)).toEqual(['Ajout de B', 'Candidat de A'])

    // B peut revenir à son espace personnel
    await enTant(B, () => db.exec(`select public.choisir_espace('${B}')`))
    expect(await noms(B)).toEqual(['Candidat de B'])
  })

  it('un lien d’invitation ne sert qu’une fois et expire', async () => {
    const jeton = await inviter(A)
    await accepter(B, jeton)
    await expect(accepter(C, jeton)).rejects.toThrow(/^invitation_invalide/)

    const expire = await inviter(A)
    await db.exec(
      `update public.invitations set expire_le = now() - interval '1 minute' where jeton = '${expire}'`,
    )
    await expect(accepter(C, expire)).rejects.toThrow(/^invitation_invalide/)
    expect(await noms(C)).toEqual([])
  })

  it('seul le propriétaire invite et retire des membres', async () => {
    await accepter(B, await inviter(A))
    await expect(inviter(A, B)).rejects.toThrow(/row-level security/)
    // B ne peut pas retirer A (la suppression ne touche aucune ligne)
    await enTant(B, () =>
      db.exec(`delete from public.membres where espace_id = '${A}' and user_id = '${A}'`),
    )
    // A retire B : B retombe sur son espace personnel
    await enTant(A, () =>
      db.exec(`delete from public.membres where espace_id = '${A}' and user_id = '${B}'`),
    )
    const { rows } = await db.query(`select user_id from public.membres where espace_id = '${A}'`)
    expect(rows).toEqual([{ user_id: A }])
    await ajouter(A, ['Secret de A'])
    expect(await noms(B)).toEqual([])
  })

  it('un membre peut quitter l’espace, pas le propriétaire', async () => {
    await accepter(B, await inviter(A))
    await enTant(A, () =>
      db.exec(`delete from public.membres where espace_id = '${A}' and user_id = '${A}'`),
    )
    await enTant(B, () =>
      db.exec(`delete from public.membres where espace_id = '${A}' and user_id = '${B}'`),
    )
    const { rows } = await db.query(`select user_id from public.membres where espace_id = '${A}'`)
    expect(rows).toEqual([{ user_id: A }])
  })

  it('refuse de choisir un espace dont on n’est pas membre', async () => {
    await expect(enTant(C, () => db.exec(`select public.choisir_espace('${A}')`))).rejects.toThrow(
      /^espace_inaccessible/,
    )
  })

  it('applique la limite Gratuite à l’espace, levée par l’offre Pro du propriétaire', async () => {
    await accepter(B, await inviter(A))
    await ajouter(A, noms50())
    await expect(
      enTant(B, () => db.exec(`insert into public.candidatures (nom) values ('51e')`)),
    ).rejects.toThrow(/^limite_gratuite/)
    await passerPro(A)
    await enTant(B, () => db.exec(`insert into public.candidatures (nom) values ('51e')`))
    const espace = await enTant(B, () => db.query('select est_pro from public.mon_espace()'))
    expect(espace.rows).toEqual([{ est_pro: true }])
  })

  it('protège les données de l’équipe à la suppression d’un compte', async () => {
    await accepter(B, await inviter(A))
    await enTant(B, () => db.exec(`insert into public.candidatures (nom) values ('Ajout de B')`))
    // A ne peut pas supprimer son compte tant que B est membre
    await expect(enTant(A, () => db.exec('select public.supprimer_mon_compte()'))).rejects.toThrow(
      /^equipe_non_vide/,
    )
    // B supprime son compte : ce qu'il a ajouté reste dans l'espace de A
    await enTant(B, () => db.exec('select public.supprimer_mon_compte()'))
    const { rows } = await db.query(`select nom, espace_id, user_id from public.candidatures`)
    expect(rows).toEqual([{ nom: 'Ajout de B', espace_id: A, user_id: null }])
  })

  it('partage les CV entre membres, pas au-delà', async () => {
    await accepter(B, await inviter(A))
    await enTant(B, () =>
      db.exec(`insert into storage.objects (bucket_id, name) values ('cv', '${A}/c1/cv.pdf')`),
    )
    const vusParA = await enTant(A, () => db.query('select name from storage.objects'))
    expect(vusParA.rows).toEqual([{ name: `${A}/c1/cv.pdf` }])
    const vusParC = await enTant(C, () => db.query('select name from storage.objects'))
    expect(vusParC.rows).toEqual([])
    await expect(
      enTant(C, () =>
        db.exec(`insert into storage.objects (bucket_id, name) values ('cv', '${A}/c2/cv.pdf')`),
      ),
    ).rejects.toThrow(/row-level security/)
  })

  it('transfère la propriété : l’ancien propriétaire devient membre, avec un nouvel espace', async () => {
    await ajouter(A, ['Candidat de l’équipe'])
    await accepter(B, await inviter(A))
    // B (simple membre) ne peut pas transférer
    await expect(
      enTant(B, () => db.exec(`select public.transferer_propriete('${A}', '${B}')`)),
    ).rejects.toThrow(/^transfert_refuse/)
    // Ni vers quelqu'un qui n'est pas membre
    await expect(
      enTant(A, () => db.exec(`select public.transferer_propriete('${A}', '${C}')`)),
    ).rejects.toThrow(/^transfert_refuse/)

    await enTant(A, () => db.exec(`select public.transferer_propriete('${A}', '${B}')`))
    const roles = await db.query(
      `select user_id, role from public.membres where espace_id = '${A}' order by role`,
    )
    expect(roles.rows).toEqual([
      { user_id: A, role: 'membre' },
      { user_id: B, role: 'proprietaire' },
    ])
    // B gère désormais l'espace (invitations) ; A non
    await inviter(A, B)
    await expect(inviter(A, A)).rejects.toThrow(/row-level security/)
    // L'offre Pro de l'espace est maintenant celle de B
    await passerPro(B)
    const espace = await enTant(A, () => db.query('select role, est_pro from public.mon_espace()'))
    expect(espace.rows).toEqual([{ role: 'membre', est_pro: true }])
  })

  it('après un transfert, l’ancien propriétaire qui part perd l’accès à l’équipe', async () => {
    await ajouter(A, ['Candidat de l’équipe'])
    await accepter(B, await inviter(A))
    await enTant(A, () => db.exec(`select public.transferer_propriete('${A}', '${B}')`))
    await enTant(A, () =>
      db.exec(`delete from public.membres where espace_id = '${A}' and user_id = '${A}'`),
    )
    // L'identifiant de l'espace d'équipe est toujours celui du compte de A : le repli ne doit
    // pas y donner accès
    expect(await noms(A)).toEqual([])
    await enTant(A, () =>
      db.exec(`insert into public.candidatures (nom) values ('Nouveau départ')`),
    )
    expect(await noms(A)).toEqual(['Nouveau départ'])
    const { rows } = await db.query<{ espace_id: string }>(
      `select espace_id from public.candidatures where nom = 'Nouveau départ'`,
    )
    expect(rows[0].espace_id).not.toBe(A)
    expect(await noms(B)).toEqual(['Candidat de l’équipe'])
  })

  it('refuse une offre d’un autre espace', async () => {
    const { rows } = await db.query<{ id: string }>(
      `insert into public.offres (user_id, titre) values ('${B}', 'Offre de B') returning id`,
    )
    await expect(
      enTant(A, () =>
        db.exec(`insert into public.candidatures (nom, offre_id) values ('X', '${rows[0].id}')`),
      ),
    ).rejects.toThrow(/candidatures_offre_fk|row-level security/)
  })
})

function noms50() {
  return Array.from({ length: 50 }, (_, i) => `C${i + 1}`)
}

describe('historique', () => {
  beforeEach(async () => {
    await db.exec(`
      grant usage on schema public to authenticated;
      grant select, insert, update, delete on all tables in schema public to authenticated;
    `)
  })

  async function enTant<T>(uid: string, action: () => Promise<T>) {
    await enTantQue(uid)
    await db.exec('set role authenticated')
    try {
      return await action()
    } finally {
      await db.exec('reset role')
      await db.exec(`select set_config('test.uid', '', false)`)
    }
  }

  const journal = async () =>
    (
      await db.query<{ action: string; details: unknown; email: string | null }>(
        'select action, details, email from public.historique order by id',
      )
    ).rows

  it('enregistre chaque action, avec son auteur', async () => {
    const id = await enTant(A, async () => {
      const { rows } = await db.query<{ id: string }>(
        `insert into public.candidatures (nom, statut) values ('Alice', 'nouveau') returning id`,
      )
      const c = rows[0].id
      await db.exec(`update public.candidatures set statut = 'retenu' where id = '${c}'`)
      await db.exec(
        `update public.candidatures set poste = 'Dev', competences = '{React}' where id = '${c}'`,
      )
      await db.exec(`update public.candidatures set cv_chemin = 'a/1.pdf' where id = '${c}'`)
      await db.exec(`update public.candidatures set cv_chemin = 'a/2.pdf' where id = '${c}'`)
      await db.exec(`update public.candidatures set cv_chemin = null where id = '${c}'`)
      await db.exec(`insert into public.notes (candidature_id, contenu) values ('${c}', 'Bien')`)
      await db.exec(`delete from public.notes where candidature_id = '${c}'`)
      await db.exec(
        `insert into public.entretiens (candidature_id, debut) values ('${c}', '2026-11-03T14:00:00Z')`,
      )
      // Une mise à jour sans changement n'est pas journalisée
      await db.exec(`update public.candidatures set statut = 'retenu' where id = '${c}'`)
      return c
    })
    expect(await journal()).toEqual([
      { action: 'creation', details: {}, email: 'a@x.fr' },
      {
        action: 'statut',
        details: { avant: 'nouveau', apres: 'retenu', avant_nom: 'Nouveau', apres_nom: 'Retenu' },
        email: 'a@x.fr',
      },
      { action: 'modification', details: { champs: ['poste', 'competences'] }, email: 'a@x.fr' },
      { action: 'cv_ajoute', details: {}, email: 'a@x.fr' },
      { action: 'cv_remplace', details: {}, email: 'a@x.fr' },
      { action: 'cv_retire', details: {}, email: 'a@x.fr' },
      { action: 'note_ajoutee', details: {}, email: 'a@x.fr' },
      { action: 'note_supprimee', details: {}, email: 'a@x.fr' },
      { action: 'entretien_planifie', details: { debut: '2026-11-03T14:00:00Z' }, email: 'a@x.fr' },
    ])
    const lu = await enTant(A, () =>
      db.query(`select count(*)::int as n from public.historique where candidature_id = '${id}'`),
    )
    expect(lu.rows).toEqual([{ n: 9 }])
  })

  it('ne peut être ni écrit, ni modifié, ni effacé par un utilisateur', async () => {
    const [{ id }] = (
      await db.query<{ id: string }>(
        `insert into public.candidatures (user_id, nom) values ('${A}', 'Alice') returning id`,
      )
    ).rows
    await expect(
      enTant(A, () =>
        db.exec(
          `insert into public.historique (candidature_id, espace_id, action) values ('${id}', '${A}', 'creation')`,
        ),
      ),
    ).rejects.toThrow(/row-level security/)
    await enTant(A, () => db.exec(`update public.historique set email = 'faux'`))
    await enTant(A, () => db.exec(`delete from public.historique`))
    await expect(
      enTant(A, () => db.exec(`select prive.journaliser('${id}', 'creation')`)),
    ).rejects.toThrow(/permission denied/)
    expect(await journal()).toEqual([{ action: 'creation', details: {}, email: null }])
  })

  it('n’est visible que dans l’espace de la candidature', async () => {
    await db.exec(`insert into public.candidatures (user_id, nom) values ('${A}', 'De A')`)
    const vuParB = await enTant(B, () => db.query('select * from public.historique'))
    expect(vuParB.rows).toEqual([])
  })

  it('ne journalise pas le détachement automatique quand une offre est supprimée', async () => {
    await enTant(A, async () => {
      const offre = (
        await db.query<{ id: string }>(
          `insert into public.offres (titre) values ('Poste') returning id`,
        )
      ).rows[0].id
      await db.exec(`insert into public.candidatures (nom, offre_id) values ('Alice', '${offre}')`)
      await db.exec(`delete from public.offres where id = '${offre}'`)
    })
    expect((await journal()).map((e) => e.action)).toEqual(['creation'])
    // Retirer l'offre à la main reste journalisé
    await enTant(A, async () => {
      const offre = (
        await db.query<{ id: string }>(
          `insert into public.offres (titre) values ('Autre') returning id`,
        )
      ).rows[0].id
      await db.exec(`update public.candidatures set offre_id = '${offre}'`)
      await db.exec(`update public.candidatures set offre_id = null`)
    })
    expect((await journal()).map((e) => e.action)).toEqual([
      'creation',
      'modification',
      'modification',
    ])
  })

  it('efface l’e-mail d’un compte supprimé et distingue les actions automatiques', async () => {
    const jeton = await enTant(A, async () => {
      const { rows } = await db.query<{ jeton: string }>(
        `insert into public.invitations (espace_id) values ('${A}') returning jeton`,
      )
      return rows[0].jeton
    })
    await enTant(B, () => db.query(`select public.accepter_invitation($1)`, [jeton]))
    await enTant(B, () => db.exec(`insert into public.candidatures (nom) values ('Ajout de B')`))
    // Action sans utilisateur connecté (traitement serveur)
    await db.exec(`update public.candidatures set statut = 'retenu'`)
    await enTant(B, () => db.exec('select public.supprimer_mon_compte()'))
    const { rows } = await db.query(
      'select action, user_id, email, par_systeme from public.historique order by id',
    )
    expect(rows).toEqual([
      { action: 'creation', user_id: null, email: null, par_systeme: false },
      { action: 'statut', user_id: null, email: null, par_systeme: true },
    ])
  })

  it('disparaît avec la candidature, notes et entretiens compris', async () => {
    const id = await enTant(A, async () => {
      const { rows } = await db.query<{ id: string }>(
        `insert into public.candidatures (nom) values ('Alice') returning id`,
      )
      const c = rows[0].id
      await db.exec(`insert into public.notes (candidature_id, contenu) values ('${c}', 'Note')`)
      await db.exec(
        `insert into public.entretiens (candidature_id, debut) values ('${c}', '2026-11-03T14:00:00Z')`,
      )
      return c
    })
    // La suppression en cascade des notes et entretiens ne doit pas bloquer
    await enTant(A, () => db.exec(`delete from public.candidatures where id = '${id}'`))
    expect(await journal()).toEqual([])
  })
})

describe('relecture de sécurité', () => {
  beforeEach(async () => {
    await db.exec(`
      grant usage on schema public to authenticated, anon;
      grant select, insert, update, delete on all tables in schema public to authenticated;
    `)
  })

  async function enTant<T>(uid: string, action: () => Promise<T>) {
    await enTantQue(uid)
    await db.exec('set role authenticated')
    try {
      return await action()
    } finally {
      await db.exec('reset role')
      await db.exec(`select set_config('test.uid', '', false)`)
    }
  }

  it('empêche de rattacher une note ou un entretien à la candidature d’un autre espace', async () => {
    const [deA, deB] = (
      await db.query<{ id: string }>(
        `insert into public.candidatures (user_id, nom) values ('${A}', 'De A'), ('${B}', 'De B')
         returning id`,
      )
    ).rows.map((r) => r.id)
    await enTant(A, async () => {
      await db.exec(`insert into public.notes (candidature_id, contenu) values ('${deA}', 'Note')`)
      await db.exec(
        `insert into public.entretiens (candidature_id, debut) values ('${deA}', '2026-11-03T14:00:00Z')`,
      )
    })
    await expect(
      enTant(A, () => db.exec(`update public.notes set candidature_id = '${deB}'`)),
      // Refus par la règle d'accès (0012), et désormais dès le changement de candidature (0017)
    ).rejects.toThrow(/row-level security|^candidature_figee/)
    await expect(
      enTant(A, () => db.exec(`update public.entretiens set candidature_id = '${deB}'`)),
    ).rejects.toThrow(/row-level security|^candidature_figee/)
    const { rows } = await db.query('select candidature_id from public.notes')
    expect(rows).toEqual([{ candidature_id: deA }])
  })

  it('refuse la suppression du compte tant qu’un abonnement est en défaut de paiement', async () => {
    await passerPro(A, 'past_due')
    await expect(enTant(A, () => db.exec('select public.supprimer_mon_compte()'))).rejects.toThrow(
      /^abonnement_actif/,
    )
    await expect(
      enTant(A, () => db.exec('select public.verifier_suppression_compte()')),
    ).rejects.toThrow(/^abonnement_actif/)
    await passerPro(A, 'canceled')
    await enTant(A, () => db.exec('select public.verifier_suppression_compte()'))
  })

  it('liste les CV des espaces possédés, quel que soit l’espace actif', async () => {
    await db.exec(
      `insert into public.candidatures (user_id, nom, cv_chemin) values
         ('${A}', 'Avec CV', '${A}/c1/cv.pdf'), ('${A}', 'Sans CV', null),
         ('${B}', 'De B', '${B}/c2/cv.pdf')`,
    )
    const { rows } = await enTant(A, () =>
      db.query<{ chemins: string[] }>('select public.cv_de_mes_espaces() as chemins'),
    )
    expect(rows[0].chemins).toEqual([`${A}/c1/cv.pdf`])
  })

  it('ne laisse appeler aucune fonction sans compte, ni celles qui renseignent sur autrui', async () => {
    await db.exec('set role anon')
    try {
      // Utilisées par les règles d'accès : appelables, mais elles ne révèlent rien sans compte
      // (migration 0017)
      const { rows } = await db.query(
        `select public.espace_actif() as espace, public.est_membre('${A}') as membre`,
      )
      expect(rows).toEqual([{ espace: null, membre: false }])
      for (const appel of [
        `select public.est_pro('${A}')`,
        'select * from public.mon_espace()',
        'select public.supprimer_mon_compte()',
      ]) {
        await expect(db.exec(appel)).rejects.toThrow(/permission denied/)
      }
    } finally {
      await db.exec('reset role')
    }
    await expect(enTant(A, () => db.exec(`select public.est_pro('${B}')`))).rejects.toThrow(
      /permission denied/,
    )
    await expect(enTant(A, () => db.exec(`select public.est_pro_espace('${B}')`))).rejects.toThrow(
      /permission denied/,
    )
    // Les fonctions utiles au site restent appelables par un utilisateur connecté
    await enTant(A, () => db.exec('select * from public.mon_espace()'))
  })
})

describe('formulaire public', () => {
  const JETON = '11111111-1111-1111-1111-111111111111'
  const IP = 'empreinte-1'

  beforeEach(async () => {
    await db.exec(`
      delete from prive.envois_formulaire;
      grant usage on schema public to anon, service_role;
      insert into public.offres (user_id, titre, description, publique, jeton_public)
        values ('${A}', 'Développeur front', 'CDI à Lyon', true, '${JETON}');
    `)
  })

  interface Depot {
    resultat: string
    candidature: string
    offre_titre: string
    espace_nom: string
    accuse_reception: boolean
    destinataires: string[]
  }

  async function deposerLigne(email: string, empreinte = IP, code = JETON) {
    await db.exec('set role service_role')
    try {
      const { rows } = await db.query<Depot>(
        `select * from public.deposer_candidature_publique($1, $2, gen_random_uuid(),
           'Alice Martin', $3, array['React'], 4)`,
        [code, empreinte, email],
      )
      return rows[0]
    } finally {
      await db.exec('reset role')
    }
  }

  const deposer = async (email: string, empreinte = IP, code = JETON) =>
    (await deposerLigne(email, empreinte, code)).resultat

  it('l’offre publiée se lit sans compte, une offre non publiée non', async () => {
    await db.exec('set role anon')
    try {
      const { rows } = await db.query(`select * from public.lire_offre_publique('${JETON}')`)
      expect(rows).toEqual([
        {
          titre: 'Développeur front',
          description: 'CDI à Lyon',
          espace_nom: expect.any(String),
          ouverte: true,
        },
      ])
      await db.exec('reset role')
      await db.exec(`update public.offres set publique = false`)
      await db.exec('set role anon')
      expect((await db.query(`select * from public.lire_offre_publique('${JETON}')`)).rows).toEqual(
        [],
      )
    } finally {
      await db.exec('reset role')
    }
  })

  it('seule la fonction serveur peut déposer une candidature', async () => {
    for (const role of ['anon', 'authenticated']) {
      await db.exec(`set role ${role}`)
      try {
        await expect(
          db.exec(`select public.deposer_candidature_publique('${JETON}', 'x', gen_random_uuid(),
            'Pirate', 'p@x.fr', '{}', 0)`),
        ).rejects.toThrow(/permission denied/)
      } finally {
        await db.exec('reset role')
      }
    }
  })

  it('crée la candidature dans l’espace de l’offre, notée « reception » dans l’historique', async () => {
    expect(await deposer('alice@x.fr')).toBe('creee')
    const { rows } = await db.query(
      `select c.espace_id, c.user_id, c.source, c.statut, c.experience, c.competences,
              o.titre, h.action, h.par_systeme
       from public.candidatures c
       join public.offres o on o.id = c.offre_id
       join public.historique h on h.candidature_id = c.id`,
    )
    expect(rows).toEqual([
      {
        espace_id: A,
        user_id: null,
        source: 'formulaire',
        statut: 'nouveau',
        experience: 4,
        competences: ['React'],
        titre: 'Développeur front',
        action: 'reception',
        par_systeme: true,
      },
    ])
  })

  it('un candidat déjà présent n’est pas dupliqué : le nouvel envoi est noté sur sa fiche', async () => {
    expect(await deposer('alice@x.fr')).toBe('creee')
    expect(await deposer('ALICE@x.fr')).toBe('deja_recue')
    const { rows } = await db.query(`select action, details from public.historique order by id`)
    expect(rows).toEqual([
      { action: 'reception', details: {} },
      { action: 'nouvelle_postulation', details: { offre: 'Développeur front' } },
    ])
    expect(await nombre('candidatures', A)).toBe(0) // user_id null : créée par personne
    const total = await db.query<{ n: number }>(
      'select count(*)::int as n from public.candidatures',
    )
    expect(total.rows[0].n).toBe(1)
  })

  it('limite les envois par connexion et par heure', async () => {
    for (let i = 1; i <= 5; i++) expect(await deposer(`c${i}@x.fr`)).toBe('creee')
    await expect(deposer('c6@x.fr')).rejects.toThrow(/^trop_de_candidatures/)
    // Une autre connexion n'est pas concernée ; les envois de plus d'une heure ne comptent plus
    expect(await deposer('c7@x.fr', 'empreinte-2')).toBe('creee')
    await db.exec(`update prive.envois_formulaire set created_at = now() - interval '2 hours'`)
    expect(await deposer('c8@x.fr')).toBe('creee')
  })

  it('refuse une offre fermée ou inconnue, et respecte la limite Gratuite', async () => {
    await expect(deposer('a@x.fr', IP, '22222222-2222-2222-2222-222222222222')).rejects.toThrow(
      /^offre_fermee/,
    )
    await ajouter(A, noms(1, 50))
    await db.exec('set role anon')
    try {
      const { rows } = await db.query<{ ouverte: boolean }>(
        `select ouverte from public.lire_offre_publique('${JETON}')`,
      )
      expect(rows[0].ouverte).toBe(false)
    } finally {
      await db.exec('reset role')
    }
    await expect(deposer('b@x.fr')).rejects.toThrow(/^limite_gratuite/)
  })
  describe('notifications', () => {
    // Un membre (B) dans l'espace de A
    beforeEach(async () => {
      await db.exec(`
        insert into public.membres (espace_id, user_id, email, role)
          values ('${A}', '${B}', 'b@x.fr', 'membre');
        grant usage on schema public to authenticated;
      `)
    })

    async function enTantQue2<T>(uid: string, action: () => Promise<T>) {
      await enTantQue(uid)
      await db.exec(`update public.profils set espace_actif = '${A}' where user_id = '${uid}'`)
      await db.exec('set role authenticated')
      try {
        return await action()
      } finally {
        await db.exec('reset role')
        await db.exec(`select set_config('test.uid', '', false)`)
      }
    }

    it('le dépôt renvoie de quoi prévenir l’équipe et le candidat', async () => {
      const depot = await deposerLigne('alice@x.fr')
      expect(depot).toMatchObject({
        resultat: 'creee',
        offre_titre: 'Développeur front',
        espace_nom: 'Mon espace',
        accuse_reception: true,
        destinataires: ['a@x.fr', 'b@x.fr'],
      })
      const { rows } = await db.query('select id from public.candidatures')
      expect(rows).toEqual([{ id: depot.candidature }])
      // Second envoi : la candidature existante
      const encore = await deposerLigne('alice@x.fr')
      expect(encore).toMatchObject({ resultat: 'deja_recue', candidature: depot.candidature })
    })

    it('chacun règle ses notifications ; seul le propriétaire règle l’accusé de réception', async () => {
      await enTantQue2(B, () => db.exec('select public.regler_notifications(false)'))
      await expect(
        enTantQue2(B, () => db.exec('select public.regler_notifications(false, false)')),
      ).rejects.toThrow(/^reserve_proprietaire/)
      const reglagesB = await enTantQue2(B, () =>
        db.query('select * from public.mes_notifications()'),
      )
      expect(reglagesB.rows).toEqual([
        { notifier: false, rappels: true, accuse_reception: true, proprietaire: false },
      ])

      await enTantQue2(A, () => db.exec('select public.regler_notifications(true, false)'))
      const depot = await deposerLigne('alice@x.fr')
      expect(depot).toMatchObject({ accuse_reception: false, destinataires: ['a@x.fr'] })
    })

    it('les réglages ne sont pas accessibles sans compte', async () => {
      await db.exec('set role anon')
      try {
        await expect(db.exec('select * from public.mes_notifications()')).rejects.toThrow(
          /permission denied/,
        )
        await expect(db.exec('select public.regler_notifications(false)')).rejects.toThrow(
          /permission denied/,
        )
      } finally {
        await db.exec('reset role')
      }
    })
  })
})

describe('étapes de recrutement', () => {
  beforeEach(async () => {
    await db.exec(`
      grant usage on schema public to authenticated;
      grant select, insert, update, delete on public.etapes, public.candidatures to authenticated;
    `)
  })

  async function enTant<T>(uid: string, action: () => Promise<T>) {
    await enTantQue(uid)
    await db.exec('set role authenticated')
    try {
      return await action()
    } finally {
      await db.exec('reset role')
      await db.exec(`select set_config('test.uid', '', false)`)
    }
  }

  const etapes = async (espace: string) =>
    (
      await db.query<{ cle: string; nom: string }>(
        `select cle, nom from public.etapes where espace_id = $1 order by position`,
        [espace],
      )
    ).rows

  it('chaque espace a les trois étapes de base, dans l’ordre', async () => {
    expect(await etapes(A)).toEqual([
      { cle: 'nouveau', nom: 'Nouveau' },
      { cle: 'retenu', nom: 'Retenu' },
      { cle: 'ecarte', nom: 'Écarté' },
    ])
  })

  it('le propriétaire ajoute une étape, placée avant « Retenu », et y range une candidature', async () => {
    await ajouter(A, ['Alice'])
    await enTant(A, async () => {
      await db.exec(`insert into public.etapes (nom) values ('  Entretien RH ')`)
      await db.exec(`insert into public.etapes (nom) values ('Offre')`)
    })
    expect((await etapes(A)).map((e) => e.nom)).toEqual([
      'Nouveau',
      'Entretien RH',
      'Offre',
      'Retenu',
      'Écarté',
    ])
    const [entretien] = (
      await db.query<{ cle: string }>(`select cle from public.etapes where nom = 'Entretien RH'`)
    ).rows
    expect(entretien.cle).toMatch(/^e_[0-9a-f]{32}$/)
    await enTant(A, () =>
      db.exec(`update public.candidatures set statut = '${entretien.cle}' where nom = 'Alice'`),
    )
    // L'historique garde le nom des étapes
    const { rows } = await db.query(`select details from public.historique where action = 'statut'`)
    expect(rows).toEqual([
      {
        details: {
          avant: 'nouveau',
          apres: entretien.cle,
          avant_nom: 'Nouveau',
          apres_nom: 'Entretien RH',
        },
      },
    ])
  })

  it('refuse une étape d’un autre espace, ou inconnue, pour une candidature', async () => {
    await ajouter(A, ['Alice'])
    await enTant(B, () => db.exec(`insert into public.etapes (nom) values ('Chez B')`))
    const [deB] = (
      await db.query<{ cle: string }>(`select cle from public.etapes where nom = 'Chez B'`)
    ).rows
    await expect(
      db.exec(`update public.candidatures set statut = '${deB.cle}' where nom = 'Alice'`),
    ).rejects.toThrow(/candidatures_etape_fk/)
    await expect(
      db.exec(`update public.candidatures set statut = 'inconnue' where nom = 'Alice'`),
    ).rejects.toThrow(/candidatures_etape_fk/)
  })

  it('protège les étapes de base et réserve les modifications au propriétaire', async () => {
    await db.exec(`
      insert into public.membres (espace_id, user_id, email, role) values ('${A}', '${B}', 'b@x.fr', 'membre');
      update public.profils set espace_actif = '${A}' where user_id = '${B}';
    `)
    // Un membre lit les étapes, sans pouvoir en ajouter
    expect(
      await enTant(B, async () => (await db.query('select cle from public.etapes')).rows),
    ).toHaveLength(3)
    await expect(
      enTant(B, () => db.exec(`insert into public.etapes (nom) values ('Pirate')`)),
    ).rejects.toThrow(/row-level security/)
    await enTant(B, () => db.exec(`update public.etapes set nom = 'Piraté'`))
    expect((await etapes(A))[0].nom).toBe('Nouveau')

    await enTant(A, async () => {
      // Renommer une étape de base : oui ; la supprimer ou changer sa clé : non
      await db.exec(`update public.etapes set nom = 'Embauché' where cle = 'retenu'`)
      await db.exec(`delete from public.etapes where cle = 'ecarte'`)
      await expect(
        db.exec(`update public.etapes set cle = 'autre' where cle = 'ecarte'`),
      ).rejects.toThrow(/^etape_figee/)
      // « Nouveau » reste la première
      await expect(
        db.exec(`update public.etapes set position = 5 where cle = 'nouveau'`),
      ).rejects.toThrow(/row-level security/)
      await expect(
        db.exec(`update public.etapes set position = 0 where cle = 'retenu'`),
      ).rejects.toThrow(/row-level security/)
      // Deux étapes du même nom (majuscules ignorées) : non
      await expect(db.exec(`insert into public.etapes (nom) values ('embauché')`)).rejects.toThrow(
        /etapes_espace_nom_unique/,
      )
    })
    expect((await etapes(A)).map((e) => e.nom)).toEqual(['Nouveau', 'Embauché', 'Écarté'])
  })

  it('supprimer une étape ramène ses candidatures à « Nouveau »', async () => {
    await ajouter(A, ['Alice', 'Bruno'])
    const cle = await enTant(A, async () => {
      const { rows } = await db.query<{ cle: string; id: string }>(
        `insert into public.etapes (nom) values ('Présélection') returning cle, id`,
      )
      await db.exec(`update public.candidatures set statut = '${rows[0].cle}'`)
      const supprimees = await db.query<{ n: number }>(
        `select public.supprimer_etape('${rows[0].id}') as n`,
      )
      expect(supprimees.rows[0].n).toBe(2)
      return rows[0].cle
    })
    const { rows } = await db.query<{ statut: string }>(
      'select distinct statut from public.candidatures',
    )
    expect(rows).toEqual([{ statut: 'nouveau' }])
    expect((await etapes(A)).map((e) => e.cle)).not.toContain(cle)
    // Étape de base : refusé
    const base = (
      await db.query<{ id: string }>(
        `select id from public.etapes where espace_id = '${A}' and cle = 'retenu'`,
      )
    ).rows[0]
    await expect(
      enTant(A, () => db.exec(`select public.supprimer_etape('${base.id}')`)),
    ).rejects.toThrow(/^etape_protegee/)
  })

  it('12 étapes au plus par espace', async () => {
    await enTant(A, async () => {
      for (let i = 1; i <= 9; i++) await db.exec(`insert into public.etapes (nom) values ('É${i}')`)
      await expect(
        db.exec(`insert into public.etapes (nom) values ('Une de trop')`),
      ).rejects.toThrow(/^trop_d_etapes/)
    })
  })
})

describe('page carrières', () => {
  beforeEach(async () => {
    await db.exec(`
      grant usage on schema public to anon, authenticated;
      grant select, update on public.espaces to authenticated;
      update public.espaces set nom = 'Agence RH' where id = '${A}';
      insert into public.offres (user_id, titre, description, publique) values
        ('${A}', 'Développeur front', 'CDI à Lyon', true),
        ('${A}', 'comptable', null, true),
        ('${A}', 'Offre interne', null, false);
    `)
  })

  async function lire(adresse: string) {
    await db.exec('set role anon')
    try {
      const { rows } = await db.query<{ page: unknown }>(
        'select public.lire_page_carrieres($1) as page',
        [adresse],
      )
      return rows[0].page
    } finally {
      await db.exec('reset role')
    }
  }

  async function regler(uid: string, sql: string) {
    await enTantQue(uid)
    await db.exec(`update public.profils set espace_actif = '${A}' where user_id = '${uid}'`)
    await db.exec('set role authenticated')
    try {
      await db.exec(sql)
    } finally {
      await db.exec('reset role')
      await db.exec(`select set_config('test.uid', '', false)`)
    }
  }

  it('n’existe que publiée, avec une adresse', async () => {
    await expect(
      db.exec(`update public.espaces set carrieres_publiques = true where id = '${A}'`),
    ).rejects.toThrow(/espaces_carrieres_adresse/)
    await db.exec(`update public.espaces set slug = 'agence-rh' where id = '${A}'`)
    expect(await lire('agence-rh')).toBeNull()
  })

  it('liste, sans compte, les seules offres en ligne, par titre', async () => {
    await regler(
      A,
      `update public.espaces set slug = 'agence-rh', carrieres_publiques = true,
         presentation = 'Cabinet lyonnais' where id = '${A}'`,
    )
    const page = (await lire('Agence-RH')) as {
      nom: string
      presentation: string
      offres: { titre: string; description: string | null; jeton: string }[]
    }
    expect(page).toMatchObject({ nom: 'Agence RH', presentation: 'Cabinet lyonnais' })
    expect(page.offres.map((o) => [o.titre, o.description])).toEqual([
      ['comptable', null],
      ['Développeur front', 'CDI à Lyon'],
    ])
    expect(page.offres[0].jeton).toMatch(/^[0-9a-f-]{36}$/)
  })

  it('adresse valide et unique ; réglée par le propriétaire seulement', async () => {
    for (const mauvaise of ['ab', 'Agence', '-agence', 'agence rh', 'x'.repeat(41)]) {
      await expect(
        db.exec(`update public.espaces set slug = '${mauvaise}' where id = '${A}'`),
      ).rejects.toThrow(/espaces_slug_check/)
    }
    await db.exec(`update public.espaces set slug = 'prise' where id = '${B}'`)
    await expect(
      db.exec(`update public.espaces set slug = 'prise' where id = '${A}'`),
    ).rejects.toThrow(/espaces_slug_unique/)

    // Un membre de l'espace ne peut pas la régler (aucune ligne modifiée)
    await db.exec(
      `insert into public.membres (espace_id, user_id, email, role) values ('${A}', '${B}', 'b@x.fr', 'membre')`,
    )
    await regler(B, `update public.espaces set slug = 'piratee' where id = '${A}'`)
    const { rows } = await db.query(`select slug from public.espaces where id = '${A}'`)
    expect(rows).toEqual([{ slug: null }])
  })
})

describe('relecture 2', () => {
  beforeEach(async () => {
    await db.exec(`
      grant usage on schema public to anon, authenticated, service_role;
      grant select, insert, update, delete on all tables in schema public to anon, authenticated;
    `)
  })

  async function enTant<T>(uid: string, action: () => Promise<T>) {
    await enTantQue(uid)
    await db.exec('set role authenticated')
    try {
      return await action()
    } finally {
      await db.exec('reset role')
      await db.exec(`select set_config('test.uid', '', false)`)
    }
  }

  it('sans compte, les tables protégées ne renvoient rien, sans erreur', async () => {
    await ajouter(A, ['Alice'])
    await db.exec('set role anon')
    try {
      for (const table of ['candidatures', 'offres', 'espaces', 'membres', 'etapes', 'notes']) {
        const { rows } = await db.query(`select * from public.${table}`)
        expect(rows, table).toEqual([])
      }
    } finally {
      await db.exec('reset role')
    }
  })

  it('une note ne change pas de candidature', async () => {
    await ajouter(A, ['Alice', 'Bruno'])
    const [alice, bruno] = (
      await db.query<{ id: string }>(`select id from public.candidatures order by nom`)
    ).rows.map((r) => r.id)
    await enTant(A, async () => {
      await db.exec(
        `insert into public.notes (candidature_id, contenu) values ('${alice}', 'Note')`,
      )
      await expect(db.exec(`update public.notes set candidature_id = '${bruno}'`)).rejects.toThrow(
        /^candidature_figee/,
      )
      // Modifier le contenu reste possible
      await db.exec(`update public.notes set contenu = 'Note corrigée'`)
    })
  })

  it('formulaire public : limite par espace, quelle que soit la connexion', async () => {
    const jeton = '33333333-3333-3333-3333-333333333333'
    await db.exec(`
      delete from prive.envois_formulaire;
      insert into public.offres (user_id, titre, publique, jeton_public)
        values ('${A}', 'Dev', true, '${jeton}');
      insert into prive.envois_formulaire (empreinte, espace_id)
        select 'connexion-' || i, '${A}' from generate_series(1, 60) i;
    `)
    await db.exec('set role service_role')
    try {
      await expect(
        db.exec(`select * from public.deposer_candidature_publique('${jeton}', 'nouvelle',
          gen_random_uuid(), 'X', 'x@x.fr', '{}', 0)`),
      ).rejects.toThrow(/^trop_de_candidatures/)
    } finally {
      await db.exec('reset role')
    }
  })

  it('notifications : chaque réglage s’enregistre seul', async () => {
    await enTant(A, async () => {
      await db.exec('select public.regler_notifications(pour_moi => false)')
      await db.exec('select public.regler_notifications(accuse => false)')
      const { rows } = await db.query('select * from public.mes_notifications()')
      expect(rows).toEqual([
        { notifier: false, rappels: true, accuse_reception: false, proprietaire: true },
      ])
    })
  })

  const ordre = async () =>
    (
      await db.query<{ nom: string }>(
        `select nom from public.etapes where espace_id = '${A}' order by position`,
      )
    ).rows.map((r) => r.nom)

  it('étapes : une nouvelle étape va avant « Retenu », même après réordonnancement', async () => {
    await enTant(A, async () => {
      await db.exec(`insert into public.etapes (nom) values ('Entretien')`)
      const { rows } = await db.query<{ id: string }>(
        `select id from public.etapes where cle = 'retenu' and espace_id = '${A}'`,
      )
      // « Retenu » remonte au-dessus d'« Entretien »
      await db.exec(`select public.deplacer_etape('${rows[0].id}', -1)`)
      await db.exec(`insert into public.etapes (nom) values ('Offre')`)
    })
    expect(await ordre()).toEqual(['Nouveau', 'Offre', 'Retenu', 'Entretien', 'Écarté'])
  })

  it('étapes : déplacement d’un seul tenant, « Nouveau » reste première, propriétaire seul', async () => {
    const id = (nom: string) =>
      db
        .query<{ id: string }>(
          `select id from public.etapes where espace_id = '${A}' and nom = $1`,
          [nom],
        )
        .then((r) => r.rows[0].id)
    await enTant(A, () => db.exec(`insert into public.etapes (nom) values ('Entretien')`))
    const entretien = await id('Entretien')
    await enTant(A, async () => {
      await db.exec(`select public.deplacer_etape('${entretien}', -1)`)
      await db.exec(`select public.deplacer_etape('${entretien}', 1)`)
    })
    expect(await ordre()).toEqual(['Nouveau', 'Retenu', 'Entretien', 'Écarté'])
    // Vers « Nouveau » : sans effet ; à la fin : sans effet
    const retenu = await id('Retenu')
    const ecarte = await id('Écarté')
    await enTant(A, () => db.exec(`select public.deplacer_etape('${retenu}', -1)`))
    await enTant(A, () => db.exec(`select public.deplacer_etape('${ecarte}', 1)`))
    expect(await ordre()).toEqual(['Nouveau', 'Retenu', 'Entretien', 'Écarté'])
    // Positions toujours distinctes
    const { rows } = await db.query<{ n: number }>(
      `select count(distinct position)::int as n from public.etapes where espace_id = '${A}'`,
    )
    expect(rows[0].n).toBe(4)

    // Un membre ne peut pas déplacer
    await db.exec(`
      insert into public.membres (espace_id, user_id, email, role) values ('${A}', '${B}', 'b@x.fr', 'membre');
      update public.profils set espace_actif = '${A}' where user_id = '${B}';
    `)
    await expect(
      enTant(B, () => db.exec(`select public.deplacer_etape('${entretien}', -1)`)),
    ).rejects.toThrow(/^etape_introuvable/)
  })

  it('historique : correction des e-mails reprise pour les bases déjà migrées', async () => {
    const sql = readFileSync(join(DOSSIER, '0017_relecture_2.sql'), 'utf8')
    expect(sql).toContain(
      'update public.historique set email = null where user_id is null and email is not null',
    )
  })
})

describe('rappels d’entretien', () => {
  let alice: string

  beforeEach(async () => {
    await db.exec(`
      grant usage on schema public to anon, authenticated, service_role;
      update public.espaces set nom = 'Agence RH' where id = '${A}';
      insert into public.membres (espace_id, user_id, email, role) values ('${A}', '${B}', 'b@x.fr', 'membre');
    `)
    await ajouter(A, ['Alice'])
    alice = (await db.query<{ id: string }>(`select id from public.candidatures`)).rows[0].id
  })

  // Entretien dans `heures` heures (négatif : passé)
  const planifier = (heures: number, lieu = 'Visio') =>
    db.exec(
      `insert into public.entretiens (user_id, candidature_id, debut, lieu)
       values ('${A}', '${alice}', now() + interval '${heures} hours', '${lieu}')`,
    )

  interface Rappel {
    candidat: string
    lieu: string
    espace_nom: string
    destinataires: string[]
  }

  async function prendre() {
    await db.exec('set role service_role')
    try {
      return (await db.query<Rappel>('select * from public.prendre_entretiens_a_rappeler()')).rows
    } finally {
      await db.exec('reset role')
    }
  }

  it('prend les entretiens des 30 prochaines heures, une seule fois', async () => {
    await planifier(20, 'Demain')
    await planifier(40, 'Plus tard')
    await planifier(-2, 'Passé')
    const rappels = await prendre()
    expect(rappels).toMatchObject([
      {
        candidat: 'Alice',
        lieu: 'Demain',
        espace_nom: 'Agence RH',
        destinataires: ['a@x.fr', 'b@x.fr'],
      },
    ])
    // Deuxième exécution : déjà rappelé
    expect(await prendre()).toEqual([])
  })

  it('un entretien déplacé est rappelé de nouveau ; un envoi échoué est rendu', async () => {
    await planifier(10)
    const [premier] = await db
      .query<{ entretien: string }>('select entretien from public.prendre_entretiens_a_rappeler()')
      .then((r) => r.rows)
    await db.exec(`update public.entretiens set debut = debut + interval '2 hours'`)
    expect(await prendre()).toHaveLength(1)

    await db.exec('set role service_role')
    try {
      await db.exec(
        `select public.rendre_entretiens_a_rappeler(array['${premier.entretien}']::uuid[])`,
      )
    } finally {
      await db.exec('reset role')
    }
    expect(await prendre()).toHaveLength(1)
  })

  it('seuls les membres qui le souhaitent sont rappelés', async () => {
    await enTantQue(B)
    await db.exec(`update public.profils set espace_actif = '${A}' where user_id = '${B}'`)
    await db.exec('set role authenticated')
    try {
      await db.exec('select public.regler_notifications(rappels => false)')
      const { rows } = await db.query('select * from public.mes_notifications()')
      // Les autres réglages ne bougent pas
      expect(rows).toEqual([
        { notifier: true, rappels: false, accuse_reception: true, proprietaire: false },
      ])
    } finally {
      await db.exec('reset role')
      await db.exec(`select set_config('test.uid', '', false)`)
    }
    await planifier(5)
    expect((await prendre())[0].destinataires).toEqual(['a@x.fr'])
  })

  it('réservé à la fonction serveur', async () => {
    for (const role of ['anon', 'authenticated']) {
      await db.exec(`set role ${role}`)
      try {
        await expect(
          db.exec('select * from public.prendre_entretiens_a_rappeler()'),
        ).rejects.toThrow(/permission denied/)
        await expect(
          db.exec(`select public.rendre_entretiens_a_rappeler('{}'::uuid[])`),
        ).rejects.toThrow(/permission denied/)
      } finally {
        await db.exec('reset role')
      }
    }
  })
})

describe('modèles de réponse', () => {
  let alice: string

  beforeEach(async () => {
    await db.exec(`
      grant usage on schema public to anon, authenticated;
      grant select, insert, update, delete on public.modeles_reponse to authenticated;
      update public.espaces set nom = 'Agence RH' where id = '${A}';
    `)
    await db.exec(
      `insert into public.candidatures (user_id, nom, email) values ('${A}', 'Alice', 'alice@x.fr')`,
    )
    alice = (await db.query<{ id: string }>(`select id from public.candidatures`)).rows[0].id
  })

  async function enTant<T>(uid: string, action: () => Promise<T>) {
    await enTantQue(uid)
    await db.exec('set role authenticated')
    try {
      return await action()
    } finally {
      await db.exec('reset role')
      await db.exec(`select set_config('test.uid', '', false)`)
    }
  }

  it('chaque espace reçoit les trois modèles proposés', async () => {
    const { rows } = await db.query<{ nom: string }>(
      `select nom from public.modeles_reponse where espace_id = '${A}' order by nom`,
    )
    expect(rows.map((r) => r.nom)).toEqual([
      'Convocation à un entretien',
      'Demande de pièces',
      'Réponse négative',
    ])
    const { rows: corps } = await db.query<{ corps: string }>(
      `select corps from public.modeles_reponse where espace_id = '${A}' and nom = 'Réponse négative'`,
    )
    expect(corps[0].corps).toContain('Bonjour {nom},\n\n')
  })

  it('un membre ne voit et ne modifie que les modèles de son espace actif', async () => {
    await enTant(A, async () => {
      await db.exec(
        `insert into public.modeles_reponse (nom, sujet, corps) values ('Relance', 'Sujet', 'Texte')`,
      )
      const { rows } = await db.query('select espace_id from public.modeles_reponse')
      expect(new Set(rows.map((r) => r.espace_id))).toEqual(new Set([A]))
    })
    await enTant(B, async () => {
      await db.exec(`delete from public.modeles_reponse where nom = 'Relance'`)
      await expect(
        db.exec(
          `insert into public.modeles_reponse (espace_id, nom, sujet, corps) values ('${A}', 'Pirate', 's', 'c')`,
        ),
      ).rejects.toThrow(/row-level security/)
    })
    const { rows } = await db.query(`select 1 from public.modeles_reponse where nom = 'Relance'`)
    expect(rows).toHaveLength(1)
  })

  it('préparer : données du modèle pour un membre, refus sinon', async () => {
    const preparation = await enTant(A, () =>
      db.query(`select * from public.preparer_reponse('${alice}')`),
    )
    expect(preparation.rows).toEqual([
      {
        email: 'alice@x.fr',
        nom: 'Alice',
        offre_titre: null,
        poste: null,
        espace_nom: 'Agence RH',
        envoyeur: 'a@x.fr',
      },
    ])
    await expect(
      enTant(B, () => db.query(`select * from public.preparer_reponse('${alice}')`)),
    ).rejects.toThrow(/^candidature_inaccessible/)
    await db.exec(`update public.candidatures set email = null`)
    await expect(
      enTant(A, () => db.query(`select * from public.preparer_reponse('${alice}')`)),
    ).rejects.toThrow(/^sans_email/)
  })

  it('noter : trace dans l’historique, au nom de l’utilisateur ; limite d’envois par heure', async () => {
    await enTant(A, () =>
      db.exec(
        `select public.noter_reponse_envoyee('${alice}', 'Proposition d''entretien', 'Convocation à un entretien')`,
      ),
    )
    const { rows } = await db.query(
      `select action, details, email from public.historique where action = 'reponse_envoyee'`,
    )
    expect(rows).toEqual([
      {
        action: 'reponse_envoyee',
        details: {
          sujet: 'Proposition d’entretien'.replace('’', "'"),
          modele: 'Convocation à un entretien',
        },
        email: 'a@x.fr',
      },
    ])
    await expect(
      enTant(B, () => db.exec(`select public.noter_reponse_envoyee('${alice}', 'x')`)),
    ).rejects.toThrow(/^candidature_inaccessible/)

    await db.exec(`
      insert into public.historique (candidature_id, espace_id, action)
        select '${alice}', '${A}', 'reponse_envoyee' from generate_series(1, 99);
    `)
    await expect(
      enTant(A, () => db.query(`select * from public.preparer_reponse('${alice}')`)),
    ).rejects.toThrow(/^trop_de_reponses/)
  })

  it('sans compte : rien', async () => {
    await db.exec('set role anon')
    try {
      await expect(db.query(`select * from public.preparer_reponse('${alice}')`)).rejects.toThrow(
        /permission denied/,
      )
      await expect(db.exec(`select public.noter_reponse_envoyee('${alice}', 'x')`)).rejects.toThrow(
        /permission denied/,
      )
    } finally {
      await db.exec('reset role')
    }
  })
})

describe('évaluations', () => {
  let alice: string
  const critere = async (nom: string, espace = A) =>
    (
      await db.query<{ id: string }>(
        `select id from public.criteres where espace_id = $1 and nom = $2`,
        [espace, nom],
      )
    ).rows[0].id

  beforeEach(async () => {
    await db.exec(`
      grant usage on schema public to anon, authenticated;
      grant select, insert, update, delete on public.criteres, public.evaluations to authenticated;
      insert into public.membres (espace_id, user_id, email, role) values ('${A}', '${B}', 'b@x.fr', 'membre');
      update public.profils set espace_actif = '${A}' where user_id = '${B}';
    `)
    await ajouter(A, ['Alice'])
    alice = (await db.query<{ id: string }>(`select id from public.candidatures`)).rows[0].id
  })

  async function enTant<T>(uid: string, action: () => Promise<T>) {
    await enTantQue(uid)
    await db.exec('set role authenticated')
    try {
      return await action()
    } finally {
      await db.exec('reset role')
      await db.exec(`select set_config('test.uid', '', false)`)
    }
  }

  const noter = (critereId: string, note: number) =>
    db.exec(
      `insert into public.evaluations (candidature_id, critere_id, note)
       values ('${alice}', '${critereId}', ${note})
       on conflict (candidature_id, critere_id, user_id) do update set note = excluded.note`,
    )

  it('chaque espace reçoit trois critères proposés, dans l’ordre', async () => {
    const { rows } = await db.query<{ nom: string }>(
      `select nom from public.criteres where espace_id = '${A}' order by position`,
    )
    expect(rows.map((r) => r.nom)).toEqual([
      'Compétences techniques',
      'Communication',
      'Motivation',
    ])
  })

  it('chaque membre note ; la moyenne réunit l’équipe', async () => {
    const technique = await critere('Compétences techniques')
    const communication = await critere('Communication')
    await enTant(A, async () => {
      await noter(technique, 4)
      await noter(communication, 2)
      // Nouvelle note sur le même critère : remplace la précédente
      await noter(communication, 3)
    })
    await enTant(B, () => noter(technique, 5))
    const { rows } = await enTant(A, () => db.query('select * from public.moyennes_evaluations()'))
    expect(rows).toEqual([{ candidature_id: alice, moyenne: '4.0', evaluateurs: 2 }])
  })

  it('personne ne modifie ni n’efface les notes d’un autre', async () => {
    const technique = await critere('Compétences techniques')
    await enTant(A, () => noter(technique, 4))
    await enTant(B, async () => {
      await db.exec(`update public.evaluations set note = 1`)
      await db.exec(`delete from public.evaluations`)
      // Ni noter à la place d'un autre
      await db.exec(
        `insert into public.evaluations (candidature_id, critere_id, note, user_id)
         values ('${alice}', '${technique}', 1, '${A}')`,
      )
    })
    const { rows } = await db.query(
      `select user_id, note from public.evaluations order by note desc`,
    )
    // La note de A est intacte ; l'insertion de B a été enregistrée à son nom
    expect(rows).toEqual([
      { user_id: A, note: 4 },
      { user_id: B, note: 1 },
    ])
  })

  it('un critère d’un autre espace ou une note hors 1 à 5 sont refusés', async () => {
    const chezB = await critere('Motivation', B)
    await expect(enTant(A, () => noter(chezB, 3))).rejects.toThrow(
      /evaluations_critere_id_espace_id_fkey/,
    )
    const technique = await critere('Compétences techniques')
    await expect(enTant(A, () => noter(technique, 6))).rejects.toThrow(/evaluations_note_check/)
  })

  it('critères : réglés par le propriétaire seul, 10 au plus, suppression en cascade', async () => {
    await expect(
      enTant(B, () => db.exec(`insert into public.criteres (nom) values ('Pirate')`)),
    ).rejects.toThrow(/row-level security/)
    await enTant(A, async () => {
      for (let i = 1; i <= 7; i++)
        await db.exec(`insert into public.criteres (nom) values ('C${i}')`)
      await expect(db.exec(`insert into public.criteres (nom) values ('C8')`)).rejects.toThrow(
        /^trop_de_criteres/,
      )
    })
    const technique = await critere('Compétences techniques')
    await enTant(A, () => noter(technique, 4))
    await enTant(A, () => db.exec(`delete from public.criteres where id = '${technique}'`))
    const { rows } = await db.query('select count(*)::int as n from public.evaluations')
    expect(rows).toEqual([{ n: 0 }])
  })

  it('sans compte : rien', async () => {
    await db.exec('set role anon')
    try {
      await expect(db.query('select * from public.moyennes_evaluations()')).rejects.toThrow(
        /permission denied/,
      )
    } finally {
      await db.exec('reset role')
    }
  })
})
