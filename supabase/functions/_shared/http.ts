// Outils communs aux fonctions : réponses JSON, client administrateur, utilisateur connecté
import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2.118.0'

export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

export function json(corps: unknown, status = 200) {
  return new Response(JSON.stringify(corps), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

// Client avec la clé service_role : seul habilité à écrire dans la table abonnements
export function supabaseAdmin(): SupabaseClient {
  return createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
  )
}

// Utilisateur à l'origine de la requête, d'après son jeton de session
export async function utilisateur(req: Request) {
  const jeton = req.headers.get('Authorization')?.replace('Bearer ', '')
  if (!jeton) return null
  const { data } = await supabaseAdmin().auth.getUser(jeton)
  return data.user
}
