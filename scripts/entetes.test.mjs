import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

// vercel.json et netlify.toml doivent déclarer les mêmes en-têtes de sécurité
function entetesVercel() {
  const vercel = JSON.parse(readFileSync('vercel.json', 'utf8'))
  return Object.fromEntries(vercel.headers[0].headers.map((e) => [e.key, e.value]))
}

function entetesNetlify() {
  const toml = readFileSync('netlify.toml', 'utf8')
  const bloc = toml.slice(toml.indexOf('[headers.values]'))
  return Object.fromEntries(
    [...bloc.matchAll(/^\s+([A-Za-z-]+) = "(.*)"$/gm)].map((m) => [m[1], m[2]]),
  )
}

describe('en-têtes de sécurité', () => {
  it('identiques sur Vercel et Netlify', () => {
    expect(entetesNetlify()).toEqual(entetesVercel())
  })

  it('politique de contenu stricte, Supabase autorisé', () => {
    const csp = entetesVercel()['Content-Security-Policy']
    expect(csp).toContain("script-src 'self';")
    expect(csp).toContain("frame-ancestors 'none'")
    expect(csp).toMatch(/connect-src [^;]*https:\/\/\*\.supabase\.co/)
    expect(csp).not.toContain('unsafe-inline')
  })
})
