import { createClient as createSupabaseClient } from "@supabase/supabase-js"

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseKey =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

// Singleton pattern to prevent multiple GoTrueClient instances
let supabaseInstance: ReturnType<typeof createSupabaseClient> | null = null

export async function createClient() {
  if (!supabaseInstance) {
    supabaseInstance = createSupabaseClient(supabaseUrl, supabaseKey)
  }
  return supabaseInstance
}

export const supabase = (() => {
  if (!supabaseInstance) {
    supabaseInstance = createSupabaseClient(supabaseUrl, supabaseKey)
  }
  return supabaseInstance
})()
