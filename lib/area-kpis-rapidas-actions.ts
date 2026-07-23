"use server"

import { getSupabaseAdmin } from "@/lib/supabase-admin"
import { getCurrentEmpresaIdForInsert } from "@/lib/user-context"
import { getUserPermissions } from "@/lib/permissions-actions"
import { getResumenExamenes, getExamenesPeriodicos } from "@/lib/examenes-medicos-actions"
import { AREA_KPI_TITULOS, type AreaKpiItem } from "@/lib/area-kpis-util"

// Tira de KPIs RÁPIDOS de "tareas pendientes / a revisar" por área. Usa conteos en
// paralelo (count:head) — NO el BSC (getIndicadoresValores, que es lento). El ícono es
// una CLAVE (string) que el cliente mapea a lucide (no se pasan componentes desde server).

function hoyBogota(): string {
  const b = new Date(new Date().toLocaleString("en-US", { timeZone: "America/Bogota" }))
  return `${b.getFullYear()}-${String(b.getMonth() + 1).padStart(2, "0")}-${String(b.getDate()).padStart(2, "0")}`
}

const MESES_KPI = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"]

export async function getAreaKpisRapidas(
  groupKey: string,
  selectedEmpresaId?: number | null,
  userId?: string,
  moduleName?: string | null,
  anioFiltro?: string | null,
  mesFiltro?: string | null,
): Promise<{ items: AreaKpiItem[]; titulo?: string }> {
  const sb: any = await getSupabaseAdmin()
  const empresaId = selectedEmpresaId || (await getCurrentEmpresaIdForInsert())
  if (!empresaId || !AREA_KPI_TITULOS[groupKey]) return { items: [] }
  const cnt = async (build: () => any): Promise<number> => {
    try {
      const { count, error } = await build()
      return error ? 0 : count || 0
    } catch {
      return 0
    }
  }

  // --- KPIs propios del SUBMÓDULO (no la tira general del área madre) ---------
  // Cada submódulo muestra SUS datos (según los SLA del BSC del módulo). La tira
  // general del grupo se conserva para la portada del módulo madre. Si el
  // submódulo actual tiene tira propia, se resuelve y se devuelve aquí.
  const subKpis = await getSubmoduloKpis(sb, moduleName, empresaId, anioFiltro, mesFiltro)
  if (subKpis) return subKpis

  const items: AreaKpiItem[] = []

  // ¿El usuario ve facturas? (KPI del Coordinador). Se calcula una sola vez.
  let puedeFacturas = false
  if (groupKey === "lip" || groupKey === "financiera") {
    try {
      const p: any = await getUserPermissions(userId)
      puedeFacturas = p ? !!p.gestionfacturas : true // sin registro (admin) → no ocultar
    } catch {
      puedeFacturas = true
    }
  }

  try {
    if (groupKey === "inventarios") {
      const [reservados, agotados] = await Promise.all([
        cnt(() => sb.from("invglobal").select("*", { count: "exact", head: true }).eq("idempresa", empresaId).gt("stock_res", 0)),
        cnt(() => sb.from("invglobal").select("*", { count: "exact", head: true }).eq("idempresa", empresaId).lte("stock_disp", 0)),
      ])
      items.push({ label: "Con stock reservado", value: String(reservados), subtext: "unidades comprometidas", variant: reservados > 0 ? "warning" : "success", icon: "lock" })
      items.push({ label: "Sin disponible", value: String(agotados), subtext: "stock disponible ≤ 0", variant: agotados > 0 ? "danger" : "success", icon: "package" })
    }

    else if (groupKey === "lip") {
      const hoy = hoyBogota()
      const [cargues, vehic, facturas] = await Promise.all([
        cnt(() => sb.from("cabeceraoc").select("*", { count: "exact", head: true }).eq("idempresa", empresaId).eq("fechacargue", hoy).is("fincargue", null)),
        cnt(() => sb.from("citasvehiculos").select("*", { count: "exact", head: true }).eq("idempresa", empresaId).is("estatus", null)),
        puedeFacturas ? cnt(() => sb.from("cabeceraoc").select("*", { count: "exact", head: true }).eq("idempresa", empresaId).is("estadofactura", null).neq("tipooperacion", "proyeccion")) : Promise.resolve(-1),
      ])
      if (puedeFacturas) items.push({ label: "Facturas por solicitar", value: String(facturas), subtext: "sin solicitar (Coordinador)", variant: facturas > 0 ? "warning" : "success", icon: "receipt" })
      items.push({ label: "Cargues hoy sin cerrar", value: String(cargues), subtext: "operación del día abierta", variant: cargues > 0 ? "danger" : "success", icon: "truck" })
      items.push({ label: "Vehículos no procesados", value: String(vehic), subtext: "por cerrar / asignar", variant: vehic > 0 ? "danger" : "success", icon: "car" })
    }

    else if (groupKey === "rrhh") {
      const [hojas, ausent, res, per] = await Promise.all([
        cnt(() => sb.from("hojas_de_vida").select("*", { count: "exact", head: true }).eq("idempresa", empresaId).eq("estado", "pendiente")),
        cnt(() => sb.from("ausentismosst").select("*", { count: "exact", head: true }).eq("idempresa", empresaId).eq("requiere_revision_sst", true)),
        getResumenExamenes(empresaId).catch(() => ({ success: false, data: null } as any)),
        getExamenesPeriodicos(empresaId).catch(() => ({ success: false, resumen: null } as any)),
      ])
      const rd = (res as any)?.data
      const pr = (per as any)?.resumen
      items.push({ label: "Exámenes vencidos", value: String(pr?.vencidos ?? 0), subtext: "periódico por realizar", variant: (pr?.vencidos ?? 0) > 0 ? "danger" : "success", icon: "stethoscope" })
      items.push({ label: "Exámenes pendientes", value: String(rd?.pendientes ?? 0), subtext: "por dictaminar", variant: (rd?.pendientes ?? 0) > 0 ? "warning" : "success", icon: "clock" })
      items.push({ label: "Hojas de vida pendientes", value: String(hojas), subtext: "por revisar", variant: hojas > 0 ? "warning" : "success", icon: "file" })
      items.push({ label: "Ausentismos por revisar", value: String(ausent), subtext: "requieren revisión SST", variant: ausent > 0 ? "warning" : "success", icon: "activity" })
    }

    else if (groupKey === "sst") {
      const [at, ipevr, ausent, res] = await Promise.all([
        cnt(() => sb.from("sst_incidentes").select("*", { count: "exact", head: true }).eq("idempresa", empresaId).not("estado", "in", "(cerrado,cerrada)")),
        cnt(() => sb.from("sst_ipevr").select("*", { count: "exact", head: true }).eq("idempresa", empresaId).lt("gc_pct_cumplimiento", 100)),
        cnt(() => sb.from("ausentismosst").select("*", { count: "exact", head: true }).eq("idempresa", empresaId).eq("requiere_revision_sst", true)),
        getResumenExamenes(empresaId).catch(() => ({ success: false, data: null } as any)),
      ])
      const rd = (res as any)?.data
      items.push({ label: "AT abiertos", value: String(at), subtext: "investigación sin cerrar", variant: at > 0 ? "danger" : "success", icon: "alert" })
      items.push({ label: "Exámenes no aptos", value: String(rd?.noAptos ?? 0), subtext: "restricción médica", variant: (rd?.noAptos ?? 0) > 0 ? "danger" : "success", icon: "stethoscope" })
      items.push({ label: "IPEVR bajo cumplimiento", value: String(ipevr), subtext: "controles < 100%", variant: ipevr > 0 ? "warning" : "success", icon: "shield" })
      items.push({ label: "Ausentismos por revisar", value: String(ausent), subtext: "osteomuscular / AT", variant: ausent > 0 ? "warning" : "success", icon: "activity" })
    }

    else if (groupKey === "financiera") {
      if (puedeFacturas) {
        const facturas = await cnt(() => sb.from("cabeceraoc").select("*", { count: "exact", head: true }).eq("idempresa", empresaId).is("estadofactura", null).neq("tipooperacion", "proyeccion"))
        items.push({ label: "Facturas por solicitar", value: String(facturas), subtext: "aún no facturadas", variant: facturas > 0 ? "warning" : "success", icon: "receipt" })
      }
    }

    else if (groupKey === "certificaciones_lip") {
      // SIG a nivel LIP (empresa 100).
      const [nc, docs] = await Promise.all([
        cnt(() => sb.from("sig_no_conformidades").select("*", { count: "exact", head: true }).eq("idempresa", 100).not("estado", "ilike", "%cerrad%")),
        cnt(() => sb.from("sig_documento_cobertura").select("*", { count: "exact", head: true }).neq("estado", "aprobado")),
      ])
      items.push({ label: "No conformidades abiertas", value: String(nc), subtext: "sin cerrar", variant: nc > 0 ? "warning" : "success", icon: "alert" })
      items.push({ label: "Documentos por aprobar", value: String(docs), subtext: "cobertura de la matriz", variant: docs > 0 ? "warning" : "success", icon: "file" })
    }
  } catch {
    /* si algo falla, se devuelven los ítems acumulados */
  }

  return { items }
}

// KPIs propios de cada SUBMÓDULO (reflejan el resumen interno del submódulo, no
// la tira general del área madre). Devuelve null si el submódulo no tiene tira
// propia (entonces se cae a la tira general del grupo). Extensible: agregar aquí
// un caso por submódulo con sus datos según el BSC.
async function getSubmoduloKpis(
  sb: any,
  moduleName: string | null | undefined,
  empresaId: number,
  anioFiltro?: string | null,
  mesFiltro?: string | null,
): Promise<{ items: AreaKpiItem[]; titulo: string } | null> {
  if (!moduleName) return null

  // Ausentismos (Gestión Humana): mismo resumen que muestra el submódulo —
  // casos, días perdidos, accidentes de trabajo y casos por revisar (SST) del
  // año en curso, por empresa/cliente.
  if (moduleName === "Ausentismos") {
    // Filtro AÑO/MES del submódulo (si el usuario filtró en la tabla); si no, el
    // año en curso. Así las tarjetas de arriba reaccionan al filtro de mes/año.
    const anio = anioFiltro && anioFiltro !== "todos" ? anioFiltro : hoyBogota().slice(0, 4)
    const mesNum = mesFiltro ? MESES_KPI.indexOf(mesFiltro) + 1 : 0 // 1-12; 0 = todos
    const desde = mesNum >= 1 ? `${anio}-${String(mesNum).padStart(2, "0")}-01` : `${anio}-01-01`
    const hasta = mesNum >= 1 ? `${anio}-${String(mesNum).padStart(2, "0")}-31` : `${anio}-12-31`
    const periodo = mesNum >= 1 ? `${mesFiltro} ${anio}` : anio
    let rows: any[] = []
    try {
      const { data } = await sb
        .from("ausentismosst")
        .select("total_dias_incapacidad, tipo_evento, requiere_revision_sst, dias_incapacidad")
        .eq("idempresa", empresaId)
        .gte("fecha_inicial", desde)
        .lte("fecha_inicial", hasta)
      rows = data || []
    } catch {
      rows = []
    }
    const casos = rows.length
    const dias = rows.reduce((s, r) => s + (Number(r.total_dias_incapacidad) || 0), 0)
    // Accidentes de trabajo = EVENTOS NUEVOS: filas AT con incapacidad inicial
    // (`dias_incapacidad` > 0). Las PRÓRROGAS puras (continuación del mismo AT;
    // `dias_incapacidad` = 0, días en `prorroga`) NO suman — antes inflaban el
    // conteo (Indupan 2026 sumaba 16 en vez de 5).
    const at = rows.filter((r) => r.tipo_evento === "AT" && (Number(r.dias_incapacidad) || 0) > 0).length
    const revSST = rows.filter((r) => r.requiere_revision_sst).length
    return {
      titulo: `Ausentismo — resumen ${periodo}`,
      items: [
        { label: "Casos", value: String(casos), subtext: `incapacidades ${periodo}`, variant: "primary", icon: "activity" },
        { label: "Días de ausentismo", value: dias.toLocaleString("es-CO"), subtext: `días perdidos ${periodo}`, variant: dias > 0 ? "warning" : "success", icon: "clock" },
        { label: "Accidentes de trabajo", value: String(at), subtext: `AT ${periodo}`, variant: at > 0 ? "danger" : "success", icon: "alert" },
        { label: "Por revisar SST", value: String(revSST), subtext: "osteomuscular / requiere revisión", variant: revSST > 0 ? "warning" : "success", icon: "shield" },
      ],
    }
  }

  // Recobro de Incapacidades: costo recuperable ante EPS (EG > 2 días) y ARL
  // (AT 100%). Refleja el resumen del submódulo: por radicar, en trámite,
  // recuperable pendiente y recobrado del año en curso.
  if (moduleName === "Recobro de Incapacidades") {
    const anio = hoyBogota().slice(0, 4)
    let rows: any[] = []
    try {
      const { data } = await sb
        .from("ausentismosst")
        .select("tipo_evento, estado_recobro, valor_recobrado, costos_arl, costos_eps")
        .eq("idempresa", empresaId)
        .gte("fecha_inicial", `${anio}-01-01`)
        .lte("fecha_inicial", `${anio}-12-31`)
      rows = data || []
    } catch {
      rows = []
    }
    let porRadicar = 0
    let enTramite = 0
    let recuperado = 0
    let pendiente = 0
    for (const a of rows) {
      const esAT = a.tipo_evento === "AT"
      const recobrable = Number(esAT ? a.costos_arl : a.costos_eps) || 0
      if (recobrable <= 0) continue // no genera recobro (EG ≤ 2 días)
      const est = String(a.estado_recobro || "PENDIENTE").toUpperCase()
      const rec = Number(a.valor_recobrado) || (est === "RECOBRADO" ? recobrable : 0)
      recuperado += rec
      if (est === "PENDIENTE") porRadicar++
      else if (est === "RADICADO") enTramite++
      if (est !== "RECOBRADO" && est !== "PERDIDO" && est !== "GLOSADO") pendiente += Math.max(0, recobrable - rec)
    }
    const cop = (n: number) => "$" + Math.round(n).toLocaleString("es-CO")
    return {
      titulo: `Recobro de incapacidades — ${anio}`,
      items: [
        { label: "Por radicar", value: String(porRadicar), subtext: "recobrables pendientes", variant: porRadicar > 0 ? "warning" : "success", icon: "clock" },
        { label: "En trámite", value: String(enTramite), subtext: "radicados ante EPS/ARL", variant: "primary", icon: "file" },
        { label: "Recuperable pendiente", value: cop(pendiente), subtext: "por recobrar", variant: pendiente > 0 ? "warning" : "success", icon: "receipt" },
        { label: "Recobrado", value: cop(recuperado), subtext: `recuperado ${anio}`, variant: recuperado > 0 ? "success" : "primary", icon: "shield" },
      ],
    }
  }

  // Liquidaciones: personal retirado CON contrato (nº SIIGO) por liquidar. Refleja
  // los KPIs del submódulo: retirados con contrato, pendientes y liquidadas.
  if (moduleName === "Liquidaciones") {
    let conContrato = 0
    try {
      const { data } = await sb
        .from("headcount")
        .select("identificacion, contratosiigo")
        .eq("idempresa", empresaId)
        .ilike("estado", "inactivo")
      conContrato = (data || []).filter((r: any) => String(r.contratosiigo || "").trim() !== "").length
    } catch {
      conContrato = 0
    }
    let liquidadas = 0
    try {
      const { count } = await sb
        .from("liquidaciones_retiro")
        .select("*", { count: "exact", head: true })
        .eq("idempresa", empresaId)
        .eq("estado", "liquidada")
      liquidadas = count || 0
    } catch {
      liquidadas = 0
    }
    const pendientes = Math.max(0, conContrato - liquidadas)
    return {
      titulo: "Liquidaciones — personal retirado",
      items: [
        { label: "Retirados con contrato", value: String(conContrato), subtext: "por liquidar", variant: "primary", icon: "file" },
        { label: "Pendientes de liquidar", value: String(pendientes), subtext: "sin marcar liquidada", variant: pendientes > 0 ? "warning" : "success", icon: "clock" },
        { label: "Liquidadas", value: String(liquidadas), subtext: "finalizadas", variant: "success", icon: "shield" },
      ],
    }
  }

  return null
}
