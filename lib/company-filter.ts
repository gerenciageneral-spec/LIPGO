import { createServerClient } from "@supabase/ssr"
import { cookies } from "next/headers"
import { createClient } from "@supabase/supabase-js"
import { EMPRESA_ID_FIELDS, EXCLUDED_TABLES } from "@/lib/company-constants"

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SUPABASE_ANON_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
const SUPABASE_SERVICE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY!

// Cliente admin para bypasear RLS
const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)

const empresaIdCache = new Map<string, { empresaId: number | null; timestamp: number }>()
const userProfileCache = new Map<string, { usuario: string | null; empresaId: number | null; timestamp: number }>()
const CACHE_DURATION = 60000 // 1 minute

/**
 * Obtiene el empresa_id del usuario autenticado
 * @returns El ID de la empresa o null si no hay usuario autenticado
 */
export async function getCurrentEmpresaId(): Promise<number | null> {
  try {
    const cookieStore = await cookies()
    const supabase = createServerClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: (cookiesToSet) => {
          cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options))
        },
      },
    })

    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return null
    }

    const cached = empresaIdCache.get(user.id)
    if (cached && Date.now() - cached.timestamp < CACHE_DURATION) {
      return cached.empresaId
    }

    // Buscar el perfil del usuario usando el admin client para bypasear RLS
    const { data: profile, error } = await supabaseAdmin
      .from("profiles")
      .select("empresa_id")
      .eq("id", user.id)
      .single()

    if (error || !profile) {
      console.error("[v0] getCurrentEmpresaId: Error fetching profile:", error)
      return null
    }

    empresaIdCache.set(user.id, {
      empresaId: profile.empresa_id,
      timestamp: Date.now(),
    })

    return profile.empresa_id
  } catch (error) {
    console.error("[v0] getCurrentEmpresaId: Error:", error)
    return null
  }
}

/**
 * Verifica si una tabla debe ser filtrada por empresa_id
 * @param tableName El nombre de la tabla
 * @returns true si la tabla debe ser filtrada, false si está excluida
 */
export async function shouldFilterByEmpresa(tableName: string): Promise<boolean> {
  return !EXCLUDED_TABLES.includes(tableName.toLowerCase())
}

/**
 * Obtiene el nombre del campo de empresa_id para una tabla específica
 * @param tableName El nombre de la tabla
 * @returns El nombre del campo de empresa_id o "idempresa" por defecto
 */
export async function getEmpresaIdFieldName(tableName: string): Promise<string> {
  return EMPRESA_ID_FIELDS[tableName] || "idempresa"
}

/**
 * Obtiene el nombre de usuario del usuario autenticado
 * @returns El nombre del usuario o "admin" por defecto
 */
export async function getCurrentUsuario(): Promise<string> {
  try {
    const cookieStore = await cookies()
    const supabase = createServerClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: (cookiesToSet) => {
          cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options))
        },
      },
    })

    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return "admin"
    }

    const cached = userProfileCache.get(user.id)
    if (cached && Date.now() - cached.timestamp < CACHE_DURATION) {
      return cached.usuario || "admin"
    }

    const { data: profile, error } = await supabaseAdmin
      .from("profiles")
      .select("usuario, empresa_id")
      .eq("id", user.id)
      .single()

    if (error || !profile) {
      console.error("[v0] getCurrentUsuario: Error fetching profile:", error)
      return "admin"
    }

    userProfileCache.set(user.id, {
      usuario: profile.usuario,
      empresaId: profile.empresa_id,
      timestamp: Date.now(),
    })

    empresaIdCache.set(user.id, {
      empresaId: profile.empresa_id,
      timestamp: Date.now(),
    })

    return profile.usuario || "admin"
  } catch (error) {
    console.error("[v0] getCurrentUsuario: Error:", error)
    return "admin"
  }
}

/**
 * Obtiene tanto el empresa_id como el usuario en una sola llamada (más eficiente)
 * @returns Objeto con empresaId y usuario
 */
export async function getCurrentUserContext(): Promise<{ empresaId: number | null; usuario: string }> {
  try {
    const cookieStore = await cookies()
    const supabase = createServerClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: (cookiesToSet) => {
          cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options))
        },
      },
    })

    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return { empresaId: null, usuario: "admin" }
    }

    const cached = userProfileCache.get(user.id)
    if (cached && Date.now() - cached.timestamp < CACHE_DURATION) {
      return { empresaId: cached.empresaId, usuario: cached.usuario || "admin" }
    }

    const { data: profile, error } = await supabaseAdmin
      .from("profiles")
      .select("usuario, empresa_id")
      .eq("id", user.id)
      .single()

    if (error || !profile) {
      console.error("[v0] getCurrentUserContext: Error fetching profile:", error)
      return { empresaId: null, usuario: "admin" }
    }

    userProfileCache.set(user.id, {
      usuario: profile.usuario,
      empresaId: profile.empresa_id,
      timestamp: Date.now(),
    })

    empresaIdCache.set(user.id, {
      empresaId: profile.empresa_id,
      timestamp: Date.now(),
    })

    return { empresaId: profile.empresa_id, usuario: profile.usuario || "admin" }
  } catch (error) {
    console.error("[v0] getCurrentUserContext: Error:", error)
    return { empresaId: null, usuario: "admin" }
  }
}

/**
 * Alias de getCurrentUsuario para consistencia en nombres
 */
export async function getCurrentUsuarioForInsert(): Promise<string> {
  return getCurrentUsuario()
}

/**
 * Alias de getCurrentEmpresaId para consistencia en nombres
 * Retorna el ID de empresa con fallback a 1 si es null
 */
export async function getCurrentEmpresaIdForInsert(): Promise<number> {
  const empresaId = await getCurrentEmpresaId()
  return empresaId || 1
}
