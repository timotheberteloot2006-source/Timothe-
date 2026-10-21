import { SUPABASE_NON_CONFIGURE, supabase } from './supabase'

// Appelle une fonction Supabase (supabase/functions/<nom>) ; en cas d'échec, lève une erreur dont
// le message est celui renvoyé par la fonction ({ erreur }), lisible par l'utilisateur
export async function appelerFonction<T>(
  nom: string,
  body?: FormData | Record<string, unknown>,
): Promise<T | null> {
  if (!supabase) throw new Error(SUPABASE_NON_CONFIGURE)
  const { data, error } = await (await supabase.fonctions()).invoke<T>(nom, { body })
  if (error) {
    // FunctionsHttpError : la réponse HTTP est dans error.context ; testé sans importer la
    // classe, chargée à la demande
    const reponse = error.name === 'FunctionsHttpError' ? (error.context as Response) : null
    const corps = reponse ? await reponse.json().catch(() => null) : null
    throw new Error(corps?.erreur ?? error.message)
  }
  return data
}
