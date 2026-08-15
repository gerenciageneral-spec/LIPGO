"use server"

/**
 * Lectura del ARCHIVO PLANO (Nómina personal › pestaña "Archivo plano").
 *
 * POR QUÉ EXISTE ESTE ARCHIVO — la pestaña consultaba `archivoplano` DESDE EL
 * NAVEGADOR y se caía siempre con:
 *
 *     code 57014 — "canceling statement due to statement timeout"
 *
 * `archivoplano` se construye sobre `pagonomina`, que arma un calendario
 * persona×día y lo cruza contra headcount, tarifas y parámetros legales. Es una
 * consulta cara, y Supabase le da a los roles del navegador (`anon` /
 * `authenticated`) un `statement_timeout` corto — del orden de 8 segundos —
 * mientras que el rol de servicio tiene un margen mucho mayor. De ahí que en el
 * editor SQL de Supabase los datos SÍ se vieran: ese editor no consulta con el
 * rol del navegador.
 *
 * Los otros SIETE módulos que leen `pagonomina` (revisión de nómina, cierre
 * financiero, parafiscales, liquidaciones, conciliación Avimol, análisis
 * financiero, cierre diario) ya lo hacen desde el servidor con
 * `getSupabaseAdmin`. Esta pestaña era la excepción, y por eso era la que
 * fallaba.
 */

import { getSupabaseAdmin } from "@/lib/supabase-admin"

export interface FilaArchivoPlano {
  identificacionempleado: string | null
  nombreempleado: string | null
  contratoempleado: string | null
  nombrenovedad: string | null
  tiponovedad: string | null
  cantidadvalor: number | null
  nominaproyectada: number | null
  fechainicio: string | null
  fechafin: string | null
  diasnohabiles: number | null
  mes: string | null
  quincena: number | null
}

const COLUMNAS =
  "identificacionempleado, nombreempleado, contratoempleado, nombrenovedad, tiponovedad, cantidadvalor, nominaproyectada, fechainicio, fechafin, diasnohabiles, mes, quincena"

/**
 * Trae el archivo plano de una empresa, opcionalmente acotado a un mes y una
 * quincena.
 *
 * El mes se compara como "8" Y como "08": la columna es TEXT y puede venir de un
 * `to_char(...,'MM')`, así que el filtro no debería depender de ese detalle.
 */
export async function getArchivoPlano(
  idempresa: number,
  mes?: string | null,
  quincena?: string | null,
): Promise<{ success: boolean; data: FilaArchivoPlano[]; message?: string }> {
  if (!idempresa) return { success: false, data: [], message: "Selecciona una empresa." }

  try {
    const admin: any = await getSupabaseAdmin()

    const filas: FilaArchivoPlano[] = []
    const pageSize = 1000

    for (let offset = 0; ; offset += pageSize) {
      let q = admin.from("archivoplano").select(COLUMNAS).eq("idempresa", idempresa)

      const m = String(mes ?? "").trim()
      if (m) {
        const n = Number(m)
        q = q.in("mes", [String(n), String(n).padStart(2, "0")])
      }
      const qn = String(quincena ?? "").trim()
      if (qn) q = q.eq("quincena", Number(qn))

      const { data, error } = await q
        .order("mes", { ascending: false })
        .order("quincena", { ascending: false })
        .range(offset, offset + pageSize - 1)

      if (error) {
        console.error("[v0] getArchivoPlano error:", error.message, error.code)
        return {
          success: false,
          data: [],
          message: [error.message, error.code ? `(${error.code})` : null].filter(Boolean).join(" "),
        }
      }
      if (!data || data.length === 0) break
      filas.push(...(data as FilaArchivoPlano[]))
      if (data.length < pageSize) break
    }

    return { success: true, data: filas }
  } catch (e: any) {
    console.error("[v0] getArchivoPlano exception:", e?.message)
    return { success: false, data: [], message: e?.message || "Error al cargar el archivo plano." }
  }
}
