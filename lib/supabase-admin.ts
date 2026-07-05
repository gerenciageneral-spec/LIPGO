"use server"

import { createClient, type SupabaseClient } from "@supabase/supabase-js"

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseServiceKey =
  process.env.SUPABASE_SERVICE_ROLE_KEY!

// Tipo de esquema PERMISIVO: este proyecto no versiona tipos generados de la BD,
// así que sin un `Database` el cliente resolvía cada tabla a `never` y rompía
// `.from()/.insert()/.select()` en todo el repo. Tipar el cliente como
// SupabaseClient<any,any,any> en el helper (una sola vez) restablece el uso sin
// afectar runtime. Si algún día se generan tipos reales, se sustituye `any`.
type DBClient = SupabaseClient<any, any, any>

// Create a singleton admin client with service_role key to bypass RLS
let adminClient: DBClient | null = null

export async function getSupabaseAdmin(): Promise<DBClient> {
  if (!adminClient) {
    adminClient = createClient(supabaseUrl, supabaseServiceKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    })
  }
  return adminClient
}
