import { describe, expect, it } from 'vitest'
import { genererSecret, SECRET_VALIDE, sqlPlanification } from './planification.mjs'

const URL_PROJET = 'https://abcdef.supabase.co'
const SECRET = 'a'.repeat(32)

describe('sqlPlanification', () => {
  it('planifie un appel quotidien de la fonction, avec son secret', () => {
    const sql = sqlPlanification(`${URL_PROJET}/`, SECRET, 6)
    expect(sql).toContain("'0 6 * * *'")
    expect(sql).toContain("url := 'https://abcdef.supabase.co/functions/v1/rappels-entretiens'")
    expect(sql).toContain(`'x-rappels-secret', '${SECRET}'`)
    expect(sql).toContain("cron.schedule(\n  'rappels-entretiens'")
  })

  it('refuse ce qui casserait la requête', () => {
    expect(() => sqlPlanification(URL_PROJET, "court'")).toThrow('RAPPELS_SECRET invalide.')
    expect(() => sqlPlanification(URL_PROJET, `${SECRET}$$`)).toThrow('RAPPELS_SECRET invalide.')
    expect(() => sqlPlanification(URL_PROJET, SECRET, 24)).toThrow('Heure invalide')
    expect(() => sqlPlanification("https://x.co/'; drop", SECRET)).toThrow('Adresse')
    expect(() => sqlPlanification('', SECRET)).toThrow('Adresse')
  })

  it('génère un secret valide et différent à chaque fois', () => {
    const [a, b] = [genererSecret(), genererSecret()]
    expect(SECRET_VALIDE.test(a)).toBe(true)
    expect(a).not.toBe(b)
  })
})
