import { createClient } from "@/lib/supabase-client"
import { getCurrentEmpresaId } from "@/lib/user-context"

export interface UserProfile {
  id: string
  usuario: string
}

export interface Empresa {
  id: number
  nombre: string
}

export interface Owner {
  id: number
  nombre: string
}

export interface UserAccess {
  usuario: string
  profile_id: string
  empresas: number[]
}

export async function getAllUsers(selectedEmpresaId?: number | null): Promise<UserProfile[]> {
  try {
    const supabase = await createClient()
    // Usa la empresa seleccionada en el selector superior; si no hay,
    // cae a la empresa del perfil del usuario actual.
    const empresaId = selectedEmpresaId ?? (await getCurrentEmpresaId())

    console.log("[v0] Fetching users from profiles table for empresa:", empresaId)

    const { data, error } = await supabase
      .from("profiles")
      .select("id, usuario")
      .eq("empresa_id", empresaId)
      .order("usuario", { ascending: true })

    if (error) {
      console.error("[v0] Error fetching users:", error)
      return []
    }

    console.log("[v0] Fetched", data?.length || 0, "users for empresa", empresaId)
    return data || []
  } catch (error) {
    console.error("[v0] Error in getAllUsers:", error)
    return []
  }
}

export async function getAllEmpresas(): Promise<Empresa[]> {
  try {
    const supabase = await createClient()

    console.log("[v0] Fetching all empresas from empresas_permisos table")

    const { data, error } = await supabase
      .from("empresas_permisos")
      .select("id, nombre")
      .order("nombre", { ascending: true })

    if (error) {
      console.error("[v0] Error fetching empresas:", error)
      return []
    }

    console.log("[v0] Fetched", data?.length || 0, "empresas from empresas_permisos")
    return data || []
  } catch (error) {
    console.error("[v0] Error in getAllEmpresas:", error)
    return []
  }
}

export async function getUserAccess(profileId: string): Promise<number[]> {
  try {
    const supabase = await createClient()

    console.log("[v0] Fetching user access for profile:", profileId)

    const { data, error } = await supabase
      .from("perfil_acceso_empresas")
      .select("empresa_id")
      .eq("profile_id", profileId)

    if (error) {
      console.error("[v0] Error fetching user access:", error)
      return []
    }

    const empresaIds = data?.map((item: any) => item.empresa_id) || []
    console.log("[v0] User access empresas:", empresaIds)
    return empresaIds
  } catch (error) {
    console.error("[v0] Error in getUserAccess:", error)
    return []
  }
}

export async function grantUserAccess(profileId: string, empresaId: number): Promise<{ success: boolean; error?: string }> {
  try {
    const supabase = await createClient()

    console.log("[v0] Granting access to profile", profileId, "for empresa", empresaId)

    // Check if access already exists
    const { data: existingAccess, error: checkError } = await supabase
      .from("perfil_acceso_empresas")
      .select("id")
      .eq("profile_id", profileId)
      .eq("empresa_id", empresaId)
      .maybeSingle()

    if (checkError) {
      console.error("[v0] Error checking existing access:", checkError)
      return { success: false, error: checkError.message }
    }

    if (existingAccess) {
      console.log("[v0] Access already exists")
      return { success: true }
    }

    // Create new access record
    const { error: insertError } = await supabase.from("perfil_acceso_empresas").insert([
      {
        profile_id: profileId,
        empresa_id: empresaId,
      },
    ])

    if (insertError) {
      console.error("[v0] Error granting access:", insertError)
      return { success: false, error: insertError.message }
    }

    console.log("[v0] Access granted successfully")
    return { success: true }
  } catch (error) {
    console.error("[v0] Error in grantUserAccess:", error)
    return { success: false, error: "Error granting access" }
  }
}

export async function revokeUserAccess(profileId: string, empresaId: number): Promise<{ success: boolean; error?: string }> {
  try {
    const supabase = await createClient()

    console.log("[v0] Revoking access from profile", profileId, "for empresa", empresaId)

    const { error } = await supabase
      .from("perfil_acceso_empresas")
      .delete()
      .eq("profile_id", profileId)
      .eq("empresa_id", empresaId)

    if (error) {
      console.error("[v0] Error revoking access:", error)
      return { success: false, error: error.message }
    }

    console.log("[v0] Access revoked successfully")
    return { success: true }
  } catch (error) {
    console.error("[v0] Error in revokeUserAccess:", error)
    return { success: false, error: "Error revoking access" }
  }
}

// ==================== OWNERS FUNCTIONS ====================

export async function getAllOwners(): Promise<Owner[]> {
  try {
    const supabase = await createClient()

    console.log("[v0] Fetching all owners from owners table")

    const { data, error } = await supabase
      .from("owners")
      .select("id, nombre")
      .order("nombre", { ascending: true })

    if (error) {
      console.error("[v0] Error fetching owners:", error)
      return []
    }

    console.log("[v0] Fetched", data?.length || 0, "owners from owners table")
    return data || []
  } catch (error) {
    console.error("[v0] Error in getAllOwners:", error)
    return []
  }
}

export async function getUserOwnerAccess(profileId: string): Promise<string[]> {
  try {
    const supabase = await createClient()

    console.log("[v0] Fetching user owner access for profile:", profileId)

    const { data, error } = await supabase
      .from("perfil_acceso_owners")
      .select("owner")
      .eq("profile_id", profileId)

    if (error) {
      console.error("[v0] Error fetching user owner access:", error)
      return []
    }

    const ownerNames = data?.map((item: any) => item.owner) || []
    console.log("[v0] User access owners:", ownerNames)
    return ownerNames
  } catch (error) {
    console.error("[v0] Error in getUserOwnerAccess:", error)
    return []
  }
}

export async function grantUserOwnerAccess(profileId: string, ownerName: string): Promise<{ success: boolean; error?: string }> {
  try {
    const supabase = await createClient()

    console.log("[v0] Granting owner access to profile", profileId, "for owner", ownerName)

    // Check if access already exists
    const { data: existingAccess, error: checkError } = await supabase
      .from("perfil_acceso_owners")
      .select("id")
      .eq("profile_id", profileId)
      .eq("owner", ownerName)
      .maybeSingle()

    if (checkError) {
      console.error("[v0] Error checking existing owner access:", checkError)
      return { success: false, error: checkError.message }
    }

    if (existingAccess) {
      console.log("[v0] Owner access already exists")
      return { success: true }
    }

    // Create new access record
    const { error: insertError } = await supabase.from("perfil_acceso_owners").insert([
      {
        profile_id: profileId,
        owner: ownerName,
      },
    ])

    if (insertError) {
      console.error("[v0] Error granting owner access:", insertError)
      return { success: false, error: insertError.message }
    }

    console.log("[v0] Owner access granted successfully")
    return { success: true }
  } catch (error) {
    console.error("[v0] Error in grantUserOwnerAccess:", error)
    return { success: false, error: "Error granting owner access" }
  }
}

export async function revokeUserOwnerAccess(profileId: string, ownerName: string): Promise<{ success: boolean; error?: string }> {
  try {
    const supabase = await createClient()

    console.log("[v0] Revoking owner access from profile", profileId, "for owner", ownerName)

    const { error } = await supabase
      .from("perfil_acceso_owners")
      .delete()
      .eq("profile_id", profileId)
      .eq("owner", ownerName)

    if (error) {
      console.error("[v0] Error revoking owner access:", error)
      return { success: false, error: error.message }
    }

    console.log("[v0] Owner access revoked successfully")
    return { success: true }
  } catch (error) {
    console.error("[v0] Error in revokeUserOwnerAccess:", error)
    return { success: false, error: "Error revoking owner access" }
  }
}
