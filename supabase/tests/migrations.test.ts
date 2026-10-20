// Applique les migrations sur un vrai Postgres (PGlite, en mémoire) et vérifie leurs règles.
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { PGlite } from '@electric-sql/pglite'
import { beforeAll, beforeEach, describe, expect, it } from 'vitest'

const DOSSIER = join(import.meta.dirname, '../migrations')
const A = '00000000-0000-0000-0000-00000000000a'
const B = '00000000-0000-0000-0000-00000000000b'

// Simulacre minimal de Supabase : rôles, schéma auth et auth.uid() lu dans un réglage de session
const SIMULACRE_SUPABASE = `
  create role anon;
  create role authenticated;
  create schema auth;
  create table auth.users (id uuid primary key, email text);
  create function auth.uid() returns uuid language sql stable as
    $$ select nullif(current_setting('test.uid', true), '')::uuid $$;
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
