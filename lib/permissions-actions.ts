"use server"

import { getSupabaseAdmin } from "@/lib/supabase-admin"
import { getCurrentUser } from "@/lib/auth-actions"
import { getCurrentEmpresaId } from "@/lib/company-filter"
// La interfaz `UserPermissions` y el mapa `MODULE_PERMISSION_MAP` viven
// en `permissions-map.ts` (sin "use server"). Next.js prohibe exportar
// valores no async desde archivos con "use server", asi que el mapa no
// puede vivir aqui. Importamos desde el modulo compartido.
import { MODULE_PERMISSION_MAP, type UserPermissions } from "@/lib/permissions-map"

export async function getUserPermissions(userId?: string): Promise<UserPermissions | null> {
  try {
    const supabase = await getSupabaseAdmin()

    // Si no se proporciona userId, usar el usuario actual
    if (!userId) {
      const currentUser = await getCurrentUser()
      if (!currentUser) return null
      userId = currentUser.id
    }

    const { data, error } = await supabase.from("permisos_usuarios").select("*").eq("usuario_id", userId).single()

    if (error) {
      console.error("Error fetching user permissions:", error)
      return null
    }

    return data as UserPermissions
  } catch (error) {
    console.error("Error in getUserPermissions:", error)
    return null
  }
}

export async function checkModulePermission(moduleName: string): Promise<boolean> {
  try {
    console.log("[v0] checkModulePermission: Checking permission for module:", moduleName)

    const permissionKey = MODULE_PERMISSION_MAP[moduleName]
    if (!permissionKey) {
      console.log("[v0] checkModulePermission: Module not found in permission map:", moduleName, "- denying access")
      return false
    }

    const permissions = await getUserPermissions()
    if (!permissions) {
      console.log("[v0] checkModulePermission: No permissions found for user - denying access")
      return false
    }

    console.log("[v0] checkModulePermission: All permissions for user:", JSON.stringify(permissions, null, 2))
    console.log("[v0] checkModulePermission: Looking for key:", permissionKey)
    console.log("[v0] checkModulePermission: Value for key:", permissions[permissionKey])
    console.log("[v0] checkModulePermission: Value type:", typeof permissions[permissionKey])

    const hasPermission = permissions[permissionKey] === true
    console.log("[v0] checkModulePermission: Permission for", moduleName, "(", permissionKey, "):", hasPermission)
    return hasPermission
  } catch (error) {
    console.error("[v0] checkModulePermission: Error checking module permission:", error)
    return false
  }
}

export async function getAllUsersWithPermissions(selectedEmpresaId?: number | null) {
  try {
    const supabase = await getSupabaseAdmin()

    // Use selectedEmpresaId if provided, otherwise fall back to current user's empresa_id
    let empresaId = selectedEmpresaId
    if (!empresaId) {
      empresaId = await getCurrentEmpresaId()
    }

    if (!empresaId) {
      console.error("Error: No empresa_id found for current user")
      return { success: false, error: "No empresa found" }
    }

    const { data, error } = await supabase
      .from("profiles")
      .select(
        `
        id,
        usuario,
        empresa_id,
        permisos_usuarios!inner (*)
      `,
      )
      .eq("empresa_id", empresaId) // Filter by empresa_id
      .order("usuario", { ascending: true })

    if (error) {
      console.error("Error fetching users with permissions:", error)
      return { success: false, error: error.message }
    }

    console.log("[v0] Fetched users with permissions:", JSON.stringify(data, null, 2))

    return { success: true, data: data || [] }
  } catch (error) {
    console.error("Error in getAllUsersWithPermissions:", error)
    return { success: false, error: String(error) }
  }
}

export async function updateUserPermissions(userId: string, permissions: Partial<UserPermissions>) {
  try {
    const supabase = await getSupabaseAdmin()

    // Verificar si ya existen permisos para este usuario
    const { data: existing } = await supabase.from("permisos_usuarios").select("id").eq("usuario_id", userId).single()

    if (existing) {
      // Actualizar permisos existentes
      const { error } = await supabase.from("permisos_usuarios").update(permissions).eq("usuario_id", userId)

      if (error) {
        console.error("Error updating user permissions:", error)
        return { success: false, error: error.message }
      }
    } else {
      // Crear nuevos permisos
      const { error } = await supabase.from("permisos_usuarios").insert({
        usuario_id: userId,
        ...permissions,
      })

      if (error) {
        console.error("Error creating user permissions:", error)
        return { success: false, error: error.message }
      }
    }

    return { success: true }
  } catch (error) {
    console.error("Error in updateUserPermissions:", error)
    return { success: false, error: String(error) }
  }
}
