"use server"

// Exportador del archivo de CARGA de Aportes en Línea (PILA) -- distinto del
// "cuadro de control" de parafiscales-actions.ts (que solo muestra números en
// pantalla). Este módulo genera el ARCHIVO PLANO real de ancho fijo que exige
// el operador (Anexo Técnico 2, Resolución 2388/2016 -- ver
// `lib/pila-planoformat.ts` para las posiciones exactas), NO un Excel. Hasta
// el 2026-09-11 generaba un .xlsx clonando una plantilla; se reemplazó porque
// el usuario compartió el archivo plano REAL del último pago (agosto-2026,
// `Agosto_2026_LIPPROGRESSIVEINTEGRALLOGISTICSSAS_Pila.txt`) y pidió que el
// generador produjera ese mismo formato -- se validó campo por campo contra
// ese archivo y contra datos reales de 5 trabajadores antes de implementar
// (ver el plan de este cambio).
//
// Fuente de verdad del CÁLCULO de cada columna (esto NO cambió con el
// formato): auditada contra la planilla real de julio-2026, 2026-09-07.
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
import { calcularAportes, PARAFISCALES_DEFAULT, clasificarDiaCotizacion, type TipoDiaCotizacion, type ClaseRiesgo } from "@/lib/parafiscales"
import { getLiquidaciones } from "@/lib/liquidaciones-actions"
import { armarRegistroTipo01, armarRegistroTipo02, type DatosDetallePila02 } from "@/lib/pila-planoformat"
import { codigoAfp, codigoEps, codigoDivipola } from "@/lib/pila-codigos-oficiales"

function finDeMes(anio: number, mes: number): string {
  const d = new Date(Date.UTC(anio, mes, 0))
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`
}

// "1. DEPENDIENTE" -> "01"; "NINGUNO" -> "00" (sin dígito líder = sin subtipo).
function codigoCotizante(texto: string | null | undefined): string {
  const m = String(texto || "").match(/^(\d+)/)
  return m ? m[1].padStart(2, "0") : "00"
}

const CLASE_RIESGO_DIGITO: Record<ClaseRiesgo, string> = { I: "1", II: "2", III: "3", IV: "4", V: "5" }

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
 * Genera el archivo plano PILA de ancho fijo de un mes (registro tipo 01 +
 * un registro tipo 02 por tramo de novedad de cada trabajador). Devuelve el
 * archivo en base64 (para descargar desde el cliente) + la lista de
 * excepciones a revisar manualmente (personas sin ficha estática, sin código
 * oficial de administradora mapeado, bono repartido entre varios tramos del
 * mismo tipo, etc.).
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
        .select("persona, fecha, total_liquidado_dia, novedad_reportada")
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

    // Bono de productividad REAL: se lee directo de `archivoplano` (la ÚNICA
    // fuente que de verdad se envía a Siigo) en vez de re-derivarlo aquí con
    // otra fórmula -- confirmado por el usuario 2026-09-11 tras encontrar que
    // las dos formas NO daban lo mismo (caso real DEIVID PARRA OSSA: $312.218
    // re-derivados aquí vs $204.299 reales en archivoplano, porque esa vista
    // excluye el día de cierre de la quincena y funde el Ajuste Nómina
    // Anterior -- lógica que este archivo no debe duplicar NUNCA: un solo
    // punto de cálculo para el mismo número). `archivoplano.anio` es NUEVO
    // (scripts/archivoplano_reemplazo.sql, columna agregada el mismo día)
    // para poder filtrar el mes sin mezclar años distintos.
    const identificaciones = Array.from(info.values()).map((i) => i.identificacion).filter(Boolean)
    const bonoRealPorCedulaQuincena = new Map<string, number>()
    if (identificaciones.length > 0) {
      const { data: bonoRows, error: bonoErr } = await admin
        .from("archivoplano")
        .select("identificacionempleado, quincena, cantidadvalor")
        .in("identificacionempleado", identificaciones)
        .eq("anio", anio)
        .eq("mes", String(mes).padStart(2, "0"))
        .eq("tiponovedad", "Valor")
        .or("nombrenovedad.ilike.%Por Productividad%,nombrenovedad.ilike.%Ajuste Toneladas%")
      // Fallar RUIDOSO si la columna `anio` todavía no existe (falta correr
      // scripts/archivoplano_reemplazo.sql en Supabase) -- nunca generar un
      // archivo plano con bono $0 para todo el mundo en silencio.
      if (bonoErr) {
        return {
          success: false,
          message: `No se pudo leer el bono real de archivoplano (${bonoErr.message}). Probablemente falta correr scripts/archivoplano_reemplazo.sql en Supabase.`,
        }
      }
      for (const b of bonoRows || []) {
        const clave = `${String(b.identificacionempleado).trim()}-${b.quincena}`
        bonoRealPorCedulaQuincena.set(clave, (bonoRealPorCedulaQuincena.get(clave) || 0) + Number(b.cantidadvalor || 0))
      }
    }

    const excepciones: ExcepcionExportador[] = []
    const registrosDetalle: DatosDetallePila02[] = []
    let noCounter = 0
    let valorTotalNomina = 0

    for (const [nombre, dias] of porPersona) {
      const ficha = info.get(nombre)!
      const est = plantilla.get(ficha.identificacion)
      if (!est) {
        excepciones.push({ persona: `${nombre} (${ficha.identificacion})`, motivo: "Sin ficha estática (proyecto/EPS/AFP/CCF) -- agrégala en Parafiscales antes de exportar." })
        continue
      }
      dias.sort((a, b) => a.fecha.localeCompare(b.fecha))

      // Bono real ya calculado por `archivoplano` -- ver comentario arriba de
      // `bonoRealPorCedulaQuincena`. Ya viene con el piso 0 aplicado (la vista
      // solo emite la fila si `bono_final > 0`), así que no hay que repetirlo.
      const bonoQ1 = bonoRealPorCedulaQuincena.get(`${ficha.identificacion}-1`) || 0
      const bonoQ2 = bonoRealPorCedulaQuincena.get(`${ficha.identificacion}-2`) || 0

      // TRAB se consolida en UN SOLO segmento para todo el mes, sin importar
      // cuántas veces se interrumpa por otra novedad (incapacidad, suspensión,
      // vacaciones...) -- verificado campo por campo contra el archivo real de
      // agosto-2026 (Anexo Técnico 2): el registro tipo 02 de "días trabajados"
      // es UNO por persona por mes, con la suma completa de días/IBC, mientras
      // que cada OTRA novedad sí sigue reportándose en su propio tramo (fusión
      // solo si son días consecutivos de la MISMA novedad). Antes de este fix
      // (2026-09-11) un trabajador con, por ejemplo, dos días de suspensión no
      // consecutivos partía su TRAB en 3 pedazos -- no coincidía con el archivo
      // real, que siempre trae un único renglón de días trabajados.
      const segmentos: Segmento[] = []
      let segmentoTrab: Segmento | null = null
      for (const r of dias) {
        const fecha = String(r.fecha)
        const diaMes = Number(fecha.slice(8, 10))
        const esDia31 = diaMes === 31
        if (ficha.fechaRetiro && !ficha.esActivo && fecha.slice(0, 10) > ficha.fechaRetiro) continue
        if (ficha.fechaInicio && fecha.slice(0, 10) < ficha.fechaInicio) continue
        const tipo = clasificarDiaCotizacion(r.novedad_reportada)
        if (tipo === "RETIRO") continue

        if (tipo === "TRAB") {
          if (!segmentoTrab) {
            segmentoTrab = { tipo: "TRAB", diaIni: diaMes, diaFin: diaMes, dias: 0, ibcTrabDevengado: 0 }
            segmentos.push(segmentoTrab)
          }
          // El día 31 NO cuenta ni como día ni como valor (mes de 30 días,
          // ver pagonomina_reemplazo.sql) -- BUG REAL corregido 2026-09-11:
          // antes sí se sumaba su `total_liquidado_dia`, algo inofensivo
          // cuando ese día pagaba $0 base (regla vieja, hasta 2026-08-30),
          // pero desde el 2026-08-31 pagonomina le paga BASE COMPLETA (un
          // día normal más), así que sumarlo aquí inflaba el mes en un día
          // extra de salario. Confirmado con datos reales: DEIVER LOPEZ DE
          // LA ROSA, agosto-2026, exactamente +$58.364 (un día) de más. El
          // destajo/exceso de ese día NO se pierde: pagonomina lo manda a
          // `bonif_prestacional`, que archivoplano YA excluye de esta
          // quincena y difiere a la siguiente vía Ajuste Nómina Anterior --
          // ese dinero llega por el bono real que se lee de archivoplano,
          // no debe contarse aquí también.
          if (!esDia31) {
            segmentoTrab.dias += 1
            segmentoTrab.diaFin = diaMes
            segmentoTrab.ibcTrabDevengado += Number(r.total_liquidado_dia || 0)
          }
          continue
        }
        if (esDia31) continue // otras novedades no se reportan el día 31

        const last = segmentos[segmentos.length - 1]
        if (last && last.tipo === tipo && last.diaFin === diaMes - 1) {
          last.diaFin = diaMes
          last.dias += 1
        } else {
          segmentos.push({ tipo, diaIni: diaMes, diaFin: diaMes, dias: 1, ibcTrabDevengado: 0 })
        }
      }

      // El tramo TRAB siempre va PRIMERO en el archivo real (verificado),
      // aunque el primer día calendario del mes no sea un día trabajado (ej.
      // arranca con una incapacidad) -- `segmentoTrab` puede haberse insertado
      // en cualquier posición según el orden cronológico en que se recorrieron
      // los días; se reordena aquí sin tocar el resto de la secuencia.
      if (segmentoTrab && segmentos[0] !== segmentoTrab) {
        segmentos.splice(segmentos.indexOf(segmentoTrab), 1)
        segmentos.unshift(segmentoTrab)
      }

      // El bono de productividad de las 2 quincenas se suma completo al ÚNICO
      // segmento TRAB del mes (ya no hay que repartirlo proporcional entre
      // varios tramos -- solo puede haber uno).
      if (segmentoTrab) {
        segmentoTrab.ibcTrabDevengado += bonoQ1 + bonoQ2
      } else if (bonoQ1 > 0 || bonoQ2 > 0) {
        excepciones.push({ persona: nombre, motivo: `Bono de productividad (${Math.round(bonoQ1 + bonoQ2)}) sin días trabajados en el mes donde asignarlo.` })
      }

      // Piso de 1 SMLV -- sobre el único segmento TRAB del mes.
      const todosTrab = segmentoTrab ? [segmentoTrab] : []
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
        // Ingreso/retiro (y las vacaciones de liquidación, ver más abajo) van
        // en el tramo TRAB cuando existe -- verificado contra el archivo real:
        // el retiro se marca en la fila de días trabajados, no en la última
        // fila del array por posición (que podía ser cualquier otra novedad
        // si el mes terminaba, por ejemplo, en una incapacidad).
        const esPrimerSegmento = segmentoTrab ? seg === segmentoTrab : seg === segmentos[0]
        const esSegmentoCierre = segmentoTrab ? seg === segmentoTrab : seg === segmentos[segmentos.length - 1]
        const vacLiqAplicada = retEsteMes && esSegmentoCierre ? vacLiqPorCedula.get(ficha.identificacion) || 0 : 0
        const cajaIbcFila = ap.ibcCaja + vacLiqAplicada
        const cajaValorFila = ap.caja + vacLiqAplicada * (PARAFISCALES_DEFAULT.pctCaja / 100)
        // Tarifa combinada (empleador+empleado) calculada del valor real sobre el
        // IBC -- ya NO se puede hardcodear un único % fijo: pensión da 16% en
        // días normales pero 12% en ausentismo/suspensión (solo empleador), y
        // salud da 12.5%/4%(exonerado) en días normales pero 4% siempre en
        // incapacidad (el 8.5% patronal no se causa, ver lib/parafiscales.ts).
        // `campoTarifa` (pila-planoformat.ts) espera PORCENTAJE (ej. 16), por
        // eso se multiplica por 100 la fracción que sale de calcularAportes.
        const pensionTarifaPct = (ap.ibcPension > 0 ? (ap.pensionEmpleador + ap.pensionEmpleado) / ap.ibcPension : 0) * 100
        const saludTarifaPct = (ap.ibcSalud > 0 ? (ap.saludEmpleador + ap.saludEmpleado) / ap.ibcSalud : 0) * 100

        const codAfp = codigoAfp(est.administradora_pension)
        const codEps = codigoEps(est.administradora_salud)
        if (!codAfp || !codEps) {
          excepciones.push({
            persona: `${nombre} (${ficha.identificacion})`,
            motivo: `Administradora sin código oficial mapeado: ${!codAfp ? `pensión "${est.administradora_pension}"` : ""}${!codAfp && !codEps ? " y " : ""}${!codEps ? `salud "${est.administradora_salud}"` : ""} -- agrégala en lib/pila-codigos-oficiales.ts.`,
          })
        }
        const [divipolaDepto, divipolaMunicipio] = codigoDivipola(est.ciudad).split("-")
        const centroTrabajoNum = Number(String(est.centro_trabajo || "").match(/(\d+)$/)?.[1] || 0)

        valorTotalNomina += cajaIbcFila
        registrosDetalle.push({
          secuencia: noCounter,
          identificacion: ficha.identificacion,
          tipoCotizante: codigoCotizante(est.tipo_cotizante),
          subtipoCotizante: codigoCotizante(est.subtipo_cotizante),
          divipolaDepto, divipolaMunicipio,
          apellido1: est.apellido1 || "", apellido2: est.apellido2 || "", nombre1: est.nombre1 || "", nombre2: est.nombre2 || "",
          ing: ingEsteMes && esPrimerSegmento ? "X" : "",
          ret: retEsteMes && esSegmentoCierre ? "X" : "",
          vst: llevaBono ? "X" : "",
          sln: seg.tipo === "AUS" ? "X" : "",
          ige: seg.tipo === "INCAP" ? "X" : "",
          lma: "",
          vacLr: seg.tipo === "VAC" ? "X" : seg.tipo === "LICR" ? "L" : "",
          codAfp, codEps, codCcf: est.administradora_caja || null,
          diasPension: seg.dias, diasSalud: seg.dias, diasArl: seg.dias, diasCcf: seg.dias,
          salario: ficha.salario,
          tipoSalario: tieneSalarioVariable ? "V" : "F",
          ibcPension: ap.ibcPension, ibcSalud: ap.ibcSalud, ibcArl: ap.ibcArl, ibcCcf: cajaIbcFila,
          tarifaPensionPct: pensionTarifaPct,
          cotizacionPension: ap.pensionEmpleador + ap.pensionEmpleado,
          tarifaSaludPct: saludTarifaPct,
          cotizacionSalud: ap.saludEmpleador + ap.saludEmpleado,
          tarifaArlPct: ap.pctArl,
          centroTrabajo: centroTrabajoNum,
          cotizacionArl: ap.arl,
          tarifaCcfPct: cajaIbcFila > 0 ? PARAFISCALES_DEFAULT.pctCaja : 0,
          valorCcf: cajaValorFila,
          tarifaSenaPct: ap.exonerado ? 0 : PARAFISCALES_DEFAULT.pctSena,
          valorSena: ap.sena,
          tarifaIcbfPct: ap.exonerado ? 0 : PARAFISCALES_DEFAULT.pctIcbf,
          valorIcbf: ap.icbf,
          exonerado: ap.exonerado,
          claseRiesgo: CLASE_RIESGO_DIGITO[ap.claseArl],
          fechaIngreso: ingEsteMes && esPrimerSegmento ? ficha.fechaInicio : null,
          fechaRetiro: retEsteMes && esSegmentoCierre ? ficha.fechaRetiro : null,
          fechaInicioSln: seg.tipo === "AUS" ? fIni : null,
          fechaFinSln: seg.tipo === "AUS" ? fFin : null,
          fechaInicioIge: seg.tipo === "INCAP" ? fIni : null,
          fechaFinIge: seg.tipo === "INCAP" ? fFin : null,
          fechaInicioVacLr: seg.tipo === "VAC" || seg.tipo === "LICR" ? fIni : null,
          fechaFinVacLr: seg.tipo === "VAC" || seg.tipo === "LICR" ? fFin : null,
          ibcOtrosParafiscales: ap.baseParafiscales,
          horasLaboradas: seg.tipo === "TRAB" ? seg.dias * 7 : 0,
          actividadEconomica: est.actividad_economica || "",
        })
      }
    }

    if (registrosDetalle.length === 0) {
      return { success: false, message: `No hay datos de nómina para ${mes}/${anio}.` }
    }

    const cotizantesUnicos = new Set(registrosDetalle.map((r) => r.identificacion)).size
    const lineaEncabezado = armarRegistroTipo01({ anio, mes, numCotizantes: cotizantesUnicos, valorTotalNomina })
    const lineasDetalle = registrosDetalle.map((r) => armarRegistroTipo02(r))
    const contenido = [lineaEncabezado, ...lineasDetalle].join("\r\n")
    const filename = `Planilla PILA ${String(mes).padStart(2, "0")}-${anio} (LIPgo - REVISAR antes de subir).txt`
    return { success: true, base64: Buffer.from(contenido, "utf8").toString("base64"), filename, excepciones }
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
  apellido1?: string | null
  apellido2?: string | null
  nombre1?: string | null
  nombre2?: string | null
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

export interface FilaFichaEstatica {
  identificacion: string
  nombre: string
  idempresa: number | null
  tieneFicha: boolean
  proyecto: string | null
  departamento: string | null
  ciudad: string | null
  tipo_cotizante: string | null
  subtipo_cotizante: string | null
  administradora_pension: string | null
  administradora_salud: string | null
  administradora_arl: string | null
  administradora_caja: string | null
  clase_riesgo: string | null
  centro_trabajo: string | null
  actividad_economica: string | null
  apellido1: string | null
  apellido2: string | null
  nombre1: string | null
  nombre2: string | null
}

/**
 * Headcount activo (con contrato SIIGO) cruzado con `parafiscales_estatico`,
 * para la pantalla de mantenimiento de la ficha -- así se ve, de un vistazo,
 * quién todavía no tiene ficha (necesaria para el archivo plano PILA) en vez
 * de tener que ir a buscarlo a mano en la base de datos.
 */
export async function listarFichasEstaticas(): Promise<{ success: boolean; data: FilaFichaEstatica[]; message?: string }> {
  try {
    const admin: any = await getSupabaseAdmin()
    const { data: personal, error: hErr } = await admin
      .from("headcount")
      .select("identificacion, nombre, idempresa, estado, contratosiigo")
      .not("nombre", "ilike", "%prueba%")
      .order("nombre", { ascending: true })
    if (hErr) return { success: false, data: [], message: hErr.message }
    const { data: fichas, error: fErr } = await admin.from("parafiscales_estatico").select("*")
    if (fErr) return { success: false, data: [], message: fErr.message }
    const fichaPorCedula = new Map<string, any>()
    for (const f of fichas || []) fichaPorCedula.set(String(f.identificacion).trim(), f)

    const vistos = new Set<string>()
    const out: FilaFichaEstatica[] = []
    for (const h of personal || []) {
      const nombre = String(h.nombre || "").trim()
      const identificacion = String(h.identificacion || "").trim()
      if (!nombre || !identificacion || !String(h.contratosiigo || "").trim()) continue
      if (String(h.estado || "").trim().toUpperCase() !== "ACTIVO") continue
      if (vistos.has(identificacion)) continue
      vistos.add(identificacion)
      const f = fichaPorCedula.get(identificacion)
      out.push({
        identificacion,
        nombre,
        idempresa: h.idempresa ?? null,
        tieneFicha: !!f,
        proyecto: f?.proyecto ?? null,
        departamento: f?.departamento ?? null,
        ciudad: f?.ciudad ?? null,
        tipo_cotizante: f?.tipo_cotizante ?? null,
        subtipo_cotizante: f?.subtipo_cotizante ?? null,
        administradora_pension: f?.administradora_pension ?? null,
        administradora_salud: f?.administradora_salud ?? null,
        administradora_arl: f?.administradora_arl ?? null,
        administradora_caja: f?.administradora_caja ?? null,
        clase_riesgo: f?.clase_riesgo ?? null,
        centro_trabajo: f?.centro_trabajo ?? null,
        actividad_economica: f?.actividad_economica ?? null,
        apellido1: f?.apellido1 ?? null,
        apellido2: f?.apellido2 ?? null,
        nombre1: f?.nombre1 ?? null,
        nombre2: f?.nombre2 ?? null,
      })
    }
    // Sin ficha primero -- son las que urge completar.
    out.sort((a, b) => Number(a.tieneFicha) - Number(b.tieneFicha) || a.nombre.localeCompare(b.nombre))
    return { success: true, data: out }
  } catch (e: any) {
    return { success: false, data: [], message: e?.message || "Error al listar las fichas." }
  }
}
