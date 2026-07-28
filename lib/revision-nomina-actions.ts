"use server"

// Revisión de nómina (Gestión Humana › Nómina): arma, para un colaborador y una
// quincena, el CUADRO DEFINITIVO del nuevo modelo de liquidación:
//   A) Liquidación diaria — cada día trabajado paga su BASE; el turno suma recargos.
//   B) Resumen de quincena — base garantizada + ingreso por turno + bono neto de
//      destajo (excedente de toneladas neteado por quincena, todo prestacional).
//   C) Archivo plano → Siigo — las novedades tal como salen (bono + horas extra + días).
// Es un LECTOR de las vistas `pagonomina` y `archivoplano` (fuente de verdad). No
// escribe nada. Mismo patrón que parafiscales-actions / liquidaciones-actions.

import { getSupabaseAdmin } from "@/lib/supabase-admin"
import { getMetasToneladas } from "@/lib/metas-toneladas-actions"

export interface ColaboradorRef {
  persona: string
  identificacion: string
  empresa: number | null
  estado: string
}

export interface DiaRevision {
  fecha: string
  dow: string
  tipo: string
  actividad: string
  novedad: string
  toneladas: number
  pagoProduccion: number
  base: number
  recargos: number
  domingo: number
  excedente: number // destajo con signo (prod - base); 0 si no es destajo
  total: number
  esDestajo: boolean
  anomalia: boolean // Cargue/Descargue con 0 toneladas (a corregir)
  meta: number // meta de toneladas del proyecto ese día (0 si no configurada)
  cumpleMeta: boolean // solo destajo: toneladas >= meta
  hcDia: number // HC real: trabajadores que movieron toneladas ese día en el proyecto
}

export interface MetaResumen {
  configurada: boolean
  metaReferencia: number // meta ton/trab/día del proyecto principal del colaborador
  diasDestajo: number
  diasCumple: number
  diasBajo: number
  toneladasMovidas: number
  toneladasMeta: number // meta acumulada del período (Σ meta de los días de destajo)
  promedioDia: number
  pctCumplimiento: number // días que cumplió la meta / días de destajo
  hcConfigurado: number // head count planeado del proyecto (tab Metas)
  hcPromedioReal: number // head count real promedio (trabajadores que asistieron a destajo)
}

export interface ResumenRevision {
  baseGarantizada: number
  ingresoTurno: number
  recargoDominical: number
  netoDestajo: number
  bono: number
  perdida: number
  total: number
  diasDestajo: number
  diasAltos: number
  diasBajos: number
  anomalias: number
}

export interface PlanoRevision {
  nombrenovedad: string
  tiponovedad: string
  cantidadvalor: number
  nominaproyectada: number
  fechainicio: string | null
}

// --- Simulación del pago en SIIGO (cruce contra el Total quincena de LIPgo) ---
export interface ConceptoSiigo {
  concepto: string
  tipo: string // "Base" | "Valor" | "Horas" | "Dias"
  cantidad: number
  unidad: string // "días" | "h" | ""
  factor: string // cómo lo valora Siigo (×1,25 / paga 66,67% / valor directo…)
  valor: number // efecto NETO en el pago (los días descontados van en negativo)
}

export interface CruceComponente {
  nombre: string
  lipgo: number
  siigo: number
}

export interface SimulacionSiigo {
  disponible: boolean
  jornada: number
  hod: number // valor hora ordinaria = salario / (30 × jornada vigente)
  baseQuincenal: number // 15 días × salario/30 (convención 30 días de Siigo)
  conceptos: ConceptoSiigo[]
  totalSiigo: number
  totalLipgo: number
  diferencia: number // totalSiigo − totalLipgo
  cuadra: boolean
  componentes: CruceComponente[]
  explicaciones: string[]
}

export interface RevisionNominaData {
  colaborador: {
    persona: string
    identificacion: string
    salario: number
    baseDia: number
    empresa: number | null
    contratosiigo: string
  }
  quincena: { anio: number; mes: number; num: number; desde: string; hasta: string }
  dias: DiaRevision[]
  resumen: ResumenRevision
  metaResumen: MetaResumen
  plano: PlanoRevision[]
  siigo: SimulacionSiigo
}

const DOW = ["Do", "Lu", "Ma", "Mi", "Ju", "Vi", "Sa"]
const num = (v: any) => Number(v || 0)
const fin = (anio: number, mes: number) => new Date(anio, mes, 0).getDate()

/** Colaboradores para el selector (Head Count, activos primero). */
export async function getColaboradores(): Promise<{ success: boolean; data: ColaboradorRef[]; message?: string }> {
  try {
    const admin: any = await getSupabaseAdmin()
    const { data, error } = await admin
      .from("headcount")
      .select("nombre, identificacion, idempresa, estado")
      .order("estado", { ascending: true })
      .order("nombre", { ascending: true })
    if (error) return { success: false, data: [], message: error.message }
    const vistos = new Set<string>()
    const out: ColaboradorRef[] = []
    for (const r of data || []) {
      const persona = String(r.nombre || "").trim()
      if (!persona || /prueba/i.test(persona)) continue
      if (vistos.has(persona)) continue
      vistos.add(persona)
      out.push({
        persona,
        identificacion: String(r.identificacion || "").trim(),
        empresa: r.idempresa != null ? Number(r.idempresa) : null,
        estado: String(r.estado || "").trim() || "—",
      })
    }
    return { success: true, data: out }
  } catch (e: any) {
    return { success: false, data: [], message: e?.message || "Error al leer colaboradores." }
  }
}

/** Cuadro completo (A/B/C) de un colaborador para una quincena. */
export async function getRevisionNomina(
  persona: string,
  anio: number,
  mes: number,
  quincena: 1 | 2,
): Promise<{ success: boolean; data?: RevisionNominaData; message?: string }> {
  try {
    if (!persona) return { success: false, message: "Selecciona un colaborador." }
    const admin: any = await getSupabaseAdmin()

    const diaIni = quincena === 1 ? 1 : 16
    const diaFin = quincena === 1 ? 15 : fin(anio, mes)
    const desde = `${anio}-${String(mes).padStart(2, "0")}-${String(diaIni).padStart(2, "0")}`
    const hasta = `${anio}-${String(mes).padStart(2, "0")}-${String(diaFin).padStart(2, "0")}`

    // Ficha del colaborador (Head Count)
    const { data: hc } = await admin
      .from("headcount")
      .select("nombre, identificacion, salario, idempresa, contratosiigo")
      .eq("nombre", persona)
      .limit(1)
      .maybeSingle()
    const identificacion = String(hc?.identificacion || "").trim()
    const salario = num(hc?.salario)
    const baseDia = salario > 0 ? salario / 30 : 58364

    // A) Días de la quincena (pagonomina — modelo nuevo ya liquida base por día)
    const { data: filas, error: errPn } = await admin
      .from("pagonomina")
      .select(
        "fecha, idempresa, idempresaliquidacion, actividad_registrada, novedad_reportada, especialidad, toneladas, pago_produccion, base_dia, bonif_prestacional, hed, hedf, hen, hef, hn, pago_domingo, recargodominical, total_liquidado_dia",
      )
      .eq("persona", persona)
      .gte("fecha", desde)
      .lte("fecha", hasta)
      .order("fecha", { ascending: true })
    if (errPn) return { success: false, message: errPn.message }

    // Metas de toneladas por proyecto (idempresa) — indicador de productividad.
    const metasRes = await getMetasToneladas()
    const metaObjPorEmpresa = new Map<number, { meta: number; hc: number }>()
    for (const m of metasRes.data || [])
      metaObjPorEmpresa.set(m.idempresa, { meta: m.metaTonTrabajadorDia, hc: m.hc })

    // HC REAL por día: trabajadores que movieron toneladas ese día en el proyecto
    // (asistencia ya ratificada en pagonomina). El HC varía a diario según el volumen.
    const proyectos = new Set<number>()
    for (const r of filas || []) {
      const esp = r.especialidad === true || String(r.especialidad) === "true"
      if (num(r.toneladas) > 0 && !esp && r.idempresaliquidacion != null) proyectos.add(Number(r.idempresaliquidacion))
    }
    const hcPorFechaEmp = new Map<string, Set<string>>()
    if (proyectos.size > 0) {
      const { data: hcRows } = await admin
        .from("pagonomina")
        .select("fecha, persona, idempresaliquidacion, especialidad")
        .in("idempresaliquidacion", Array.from(proyectos))
        .gte("fecha", desde)
        .lte("fecha", hasta)
        .gt("toneladas", 0)
      for (const r of hcRows || []) {
        if (r.especialidad === true || String(r.especialidad) === "true") continue
        const key = String(r.fecha).slice(0, 10) + "|" + Number(r.idempresaliquidacion)
        if (!hcPorFechaEmp.has(key)) hcPorFechaEmp.set(key, new Set())
        hcPorFechaEmp.get(key)!.add(String(r.persona || "").trim())
      }
    }
    const hcReal = (fecha: string, emp: number) => hcPorFechaEmp.get(fecha + "|" + emp)?.size || 0

    const dias: DiaRevision[] = []
    let baseGar = 0,
      ingTurno = 0,
      recDom = 0,
      neto = 0,
      diasDestajo = 0,
      diasAltos = 0,
      diasBajos = 0,
      anomalias = 0,
      diasCumpleMeta = 0,
      toneladasMovidas = 0,
      toneladasMeta = 0,
      // Dominical partido para el cruce Siigo: el domingo TRABAJADO va como novedad
      // (08/25) en el plano; el descanso dominical va DENTRO de la base quincenal.
      domTrabajado = 0,
      domDescanso = 0,
      empresa: number | null = hc?.idempresa != null ? Number(hc.idempresa) : null

    for (const r of filas || []) {
      const d = new Date(String(r.fecha).slice(0, 10) + "T12:00:00Z")
      const ton = num(r.toneladas)
      const prod = num(r.pago_produccion)
      const base = num(r.base_dia)
      const esp = r.especialidad === true || String(r.especialidad) === "true"
      const nov = String(r.novedad_reportada || "").trim()
      const act = String(r.actividad_registrada || "").trim()
      const recargos = num(r.hed) + num(r.hedf) + num(r.hen) + num(r.hef) + num(r.hn)
      const domingo = num(r.pago_domingo) + num(r.recargodominical)
      const total = num(r.total_liquidado_dia)
      const esDestajo = ton > 0 && !esp
      const esFestivo = /festivo/i.test(act)
      const anomalia = /cargue|descargue/i.test(act) && ton === 0 && !esp && base > 0 && nov === "" && !esFestivo
      const excedente = esDestajo ? prod - base : 0

      let tipo: string
      if (esDestajo) tipo = "Destajo"
      else if (esp) tipo = "Turno"
      else if (esFestivo) tipo = "Festivo"
      else if (nov) tipo = "Novedad"
      else if (total > 0) tipo = "Descanso"
      else tipo = "Sin registro"

      // Proyecto del día (idempresaliquidacion = donde se movió el tonelaje).
      const empDia =
        r.idempresaliquidacion != null ? Number(r.idempresaliquidacion) : r.idempresa != null ? Number(r.idempresa) : 0
      // Meta de toneladas del proyecto de ese día (indicador de productividad).
      const metaDia = empDia ? metaObjPorEmpresa.get(empDia)?.meta || 0 : 0
      const cumpleMeta = esDestajo && metaDia > 0 ? ton >= metaDia : false
      const hcDia = esDestajo ? hcReal(String(r.fecha).slice(0, 10), empDia) : 0

      // Descomposición del total del día: base = total − recargos − dominical
      const basePortion = Math.max(0, total - recargos - domingo)
      if (total > 0) baseGar += basePortion
      ingTurno += recargos
      recDom += domingo
      if (domingo > 0) {
        if (esDestajo || esp) domTrabajado += domingo
        else domDescanso += domingo
      }
      if (esDestajo) {
        neto += excedente
        diasDestajo += 1
        if (excedente >= 0) diasAltos += 1
        else diasBajos += 1
        toneladasMovidas += ton
        if (metaDia > 0) {
          toneladasMeta += metaDia
          if (cumpleMeta) diasCumpleMeta += 1
        }
      }
      if (anomalia) anomalias += 1
      if (empresa == null && r.idempresa != null) empresa = Number(r.idempresa)

      dias.push({
        fecha: String(r.fecha).slice(0, 10),
        dow: DOW[d.getUTCDay()],
        tipo,
        actividad: act,
        novedad: nov,
        toneladas: ton,
        pagoProduccion: prod,
        base: basePortion,
        recargos,
        domingo,
        excedente,
        total,
        esDestajo,
        anomalia,
        meta: metaDia,
        cumpleMeta,
        hcDia,
      })
    }

    // Resumen de cumplimiento de META (productividad). La meta de referencia es la
    // del proyecto principal del colaborador (su empresa); días con meta configurada.
    const metaReferencia = empresa != null ? metaObjPorEmpresa.get(empresa)?.meta || 0 : 0
    const hcConfigurado = empresa != null ? metaObjPorEmpresa.get(empresa)?.hc || 0 : 0
    const diasConMeta = dias.filter((x) => x.esDestajo && x.meta > 0).length
    const diasDestajoArr = dias.filter((x) => x.esDestajo && x.hcDia > 0)
    const hcPromedioReal =
      diasDestajoArr.length > 0 ? diasDestajoArr.reduce((a, x) => a + x.hcDia, 0) / diasDestajoArr.length : 0
    const metaResumen: MetaResumen = {
      configurada: metaReferencia > 0 || diasConMeta > 0,
      metaReferencia,
      diasDestajo,
      diasCumple: diasCumpleMeta,
      diasBajo: Math.max(0, diasConMeta - diasCumpleMeta),
      toneladasMovidas,
      toneladasMeta,
      promedioDia: diasDestajo > 0 ? toneladasMovidas / diasDestajo : 0,
      pctCumplimiento: diasConMeta > 0 ? (diasCumpleMeta / diasConMeta) * 100 : 0,
      hcConfigurado,
      hcPromedioReal,
    }

    const bono = Math.max(0, neto)
    const perdida = Math.max(0, -neto)
    const resumen: ResumenRevision = {
      baseGarantizada: baseGar,
      ingresoTurno: ingTurno,
      recargoDominical: recDom,
      netoDestajo: neto,
      bono,
      perdida,
      total: baseGar + ingTurno + recDom + bono,
      diasDestajo,
      diasAltos,
      diasBajos,
      anomalias,
    }

    // C) Archivo plano (novedades a Siigo) para ese id + mes + quincena
    let plano: PlanoRevision[] = []
    if (identificacion) {
      const { data: pl } = await admin
        .from("archivoplano")
        .select("nombrenovedad, tiponovedad, cantidadvalor, nominaproyectada, fechainicio, quincena, mes")
        .eq("identificacionempleado", identificacion)
        .eq("mes", String(mes).padStart(2, "0"))
        .eq("quincena", quincena)
      plano = (pl || []).map((p: any) => ({
        nombrenovedad: String(p.nombrenovedad || ""),
        tiponovedad: String(p.tiponovedad || ""),
        cantidadvalor: num(p.cantidadvalor),
        nominaproyectada: num(p.nominaproyectada),
        fechainicio: p.fechainicio || null,
      }))
    }

    // D) SIMULACIÓN SIIGO — replica el proceso de liquidación de Siigo al ingerir el
    // archivo plano, para CRUZARLO contra el Total quincena de LIPgo:
    //   1. Base quincenal automática = salario/2 (15 días × salario/30, convención 30
    //      días; Siigo la paga sola desde el contrato — el plano NO la envía).
    //   2. Novedades tipo "Valor" (71-Bono) → suman directo.
    //   3. Novedades tipo "Horas" → horas × HOD × factor del concepto, con HOD =
    //      salario/(30×jornada) y los % de la vigencia legal de la quincena (los
    //      mismos con los que LIPgo calculó las horas: hed 25, hedf, hen 75, hef,
    //      hn 35, dominical). 08 = día adicional por dominical trabajado (×1,00);
    //      25 = solo el recargo dominical (×pct).
    //   4. Novedades tipo "Dias" → Siigo descuenta el día de la base y paga el
    //      concepto a su %: 13-Incap 100% (neto 0), 15-Incap 66,67% (neto −33,33%),
    //      14-Incap 50% (neto −50%), 38-Lic. no remunerada (neto −100%),
    //      31-Vacaciones y licencias remuneradas (neto 0).
    let siigo: SimulacionSiigo = {
      disponible: false,
      jornada: 0,
      hod: 0,
      baseQuincenal: 0,
      conceptos: [],
      totalSiigo: 0,
      totalLipgo: Math.round(resumen.total),
      diferencia: 0,
      cuadra: false,
      componentes: [],
      explicaciones: [],
    }
    if (salario > 0) {
      // Vigencia legal aplicable a la quincena (los cortes legales rigen el 16-jul,
      // que coincide con el inicio de la 2ª quincena → una sola vigencia por quincena).
      const { data: vig } = await admin
        .from("parametros_legales_vigencia")
        .select("*")
        .lte("fecha_desde", desde)
        .order("fecha_desde", { ascending: false })
        .limit(1)
        .maybeSingle()
      const jornada = vig?.jornada_horas != null ? Number(vig.jornada_horas) : 7
      const pct = {
        hed: vig?.pct_hed != null ? Number(vig.pct_hed) : 25,
        hen: vig?.pct_hen != null ? Number(vig.pct_hen) : 75,
        hn: vig?.pct_hn != null ? Number(vig.pct_hn) : 35,
        dom: vig?.pct_recargo_dominical != null ? Number(vig.pct_recargo_dominical) : 90,
        hedf: vig?.pct_hedf != null ? Number(vig.pct_hedf) : 115,
        hef: vig?.pct_hef != null ? Number(vig.pct_hef) : 165,
      }
      const hod = salario / (30 * jornada)
      const baseDiaSim = salario / 30
      const baseQuincenal = Math.round(salario / 2)
      const fmtX = (m: number) =>
        "×" + m.toLocaleString("es-CO", { minimumFractionDigits: 2, maximumFractionDigits: 2 })

      // Agrupar las novedades del plano por concepto (los días vienen 1 fila/día).
      const agg = new Map<string, { tipo: string; cant: number }>()
      for (const p of plano) {
        const g = agg.get(p.nombrenovedad) || { tipo: p.tiponovedad, cant: 0 }
        g.cant += p.cantidadvalor
        agg.set(p.nombrenovedad, g)
      }

      const conceptos: ConceptoSiigo[] = [
        {
          concepto: "Salario básico de la quincena (contrato)",
          tipo: "Base",
          cantidad: 15,
          unidad: "días",
          factor: "salario/30",
          valor: baseQuincenal,
        },
      ]
      for (const [nom, g] of agg) {
        if (nom.startsWith("71")) {
          conceptos.push({
            concepto: nom,
            tipo: "Valor",
            cantidad: 1,
            unidad: "",
            factor: "valor directo",
            valor: Math.round(g.cant),
          })
        } else if (g.tipo === "Horas") {
          let mult = 1
          if (nom.startsWith("10")) mult = 1 + pct.hed / 100
          else if (nom.startsWith("07")) mult = 1 + pct.hedf / 100
          else if (nom.startsWith("11")) mult = 1 + pct.hen / 100
          else if (nom.startsWith("12")) mult = 1 + pct.hef / 100
          else if (nom.startsWith("26")) mult = pct.hn / 100
          else if (nom.startsWith("08")) mult = 1 // día adicional por dominical trabajado
          else if (nom.startsWith("25")) mult = pct.dom / 100 // solo el recargo
          conceptos.push({
            concepto: nom,
            tipo: "Horas",
            cantidad: g.cant,
            unidad: "h",
            factor: fmtX(mult),
            valor: Math.round(g.cant * hod * mult),
          })
        } else if (g.tipo === "Dias") {
          // Efecto NETO en el pago: Siigo descuenta el día y paga el concepto a su %.
          let netoDia = 0
          let nota = "pagada 100% (sin efecto neto)"
          if (nom.startsWith("38")) {
            netoDia = -baseDiaSim
            nota = "no remunerada (descuenta el día)"
          } else if (nom.startsWith("15")) {
            netoDia = -baseDiaSim * (1 - 0.6667)
            nota = "paga 66,67% (descuenta 33,33%)"
          } else if (nom.startsWith("14")) {
            netoDia = -baseDiaSim * 0.5
            nota = "paga 50% (descuenta 50%)"
          }
          conceptos.push({
            concepto: nom,
            tipo: "Dias",
            cantidad: g.cant,
            unidad: "día(s)",
            factor: nota,
            valor: Math.round(netoDia * g.cant),
          })
        }
      }
      const totalSiigo = conceptos.reduce((a, c) => a + c.valor, 0)
      const sumC = (f: (c: ConceptoSiigo) => boolean) => conceptos.filter(f).reduce((a, c) => a + c.valor, 0)

      // Cruce por componente: en LIPgo el descanso dominical se suma a la base (en
      // Siigo vive dentro de los 15 días); el dominical TRABAJADO cruza contra 08/25.
      const componentes: CruceComponente[] = [
        {
          nombre: "Base (días de salario)",
          lipgo: Math.round(baseGar + domDescanso),
          siigo: baseQuincenal + sumC((c) => c.tipo === "Dias"),
        },
        {
          nombre: "Horas extra / recargos",
          lipgo: Math.round(ingTurno),
          siigo: sumC((c) => c.tipo === "Horas" && !c.concepto.startsWith("08") && !c.concepto.startsWith("25")),
        },
        {
          nombre: "Dominical trabajado (08/25)",
          lipgo: Math.round(domTrabajado),
          siigo: sumC((c) => c.concepto.startsWith("08") || c.concepto.startsWith("25")),
        },
        {
          nombre: "Bono productividad (71)",
          lipgo: Math.round(bono),
          siigo: sumC((c) => c.concepto.startsWith("71")),
        },
      ]

      const totalLipgo = Math.round(resumen.total)
      const diferencia = totalSiigo - totalLipgo
      const cuadra = Math.abs(diferencia) <= 2000 // tolerancia de redondeo (horas a 2 decimales)

      // Explicaciones de la diferencia (las causas estructurales conocidas).
      const explicaciones: string[] = []
      const diasRango = Math.round((Date.parse(hasta) - Date.parse(desde)) / 86400000) + 1
      const hoyISO = new Date().toISOString().slice(0, 10)
      if (hoyISO < hasta)
        explicaciones.push(
          `Quincena EN CURSO: LIPgo lleva ${dias.length} de ${diasRango} días con datos; Siigo liquida la quincena completa (15 días de base). La diferencia se cierra al terminar la quincena.`,
        )
      if (diasRango !== 15)
        explicaciones.push(
          `La quincena tiene ${diasRango} días de calendario y Siigo paga 15 (convención 30 días): diferencia estructural de ${Math.abs(diasRango - 15)} día(s) de base ≈ $${Math.round(Math.abs(diasRango - 15) * baseDiaSim).toLocaleString("es-CO")} ${diasRango > 15 ? "que LIPgo liquida de más (día 31)" : "que Siigo paga de más (febrero)"}.`,
        )
      const diasSinPago = dias.filter((x) => x.total === 0).length
      if (diasSinPago > 0)
        explicaciones.push(
          `${diasSinPago} día(s) SIN pago en LIPgo (sin registro / falta) que la base quincenal de Siigo SÍ paga (+$${Math.round(diasSinPago * baseDiaSim).toLocaleString("es-CO")} en Siigo). Si son faltas reales, deben reportarse en Siigo como novedad de ausencia.`,
        )
      if (cuadra)
        explicaciones.push(
          "Diferencia dentro de la tolerancia de redondeo (±$2.000): el pago de Siigo coincide con el cálculo de LIPgo.",
        )

      siigo = {
        disponible: true,
        jornada,
        hod,
        baseQuincenal,
        conceptos,
        totalSiigo,
        totalLipgo,
        diferencia,
        cuadra,
        componentes,
        explicaciones,
      }
    }

    return {
      success: true,
      data: {
        colaborador: {
          persona,
          identificacion,
          salario,
          baseDia,
          empresa,
          contratosiigo: String(hc?.contratosiigo || "").trim(),
        },
        quincena: { anio, mes, num: quincena, desde, hasta },
        dias,
        resumen,
        metaResumen,
        plano,
        siigo,
      },
    }
  } catch (e: any) {
    return { success: false, message: e?.message || "Error al armar la revisión de nómina." }
  }
}

// ---------------------------------------------------------------------------
// HC POR DÍA POR PROYECTO (ID) — base real de trabajadores con la que se opera
// cada día. Cuenta los trabajadores DISTINTOS que movieron toneladas (destajo)
// por fecha + proyecto (asistencia ya ratificada en pagonomina), y lo cruza con
// el HC planeado y la meta configurados. El HC varía a diario según el volumen.
// ---------------------------------------------------------------------------

export interface HcDiaProyecto {
  fecha: string
  dow: string
  idempresa: number
  proyecto: string
  hcReal: number
  toneladas: number
  hcConfig: number
  meta: number
  tonPorTrabajador: number // toneladas ÷ hcReal (promedio real por trabajador ese día)
}

export async function getHcPorDia(
  anio: number,
  mes: number,
): Promise<{ success: boolean; data: HcDiaProyecto[]; message?: string }> {
  try {
    const admin: any = await getSupabaseAdmin()
    const desde = `${anio}-${String(mes).padStart(2, "0")}-01`
    const hasta = `${anio}-${String(mes).padStart(2, "0")}-${String(fin(anio, mes)).padStart(2, "0")}`

    // Metas por proyecto (nombre + HC planeado + meta)
    const metasRes = await getMetasToneladas()
    const metaObj = new Map<number, { proyecto: string; hc: number; meta: number }>()
    for (const m of metasRes.data || [])
      metaObj.set(m.idempresa, { proyecto: m.proyecto, hc: m.hc, meta: m.metaTonTrabajadorDia })

    // pagonomina del mes con toneladas (destajo). Paginado.
    const rows: any[] = []
    for (let off = 0; ; off += 1000) {
      const { data, error } = await admin
        .from("pagonomina")
        .select("fecha, persona, idempresaliquidacion, especialidad, toneladas")
        .gte("fecha", desde)
        .lte("fecha", hasta)
        .gt("toneladas", 0)
        .range(off, off + 999)
      if (error) return { success: false, data: [], message: error.message }
      if (!data || data.length === 0) break
      rows.push(...data)
      if (data.length < 1000) break
    }

    // Agrupar por fecha + proyecto: HC (distintos) + toneladas
    const grupo = new Map<string, { personas: Set<string>; ton: number; fecha: string; emp: number }>()
    for (const r of rows) {
      if (r.especialidad === true || String(r.especialidad) === "true") continue
      const emp = r.idempresaliquidacion != null ? Number(r.idempresaliquidacion) : 0
      const fecha = String(r.fecha).slice(0, 10)
      const key = fecha + "|" + emp
      if (!grupo.has(key)) grupo.set(key, { personas: new Set(), ton: 0, fecha, emp })
      const g = grupo.get(key)!
      g.personas.add(String(r.persona || "").trim())
      g.ton += num(r.toneladas)
    }

    const data: HcDiaProyecto[] = []
    for (const g of grupo.values()) {
      const cfg = metaObj.get(g.emp)
      const hcReal = g.personas.size
      const d = new Date(g.fecha + "T12:00:00Z")
      data.push({
        fecha: g.fecha,
        dow: DOW[d.getUTCDay()],
        idempresa: g.emp,
        proyecto: cfg?.proyecto || `Proyecto ${g.emp}`,
        hcReal,
        toneladas: g.ton,
        hcConfig: cfg?.hc || 0,
        meta: cfg?.meta || 0,
        tonPorTrabajador: hcReal > 0 ? g.ton / hcReal : 0,
      })
    }
    data.sort((a, b) => (a.fecha < b.fecha ? 1 : a.fecha > b.fecha ? -1 : a.idempresa - b.idempresa))
    return { success: true, data }
  } catch (e: any) {
    return { success: false, data: [], message: e?.message || "Error al calcular el HC por día." }
  }
}
