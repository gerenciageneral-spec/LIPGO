import { type NextRequest, NextResponse } from "next/server"
import { createServerClient } from "@/lib/supabase-server"
import { getCurrentEmpresaIdForInsert } from "@/lib/user-context"

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const selectedEmpresaId = searchParams.get("empresaId")
    // Cuando admin=true se listan TODOS los administrativos sin filtrar por
    // empresa (un administrativo puede o no estar asociado a un idempresa).
    const adminOnly = searchParams.get("admin") === "true"

    const supabase = createServerClient()

    let query = supabase.from("headcount").select("*").order("id", { ascending: false })

    if (adminOnly) {
      query = query.eq("admin", true)
    } else {
      const empresaId = selectedEmpresaId
        ? parseInt(selectedEmpresaId, 10)
        : await getCurrentEmpresaIdForInsert()
      query = query.eq("idempresa", empresaId)
    }

    const { data, error } = await query

    if (error) {
      console.error("[v0] Error fetching headcount:", error)
      return NextResponse.json({ error: "Error al obtener la lista de personal" }, { status: 500 })
    }

    return NextResponse.json(data)
  } catch (error) {
    console.error("[v0] Error in GET /api/headcount:", error)
    return NextResponse.json({ error: "Error al obtener la lista de personal" }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()

    const supabase = createServerClient()
    const empresaId = body.empresaId ? parseInt(body.empresaId, 10) : await getCurrentEmpresaIdForInsert()

    const { data, error } = await supabase
      .from("headcount")
      .insert({
        identificacion: body.identificacion,
        nombre: body.nombre,
        correo: body.correo || null,
        celular: body.celular || null,
        contratosiigo: body.contratosiigo || null,
        cargo: body.cargo || null,
        fechainicio: body.fechainicio || null,
        salario: body.salario ? Number(body.salario) : null,
        // Coercion estricta: `!!body.aplicaplano` garantiza boolean true/false
        // aunque el cliente envie undefined / null / "true" / 0, etc.
        aplicaplano: !!body.aplicaplano,
        // Personal administrativo. En la pestaña de administrativos siempre
        // llega true; en la pestaña normal queda false.
        admin: !!body.admin,
        idempresa: empresaId,
        estado: "Inactivo",
      })
      .select()
      .single()

    if (error) {
      console.error("[v0] Error creating headcount person:", error)
      return NextResponse.json({ error: "Error al crear el registro de personal", detail: error.message }, { status: 500 })
    }

    return NextResponse.json(data)
  } catch (error) {
    console.error("[v0] Error in POST /api/headcount:", error)
    return NextResponse.json({ error: "Error al crear el registro de personal" }, { status: 500 })
  }
}
