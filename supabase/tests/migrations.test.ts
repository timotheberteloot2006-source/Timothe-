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
})

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
    ).rejects.toThrow(/candidatures_user_email_unique/)
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

  it('empêche d’ajouter une candidature au nom d’un autre', async () => {
    await expect(
      db.exec(`insert into public.candidatures (user_id, nom) values ('${B}', 'Intrus')`),
    ).rejects.toThrow(/row-level security/)
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

  it('refuse deux offres de même titre pour un utilisateur', async () => {
    await creerOffre(A, 'Data analyst')
    await expect(creerOffre(A, 'DATA ANALYST')).rejects.toThrow(/offres_user_titre_unique/)
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
      db.exec(`insert into public.offres (user_id, titre) values ('${B}', 'Intrus')`),
    ).rejects.toThrow(/row-level security/)
  })
})
