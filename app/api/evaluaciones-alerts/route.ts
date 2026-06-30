import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"

/**
 * Evaluaciones de Desempeno - Alertas de pendientes.
 *
 * Politica de evaluacion (requerimiento de negocio):
 *  - Primera evaluacion: fecha de ingreso (headcount.fechainicio) + 1 mes.
 *  - Evaluaciones siguientes: ultima evaluacion + 1 anio.
 *
 * Un colaborador esta "pendiente" cuando la fecha de su PROXIMA evaluacion
 * ya vencio (o no se puede calcular por falta de datos).
 *
 * Siempre se filtra por la empresa seleccionada (idempresa).
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const empresaId = searchParams.get("empresaId")

    if (!empresaId) {
      return NextResponse.json({ alerts: [], count: 0 })
    }

    const supabase = await createClient()
    const empresaIdNum = parseInt(empresaId, 10)

    // 1) Trae el headcount total de la empresa
    const { data: headcount, error: errHeadcount } = await supabase
      .from("headcount")
      .select("id, nombre, cargo, fechainicio")
      .eq("idempresa", empresaIdNum)
      .order("nombre", { ascending: true })

    if (errHeadcount) {
      console.error("[v0] evaluaciones-alerts: error headcount:", errHeadcount)
      return NextResponse.json({ alerts: [], count: 0 })
    }

    // Excluimos del listado a cualquier colaborador cuyo NOMBRE
    // contenga la palabra "AUXILIAR" (case-insensitive). Estos
    // registros representan auxiliares de cargue / transitorios que
    // no entran en el ciclo de evaluacion de desempeno, asi que no
    // deben generar ruido en el badge de alertas. El filtro va aqui
    // (post-fetch) en vez de en la query de Supabase porque
    // "AUXILIAR" puede aparecer en cualquier parte del nombre, no
    // solo al inicio. NOTA: el filtro se aplica unicamente sobre
    // `nombre`, no sobre `cargo`, para no excluir colaboradores con
    // cargos legitimos que contengan esa palabra.
    const headcountList = (headcount || []).filter(
      (h) => !(h.nombre || "").toUpperCase().includes("AUXILIAR"),
    )
    if (headcountList.length === 0) {
      return NextResponse.json({ alerts: [], count: 0 })
    }

    // 2) Trae las evaluaciones de la empresa para calcular la ultima por colaborador.
    //    Si la tabla no existe (modulo aun sin setup), regresa todos como pendientes.
    const ids = headcountList.map((h) => h.id)
    // Nota: el esquema real usa `created_at` (no existe fecha_evaluacion)
    const { data: evaluaciones, error: errEval } = await supabase
      .from("evaluaciones_desempeno")
      .select("colaborador_id, created_at")
      .in("colaborador_id", ids)
      .order("created_at", { ascending: false })

    // Mapa colaborador_id -> fecha mas reciente
    const ultimaPorColaborador = new Map<number, string>()
    if (!errEval && evaluaciones) {
      for (const e of evaluaciones) {
        if (!ultimaPorColaborador.has(e.colaborador_id)) {
          ultimaPorColaborador.set(e.colaborador_id, e.created_at)
        }
      }
    }

    // 3) Calcular pendientes segun la politica de proxima evaluacion:
    //    - con evaluacion previa: proxima = ultima + 1 anio
    //    - sin evaluacion pero con ingreso: proxima = ingreso + 1 mes
    //    - sin datos: pendiente (no se puede calcular)
    const ahora = Date.now()
    const pendientes = headcountList
      .map((h) => {
        const ultima = ultimaPorColaborador.get(h.id) || null
        const fechaInicio = (h as any).fechainicio || null

        let proxima: Date | null = null
        if (ultima) {
          proxima = new Date(ultima)
          proxima.setFullYear(proxima.getFullYear() + 1)
        } else if (fechaInicio) {
          proxima = new Date(fechaInicio)
          proxima.setMonth(proxima.getMonth() + 1)
        }

        const proximaValida = proxima && !isNaN(proxima.getTime())
        const isPendiente = !proximaValida || (proxima as Date).getTime() < ahora

        let diasDesdeUltima: number | null = null
        if (ultima) {
          diasDesdeUltima = Math.floor((ahora - new Date(ultima).getTime()) / (1000 * 60 * 60 * 24))
        }

        return {
          id: h.id,
          nombre: h.nombre,
          cargo: h.cargo,
          ultima_evaluacion: ultima,
          proxima_evaluacion: proximaValida ? (proxima as Date).toISOString() : null,
          dias_desde_ultima: diasDesdeUltima,
          isPendiente,
        }
      })
      .filter((c) => c.isPendiente)

    // Retornar los primeros 5 para el popover, y el conteo total
    const alerts = pendientes.slice(0, 5).map((p) => ({
      id: p.id,
      nombre: p.nombre,
      cargo: p.cargo,
      ultima_evaluacion: p.ultima_evaluacion,
      proxima_evaluacion: p.proxima_evaluacion,
      dias_desde_ultima: p.dias_desde_ultima,
    }))

    return NextResponse.json({
      alerts,
      count: pendientes.length,
    })
  } catch (error) {
    console.error("[v0] Error in evaluaciones-alerts:", error)
    return NextResponse.json({ alerts: [], count: 0 }, { status: 500 })
  }
}
