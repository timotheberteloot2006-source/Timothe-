// Client Supabase allégé : les mêmes briques officielles que createClient (@supabase/supabase-js),
// sans le temps réel (realtime-js, phoenix) que le site n'utilise pas. Il se comporte comme
// createClient : même clé de stockage de session (les sessions existantes restent valides), même
// en-têtes, mêmes réglages d'authentification par défaut. Le stockage (CV) et les fonctions
// (paiement) ne sont téléchargés qu'à leur première utilisation.
import { AuthClient } from '@supabase/auth-js'
import { PostgrestClient } from '@supabase/postgrest-js'
import type { FunctionsClient } from '@supabase/functions-js'
import type { StorageClient } from '@supabase/storage-js'

export function creerClientSupabase(url: string, cle: string) {
  const base = new URL(url.trim().endsWith('/') ? url.trim() : `${url.trim()}/`)

  const auth = new AuthClient({
    url: new URL('auth/v1', base).href,
    headers: { Authorization: `Bearer ${cle}`, apikey: cle },
    storageKey: `sb-${base.hostname.split('.')[0]}-auth-token`,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: true,
    flowType: 'implicit',
  })

  // Ajoute la clé et le jeton de session de l'utilisateur à chaque requête vers la base, le
  // stockage et les fonctions (sans session : la clé publique, sauf pour les nouvelles clés
  // « sb_publishable_ » vers les fonctions, comme dans supabase-js)
  function fetchAvecSession(clePourJeton: boolean): typeof fetch {
    return async (entree, options) => {
      const { data } = await auth.getSession()
      const entetes = new Headers(options?.headers)
      if (!entetes.has('apikey')) entetes.set('apikey', cle)
      if (!entetes.has('Authorization')) {
        const jeton = data.session?.access_token ?? (clePourJeton ? cle : null)
        if (jeton) entetes.set('Authorization', `Bearer ${jeton}`)
      }
      return fetch(entree, { ...options, headers: entetes })
    }
  }

  const nouvelleCle = cle.startsWith('sb_publishable_') || cle.startsWith('sb_secret_')
  const rest = new PostgrestClient(new URL('rest/v1', base).href, {
    schema: 'public',
    fetch: fetchAvecSession(true),
  })

  let stockage: Promise<StorageClient> | undefined
  let fonctions: Promise<FunctionsClient> | undefined

  return {
    auth,
    from: rest.from.bind(rest),
    rpc: rest.rpc.bind(rest),
    // Chargés à la demande (import dynamique, morceau séparé)
    stockage: () =>
      (stockage ??= import('@supabase/storage-js').then(
        ({ StorageClient }) =>
          new StorageClient(new URL('storage/v1', base).href, {}, fetchAvecSession(true)),
      )),
    fonctions: () =>
      (fonctions ??= import('@supabase/functions-js').then(
        ({ FunctionsClient }) =>
          new FunctionsClient(new URL('functions/v1', base).href, {
            customFetch: fetchAvecSession(!nouvelleCle),
          }),
      )),
  }
}

export type ClientSupabase = ReturnType<typeof creerClientSupabase>
