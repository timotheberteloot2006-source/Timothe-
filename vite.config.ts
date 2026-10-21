/// <reference types="vitest/config" />
import { readFileSync } from 'fs'
import path from 'path'
import tailwindcss from '@tailwindcss/vite'
import { tanstackRouter } from '@tanstack/router-plugin/vite'
import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv } from 'vite'

// En-têtes de sécurité de l'hébergement (vercel.json, repris dans netlify.toml), appliqués aussi
// par `vite preview` pour que les tests de bout en bout tournent sous la même politique.
// L'adresse Supabase du build est ajoutée à connect-src (faux Supabase des tests, domaine
// personnalisé…).
function entetesSecurite(urlSupabase: string | undefined): Record<string, string> {
  const vercel = JSON.parse(readFileSync('vercel.json', 'utf8')) as {
    headers: { headers: { key: string; value: string }[] }[]
  }
  const entetes = Object.fromEntries(vercel.headers[0].headers.map((e) => [e.key, e.value]))
  if (urlSupabase) {
    entetes['Content-Security-Policy'] = entetes['Content-Security-Policy'].replace(
      'connect-src ',
      `connect-src ${new URL(urlSupabase).origin} `,
    )
  }
  return entetes
}

// https://vite.dev/config/
export default defineConfig(({ mode }) => ({
  plugins: [
    // TanStack Router doit passer avant le plugin React
    tanstackRouter({ target: 'react', autoCodeSplitting: true }),
    react(),
    tailwindcss(),
  ],
  resolve: { alias: { '@': path.resolve(import.meta.dirname, './src') } },
  preview: {
    headers: entetesSecurite(
      process.env.VITE_SUPABASE_URL ?? loadEnv(mode, process.cwd(), 'VITE_').VITE_SUPABASE_URL,
    ),
  },
  test: {
    // Même fuseau sur toutes les machines (dates affichées en heure de Paris)
    env: { TZ: 'Europe/Paris' },
  },
}))
