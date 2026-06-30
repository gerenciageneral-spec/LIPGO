"use server"

// Aporte INDIVIDUAL del trabajador a los objetivos del SIG, para su PORTAL.
// Cada trabajador entra con su cédula y solo ve SU información. Todo se calcula
// EN VIVO desde LIPgo (fuente de verdad), filtrado estrictamente por el
// colaborador logueado. Enlace clave: en toneladasauxiliares están los
// auxiliares que intervinieron en cada cargue/descargue → así el SLA de tiempos
// (objetivo operativo) se atribuye a cada persona.

import { getSupabaseAdmin } from "@/lib/supabase-admin"
import { getSlaCargueMin } from "@/lib/sla-acordados"
import { getMetaDiaForEmpresa } from "@/lib/empresa-meta-dia"
import { getResultadosPorHeadcount } from "@/lib/inducciones-actions"
import type { AporteTarjeta, AporteEvento, MetaColaborador, MiAporte, EstadoTarjeta } from "@/lib/portal-objetivos"

const pct = (n: number, d: number) => (d > 0 ? Math.round((n / d) * 1000) / 10 : 0)
const aMin = (s: string) => {
  const [h, m, sec] = String(s).split(":").map(Number)
  return h * 60 + m + (sec || 0) / 60
}
const estadoDe = (valor: number, meta: number | null, sentido: "mayor_mejor" | "menor_mejor"): EstadoTarjeta => {
  if (meta == null) return "info"
  return sentido === "mayor_mejor"
    ? valor >= meta ? "ok" : valor >= meta * 0.85 ? "warn" : "bad"
    : valor <= meta ? "ok" : valor <= meta * 1.3 ? "warn" : "bad"
}

export async function getMiAporteObjetivos(input: {
  identificacion: string
  nombre: string
  colaboradorId: number
  idempresa: number | null
}): Promise<{ success: boolean; data?: MiAporte; error?: string }> {
  try {
    const supabase: any = await getSupabaseAdmin()
    const hoy = new Date()
    const desde = `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, "0")}-01`
    const periodoLabel = hoy.toLocaleDateString("es-CO", { month: "long", year: "numeric" })
    const tarjetas: AporteTarjeta[] = []
    const timeline: AporteEvento[] = []

    // ---- 1) Asistencia / SST (registroasistencia por cédula) ----
    const { data: asis } = await supabase
      .from("registroasistencia")
      .select("fecha, asistencia, puesto, hed, hedf, hen, hef, hn")
      .eq("identificacion", input.identificacion)
      .gte("fecha", desde)
      .order("fecha", { ascending: false })
    const asisRows: any[] = asis ?? []
    const total = asisRows.length
    const presentes = asisRows.filter((r) => !r.asistencia).length
    const incaps = asisRows.filter((r) => String(r.asistencia || "").toLowerCase().includes("incapacidad")).length
    const novedades = asisRows.filter((r) => r.asistencia)
    const jornada = pct(presentes, total)
    tarjetas.push({
      area: "SST", label: "Asistencia (jornada cumplida)", valor: jornada, meta: 95, unidad: "%", sentido: "mayor_mejor",
      estado: estadoDe(jornada, 95, "mayor_mejor"),
      mensaje: `Tu asistencia aporta al objetivo de SST. Este mes registraste ${incaps} incapacidad(es) y ${novedades.length} novedad(es) en ${total} turnos.`,
    })
    for (const n of novedades.slice(0, 30)) {
      const esIncap = String(n.asistencia).toLowerCase().includes("incapacidad")
      timeline.push({ fecha: n.fecha, tipo: esIncap ? "incapacidad" : "novedad", texto: String(n.asistencia), signo: "bad" })
    }

    // ---- 2) Aporte al SLA de cargues (toneladasauxiliares → cabeceraoc) ----
    let toneladas = 0
    let qTaux = supabase
      .from("toneladasauxiliares")
      .select("ordendecargue, fechacargue, toneladas_auxiliar")
      .eq("nombre_auxiliar", input.nombre)
      .gte("fechacargue", desde)
    if (input.idempresa) qTaux = qTaux.eq("idempresa", input.idempresa)
    const { data: taux } = await qTaux
    const ordenIds = Array.from(new Set((taux ?? []).map((t: any) => String(t.ordendecargue)).filter(Boolean)))
    for (const t of taux ?? []) toneladas += Number(t.toneladas_auxiliar) || 0

    let dentroSLA = 0
    let evaluables = 0
    if (ordenIds.length) {
      const { data: cab } = await supabase
        .from("cabeceraoc")
        .select("ordendecargue, fechaorden, iniciocargue, fincargue")
        .in("ordendecargue", ordenIds)
      const { data: citas } = await supabase
        .from("citasvehiculos")
        .select("ocargue, tipovehiculo")
        .in("ocargue", ordenIds)
      const tipoPorOc: Record<string, string> = {}
      for (const c of citas ?? []) if (c.ocargue) tipoPorOc[String(c.ocargue)] = c.tipovehiculo
      for (const r of cab ?? []) {
        if (!r.iniciocargue || !r.fincargue) continue
        const max = getSlaCargueMin(tipoPorOc[String(r.ordendecargue)], "PT")
        if (!max) continue
        const real = aMin(r.fincargue) - aMin(r.iniciocargue)
        if (real <= 0 || real > 600) continue
        evaluables++
        if (real <= max) dentroSLA++
        else {
          timeline.push({
            fecha: r.fechaorden, tipo: "sla_fuera",
            texto: `Cargue ${r.ordendecargue} fuera de SLA (+${Math.round(real - max)} min)`, signo: "bad",
          })
        }
      }
    }
    const slaPct = pct(dentroSLA, evaluables)
    if (ordenIds.length) {
      tarjetas.push({
        area: "Operación", label: "Aporte al SLA de cargues", valor: slaPct, meta: 90, unidad: "%", sentido: "mayor_mejor",
        estado: estadoDe(slaPct, 90, "mayor_mejor"),
        mensaje: `Participaste en ${ordenIds.length} cargues/descargues. ${dentroSLA} de ${evaluables} se hicieron dentro del tiempo acordado.`,
      })
    }

    // ---- 3) Productividad (toneladas vs META JUSTA derivada) ----
    // Método del cliente: meta del DÍA del proyecto (getMetaDiaForEmpresa, =
    // volumen mensual / ~24.7 días hábiles; cargue no trabaja domingos/festivos)
    // repartida entre las personas que trabajaron en cargue ESE día, sumada en
    // los días que el trabajador participó. Así su meta es proporcional y justa.
    const horasExtra = asisRows.reduce(
      (s, r) => s + (Number(r.hed) || 0) + (Number(r.hedf) || 0) + (Number(r.hen) || 0) + (Number(r.hef) || 0) + (Number(r.hn) || 0),
      0,
    )
    const metaDiaProyecto = getMetaDiaForEmpresa(input.idempresa ?? 0)
    // Días en que el trabajador fue PROGRAMADO a un turno operativo (puesto != null)
    // Y ASISTIÓ (asistencia null = sin novedad de ausencia). Cruce programación +
    // tabla de asistencia: solo cuentan los días que realmente trabajó.
    const susDias = new Set<string>(
      asisRows.filter((r) => r.puesto && !r.asistencia).map((r) => String(r.fecha).slice(0, 10)).filter(Boolean),
    )
    let metaTonDerivada = 0
    if (metaDiaProyecto > 0 && susDias.size && input.idempresa) {
      // Personas PROGRAMADAS y que ASISTIERON por día en el proyecto
      // (registroasistencia con puesto asignado y sin novedad de ausencia).
      const { data: progProj } = await supabase
        .from("registroasistencia")
        .select("identificacion, fecha, puesto")
        .eq("idempresa", input.idempresa)
        .gte("fecha", desde)
        .not("puesto", "is", null)
        .is("asistencia", null)
      const personasDia: Record<string, Set<string>> = {}
      for (const r of progProj ?? []) {
        const d = String(r.fecha).slice(0, 10)
        if (!d) continue
        if (!personasDia[d]) personasDia[d] = new Set()
        if (r.identificacion) personasDia[d].add(String(r.identificacion))
      }
      // Meta del día del proyecto repartida entre los programados ese día,
      // sumada en los días que el trabajador estuvo programado.
      for (const d of susDias) metaTonDerivada += metaDiaProyecto / (personasDia[d]?.size || 1)
    }
    metaTonDerivada = Math.round(metaTonDerivada * 10) / 10
    const tonVal = Math.round(toneladas * 10) / 10
    tarjetas.push({
      area: "Productividad", label: "Toneladas movilizadas", valor: tonVal,
      meta: metaTonDerivada > 0 ? metaTonDerivada : null, unidad: "ton", sentido: "mayor_mejor",
      estado: metaTonDerivada > 0 ? estadoDe(tonVal, metaTonDerivada, "mayor_mejor") : "info",
      mensaje:
        metaTonDerivada > 0
          ? `Moviste ${tonVal.toLocaleString("es-CO")} de ${metaTonDerivada.toLocaleString("es-CO")} ton de tu meta (tu parte de la meta diaria repartida entre quienes trabajaron, en ${susDias.size} días). ${Math.round(horasExtra)} horas extra.`
          : `Este mes moviste ${tonVal.toLocaleString("es-CO")} toneladas y ${Math.round(horasExtra)} horas extra.`,
    })

    // ---- 4) Formación / competencia (capacitaciones por headcount) ----
    const cap = await getResultadosPorHeadcount(input.colaboradorId)
    const porTitulo = new Map<string, any>() // último intento por evaluación (ya viene desc)
    for (const r of cap.data ?? []) if (!porTitulo.has(r.evaluacion_titulo)) porTitulo.set(r.evaluacion_titulo, r)
    const cursos = Array.from(porTitulo.values())
    const aprobadas = cursos.filter((c) => c.aprobado).length
    const formacionPct = pct(aprobadas, cursos.length)
    if (cursos.length) {
      tarjetas.push({
        area: "Formación", label: "Capacitaciones aprobadas", valor: formacionPct, meta: 100, unidad: "%", sentido: "mayor_mejor",
        estado: estadoDe(formacionPct, 100, "mayor_mejor"),
        mensaje: `Tienes ${aprobadas} de ${cursos.length} capacitaciones aprobadas.`,
      })
      for (const c of cursos) {
        timeline.push({
          fecha: c.fecha, tipo: c.aprobado ? "curso_ok" : "curso_pend",
          texto: `${c.aprobado ? "Aprobaste" : "Pendiente"}: ${c.evaluacion_titulo}`, signo: c.aprobado ? "ok" : "bad",
        })
      }
    }

    // ---- 5) Desempeño (última evaluación) ----
    const { data: evalDes } = await supabase
      .from("evaluaciones_desempeno")
      .select("puntaje_total, porcentaje_riesgo, p15_decision_sugerida, created_at")
      .eq("colaborador_id", input.colaboradorId)
      .order("created_at", { ascending: false })
      .limit(1)
    const ev = (evalDes ?? [])[0]
    let desempeno = null as MiAporte["desempeno"]
    if (ev) {
      const riesgo = Number(ev.porcentaje_riesgo) || 0
      desempeno = {
        puntaje: Number(ev.puntaje_total) || 0,
        riesgo,
        decision: ev.p15_decision_sugerida ?? null,
        fecha: ev.created_at ?? null,
      }
      tarjetas.push({
        area: "Desempeño", label: "Última evaluación de desempeño", valor: Number(ev.puntaje_total) || 0, meta: null, unidad: "pts", sentido: "mayor_mejor",
        estado: riesgo <= 30 ? "ok" : riesgo <= 60 ? "warn" : "bad",
        mensaje: `Tu última evaluación tuvo ${Number(ev.puntaje_total) || 0} puntos y ${riesgo}% de riesgo. Tu día a día (asistencia, SLA y formación) es lo que tu líder evalúa.`,
      })
    }

    // ---- 6) Metas individuales asignadas (sig_metas_colaborador) ----
    const { data: metasRows } = await supabase
      .from("sig_metas_colaborador")
      .select("id, area, indicador, meta, unidad, sentido, valor_actual, estado, periodo")
      .eq("colaborador_id", input.colaboradorId)
      .eq("activo", true)
    const metas: MetaColaborador[] = (metasRows ?? []) as MetaColaborador[]

    // Si hay meta de toneladas asignada, la tarjeta de Productividad pasa de
    // informativa a medible (semáforo vs meta). El SLA queda como indicador de
    // cumplimiento aparte (volumen + calidad, ambas dimensiones).
    const metaTon = metas.find((m) => m.unidad === "ton" || String(m.area || "").toLowerCase().includes("productiv"))
    if (metaTon && metaTon.meta != null) {
      const tProd = tarjetas.find((t) => t.area === "Productividad")
      if (tProd) {
        tProd.meta = Number(metaTon.meta)
        tProd.sentido = "mayor_mejor"
        tProd.estado = estadoDe(tProd.valor, tProd.meta, "mayor_mejor")
        tProd.mensaje = `Moviste ${tProd.valor.toLocaleString("es-CO")} de ${Number(metaTon.meta).toLocaleString("es-CO")} ton de tu meta del mes.`
      }
    }

    // ---- Consejo de mejora + impacto en la evaluación de desempeño ----
    const CONSEJO: Record<string, string> = {
      SST: "Avisa con anticipación cualquier novedad y evita ausencias no programadas.",
      Operación: "Coordina con tu equipo para cargar dentro del tiempo acordado y reporta a tiempo las demoras del cliente.",
      Formación: "Presenta y aprueba tus capacitaciones pendientes.",
      Productividad: "Mantén tu ritmo y registra bien tus operaciones.",
      Desempeño: "Conversa con tu líder y define un plan de mejora.",
    }
    const IMPACTO: Record<string, string> = {
      SST: "Suma a tu evaluación de desempeño en disciplina y seguridad.",
      Operación: "Suma a tu evaluación de desempeño en productividad.",
      Formación: "Suma a tu evaluación de desempeño en competencia y calidad.",
      Productividad: "Suma a tu evaluación de desempeño en productividad.",
      Desempeño: "Es el resultado de tu evaluación de desempeño.",
    }
    for (const t of tarjetas) {
      t.impactoDesempeno = IMPACTO[t.area] ?? null
      t.consejo = t.estado === "ok" || t.estado === "info" ? null : CONSEJO[t.area] ?? null
    }

    // ---- Puntaje de compromiso (global de sus metas) + nivel inspirador ----
    const conMeta = tarjetas.filter((t) => t.meta != null)
    const logro = (t: AporteTarjeta) => {
      const r = t.sentido === "mayor_mejor" ? (t.meta ? t.valor / t.meta : 0) : t.valor ? (t.meta as number) / t.valor : 1
      return Math.max(0, Math.min(1, r))
    }
    const puntajeCompromiso = conMeta.length
      ? Math.round((conMeta.reduce((a, t) => a + logro(t), 0) / conMeta.length) * 1000) / 10
      : 0
    const nivel =
      puntajeCompromiso >= 90
        ? { nombre: "Ejemplar", mensaje: "¡Eres ejemplo del equipo! Tu compromiso mueve a LIP. 🌟", emoji: "🌟", color: "ok" as const }
        : puntajeCompromiso >= 70
          ? { nombre: "En camino", mensaje: "Vas muy bien. Un par de ajustes y llegas a la meta. 💪", emoji: "💪", color: "warn" as const }
          : { nombre: "A mejorar", mensaje: "Tú puedes lograrlo: enfócate en lo señalado y lo vas a levantar. 🚀", emoji: "🚀", color: "bad" as const }

    // Acciones de mejora consolidadas (lo que está en amarillo/rojo).
    const accionesMejora = tarjetas
      .filter((t) => t.consejo)
      .map((t) => `${t.label}: ${t.consejo}`)

    // Ordena la línea de tiempo por fecha desc.
    timeline.sort((a, b) => String(b.fecha).localeCompare(String(a.fecha)))

    return {
      success: true,
      data: { periodoLabel, puntajeCompromiso, nivel, tarjetas, timeline: timeline.slice(0, 40), metas, desempeno, accionesMejora },
    }
  } catch (err: any) {
    return { success: false, error: err?.message || "Error desconocido" }
  }
}
