import { createClient, type SupabaseClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_PUBLIC_SUPABASE_URL as string | undefined
const key = import.meta.env.VITE_PUBLIC_SUPABASE_PUBLISHABLE_KEY as string | undefined

/**
 * Null when the env vars are missing. The app then runs without login,
 * which keeps local development and the mock API usable without Supabase.
 */
export const supabase: SupabaseClient | null = url && key ? createClient(url, key) : null

export const authEnabled = supabase !== null
