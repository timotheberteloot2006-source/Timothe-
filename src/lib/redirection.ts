// N'accepte que les chemins internes, pour éviter les redirections vers un autre site
export function cheminInterne(valeur: unknown): string | undefined {
  if (typeof valeur !== 'string') return undefined
  if (!valeur.startsWith('/') || valeur.startsWith('//')) return undefined
  return valeur
}
