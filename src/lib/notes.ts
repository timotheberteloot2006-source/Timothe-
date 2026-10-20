import { SUPABASE_NON_CONFIGURE, supabase } from './supabase'

// Table créée par supabase/migrations/0005_notes_et_cv.sql
export interface Note {
  id: string
  contenu: string
  created_at: string
}

function table() {
  if (!supabase) throw new Error(SUPABASE_NON_CONFIGURE)
  return supabase.from('notes')
}

export async function listerNotes(candidatureId: string): Promise<Note[]> {
  const { data, error } = await table()
    .select('id, contenu, created_at')
    .eq('candidature_id', candidatureId)
    .order('created_at', { ascending: false })
  if (error) throw new Error(error.message)
  return data
}

export async function ajouterNote(candidatureId: string, contenu: string) {
  const { error } = await table().insert({ candidature_id: candidatureId, contenu })
  if (error) throw new Error(error.message)
}

export async function supprimerNote(id: string) {
  const { error } = await table().delete().eq('id', id)
  if (error) throw new Error(error.message)
}
