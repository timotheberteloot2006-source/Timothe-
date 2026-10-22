import type { Candidature } from './candidatures'
import type { Etape } from './etapes'
import type { Etiquette } from './etiquettes'
import type { Offre } from './offres'
import { SUPABASE_NON_CONFIGURE, supabase } from './supabase'

// Indicateurs de recrutement de la page Statistiques, sur les candidatures reçues pendant une
// période

export const PERIODES = {
  '30j': '30 derniers jours',
  '90j': '90 derniers jours',
  '12m': '12 derniers mois',
  tout: 'Depuis le début',
} as const

export type Periode = keyof typeof PERIODES

// « tout » est la période par défaut : inutile de la garder dans l'adresse
export function lirePeriode(search: Record<string, unknown>): { periode?: Periode } {
  return typeof search.periode === 'string' &&
    Object.hasOwn(PERIODES, search.periode) &&
    search.periode !== 'tout'
    ? { periode: search.periode as Periode }
    : {}
}

// Début de la période, ou null pour « depuis le début »
export function debutPeriode(periode: Periode, maintenant = new Date()): Date | null {
  const debut = new Date(maintenant)
  if (periode === '30j') debut.setDate(debut.getDate() - 30)
  else if (periode === '90j') debut.setDate(debut.getDate() - 90)
  else if (periode === '12m') debut.setFullYear(debut.getFullYear() - 1)
  else return null
  return debut
}

// L'API renvoie au plus 1000 lignes par requête : on lit par tranches
const TRANCHE = 1000

// Date du premier passage de chaque candidature à l'étape « Retenu », d'après l'historique
// (supabase/migrations/0010_historique.sql), dans l'espace actif
export async function listerDatesRetenues(): Promise<Map<string, string>> {
  if (!supabase) throw new Error(SUPABASE_NON_CONFIGURE)
  const dates = new Map<string, string>()
  for (let debut = 0; ; debut += TRANCHE) {
    const { data, error } = await supabase
      .from('historique')
      .select('candidature_id, created_at')
      .eq('action', 'statut')
      .eq('details->>apres', 'retenu')
      .order('created_at')
      .order('id')
      .range(debut, debut + TRANCHE - 1)
    if (error) throw new Error(error.message)
    for (const { candidature_id, created_at } of data as {
      candidature_id: string
      created_at: string
    }[])
      if (!dates.has(candidature_id)) dates.set(candidature_id, created_at)
    if (data.length < TRANCHE) return dates
  }
}

// Mois affichés au plus dans « Par mois » (les plus récents)
export const NOMBRE_MAX_MOIS = 24

const JOUR = 24 * 3600 * 1000

export interface Indicateurs {
  total: number
  // Déposées par le formulaire en ligne
  enLigne: number
  // À l'étape « Retenu » ou « Écarté » aujourd'hui
  retenues: number
  ecartees: number
  // Médiane, en jours, entre la réception et le premier passage à « Retenu » (candidatures
  // retenues aujourd'hui) ; null si aucune
  delaiMedian: number | null
  nombreDelais: number
  parEtape: { etape: Etape; nombre: number }[]
  // Clé « 2026-03 », du plus ancien au plus récent, mois vides compris
  parMois: { mois: string; nombre: number }[]
  // Les plus fournies d'abord ; offre null : candidatures sans offre
  parOffre: { offre: Offre | null; recues: number; retenues: number }[]
  parEtiquette: { etiquette: Etiquette; nombre: number }[]
}

interface Donnees {
  candidatures: Candidature[]
  etapes: Etape[]
  offres: Offre[]
  etiquettes: Etiquette[]
  // Identifiants des étiquettes posées, par candidature
  attributions: ReadonlyMap<string, readonly string[]>
  datesRetenues: ReadonlyMap<string, string>
}

const cleMois = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`

export function calculerIndicateurs(
  donnees: Donnees,
  periode: Periode = 'tout',
  maintenant = new Date(),
): Indicateurs {
  const debut = debutPeriode(periode, maintenant)
  const candidatures = donnees.candidatures.filter((c) => !debut || new Date(c.created_at) >= debut)
  const compter = (garder: (c: Candidature) => boolean) => candidatures.filter(garder).length

  // Délais des candidatures retenues aujourd'hui
  const delais = candidatures
    .filter((c) => c.statut === 'retenu' && donnees.datesRetenues.has(c.id))
    .map(
      (c) =>
        (new Date(donnees.datesRetenues.get(c.id)!).getTime() - new Date(c.created_at).getTime()) /
        JOUR,
    )
    .filter((d) => d >= 0)
    .sort((a, b) => a - b)
  const milieu = Math.floor(delais.length / 2)
  const delaiMedian =
    delais.length === 0
      ? null
      : delais.length % 2
        ? delais[milieu]
        : (delais[milieu - 1] + delais[milieu]) / 2

  // Mois de la période (ou depuis la première candidature), jusqu'au mois en cours
  const parMoisCompte = new Map<string, number>()
  for (const c of candidatures) {
    const cle = cleMois(new Date(c.created_at))
    parMoisCompte.set(cle, (parMoisCompte.get(cle) ?? 0) + 1)
  }
  const premiere = candidatures.reduce<Date | null>((min, c) => {
    const date = new Date(c.created_at)
    return !min || date < min ? date : min
  }, null)
  const parMois: Indicateurs['parMois'] = []
  const origine = debut ?? premiere
  if (origine) {
    const mois = new Date(origine.getFullYear(), origine.getMonth(), 1)
    const fin = new Date(maintenant.getFullYear(), maintenant.getMonth(), 1)
    for (; mois <= fin; mois.setMonth(mois.getMonth() + 1)) {
      const cle = cleMois(mois)
      parMois.push({ mois: cle, nombre: parMoisCompte.get(cle) ?? 0 })
    }
  }

  const offres = new Map(donnees.offres.map((o) => [o.id, o]))
  const parOffre = new Map<string | null, { recues: number; retenues: number }>()
  for (const c of candidatures) {
    // Offre supprimée entre-temps : comptée avec les candidatures sans offre
    const cle = c.offre_id && offres.has(c.offre_id) ? c.offre_id : null
    const ligne = parOffre.get(cle) ?? { recues: 0, retenues: 0 }
    ligne.recues++
    if (c.statut === 'retenu') ligne.retenues++
    parOffre.set(cle, ligne)
  }

  const comparerNoms = new Intl.Collator('fr', { sensitivity: 'base' }).compare
  return {
    total: candidatures.length,
    enLigne: compter((c) => c.source === 'formulaire'),
    retenues: compter((c) => c.statut === 'retenu'),
    ecartees: compter((c) => c.statut === 'ecarte'),
    delaiMedian,
    nombreDelais: delais.length,
    parEtape: donnees.etapes.map((etape) => ({
      etape,
      nombre: compter((c) => c.statut === etape.cle),
    })),
    parMois: parMois.slice(-NOMBRE_MAX_MOIS),
    parOffre: [...parOffre]
      .map(([id, ligne]) => ({ offre: id ? offres.get(id)! : null, ...ligne }))
      .sort(
        (a, b) =>
          b.recues - a.recues ||
          // Sans offre en dernier à égalité
          Number(a.offre === null) - Number(b.offre === null) ||
          comparerNoms(a.offre?.titre ?? '', b.offre?.titre ?? ''),
      ),
    parEtiquette: donnees.etiquettes
      .map((etiquette) => ({
        etiquette,
        nombre: compter((c) => !!donnees.attributions.get(c.id)?.includes(etiquette.id)),
      }))
      .sort((a, b) => b.nombre - a.nombre || comparerNoms(a.etiquette.nom, b.etiquette.nom)),
  }
}

// « 42 % » ; « — » sans base
export function pourcentage(nombre: number, total: number) {
  return total === 0 ? '—' : `${Math.round((nombre / total) * 100)} %`
}

// « moins d'un jour », « 1 jour », « 12 jours »
export function formaterDelai(jours: number) {
  if (jours < 1) return 'moins d’un jour'
  const arrondi = Math.round(jours)
  return `${arrondi} jour${arrondi > 1 ? 's' : ''}`
}

// « 2026-03 » → « mars 2026 », ou « mars 26 » en court
export function libelleMois(mois: string, court = false) {
  const [annee, numero] = mois.split('-').map(Number)
  return new Date(annee, numero - 1, 1).toLocaleDateString('fr-FR', {
    month: court ? 'short' : 'long',
    year: court ? '2-digit' : 'numeric',
  })
}
