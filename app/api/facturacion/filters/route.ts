import { createClient } from "@/lib/supabase"
import { NextResponse } from "next/server"

export async function GET(request: Request) {
  try {
    const supabase = await createClient()

    // Fetch unique values for each filter field
    const [ownersRes, playasRes, subcategoriasRes, empresasRes, transportesRes, todasEmpresas, puestosRes] =
      await Promise.all([
        supabase.from("facturacion").select("owner").not("owner", "is", null),
        supabase.from("facturacion").select("placa").not("placa", "is", null),
        supabase.from("facturacion").select("subcategoria").not("subcategoria", "is", null),
        supabase.from("facturacion").select("idempresa").not("idempresa", "is", null),
        supabase.from("facturacion").select("transporte").not("transporte", "is", null),
        supabase.from("empresas").select("id, nombre"), // Fetch all valid empresas
        supabase.from("facturacionturnos").select("puesto").not("puesto", "is", null),
      ])

    // Extract unique values from responses
    const getUnique = (data: any[], field: string) => {
      if (!data) return []
      return [...new Set(data.map((item) => item[field]).filter(Boolean))].sort((a, b) => a - b)
    }

    // Get unique empresas - combine facturacion data with all valid empresas
    const facturacionEmpresas = getUnique(empresasRes.data || [], "idempresa")
    const allEmpresas = todasEmpresas.data || []
    
    // Merge: include all valid empresas, but prioritize those with actual facturacion data
    const empresasMap = new Map<number, string>()
    allEmpresas.forEach((emp: any) => {
      empresasMap.set(emp.id, emp.nombre)
    })
    
    // Add empresas from facturacion even if they don't exist in empresas table
    facturacionEmpresas.forEach((id: number) => {
      if (!empresasMap.has(id)) {
        empresasMap.set(id, `Empresa ${id}`)
      }
    })

    const empresasFormatted = Array.from(empresasMap.entries())
      .map(([id, nombre]) => ({ id, nombre }))
      .sort((a, b) => a.id - b.id)

    // Hardcoded tipos de operacion
    const tiposOperacionHardcoded = ["Cargue", "Descargue", "Tolva", "Tolva f", "Distribucion"]

    const filters = {
      owners: getUnique(ownersRes.data || [], "owner"),
      playas: getUnique(playasRes.data || [], "placa"),
      subcategorias: getUnique(subcategoriasRes.data || [], "subcategoria"),
      empresas: empresasFormatted,
      transportes: getUnique(transportesRes.data || [], "transporte"),
      tiposOperacion: tiposOperacionHardcoded,
      puestos: getUnique(puestosRes.data || [], "puesto"),
    }

    return NextResponse.json(filters)
  } catch (error) {
    console.error("[v0] Error fetching filter options:", error)
    return NextResponse.json(
      {
        owners: [],
        playas: [],
        subcategorias: [],
        empresas: [],
        transportes: [],
        tiposOperacion: [],
        puestos: [],
      },
      { status: 200 },
    )
  }
}
