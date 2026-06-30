import { NextResponse } from "next/server"
import { createServerClient } from "@supabase/ssr"
import { createClient as createSupabaseClient } from "@supabase/supabase-js"
import { cookies } from "next/headers"

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SUPABASE_ANON_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
const SUPABASE_SERVICE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY!

const supabaseAdmin = createSupabaseClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)

export async function GET() {
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

    // Get current user
    const { data: { user }, error: userError } = await supabase.auth.getUser()
    if (userError || !user) {
      return NextResponse.json({ success: false, data: [], error: "No autenticado" }, { status: 401 })
    }

    // Get accessible empresa IDs from perfil_acceso_empresas
    const { data: accessData, error: accessError } = await supabaseAdmin
      .from("perfil_acceso_empresas")
      .select("empresa_id")
      .eq("profile_id", user.id)

    if (accessError) {
      console.error("[v0] Error fetching accessible empresas:", accessError)
      return NextResponse.json({ success: false, data: [], error: accessError.message }, { status: 500 })
    }

    if (!accessData || accessData.length === 0) {
      // If no specific access, return the user's default empresa from profiles
      const { data: profileData, error: profileError } = await supabaseAdmin
        .from("profiles")
        .select("idempresa")
        .eq("id", user.id)
        .single()

      if (profileError || !profileData?.idempresa) {
        return NextResponse.json({ success: false, data: [], error: "No se encontró empresa" }, { status: 404 })
      }

      const { data: defaultEmpresa, error: defaultError } = await supabaseAdmin
        .from("empresas")
        .select("id, nombre")
        .eq("id", profileData.idempresa)
        .single()

      if (defaultError || !defaultEmpresa) {
        return NextResponse.json({ success: false, data: [], error: "No se encontró empresa" }, { status: 404 })
      }

      return NextResponse.json({ success: true, data: [{ id: defaultEmpresa.id, nombre: defaultEmpresa.nombre }] })
    }

    const empresaIds = accessData.map(a => a.empresa_id)

    // Fetch empresa details
    const { data: empresasData, error: empresasError } = await supabaseAdmin
      .from("empresas")
      .select("id, nombre")
      .in("id", empresaIds)
      .order("nombre", { ascending: true })

    if (empresasError) {
      console.error("[v0] Error fetching empresas details:", empresasError)
      return NextResponse.json({ success: false, data: [], error: empresasError.message }, { status: 500 })
    }

    return NextResponse.json({ success: true, data: empresasData })
  } catch (error) {
    console.error("[v0] Error in accessible-empresas API:", error)
    return NextResponse.json({ success: false, data: [], error: "Error interno" }, { status: 500 })
  }
}
