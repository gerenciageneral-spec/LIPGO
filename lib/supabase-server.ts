import { createServerClient as createSupabaseServerClient } from "@supabase/ssr"
import type { SupabaseClient } from "@supabase/supabase-js"
import { cookies } from "next/headers"

// Tipo de esquema PERMISIVO (ver nota en supabase-client.ts): sin tipos generados
// de la BD el cliente resolvía cada tabla a `never`. Type-only, no afecta runtime.
type DBClient = SupabaseClient<any, any, any>

export function createServerClient(): DBClient {
  const cookieStore = cookies()

  return createSupabaseServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        async get(name: string) {
          const cookie = await cookieStore
          return cookie.get(name)?.value
        },
        async set(name: string, value: string, options: any) {
          try {
            const cookie = await cookieStore
            cookie.set({ name, value, ...options })
          } catch (error) {
            // Server component, ignore
          }
        },
        async remove(name: string, options: any) {
          try {
            const cookie = await cookieStore
            cookie.set({ name, value: "", ...options })
          } catch (error) {
            // Server component, ignore
          }
        },
      },
    },
  )
}

export { createServerClient as createClient }
