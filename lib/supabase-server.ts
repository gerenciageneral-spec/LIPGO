import { createServerClient as createSupabaseServerClient } from "@supabase/ssr"
import { cookies } from "next/headers"

export function createServerClient() {
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
