// Tâches planifiées (rappels d'entretien, durée de conservation) : appelées par la base avec
// l'en-tête x-rappels-secret, comparé au secret RAPPELS_SECRET des fonctions
import { json } from './http.ts'

// Renvoie la réponse de refus, ou null si l'appel porte le bon secret
export function refuserSansSecret(req: Request): Response | null {
  const secret = Deno.env.get('RAPPELS_SECRET') ?? ''
  // Valeur d'exemple (« ... ») ou trop courte : facile à deviner, la fonction reste fermée
  if (secret.length < 24) return json({ erreur: 'RAPPELS_SECRET non configuré.' }, 500)
  if (!egaux(req.headers.get('x-rappels-secret') ?? '', secret))
    return json({ erreur: 'Accès refusé.' }, 401)
  return null
}

// Comparaison en temps constant : la durée ne renseigne pas sur la longueur du préfixe juste
function egaux(a: string, b: string) {
  const [x, y] = [new TextEncoder().encode(a), new TextEncoder().encode(b)]
  let difference = x.length ^ y.length
  for (let i = 0; i < Math.max(x.length, y.length); i++) difference |= (x[i] ?? 0) ^ (y[i] ?? 0)
  return difference === 0
}
