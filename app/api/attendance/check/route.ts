import { NextResponse } from "next/server"
import { createServerClient } from "@/lib/supabase-server"

export async function POST(request: Request) {
  try {
    const { identificacion } = await request.json()

    if (!identificacion) {
      return NextResponse.json({ error: "Identificación es requerida" }, { status: 400 })
    }

    const supabase = createServerClient()

    // Check if person exists in headcount and get their status
    const { data: person, error } = await supabase
      .from("headcount")
      .select("identificacion, nombre, estado")
      .eq("identificacion", identificacion)
      .maybeSingle()

    if (error) {
      console.error("[v0] Error checking headcount:", error)
      return NextResponse.json({ error: "Error al verificar el registro" }, { status: 500 })
    }

    if (!person || person.estado !== "Activo") {
      return NextResponse.json(
        {
          success: false,
          message: "Este documento no existe o está inactivo",
        },
        { status: 200 },
      )
    }

    return NextResponse.json(
      {
        success: true,
        message: `Bienvenido ${person.nombre}`,
        person,
      },
      { status: 200 },
    )
  } catch (error) {
    console.error("[v0] Error in POST /api/attendance/check:", error)
    return NextResponse.json({ error: "Error al procesar la solicitud" }, { status: 500 })
  }
}
