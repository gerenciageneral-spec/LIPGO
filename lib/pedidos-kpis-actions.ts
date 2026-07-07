"use server"

import { getSupabaseAdmin } from "@/lib/supabase-admin"
import { getCurrentEmpresaIdForInsert } from "@/lib/user-context"

// KPIs de gestión del cliente para el módulo de Pedidos, alineados a los objetivos
// del área (cumplimiento de entregas). Reutiliza la MISMA definición del Dashboard
// Pedidos (components/orders/dashboard-pedidos/calculations.ts:136-183):
//   - Universo: pedido con fecha_programada (promesa) y SIN fechaordencargue (no
//     entregado aún). Se excluyen los anulados.
//   - Vencido  = fecha_programada < hoy (America/Bogota)
//   - Vence hoy = fecha_programada == hoy
//   - Por vencer = fecha_programada en los próximos días.

export interface PedidosKpis {
  total: number
  pendientes: number
  vencidos: number
  venceHoy: number
  porVencer7: number
  entregados: number
  valorVencido: number
  cumplimientoPct: number // entregados a tiempo / con promesa vencida-o-hoy
}

function hoyBogotaMs(): number {
  const b = new Date(new Date().toLocaleString("en-US", { timeZone: "America/Bogota" }))
  b.setHours(0, 0, 0, 0)
  return b.getTime()
}
const diaMs = 86400000
function fechaMs(v: any): number | null {
  if (!v) return null
  const s = String(v).slice(0, 10)
  const t = new Date(s + "T00:00:00").getTime()
  return isNaN(t) ? null : t
}

export async function getPedidosKpis(selectedEmpresaId?: number | null): Promise<PedidosKpis> {
  const empty: PedidosKpis = { total: 0, pendientes: 0, vencidos: 0, venceHoy: 0, porVencer7: 0, entregados: 0, valorVencido: 0, cumplimientoPct: 0 }
  const sb: any = await getSupabaseAdmin()
  const empresaId = selectedEmpresaId || (await getCurrentEmpresaIdForInsert())
  if (!empresaId) return empty

  const rows: any[] = []
  let from = 0
  while (true) {
    const { data, error } = await sb
      .from("pedidoscabecera")
      .select("estado,fecha_programada,fechaordencargue,total_pagar")
      .eq("id_empresa", empresaId)
      .range(from, from + 999)
    if (error) return empty
    rows.push(...(data ?? []))
    if (!data || data.length < 1000) break
    from += 1000
    if (from > 100000) break
  }

  const hoy = hoyBogotaMs()
  let total = 0, pendientes = 0, vencidos = 0, venceHoy = 0, porVencer7 = 0, entregados = 0, valorVencido = 0
  let promesaVencidaOHoy = 0, entregadasATiempo = 0
  for (const r of rows) {
    if (String(r.estado || "").toLowerCase().includes("anulad")) continue // se excluyen anulados
    total++
    const entregado = !!(r.fechaordencargue && String(r.fechaordencargue).trim())
    const prog = fechaMs(r.fecha_programada)
    if (entregado) {
      entregados++
      // OTIF simple: entregado (fechaordencargue) <= promesa (fecha_programada)
      if (prog !== null) {
        promesaVencidaOHoy++
        const ent = fechaMs(r.fechaordencargue)
        if (ent !== null && ent <= prog) entregadasATiempo++
      }
      continue
    }
    if (prog === null) continue // pendiente sin promesa → no entra a vencidos
    pendientes++
    const dias = Math.round((prog - hoy) / diaMs)
    if (dias < 0) { vencidos++; valorVencido += Number(r.total_pagar) || 0 }
    else if (dias === 0) venceHoy++
    else if (dias <= 7) porVencer7++
  }
  const cumplimientoPct = promesaVencidaOHoy > 0 ? Math.round((entregadasATiempo / promesaVencidaOHoy) * 1000) / 10 : 0
  return { total, pendientes, vencidos, venceHoy, porVencer7, entregados, valorVencido: Math.round(valorVencido), cumplimientoPct }
}

// Vehículos NO PROCESADOS (sin cerrar): citasvehiculos con estatus IS NULL. Es el
// mismo predicado que usa la app para "registro abierto / por distribuir"
// (lib/vehicle-actions.ts:290-313). Sirve para que el cliente sepa cuáles cerrar.
export interface VehiculosKpis {
  noProcesados: number
  placas: string[]
}

export async function getVehiculosNoProcesados(selectedEmpresaId?: number | null): Promise<VehiculosKpis> {
  const sb: any = await getSupabaseAdmin()
  const empresaId = selectedEmpresaId || (await getCurrentEmpresaIdForInsert())
  if (!empresaId) return { noProcesados: 0, placas: [] }
  const { data, count } = await sb
    .from("citasvehiculos")
    .select("placa,fechallegada", { count: "exact" })
    .eq("idempresa", empresaId)
    .is("estatus", null)
    .order("fechallegada", { ascending: true })
    .limit(20)
  return {
    noProcesados: count || (data?.length ?? 0),
    placas: (data ?? []).map((r: any) => r.placa).filter(Boolean),
  }
}
