import { creerClientSupabase } from './clientSupabase'

const url = import.meta.env.VITE_SUPABASE_URL
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

// null tant que les variables d'environnement ne sont pas renseignées (voir .env.example)
export const supabase = url && anonKey ? creerClientSupabase(url, anonKey) : null

export const SUPABASE_NON_CONFIGURE =
  "L'authentification n'est pas configurée : renseignez VITE_SUPABASE_URL et VITE_SUPABASE_ANON_KEY dans .env."
