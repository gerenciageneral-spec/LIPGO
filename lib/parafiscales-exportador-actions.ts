"use server"

// Exportador del archivo de CARGA de Aportes en Línea (PILA) -- distinto del
// "cuadro de control" de parafiscales-actions.ts (que solo muestra números en
// pantalla). Este módulo genera el archivo EXCEL que se sube al operador,
// clonando el layout real de una planilla ya aceptada (columna por columna,
// 99 columnas) en vez de reconstruirlo desde cero -- así se preservan las
// otras hojas del archivo (catálogos, etc.) que el portal puede necesitar.
//
// Fuente de verdad de cada columna: auditada contra la planilla real de
// julio-2026 (`7. julio ADDIN.xlsx`, hoja "Liquidaciones (2)"), 2026-09-07.
// Reglas de cotización por tipo de novedad -- confirmadas con esa planilla:
//   · TRAB  -> cotiza TODO (pensión 0.16, salud 0.04/0.125, ARL, caja 0.04).
//   · VAC   -> cotiza pensión + SALUD + caja (NO ARL). (parafiscales.ts tenía
//     esto mal -- excluía salud -- corregido el mismo día con este hallazgo).
//   · INCAP -> pensión 0.16 (12% empleador + 4% empleado) + salud SOLO 0.04
//     (el 4% del empleado; el 8.5% patronal NO se causa -- lo asume la
//     EPS/ARL, confirmado por el usuario 2026-09-11). NO ARL, NO caja.
//   · AUS   -> pensión SOLO empleador (tarifa 0.12) -- NO salud, NO ARL, NO
//     caja. Incluye tanto "Licencia no remunerada" como la nueva novedad
//     "Suspensión temporal de Contrato" (mismo código PILA SLN, mismo trato).
//   · LICR  -> igual que TRAB menos ARL (pensión + salud + caja).
//   · pensionTarifa/saludTarifa NO son constantes -- se calculan como
//     valor/IBC de cada fila (ver más abajo), porque varían según el tipo de
//     segmento (16%/12% en pensión, 12.5%|4%|4% en salud).
//   · Vacaciones PAGADAS EN LIQUIDACIÓN de retiro (dinero, no días) suman su
//     valor SOLO al IBC/valor de Caja del segmento de cierre del mes del
//     retiro -- ver `vacLiqPorCedula` más abajo.
//   · Las columnas "Días" de los 4 conceptos SIEMPRE muestran el mismo conteo
//     del tramo (el concepto que no aplica se ve en la TARIFA/VALOR en $0, no
//     en el conteo de días).
//   · "VST" (columna 26) = SI solo en el/los tramo(s) TRABAJADO que llevan
//     bono de productividad ese mes; "Salario Variable" (columna 49) = SI en
//     TODAS las filas de una persona que tuvo bono positivo en alguna
//     quincena (aunque esa fila puntual sea una novedad sin bono).
//   · El piso de 1 SMLV proporcional se aplica UNA vez sobre el total TRAB
//     del mes (no por tramo) -- si se aplicara por tramo, un hueco de datos
//     en un tramo corto lo infla de más aunque el mes completo esté bien.

import { getSupabaseAdmin } from "@/lib/supabase-admin"
import { calcularAportes, PARAFISCALES_DEFAULT, clasificarDiaCotizacion, type TipoDiaCotizacion } from "@/lib/parafiscales"
import { getLiquidaciones } from "@/lib/liquidaciones-actions"
import * as XLSX from "xlsx"

const PLANTILLA_STORAGE_PATH = "parafiscales/plantilla-carga-pila.xlsx"
const PLANTILLA_SHEET = "Liquidaciones (2)"

function finDeMes(anio: number, mes: number): string {
  const d = new Date(Date.UTC(anio, mes, 0))
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`
}

function serialExcel(fechaIso: string): number {
  const [y, m, d] = fechaIso.split("-").map(Number)
  return Math.round((Date.UTC(y, m - 1, d) - Date.UTC(1899, 11, 30)) / 86400000)
}

interface Segmento {
  tipo: TipoDiaCotizacion
  diaIni: number
  diaFin: number
  dias: number
  ibcTrabDevengado: number
}

export interface ExcepcionExportador {
  persona: string
  motivo: string
}

/**
 * Genera el archivo de carga PILA de un mes, clonando el layout real (99
 * columnas) desde la plantilla guardada en Storage. Devuelve el archivo en
 * base64 (para descargar desde el cliente) + la lista de excepciones a
 * revisar manualmente (personas sin ficha estática, bono repartido entre
 * varios tramos del mismo tipo, etc.).
 */
export async function generarArchivoCargaPila(
  anio: number,
  mes: number,
): Promise<{ success: boolean; base64?: string; filename?: string; excepciones?: ExcepcionExportador[]; message?: string }> {
  try {
    const admin: any = await getSupabaseAdmin()

    const { data: pa } = await admin
      .from("parametros_legales_anio")
      .select("smlv")
      .eq("anio", anio)
      .maybeSingle()
    const smlv = Number(pa?.smlv || 0)
    if (!smlv) return { success: false, message: `No hay parámetros legales cargados para el año ${anio}.` }

    const { data: estaticos } = await admin.from("parafiscales_estatico").select("*")
    const plantilla = new Map<string, any>()
    for (const e of estaticos || []) plantilla.set(String(e.identificacion).trim(), e)

    const { data: personal } = await admin
      .from("headcount")
      .select("identificacion, nombre, admin, salario, idempresa, contratosiigo, fecha_retiro, fechainicio, estado")
      .not("nombre", "ilike", "%prueba%")
    const info = new Map<
      string,
      {
        identificacion: string
        esAdmin: boolean
        salario: number
        idempresa: number | null
        fechaRetiro: string | null
        fechaInicio: string | null
        esActivo: boolean
      }
    >()
    for (const h of personal || []) {
      const nombre = String(h.nombre || "").trim()
      if (!nombre || !String(h.contratosiigo || "").trim() || /^sin auxiliar$/i.test(nombre)) continue
      const prev = info.get(nombre)
      const esActivoFila = String(h.estado || "").trim().toUpperCase() === "ACTIVO"
      info.set(nombre, {
        identificacion: String(h.identificacion || "").trim() || prev?.identificacion || "",
        esAdmin: h.admin === true || prev?.esAdmin || false,
        salario: Number(h.salario) || prev?.salario || 0,
        idempresa: h.idempresa ?? prev?.idempresa ?? null,
        fechaRetiro: h.fecha_retiro ? String(h.fecha_retiro).slice(0, 10) : (prev?.fechaRetiro ?? null),
        fechaInicio: h.fechainicio ? String(h.fechainicio).slice(0, 10) : (prev?.fechaInicio ?? null),
        esActivo: (prev?.esActivo ?? false) || esActivoFila,
      })
    }

    const desde = `${anio}-${String(mes).padStart(2, "0")}-01`
    const hasta = finDeMes(anio, mes)

    // Vacaciones pagadas en la LIQUIDACIÓN de retiro -> suman al IBC de Caja de
    // Compensación del segmento de cierre, en el mes del retiro. Misma fuente y
    // mismo criterio que getParafiscales() (lib/parafiscales-actions.ts) -- ver
    // comentario ahí. Solo se consulta si hay retiros este mes.
    const vacLiqPorCedula = new Map<string, number>()
    const idsEmpresaConRetiro = new Set(
      Array.from(info.values())
        .filter((i) => i.fechaRetiro && i.fechaRetiro >= desde && i.fechaRetiro <= hasta && i.idempresa != null)
        .map((i) => i.idempresa as number),
    )
    for (const idEmp of idsEmpresaConRetiro) {
      const liq = await getLiquidaciones(idEmp)
      if (!liq.success) continue
      for (const lp of liq.data) {
        if (lp.fecha_retiro && lp.fecha_retiro >= desde && lp.fecha_retiro <= hasta && lp.vacaciones > 0) {
          vacLiqPorCedula.set(lp.identificacion, lp.vacaciones)
        }
      }
    }
    const nombres = Array.from(info.keys())
    let filas: any[] = []
    const pageSize = 1000
    for (let offset = 0; ; offset += pageSize) {
      const { data } = await admin
        .from("pagonomina")
        .select("persona, fecha, total_liquidado_dia, novedad_reportada, bonif_prestacional")
        .in("persona", nombres)
        .gte("fecha", desde)
        .lte("fecha", hasta)
        .range(offset, offset + pageSize - 1)
      if (!data || data.length === 0) break
      filas = filas.concat(data)
      if (data.length < pageSize) break
    }

    const porPersona = new Map<string, any[]>()
    for (const r of filas) {
      const nombre = String(r.persona || "").trim()
      if (!info.has(nombre)) continue
      const arr = porPersona.get(nombre) || []
      arr.push(r)
      porPersona.set(nombre, arr)
    }

    const excepciones: ExcepcionExportador[] = []
    const filasSalida: any[] = []
    let noCounter = 0

    for (const [nombre, dias] of porPersona) {
      const ficha = info.get(nombre)!
      const est = plantilla.get(ficha.identificacion)
      if (!est) {
        excepciones.push({ persona: `${nombre} (${ficha.identificacion})`, motivo: "Sin ficha estática (proyecto/EPS/AFP/CCF) -- agrégala en Parafiscales antes de exportar." })
        continue
      }
      dias.sort((a, b) => a.fecha.localeCompare(b.fecha))

      let excQ1 = 0, excQ2 = 0
      for (const r of dias) {
        const diaMes = Number(r.fecha.slice(8, 10))
        if (clasificarDiaCotizacion(r.novedad_reportada) !== "TRAB") continue
        if (diaMes <= 15) excQ1 += Number(r.bonif_prestacional || 0)
        else excQ2 += Number(r.bonif_prestacional || 0)
      }
      const bonoQ1 = Math.max(0, excQ1)
      const bonoQ2 = Math.max(0, excQ2)

      const segmentos: Segmento[] = []
      for (const r of dias) {
        const fecha = String(r.fecha)
        const diaMes = Number(fecha.slice(8, 10))
        const esDia31 = diaMes === 31
        if (ficha.fechaRetiro && !ficha.esActivo && fecha.slice(0, 10) > ficha.fechaRetiro) continue
        if (ficha.fechaInicio && fecha.slice(0, 10) < ficha.fechaInicio) continue
        const tipo = clasificarDiaCotizacion(r.novedad_reportada)
        if (tipo === "RETIRO") continue

        if (esDia31) {
          if (tipo === "TRAB") {
            for (let k = segmentos.length - 1; k >= 0; k--) {
              if (segmentos[k].tipo === "TRAB") {
                segmentos[k].ibcTrabDevengado += Number(r.total_liquidado_dia || 0)
                break
              }
            }
          }
          continue
        }

        const last = segmentos[segmentos.length - 1]
        if (last && last.tipo === tipo && last.diaFin === diaMes - 1) {
          last.diaFin = diaMes
          last.dias += 1
          if (tipo === "TRAB") last.ibcTrabDevengado += Number(r.total_liquidado_dia || 0)
        } else {
          segmentos.push({ tipo, diaIni: diaMes, diaFin: diaMes, dias: 1, ibcTrabDevengado: tipo === "TRAB" ? Number(r.total_liquidado_dia || 0) : 0 })
        }
      }

      const trabQ1 = segmentos.filter((s) => s.tipo === "TRAB" && s.diaIni <= 15)
      const trabQ2 = segmentos.filter((s) => s.tipo === "TRAB" && s.diaFin > 15)
      if (trabQ1.length > 1 || trabQ2.length > 1) {
        excepciones.push({ persona: nombre, motivo: "Varios tramos trabajados en la misma quincena -- el bono de productividad se repartió proporcional por días, revisar." })
      }
      const diasQ1 = trabQ1.reduce((s, x) => s + x.dias, 0)
      const diasQ2 = trabQ2.reduce((s, x) => s + x.dias, 0)
      let bonoQ1Asignado = false, bonoQ2Asignado = false
      if (bonoQ1 > 0 && diasQ1 > 0) { for (const s of trabQ1) s.ibcTrabDevengado += (bonoQ1 * s.dias) / diasQ1; bonoQ1Asignado = true }
      if (bonoQ2 > 0 && diasQ2 > 0) { for (const s of trabQ2) s.ibcTrabDevengado += (bonoQ2 * s.dias) / diasQ2; bonoQ2Asignado = true }
      if (bonoQ1 > 0 && !bonoQ1Asignado) excepciones.push({ persona: nombre, motivo: `Bono quincena 1 (${Math.round(bonoQ1)}) sin tramo trabajado donde asignarlo.` })
      if (bonoQ2 > 0 && !bonoQ2Asignado) excepciones.push({ persona: nombre, motivo: `Bono quincena 2 (${Math.round(bonoQ2)}) sin tramo trabajado donde asignarlo.` })

      // Piso de 1 SMLV proporcional -- UNA vez sobre el total del mes, no por tramo.
      const todosTrab = segmentos.filter((s) => s.tipo === "TRAB")
      const diasTrabTotal = todosTrab.reduce((s, x) => s + x.dias, 0)
      const ibcTrabTotal = todosTrab.reduce((s, x) => s + x.ibcTrabDevengado, 0)
      const pisoMes = (smlv / 30) * diasTrabTotal
      if (diasTrabTotal > 0 && ibcTrabTotal < pisoMes && ibcTrabTotal > 0) {
        const factor = pisoMes / ibcTrabTotal
        for (const s of todosTrab) s.ibcTrabDevengado *= factor
      }

      const tieneSalarioVariable = bonoQ1 > 0 || bonoQ2 > 0
      const ingEsteMes = ficha.fechaInicio && ficha.fechaInicio >= desde && ficha.fechaInicio <= hasta
      const retEsteMes = ficha.fechaRetiro && ficha.fechaRetiro >= desde && ficha.fechaRetiro <= hasta

      for (const seg of segmentos) {
        const entrada = {
          salario: ficha.salario,
          ibcTrabajado: seg.tipo === "TRAB" ? seg.ibcTrabDevengado : 0,
          diasTrabajados: seg.tipo === "TRAB" ? seg.dias : 0,
          diasVacaciones: seg.tipo === "VAC" ? seg.dias : 0,
          diasIncapacidad: seg.tipo === "INCAP" ? seg.dias : 0,
          diasAusentismo: seg.tipo === "AUS" ? seg.dias : 0,
          diasLicencia: seg.tipo === "LICR" ? seg.dias : 0,
          auxilio: 0,
          smlv,
          esAdmin: ficha.esAdmin,
          ibcTrabajadoEsReal: seg.tipo === "TRAB",
        }
        const ap = calcularAportes(entrada, { ...PARAFISCALES_DEFAULT, anio })
        noCounter++
        const fIni = `${anio}-${String(mes).padStart(2, "0")}-${String(seg.diaIni).padStart(2, "0")}`
        const fFin = `${anio}-${String(mes).padStart(2, "0")}-${String(seg.diaFin).padStart(2, "0")}`
        const llevaBono = seg.tipo === "TRAB" && ((seg.diaIni <= 15 && bonoQ1 > 0) || (seg.diaFin > 15 && bonoQ2 > 0))
        // Vacaciones de liquidación de retiro: se suman SOLO al segmento de
        // CIERRE (el que lleva `retFecha`), y SOLO al IBC/valor de Caja -- ver
        // comentario junto a `vacLiqPorCedula` más arriba.
        const esSegmentoCierre = retEsteMes && seg === segmentos[segmentos.length - 1]
        const vacLiqAplicada = esSegmentoCierre ? vacLiqPorCedula.get(ficha.identificacion) || 0 : 0
        const cajaIbcFila = ap.ibcCaja + vacLiqAplicada
        const cajaValorFila = ap.caja + vacLiqAplicada * (PARAFISCALES_DEFAULT.pctCaja / 100)
        // Tarifa combinada (empleador+empleado) calculada del valor real sobre el
        // IBC -- ya NO se puede hardcodear un único % fijo: pensión da 16% en
        // días normales pero 12% en ausentismo/suspensión (solo empleador), y
        // salud da 12.5%/4%(exonerado) en días normales pero 4% siempre en
        // incapacidad (el 8.5% patronal no se causa, ver lib/parafiscales.ts).
        const pensionTarifa = ap.ibcPension > 0 ? (ap.pensionEmpleador + ap.pensionEmpleado) / ap.ibcPension : 0
        const saludTarifa = ap.ibcSalud > 0 ? (ap.saludEmpleador + ap.saludEmpleado) / ap.ibcSalud : 0
        filasSalida.push({
          no: noCounter, tipoId: "CC", noId: ficha.identificacion,
          proyecto: est.proyecto, apellido1: est.apellido1 || "", apellido2: est.apellido2 || "", nombre1: est.nombre1 || "", nombre2: est.nombre2 || "",
          departamento: est.departamento, ciudad: est.ciudad, tipoCotizante: est.tipo_cotizante, subtipoCotizante: est.subtipo_cotizante,
          horasLaboradas: seg.dias * 7,
          vst: llevaBono ? "SI" : "NO", salarioVariable: tieneSalarioVariable ? "SI" : "NO",
          ingFecha: ingEsteMes && seg === segmentos[0] ? ficha.fechaInicio : null,
          retFecha: retEsteMes && seg === segmentos[segmentos.length - 1] ? ficha.fechaRetiro : null,
          tipoSegmento: seg.tipo, fechaIniSerial: serialExcel(fIni), fechaFinSerial: serialExcel(fFin),
          salarioMensual: ficha.salario,
          pensionAdmin: est.administradora_pension, pensionDias: seg.dias, pensionIbc: ap.ibcPension, pensionTarifa, pensionValor: ap.pensionEmpleador + ap.pensionEmpleado,
          saludAdmin: est.administradora_salud, saludDias: seg.dias, saludIbc: ap.ibcSalud, saludTarifa, saludValor: ap.saludEmpleador + ap.saludEmpleado,
          arlAdmin: est.administradora_arl, arlDias: seg.dias, arlIbc: ap.ibcArl, arlTarifa: ap.ibcArl > 0 ? ap.pctArl / 100 : 0, arlValor: ap.arl,
          claseRiesgo: est.clase_riesgo, centroTrabajo: est.centro_trabajo, actividadEconomica: est.actividad_economica,
          cajaAdmin: est.administradora_caja, cajaDias: seg.dias, cajaIbc: cajaIbcFila, cajaTarifa: cajaIbcFila > 0 ? PARAFISCALES_DEFAULT.pctCaja / 100 : 0, cajaValor: cajaValorFila,
          senaValor: ap.sena, icbfValor: ap.icbf, exonerado: ap.exonerado ? "SI" : "NO",
        })
      }
    }

    if (filasSalida.length === 0) {
      return { success: false, message: `No hay datos de nómina para ${mes}/${anio}.` }
    }

    // Cargar la plantilla real desde Storage y reemplazar solo los datos de
    // la hoja de Liquidaciones -- las demás hojas quedan intactas.
    const { data: plantillaBlob, error: dlErr } = await admin.storage.from("archivos").download(PLANTILLA_STORAGE_PATH)
    if (dlErr || !plantillaBlob) {
      return { success: false, message: `No se pudo leer la plantilla del archivo de carga: ${dlErr?.message || "no encontrada"}.` }
    }
    const plantillaBuf = Buffer.from(await plantillaBlob.arrayBuffer())
    const wb = XLSX.read(plantillaBuf, { type: "buffer" })
    const filasJulio = XLSX.utils.sheet_to_json(wb.Sheets[PLANTILLA_SHEET], { header: 1, defval: "" }) as any[][]
    // FIX 2026-09-11: el portal quitó la columna "Proyecto" (índice 3) de su
    // formato de exportación entre julio y agosto -- confirmado columna por
    // columna contra la planilla real de agosto (`addin ss 202608.xlsx`):
    // TODO lo demás coincide exacto una vez se quita esa única columna, en
    // las 99 columnas y en las 18 filas de encabezado por igual (no solo en
    // la tabla de empleados). La plantilla guardada (julio) todavía la
    // tiene, así que se quita aquí al clonar el encabezado -- ver el mismo
    // ajuste más abajo en `row.splice(3, 1)` para las filas de datos.
    const encabezado = filasJulio.slice(0, 18).map((fila) => {
      const f = [...fila]
      f.splice(3, 1)
      return f
    })

    const NO = "NO"
    const ESPACIOS15 = "               "
    const nuevasFilas: any[][] = []
    for (const f of filasSalida) {
      // Se sigue construyendo con los mismos 99 índices de siempre (para no
      // tener que re-numerar cada asignación de abajo) y se quita la columna
      // "Proyecto" (índice 3) al final con splice -- ver el comentario junto
      // a `encabezado` más arriba.
      const row = new Array(99).fill("")
      row[0] = f.no; row[1] = f.tipoId; row[2] = f.noId; row[3] = f.proyecto
      row[4] = f.apellido1; row[5] = f.apellido2; row[6] = f.nombre1; row[7] = f.nombre2
      row[8] = f.departamento; row[9] = f.ciudad; row[10] = f.tipoCotizante; row[11] = f.subtipoCotizante
      row[12] = f.horasLaboradas
      row[13] = NO; row[14] = NO; row[15] = ""
      row[16] = f.ingFecha ? "Todos los sistemas (ARL, AFP, CCF, EPS)" : NO
      row[17] = f.ingFecha ? serialExcel(f.ingFecha) : ""
      row[18] = f.retFecha ? "Todos los sistemas (ARL, AFP, CCF, EPS)" : NO
      row[19] = f.retFecha ? serialExcel(f.retFecha) : ""
      row[20] = NO; row[21] = NO; row[22] = NO; row[23] = NO
      row[24] = NO; row[25] = ""
      row[26] = f.vst
      row[27] = NO; row[28] = ""; row[29] = ""
      row[30] = NO; row[31] = ""; row[32] = ""
      row[33] = NO; row[34] = ""; row[35] = ""
      row[36] = NO; row[37] = ""; row[38] = ""
      row[39] = NO
      row[40] = NO; row[41] = ""; row[42] = ""
      row[43] = 0; row[44] = ""; row[45] = ""
      if (f.tipoSegmento === "AUS") { row[27] = "LICENCIA NO REMUNERADA"; row[28] = f.fechaIniSerial; row[29] = f.fechaFinSerial }
      if (f.tipoSegmento === "INCAP") { row[30] = "INCAPACIDAD GENERAL"; row[31] = f.fechaIniSerial; row[32] = f.fechaFinSerial }
      if (f.tipoSegmento === "VAC") { row[36] = "VACACIONES"; row[37] = f.fechaIniSerial; row[38] = f.fechaFinSerial }
      if (f.tipoSegmento === "LICR") { row[36] = "LICENCIA REMUNERADA"; row[37] = f.fechaIniSerial; row[38] = f.fechaFinSerial }
      row[46] = 0
      row[47] = f.salarioMensual
      row[48] = NO
      row[49] = f.salarioVariable
      row[50] = f.pensionAdmin; row[51] = f.pensionDias; row[52] = Math.round(f.pensionIbc); row[53] = f.pensionTarifa; row[54] = Math.round(f.pensionValor)
      row[55] = "Sin Riesgo"; row[56] = 0; row[57] = 0; row[58] = 0; row[59] = 0; row[60] = 0
      row[61] = Math.round(f.pensionValor)
      row[62] = "NINGUNA"
      row[63] = f.saludAdmin; row[64] = f.saludDias; row[65] = Math.round(f.saludIbc); row[66] = f.saludTarifa; row[67] = Math.round(f.saludValor)
      row[68] = 0; row[69] = ESPACIOS15; row[70] = 0; row[71] = ESPACIOS15; row[72] = 0
      row[73] = "NINGUNA"
      row[74] = f.arlAdmin; row[75] = f.arlDias; row[76] = Math.round(f.arlIbc); row[77] = f.arlTarifa
      row[78] = f.claseRiesgo; row[79] = f.centroTrabajo; row[80] = f.actividadEconomica
      row[81] = Math.round(f.arlValor)
      row[82] = f.cajaDias; row[83] = f.cajaAdmin; row[84] = Math.round(f.cajaIbc); row[85] = f.cajaTarifa; row[86] = Math.round(f.cajaValor)
      row[87] = 0
      row[88] = f.exonerado === "SI" ? 0 : 2; row[89] = Math.round(f.senaValor)
      row[90] = f.exonerado === "SI" ? 0 : 3; row[91] = Math.round(f.icbfValor)
      row[92] = 0; row[93] = 0; row[94] = 0; row[95] = 0
      row[96] = f.exonerado
      row[97] = ""; row[98] = ""
      row.splice(3, 1) // quitar "Proyecto" -- el portal ya no la trae (ver FIX 2026-09-11 arriba)
      nuevasFilas.push(row)
    }

    if (encabezado[9]) {
      const periodoAnterior = `${anio}-${String(mes).padStart(2, "0")}`
      for (let i = 0; i < encabezado[9].length; i++) {
        if (typeof encabezado[9][i] === "string" && /^\d{4}-\d{2}$/.test(encabezado[9][i])) encabezado[9][i] = periodoAnterior
      }
    }

    const nuevaHoja = XLSX.utils.aoa_to_sheet([...encabezado, ...nuevasFilas])
    wb.Sheets[PLANTILLA_SHEET] = nuevaHoja
    const buf = XLSX.write(wb, { bookType: "xlsx", type: "buffer" }) as Buffer
    const filename = `Planilla PILA ${String(mes).padStart(2, "0")}-${anio} (LIPgo - REVISAR antes de subir).xlsx`
    return { success: true, base64: buf.toString("base64"), filename, excepciones }
  } catch (e: any) {
    return { success: false, message: e?.message || "Error al generar el archivo de carga." }
  }
}

/** Backfill/edición manual de la ficha estática de una persona (proyecto, EPS, AFP, ARL, CCF, etc). */
export async function guardarFichaEstaticaParafiscal(payload: {
  identificacion: string
  proyecto?: string | null
  departamento?: string | null
  ciudad?: string | null
  tipo_cotizante?: string | null
  subtipo_cotizante?: string | null
  administradora_pension?: string | null
  administradora_salud?: string | null
  administradora_arl?: string | null
  administradora_caja?: string | null
  clase_riesgo?: string | null
  centro_trabajo?: string | null
  actividad_economica?: string | null
}): Promise<{ success: boolean; message?: string }> {
  if (!payload?.identificacion) return { success: false, message: "Falta la identificación." }
  try {
    const admin: any = await getSupabaseAdmin()
    const { error } = await admin
      .from("parafiscales_estatico")
      .upsert({ ...payload, updated_at: new Date().toISOString() }, { onConflict: "identificacion" })
    if (error) return { success: false, message: error.message }
    return { success: true }
  } catch (e: any) {
    return { success: false, message: e?.message || "Error al guardar la ficha." }
  }
}

export async function getFichaEstaticaParafiscal(identificacion: string): Promise<{ success: boolean; data?: any; message?: string }> {
  try {
    const admin: any = await getSupabaseAdmin()
    const { data, error } = await admin.from("parafiscales_estatico").select("*").eq("identificacion", identificacion).maybeSingle()
    if (error) return { success: false, message: error.message }
    return { success: true, data }
  } catch (e: any) {
    return { success: false, message: e?.message || "Error al leer la ficha." }
  }
}
