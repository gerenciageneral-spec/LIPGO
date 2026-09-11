import { NextRequest, NextResponse } from "next/server"
import { getSupabaseAdminAsSystem } from "@/lib/supabase-admin"
import { registrarEventoCiclo, getCondicionesGeneracionPrefactura } from "@/lib/ciclo-facturacion-actions"
import { ownerDePrefactura } from "@/lib/ciclo-facturacion-shared"
import { construirPdfAnexoFacturacion } from "@/lib/anexo-facturacion-pdf"
import { getPrefactura, getControlFacturacion, guardarPrefactura, buscarSolapesCuadroControl, type Advertencia, type UnidadCobro } from "@/lib/facturacion-control-actions"
import { getPrefacturaProduccion, guardarPrefacturaProduccion } from "@/lib/prefactura-produccion-actions"

/**
 * CRON DIARIO -- dos fases, en este orden:
 *
 * FASE A -- GENERAR automáticamente la prefactura de los proyectos que lo
 * tengan activado (`condiciones_generacion_prefactura`, panel "Frecuencia de
 * generación de prefacturas" en Ciclo de Facturación). Antes esto lo hacía
 * siempre una persona a mano en Cuadro de Control/Prefactura de Producción;
 * ahora, si el proyecto lo pide, el propio cron calcula el período contiguo
 * (desde el día siguiente a la última prefactura aprobada, hasta ayer) y lo
 * genera solo -- decisión del negocio: "generar igual y avisar después", así
 * que si hay advertencias (sin tarifa/sin gestionar/pago no cuadra/avisos de
 * producción) igual se genera, pero quedan guardadas en `prefacturas.advertencias`
 * para que el Jefe las revise (alerta en el top-bar) y corrija si hace falta
 * con "Solicitar corrección". Nunca se adivina una fecha de arranque: si un
 * proyecto no tiene ninguna prefactura previa, se omite (requiere la primera
 * a mano, una sola vez). Tampoco se fuerza nunca un solape de período.
 *
 * FASE B -- envía automáticamente el anexo (evento `anexo_enviado`) de las
 * prefacturas YA APROBADAS (por una persona o por la Fase A de arriba) que
 * están esperando su anexo (estado_ciclo='pendiente_anexo'). Sin cambios
 * respecto al cron original -- una prefactura recién generada en la Fase A ya
 * queda en ese estado, así que esta fase la recoge en la misma corrida.
 *
 * Corre TODOS LOS DÍAS (ver vercel.json); cada proyecto decide, con su propia
 * config, si HOY le toca generar y/o enviar (son decisiones independientes:
 * un proyecto puede generar diario y enviar semanal, por ejemplo -- en ese
 * caso el cliente recibirá varios anexos separados el día de envío, uno por
 * cada prefactura generada esos días, no uno solo consolidado).
 */

const DIA_SEMANA_DEFAULT = 1 // lunes
const USUARIO_CRON = "sistema (cron diario)"
const IDS_PRODUCCION = new Set([1, 2]) // Indupan, Avimol -> Prefactura de Producción; 3/4 -> Cuadro de Control
const esTon = (u?: UnidadCobro) => u !== "h" && u !== "turno" && u !== "u"

function diaSemanaColombiaHoy(): number {
  const ahora = new Date()
  const colombia = new Date(ahora.toLocaleString("en-US", { timeZone: "America/Bogota" }))
  return colombia.getDay()
}

function fechaAyerColombia(): string {
  const ahora = new Date()
  const colombia = new Date(ahora.toLocaleString("en-US", { timeZone: "America/Bogota" }))
  colombia.setDate(colombia.getDate() - 1)
  const y = colombia.getFullYear()
  const m = String(colombia.getMonth() + 1).padStart(2, "0")
  const d = String(colombia.getDate()).padStart(2, "0")
  return `${y}-${m}-${d}`
}

function diaSiguiente(fechaISO: string): string {
  const d = new Date(fechaISO + "T00:00:00")
  d.setDate(d.getDate() + 1)
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, "0")
  const dd = String(d.getDate()).padStart(2, "0")
  return `${y}-${m}-${dd}`
}

async function generarPrefacturasAutomaticas(sb: any, hoy: number) {
  const resultado = { generadas: 0, omitidas: 0, errores: [] as { idempresa: number; error: string }[] }

  const condiciones = await getCondicionesGeneracionPrefactura()
  if (!condiciones.success) {
    resultado.errores.push({ idempresa: 0, error: "No se pudieron leer las condiciones de generación: " + condiciones.message })
    return resultado
  }

  for (const cond of condiciones.data) {
    try {
      if (!cond.activo) {
        resultado.omitidas++
        continue
      }
      const leToca = cond.frecuencia === "diario" || cond.dia_semana === hoy
      if (!leToca) {
        resultado.omitidas++
        continue
      }

      const origen = IDS_PRODUCCION.has(cond.idempresa) ? "produccion" : "cuadro_control"
      const { data: ultima } = await sb
        .from("prefacturas")
        .select("periodo_hasta")
        .eq("idempresa", cond.idempresa)
        .eq("origen", origen)
        .eq("estado", "aprobada")
        .order("periodo_hasta", { ascending: false })
        .limit(1)
        .maybeSingle()

      // Nunca se adivina una fecha de arranque: la primera prefactura de un
      // proyecto la sigue generando una persona, a mano, una sola vez.
      if (!ultima?.periodo_hasta) {
        resultado.omitidas++
        continue
      }

      const desde = diaSiguiente(ultima.periodo_hasta)
      const hasta = fechaAyerColombia()
      if (desde > hasta) {
        // ya está al día -- no ha pasado un día nuevo por facturar
        resultado.omitidas++
        continue
      }

      if (IDS_PRODUCCION.has(cond.idempresa)) {
        // -------- Indupan (1) / Avimol (2) --------
        const prev = await getPrefacturaProduccion(cond.idempresa, desde, hasta)
        if (!prev.success || !prev.data) {
          resultado.errores.push({ idempresa: cond.idempresa, error: prev.message || "No se pudo calcular la prefactura de producción" })
          continue
        }
        const data = prev.data
        if (!(data.total > 0)) {
          resultado.omitidas++ // nada que facturar este período
          continue
        }

        const todasLasLineas = [...data.produccion, ...data.horasExtra]
        const advertencias: Advertencia[] = [
          ...data.alertas.map((a) => ({ tipo: a.tipo, detalle: a.detalle })),
          ...todasLasLineas.filter((l) => l.sinTarifa).map((l) => ({ tipo: "sin_tarifa", detalle: `${l.concepto}: sin tarifa vigente (se cobró $0)` })),
        ]

        const r = await guardarPrefacturaProduccion({
          idempresa: cond.idempresa,
          proyecto: data.proyecto,
          periodo_desde: desde,
          periodo_hasta: hasta,
          lineas: todasLasLineas,
          soporte: data.soporte,
          total: data.total,
          toneladas: data.totalToneladas,
          usuarioOverride: USUARIO_CRON,
          advertencias,
        })
        if (!r.success) {
          resultado.errores.push({ idempresa: cond.idempresa, error: r.message || "No se pudo guardar la prefactura de producción" })
          continue
        }
        resultado.generadas++
      } else {
        // -------- Cedi Funza (3) / Cedi Medellín (4) --------
        const solapes = await buscarSolapesCuadroControl(cond.idempresa, desde, hasta)
        if (solapes.length > 0) {
          resultado.errores.push({
            idempresa: cond.idempresa,
            error: `Solape con prefactura(s) ya aprobada(s): ${solapes.map((s: any) => `#${s.id} ${s.periodo}`).join(", ")} -- no se generó para evitar cobrar dos veces.`,
          })
          continue
        }

        const [prefR, ctrlR] = await Promise.all([
          getPrefactura(cond.idempresa, { desde, hasta }),
          getControlFacturacion(cond.idempresa, { desde, hasta }),
        ])
        if (!prefR.success || !prefR.data) {
          resultado.errores.push({ idempresa: cond.idempresa, error: prefR.message || "No se pudo calcular la prefactura" })
          continue
        }
        const pref = prefR.data

        // "Seleccionar todo" -- el default documentado de la UI (guardarBorrador),
        // aquí sin selección manual porque no hay nadie mirando la pantalla.
        const lineas = pref.resumen
          .filter((r) => r.valorPorFacturar > 0)
          .map((r) => ({
            owner: r.owner,
            servicio: r.operacion,
            toneladas: Number(r.tonPorFacturar.toFixed(3)),
            tarifa: r.tarifa,
            total: Math.round(r.valorPorFacturar),
            fuente: r.fuente,
            unidad: r.unidad,
          }))
        if (lineas.length === 0) {
          resultado.omitidas++ // nada por facturar (todo ya tiene factura Siigo, o no hubo movimiento)
          continue
        }

        const soporte = [
          ...pref.origen
            .filter((l) => l.categoria !== "facturado")
            .map((l) => ({
              owner: l.owner,
              operacion: l.grupoResumen || "",
              servicio: l.servicio,
              fecha: l.fechacargue,
              numeroorden: l.numeroorden,
              placa: l.placa,
              cliente: l.cliente,
              producto: l.producto,
              toneladas: Number((l.toneladas || 0).toFixed(3)),
              tarifa: l.tarifaServicio,
              valor: Math.round(l.valorServicio),
              unidad: l.unidad,
              tiquete: l.tiquete,
            })),
          ...(pref.soporteProduccion || []),
        ].filter((l) => l.valor > 0)

        const total = Math.round(lineas.reduce((s, l) => s + l.total, 0))
        const toneladas = Number(lineas.reduce((s, l) => s + (esTon(l.unidad) ? l.toneladas : 0), 0).toFixed(3))

        // OJO: `ordenes_sin_gestionar` NO entra aquí -- es, por definición, el
        // conteo de "órdenes listas para facturar por primera vez" (de ahí
        // sale `valorPorFacturar` mismo), no una anomalía. Confirmado con una
        // corrida en seco contra datos reales: en cualquier período recién
        // generado ese contador es SIEMPRE > 0 -- tratarlo como advertencia
        // marcaría TODA prefactura automática como sospechosa, sin serlo, y
        // el aviso dejaría de servir para algo. Solo cuentan como
        // advertencia real las anomalías de DATOS (tarifa/pago), no el
        // estado normal de "esto está pendiente de facturar".
        const advertencias: Advertencia[] = []
        if (ctrlR.success && ctrlR.data) {
          const t = ctrlR.data.totales
          if (t.ordenes_sin_tarifa > 0) advertencias.push({ tipo: "sin_tarifa", detalle: `${t.ordenes_sin_tarifa} orden(es) sin tarifa vigente (se cobraron $0)` })
          if (t.ordenes_medio_pago > 0) advertencias.push({ tipo: "pago_no_cuadra", detalle: `${t.ordenes_medio_pago} orden(es) con medio de pago inconsistente` })
          if (ctrlR.data.produccionAviso) advertencias.push({ tipo: "produccion_aviso", detalle: ctrlR.data.produccionAviso })
          for (const al of ctrlR.data.produccionAlertas || []) advertencias.push({ tipo: "produccion_alerta", detalle: al })
        }

        const r = await guardarPrefactura({
          idempresa: cond.idempresa,
          proyecto: cond.proyecto,
          periodo_desde: desde,
          periodo_hasta: hasta,
          lineas,
          soporte,
          total,
          toneladas,
          usuario: USUARIO_CRON,
          advertencias,
        })
        if (!r.success) {
          resultado.errores.push({ idempresa: cond.idempresa, error: r.message || "No se pudo guardar la prefactura" })
          continue
        }
        resultado.generadas++
      }
    } catch (e: any) {
      resultado.errores.push({ idempresa: cond.idempresa, error: e?.message || String(e) })
    }
  }

  return resultado
}

export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET
  if (!secret) {
    console.error("[cron/anexos-pendientes] CRON_SECRET no configurado -- el cron no puede correr (falla cerrado).")
    return NextResponse.json({ error: "CRON_SECRET no configurado" }, { status: 500 })
  }
  if (request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 })
  }

  const resultados: {
    generacion: { generadas: number; omitidas: number; errores: { idempresa: number; error: string }[] }
    procesadas: number
    omitidas: number
    noLeToca: number
    errores: { id: number; error: string }[]
  } = {
    generacion: { generadas: 0, omitidas: 0, errores: [] },
    procesadas: 0,
    omitidas: 0,
    noLeToca: 0,
    errores: [],
  }

  try {
    const sb: any = await getSupabaseAdminAsSystem()
    const hoy = diaSemanaColombiaHoy()

    // FASE A -- generar automáticamente lo que corresponda hoy.
    resultados.generacion = await generarPrefacturasAutomaticas(sb, hoy)

    // FASE B -- enviar el anexo de toda prefactura aprobada (recién generada
    // arriba, o aprobada por una persona) que esté esperando su anexo.
    const { data: condiciones } = await sb.from("condiciones_envio_anexo").select("idempresa, frecuencia, dia_semana")
    const condicionPorEmpresa = new Map<number, { frecuencia: string; dia_semana: number | null }>()
    for (const c of condiciones || []) condicionPorEmpresa.set(c.idempresa, c)

    const { data: candidatas, error: errCand } = await sb
      .from("prefacturas")
      .select("id, idempresa, proyecto, periodo_desde, periodo_hasta, soporte, lineas")
      .eq("estado", "aprobada")
      .eq("estado_ciclo", "pendiente_anexo")

    if (errCand) {
      return NextResponse.json({ error: errCand.message, ...resultados }, { status: 500 })
    }

    for (const p of candidatas || []) {
      try {
        const cond = condicionPorEmpresa.get(p.idempresa)
        const frecuencia = cond?.frecuencia || "semanal"
        const diaSemana = cond ? cond.dia_semana : DIA_SEMANA_DEFAULT
        const leToca = frecuencia === "diario" || diaSemana === hoy
        if (!leToca) {
          resultados.noLeToca++
          continue
        }

        if (!p.soporte?.length) {
          resultados.omitidas++
          continue
        }

        const { owner } = ownerDePrefactura(p.lineas)
        const { data: empresa } = await sb.from("empresas_permisos").select("nombre, nit, direccion").eq("id", p.idempresa).maybeSingle()

        const buffer = await construirPdfAnexoFacturacion({
          empresaProyecto: { nombre: empresa?.nombre || p.proyecto || `Empresa ${p.idempresa}`, nit: empresa?.nit ?? null, direccion: empresa?.direccion ?? null },
          proyecto: p.proyecto || "",
          owner,
          periodoDesde: p.periodo_desde,
          periodoHasta: p.periodo_hasta,
          soporte: p.soporte,
        })

        const path = `ciclo_facturacion/anexo_enviado/prefactura_${p.id}_${Date.now()}.pdf`
        const { error: errUpload } = await sb.storage.from("archivos").upload(path, Buffer.from(buffer), {
          contentType: "application/pdf",
          upsert: true,
        })
        if (errUpload) throw new Error(`Storage: ${errUpload.message}`)

        const { data: pub } = sb.storage.from("archivos").getPublicUrl(path)
        const nombre = `Anexo_${owner}_${p.id}.pdf`.replace(/[^a-zA-Z0-9_.-]+/g, "_")

        const r = await registrarEventoCiclo(p.id, "anexo_enviado", [{ url: pub.publicUrl, nombre }], USUARIO_CRON)
        if (!r.success) throw new Error(r.message || "registrarEventoCiclo falló")

        resultados.procesadas++
      } catch (e: any) {
        resultados.errores.push({ id: p.id, error: e?.message || String(e) })
      }
    }

    return NextResponse.json(resultados)
  } catch (error: any) {
    console.error("[cron/anexos-pendientes] error fatal:", error)
    return NextResponse.json({ error: error?.message || "Error inesperado", ...resultados }, { status: 500 })
  }
}
