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
  /** Bonos del módulo Bonos (43/50/66). No cotizan al IBC, pero sí se pagan. */
  bonosNoPrestacionales: number
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

// Supabase topa toda respuesta en 1000 filas aunque se pida más: para leer el
// proyecto completo (todas las personas × todos los días) hay que paginar con
// .range hasta agotar. `makeQuery(from,to)` arma la consulta con su .range.
async function fetchAllRows(makeQuery: (from: number, to: number) => any): Promise<any[]> {
  const PAGE = 1000
  let offset = 0
  const all: any[] = []
  for (;;) {
    const { data, error } = await makeQuery(offset, offset + PAGE - 1)
    if (error) throw new Error(error.message)
    const batch = data ?? []
    all.push(...batch)
    if (batch.length < PAGE) break
    offset += PAGE
  }
  return all
}

/** Parte una lista larga en lotes, para no reventar la URL de un `.in(...)`. */
function enLotes<T>(arr: T[], n: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n))
  return out
}

/**
 * Colaboradores para el selector (Head Count, activos primero).
 * `idempresa` = el SELECTOR GLOBAL: cada id es un centro de costo, así que al
 * filtrar por él salen solo los colaboradores amarrados a ese proyecto — que es
 * exactamente el universo con el que se cruza el plano contra Siigo.
 */
export async function getColaboradores(
  idempresa?: number | null,
): Promise<{ success: boolean; data: ColaboradorRef[]; message?: string }> {
  try {
    const admin: any = await getSupabaseAdmin()
    let q = admin
      .from("headcount")
      .select("nombre, identificacion, idempresa, estado")
      .order("estado", { ascending: true })
      .order("nombre", { ascending: true })
    if (idempresa != null) q = q.eq("idempresa", idempresa)
    const { data, error } = await q
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

/** Columnas de `pagonomina` que necesita el cuadro (una sola definición). */
const PN_COLS =
  "fecha, persona, idempresa, idempresaliquidacion, actividad_registrada, novedad_reportada, especialidad, toneladas, pago_produccion, base_dia, bonif_prestacional, bonif_no_prestacional, hed, hedf, hen, hef, hn, pago_domingo, recargodominical, total_liquidado_dia"

/**
 * Contexto del cálculo que NO depende del colaborador (metas del proyecto, HC
 * real por día, vigencia legal de la quincena). Se arma UNA vez y se reutiliza,
 * de modo que el consolidado por proyecto corra EXACTAMENTE la misma lógica que
 * la revisión individual — sin duplicarla ni dejarla derivar.
 */
interface CtxRevision {
  anio: number
  mes: number
  quincena: 1 | 2
  desde: string
  hasta: string
  metaObjPorEmpresa: Map<number, { meta: number; hc: number }>
  hcReal: (fecha: string, emp: number) => number
  vig: any | null
}

/** Rango [desde, hasta] de la quincena, en ISO. */
function rangoQ(anio: number, mes: number, quincena: 1 | 2) {
  const diaIni = quincena === 1 ? 1 : 16
  const diaFin = quincena === 1 ? 15 : fin(anio, mes)
  const p = (n: number) => String(n).padStart(2, "0")
  return { desde: `${anio}-${p(mes)}-${p(diaIni)}`, hasta: `${anio}-${p(mes)}-${p(diaFin)}` }
}

async function armarContexto(
  admin: any,
  anio: number,
  mes: number,
  quincena: 1 | 2,
  desde: string,
  hasta: string,
  proyectos: Set<number>,
): Promise<CtxRevision> {
  // Metas de toneladas por proyecto (idempresa) — indicador de productividad.
  const metasRes = await getMetasToneladas()
  const metaObjPorEmpresa = new Map<number, { meta: number; hc: number }>()
  for (const m of metasRes.data || []) metaObjPorEmpresa.set(m.idempresa, { meta: m.metaTonTrabajadorDia, hc: m.hc })

  // HC REAL por día: trabajadores que movieron toneladas ese día en el proyecto
  // (asistencia ya ratificada en pagonomina). El HC varía a diario según el volumen.
  // PAGINADO: un proyecto entero en 15 días supera fácil el tope de 1000 filas de
  // Supabase, y sin paginar el HC real saldría corto en silencio.
  const hcPorFechaEmp = new Map<string, Set<string>>()
  if (proyectos.size > 0) {
    const hcRows = await fetchAllRows((f, t) =>
      admin
        .from("pagonomina")
        .select("fecha, persona, idempresaliquidacion, especialidad")
        .in("idempresaliquidacion", Array.from(proyectos))
        .gte("fecha", desde)
        .lte("fecha", hasta)
        .gt("toneladas", 0)
        .order("fecha", { ascending: true })
        .range(f, t),
    )
    for (const r of hcRows) {
      if (r.especialidad === true || String(r.especialidad) === "true") continue
      const key = String(r.fecha).slice(0, 10) + "|" + Number(r.idempresaliquidacion)
      if (!hcPorFechaEmp.has(key)) hcPorFechaEmp.set(key, new Set())
      hcPorFechaEmp.get(key)!.add(String(r.persona || "").trim())
    }
  }

  // Vigencia legal aplicable a la quincena (los cortes legales rigen el 16-jul,
  // que coincide con el inicio de la 2ª quincena → una sola vigencia por quincena).
  const { data: vig } = await admin
    .from("parametros_legales_vigencia")
    .select("*")
    .lte("fecha_desde", desde)
    .order("fecha_desde", { ascending: false })
    .limit(1)
    .maybeSingle()

  return {
    anio,
    mes,
    quincena,
    desde,
    hasta,
    metaObjPorEmpresa,
    hcReal: (fecha: string, emp: number) => hcPorFechaEmp.get(fecha + "|" + emp)?.size || 0,
    vig: vig || null,
  }
}

/**
 * Cuadro completo (A/B/C/D) de UNA persona, a partir de datos ya leídos.
 * Función pura: la usan tanto la vista individual como el consolidado por
 * proyecto, así que el cruce con Siigo es idéntico en ambos casos.
 */
function armarPersona(
  persona: string,
  hc: any | null,
  filas: any[],
  planoRows: any[],
  ctx: CtxRevision,
): RevisionNominaData {
  const { anio, mes, quincena, desde, hasta, metaObjPorEmpresa, hcReal } = ctx
  const identificacion = String(hc?.identificacion || "").trim()
  const salario = num(hc?.salario)
  const baseDia = salario > 0 ? salario / 30 : 58364

  // Bloque A/B/C/D — se conserva tal cual estaba en la versión de una sola
  // persona (misma lógica ya validada contra Siigo); lo único que cambió es de
  // dónde llegan los datos: antes los leía aquí, ahora se los pasa el llamador.
  {
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
      // Bonos NO prestacionales (módulo Compensación › Bonos). NO vienen dentro
      // de total_liquidado_dia (no cotizan al IBC), pero SÍ se le pagan al
      // trabajador vía el archivo plano, así que suman al Total quincena.
      bonosNoPrest = 0,
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
      bonosNoPrest += num(r.bonif_no_prestacional)
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
      bonosNoPrestacionales: bonosNoPrest,
      total: baseGar + ingTurno + recDom + bono + bonosNoPrest,
      diasDestajo,
      diasAltos,
      diasBajos,
      anomalias,
    }

    // C) Archivo plano (novedades a Siigo) para ese id + mes + quincena.
    // Las filas ya vienen leídas y filtradas por el llamador (`planoRows`).
    const plano: PlanoRevision[] = (planoRows || []).map((p: any) => ({
      nombrenovedad: String(p.nombrenovedad || ""),
      tiponovedad: String(p.tiponovedad || ""),
      cantidadvalor: num(p.cantidadvalor),
      nominaproyectada: num(p.nominaproyectada),
      fechainicio: p.fechainicio || null,
    }))

    // D) SIMULACIÓN SIIGO — replica el proceso de liquidación de Siigo al ingerir el
    // archivo plano, para CRUZARLO contra el Total quincena de LIPgo:
    //   1. Base quincenal automática = salario/2 (15 días × salario/30, convención 30
    //      días; Siigo la paga sola desde el contrato — el plano NO la envía).
    //   2. Novedades tipo "Valor" (52-Bono de productividad) → suman directo.
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
    // Solo se simula a quien la nómina EFECTIVAMENTE liquida en la quincena.
    // Sin `dias.length > 0` se le asignaba una base quincenal fantasma de 15
    // días a cualquiera con salario en Head Count — incluidos los RETIRADOS,
    // que `pagonomina` y `archivoplano` ya excluyen y cuya liquidación va por el
    // módulo Liquidaciones, no por el plano. Eso inventaba un descuadre del
    // tamaño de medio salario por cada retirado (en Indupan eran $4,4 millones
    // de diferencia falsa).
    if (salario > 0 && dias.length > 0) {
      // Vigencia legal aplicable a la quincena (ya resuelta en el contexto: los
      // cortes legales rigen el 16-jul, que coincide con el inicio de la 2ª
      // quincena → una sola vigencia por quincena).
      const vig = ctx.vig
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
      // Base quincenal de Siigo = 15 días (convención de mes de 30)... PERO
      // PRORRATEADA si la persona ingresó DENTRO de la quincena: Siigo paga
      // desde la fecha de contratación, no el periodo completo. Sin esto, a un
      // ingreso de mitad de quincena se le atribuían los 15 días y salía un
      // descuadre del tamaño de los días que aún no era empleado (caso real:
      // ANDRÉS FELIPE ESCORCIA y OTONIEL MURILLO, ingreso 27-jul, ~$642.000
      // cada uno). Mismo criterio con el que `pagonomina` corta por
      // headcount.fechainicio.
      const ingreso = hc?.fechainicio ? String(hc.fechainicio).slice(0, 10) : ""
      let diasBase = 15
      if (ingreso && ingreso > desde) {
        const tope = ingreso > hasta ? hasta : ingreso
        const diasFuera = Math.round((Date.parse(tope) - Date.parse(desde)) / 86400000)
        diasBase = Math.max(0, 15 - diasFuera)
      }
      const baseQuincenal = Math.round(diasBase * baseDiaSim)
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
          concepto:
            diasBase < 15
              ? `Salario básico de la quincena (contrato, prorrateado desde el ingreso ${ingreso})`
              : "Salario básico de la quincena (contrato)",
          tipo: "Base",
          cantidad: diasBase,
          unidad: "días",
          factor: "salario/30",
          valor: baseQuincenal,
        },
      ]
      for (const [nom, g] of agg) {
        // Novedades de VALOR directo: el bono de productividad y los bonos del
        // módulo Compensación › Bonos (43 ocasionales / 50 no prestacional /
        // 66 aux. movilidad). Sin listarlos aquí caerían fuera de todas las
        // ramas y se ignorarían en silencio, descuadrando el cruce.
        //
        // El bono de productividad se acepta con SUS DOS códigos: 52 desde la
        // quincena del 16-jul-2026 y 71 antes (ver archivoplano_reemplazo.sql).
        // Reconocer solo el nuevo dejaría sin bono el cruce de toda quincena
        // anterior, que es justo donde uno va a revisar el histórico.
        if (
          nom.startsWith("52") ||
          nom.startsWith("71") ||
          nom.startsWith("43") ||
          nom.startsWith("50") ||
          nom.startsWith("66")
        ) {
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
          // 52 desde la quincena del 16-jul-2026; 71 en las anteriores.
          nombre: "Bono productividad (52)",
          lipgo: Math.round(bono),
          siigo: sumC((c) => c.concepto.startsWith("52") || c.concepto.startsWith("71")),
        },
        {
          // Bonos del módulo Compensación › Bonos. No cotizan al IBC, pero se
          // pagan por el plano: cruzan contra bonif_no_prestacional de pagonomina.
          nombre: "Bonos no prestacionales (43/50/66)",
          lipgo: Math.round(bonosNoPrest),
          siigo: sumC(
            (c) => c.concepto.startsWith("43") || c.concepto.startsWith("50") || c.concepto.startsWith("66"),
          ),
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
    }
  }
}

/** Cuadro completo (A/B/C/D) de un colaborador para una quincena. */
export async function getRevisionNomina(
  persona: string,
  anio: number,
  mes: number,
  quincena: 1 | 2,
): Promise<{ success: boolean; data?: RevisionNominaData; message?: string }> {
  try {
    if (!persona) return { success: false, message: "Selecciona un colaborador." }
    const admin: any = await getSupabaseAdmin()
    const { desde, hasta } = rangoQ(anio, mes, quincena)

    // Ficha del colaborador (Head Count)
    const { data: hc } = await admin
      .from("headcount")
      .select("nombre, identificacion, salario, idempresa, contratosiigo, fechainicio")
      .eq("nombre", persona)
      .limit(1)
      .maybeSingle()

    // A) Días de la quincena (pagonomina — modelo nuevo ya liquida base por día)
    const { data: filas, error: errPn } = await admin
      .from("pagonomina")
      .select(PN_COLS)
      .eq("persona", persona)
      .gte("fecha", desde)
      .lte("fecha", hasta)
      .order("fecha", { ascending: true })
    if (errPn) return { success: false, message: errPn.message }

    // C) Archivo plano de esa cédula para el mes + quincena
    const identificacion = String(hc?.identificacion || "").trim()
    let planoRows: any[] = []
    if (identificacion) {
      const { data: pl } = await admin
        .from("archivoplano")
        .select("nombrenovedad, tiponovedad, cantidadvalor, nominaproyectada, fechainicio, quincena, mes")
        .eq("identificacionempleado", identificacion)
        .eq("mes", String(mes).padStart(2, "0"))
        .eq("quincena", quincena)
      planoRows = pl || []
    }

    const proyectos = new Set<number>()
    for (const r of filas || []) {
      const esp = r.especialidad === true || String(r.especialidad) === "true"
      if (num(r.toneladas) > 0 && !esp && r.idempresaliquidacion != null) proyectos.add(Number(r.idempresaliquidacion))
    }
    const ctx = await armarContexto(admin, anio, mes, quincena, desde, hasta, proyectos)

    return { success: true, data: armarPersona(persona, hc, filas || [], planoRows, ctx) }
  } catch (e: any) {
    return { success: false, message: e?.message || "Error al armar la revisión de nómina." }
  }
}

// ---------------------------------------------------------------------------
// CONSOLIDADO POR PROYECTO — "Todos los colaboradores"
// Mismo cuadro, pero para TODO el centro de costo a la vez: es lo que permite
// cruzar el archivo plano COMPLETO de LIPgo contra Siigo de una sola pasada, en
// vez de persona por persona. El universo son los colaboradores del Head Count
// amarrados al id del selector global (cada id ES un centro de costo), y de cada
// uno se toman TODOS sus días — trabaje donde trabaje —, porque Siigo lo liquida
// por su contrato, no por dónde movió el tonelaje.
// Corre `armarPersona` (la misma función de la vista individual) sobre cada uno,
// así que el cruce con Siigo es idéntico; aquí solo se suma y se ordena por Δ.
// ---------------------------------------------------------------------------

export interface PersonaProyectoRow {
  persona: string
  identificacion: string
  estado: string
  salario: number
  /** LIPgo */
  baseGarantizada: number
  ingresoTurno: number
  recargoDominical: number
  bono: number
  perdida: number
  bonosNoPrestacionales: number
  totalLipgo: number
  /** Siigo (simulado desde el archivo plano) */
  baseQuincenal: number
  totalSiigo: number
  diferencia: number
  cuadra: boolean
  simulable: boolean // hay salario en Head Count (sin él no se puede simular Siigo)
  /** Señales para priorizar la revisión */
  diasLiquidados: number
  diasSinPago: number
  anomalias: number
  novedadesPlano: number
  componentes: CruceComponente[]
}

export interface NovedadPlanoAgg {
  nombrenovedad: string
  tiponovedad: string
  personas: number
  cantidadvalor: number
}

export interface RevisionProyectoData {
  empresa: number | null
  quincena: { anio: number; mes: number; num: number; desde: string; hasta: string }
  personas: PersonaProyectoRow[]
  resumen: {
    nPersonas: number
    nConDatos: number
    nCuadran: number
    nDescuadran: number
    nSinSalario: number
    nSinPlano: number
    totalLipgo: number
    totalSiigo: number
    diferencia: number
    baseGarantizada: number
    ingresoTurno: number
    recargoDominical: number
    bono: number
    perdida: number
    bonosNoPrestacionales: number
    anomalias: number
    diasSinPago: number
  }
  componentes: CruceComponente[]
  plano: NovedadPlanoAgg[]
}

export async function getRevisionNominaProyecto(
  idempresa: number | null,
  anio: number,
  mes: number,
  quincena: 1 | 2,
): Promise<{ success: boolean; data?: RevisionProyectoData; message?: string }> {
  try {
    const admin: any = await getSupabaseAdmin()
    const { desde, hasta } = rangoQ(anio, mes, quincena)

    // 1) Universo = Head Count del proyecto (centro de costo del selector global).
    let qhc = admin.from("headcount").select("nombre, identificacion, salario, idempresa, contratosiigo, estado, fechainicio")
    if (idempresa != null) qhc = qhc.eq("idempresa", idempresa)
    const { data: hcRows, error: errHc } = await qhc
    if (errHc) return { success: false, message: errHc.message }

    const hcPorPersona = new Map<string, any>()
    for (const r of hcRows || []) {
      const p = String(r.nombre || "").trim()
      if (!p || /prueba/i.test(p)) continue
      // RETIRADOS FUERA. Mismo criterio literal que la vista `archivoplano`
      // (lower(coalesce(estado,'activo')) <> 'inactivo'): si el plano no los
      // envía, Siigo no los liquida y no hay nada que cruzar. Su nómina
      // pendiente se paga desde el submódulo Liquidaciones.
      if (String(r.estado || "activo").trim().toLowerCase() === "inactivo") continue
      if (!hcPorPersona.has(p)) hcPorPersona.set(p, r)
    }
    const personas = Array.from(hcPorPersona.keys())
    if (personas.length === 0)
      return {
        success: false,
        message:
          idempresa != null
            ? `No hay colaboradores en el Head Count del proyecto ${idempresa}.`
            : "No hay colaboradores en el Head Count.",
      }

    // 2) pagonomina de todos ellos (por lotes para no reventar la URL del .in,
    //    y paginado dentro de cada lote por el tope de 1000 filas de Supabase).
    const filasTodas: any[] = []
    for (const lote of enLotes(personas, 50)) {
      const rows = await fetchAllRows((f, t) =>
        admin
          .from("pagonomina")
          .select(PN_COLS)
          .in("persona", lote)
          .gte("fecha", desde)
          .lte("fecha", hasta)
          .order("persona", { ascending: true })
          .order("fecha", { ascending: true })
          .range(f, t),
      )
      filasTodas.push(...rows)
    }
    const filasPorPersona = new Map<string, any[]>()
    for (const r of filasTodas) {
      const p = String(r.persona || "").trim()
      if (!filasPorPersona.has(p)) filasPorPersona.set(p, [])
      filasPorPersona.get(p)!.push(r)
    }

    // 3) archivoplano de todas las cédulas del universo.
    const cedulas = personas.map((p) => String(hcPorPersona.get(p)?.identificacion || "").trim()).filter(Boolean)
    const planoTodo: any[] = []
    for (const lote of enLotes(Array.from(new Set(cedulas)), 50)) {
      const rows = await fetchAllRows((f, t) =>
        admin
          .from("archivoplano")
          .select("identificacionempleado, nombrenovedad, tiponovedad, cantidadvalor, nominaproyectada, fechainicio, quincena, mes")
          .in("identificacionempleado", lote)
          .eq("mes", String(mes).padStart(2, "0"))
          .eq("quincena", quincena)
          .order("identificacionempleado", { ascending: true })
          .range(f, t),
      )
      planoTodo.push(...rows)
    }
    const planoPorCedula = new Map<string, any[]>()
    for (const r of planoTodo) {
      const c = String(r.identificacionempleado || "").trim()
      if (!planoPorCedula.has(c)) planoPorCedula.set(c, [])
      planoPorCedula.get(c)!.push(r)
    }

    // 4) Contexto compartido (metas + HC real + vigencia) y cálculo por persona.
    const proyectos = new Set<number>()
    for (const r of filasTodas) {
      const esp = r.especialidad === true || String(r.especialidad) === "true"
      if (num(r.toneladas) > 0 && !esp && r.idempresaliquidacion != null) proyectos.add(Number(r.idempresaliquidacion))
    }
    const ctx = await armarContexto(admin, anio, mes, quincena, desde, hasta, proyectos)

    const out: PersonaProyectoRow[] = []
    const compAcum = new Map<string, { lipgo: number; siigo: number; orden: number }>()
    const novAgg = new Map<string, { tipo: string; cant: number; personas: Set<string> }>()
    const res = {
      nPersonas: personas.length,
      nConDatos: 0,
      nCuadran: 0,
      nDescuadran: 0,
      nSinSalario: 0,
      nSinPlano: 0,
      totalLipgo: 0,
      totalSiigo: 0,
      diferencia: 0,
      baseGarantizada: 0,
      ingresoTurno: 0,
      recargoDominical: 0,
      bono: 0,
      perdida: 0,
      bonosNoPrestacionales: 0,
      anomalias: 0,
      diasSinPago: 0,
    }

    for (const persona of personas) {
      const hc = hcPorPersona.get(persona)
      const ced = String(hc?.identificacion || "").trim()
      const filas = filasPorPersona.get(persona) || []
      const planoRows = ced ? planoPorCedula.get(ced) || [] : []
      const d = armarPersona(persona, hc, filas, planoRows, ctx)
      const r = d.resumen
      const s = d.siigo
      const diasSinPago = d.dias.filter((x) => x.total === 0).length

      out.push({
        persona,
        identificacion: ced,
        estado: String(hc?.estado || "").trim() || "—",
        salario: d.colaborador.salario,
        baseGarantizada: r.baseGarantizada,
        ingresoTurno: r.ingresoTurno,
        recargoDominical: r.recargoDominical,
        bono: r.bono,
        perdida: r.perdida,
        bonosNoPrestacionales: r.bonosNoPrestacionales,
        totalLipgo: r.total,
        baseQuincenal: s.baseQuincenal,
        totalSiigo: s.totalSiigo,
        diferencia: s.disponible ? s.diferencia : 0,
        cuadra: s.disponible ? s.cuadra : false,
        simulable: s.disponible,
        diasLiquidados: d.dias.length,
        diasSinPago,
        anomalias: r.anomalias,
        novedadesPlano: d.plano.length,
        componentes: s.componentes,
      })

      if (d.dias.length > 0) res.nConDatos += 1
      if (!s.disponible) res.nSinSalario += 1
      else if (s.cuadra) res.nCuadran += 1
      else res.nDescuadran += 1
      if (d.plano.length === 0) res.nSinPlano += 1
      res.totalLipgo += r.total
      res.totalSiigo += s.disponible ? s.totalSiigo : 0
      res.baseGarantizada += r.baseGarantizada
      res.ingresoTurno += r.ingresoTurno
      res.recargoDominical += r.recargoDominical
      res.bono += r.bono
      res.perdida += r.perdida
      res.bonosNoPrestacionales += r.bonosNoPrestacionales
      res.anomalias += r.anomalias
      res.diasSinPago += diasSinPago

      // Cruce por componente, acumulado del proyecto (mismo desglose que la vista
      // individual, para poder ver DÓNDE nace la diferencia total).
      s.componentes.forEach((c, i) => {
        const g = compAcum.get(c.nombre) || { lipgo: 0, siigo: 0, orden: i }
        g.lipgo += c.lipgo
        g.siigo += c.siigo
        compAcum.set(c.nombre, g)
      })
      for (const p of d.plano) {
        const g = novAgg.get(p.nombrenovedad) || { tipo: p.tiponovedad, cant: 0, personas: new Set<string>() }
        g.cant += p.cantidadvalor
        g.personas.add(persona)
        novAgg.set(p.nombrenovedad, g)
      }
    }

    res.diferencia = res.totalSiigo - res.totalLipgo

    // Orden de revisión: primero los que más descuadran (|Δ| desc), y dentro de
    // los que cuadran, por total. Es la lista de trabajo, no un directorio.
    out.sort((a, b) => {
      const da = a.simulable ? Math.abs(a.diferencia) : -1
      const db = b.simulable ? Math.abs(b.diferencia) : -1
      if (db !== da) return db - da
      return b.totalLipgo - a.totalLipgo
    })

    const componentes: CruceComponente[] = Array.from(compAcum.entries())
      .sort((a, b) => a[1].orden - b[1].orden)
      .map(([nombre, g]) => ({ nombre, lipgo: Math.round(g.lipgo), siigo: Math.round(g.siigo) }))

    const plano: NovedadPlanoAgg[] = Array.from(novAgg.entries())
      .map(([nombrenovedad, g]) => ({
        nombrenovedad,
        tiponovedad: g.tipo,
        personas: g.personas.size,
        cantidadvalor: g.cant,
      }))
      .sort((a, b) => a.nombrenovedad.localeCompare(b.nombrenovedad, "es"))

    return {
      success: true,
      data: {
        empresa: idempresa,
        quincena: { anio, mes, num: quincena, desde, hasta },
        personas: out,
        resumen: res,
        componentes,
        plano,
      },
    }
  } catch (e: any) {
    return { success: false, message: e?.message || "Error al armar el consolidado del proyecto." }
  }
}

// ---------------------------------------------------------------------------
// CONCILIACIÓN PESO ↔ PAGO ↔ FACTURACIÓN (quincena, LIP completo: id 1-4)
// Garantiza que lo PAGADO al personal cuadre con lo FACTURABLE. La fuente de
// verdad del peso cambia por proyecto — MISMO criterio que `peso_base_calculo`
// en pagonomina_reemplazo.sql (no se reinventa, se replica 1:1):
//   - Plantas con báscula física (Indupan=1, Avimol=2): SIEMPRE pesovascula,
//     cualquier operación.
//   - CEDIS (Cedi Funza=3, Cedi Medellín=4) en Descargue: báscula del tiquete
//     normalizada (÷1000 si viene en kg), con fallback a pesoorden si no hay
//     báscula o el dato es corrupto (fuera de rango 0.1×–10× el pesoorden).
//   - CEDIS en el resto de operaciones (Cargue, etc.): pesoorden (peso
//     declarado por los productos de la orden).
// Universo = mismas órdenes que liquida pagonomina (fincargue no vacío),
// EXCLUYENDO los clones de Distribución (+D): heredan pesovascula/pesoorden
// de la orden madre (ya se pesó/declaró ahí) — incluirlos duplicaría el
// tonelaje. Reparte igual que pagonomina (peso base ÷ n auxiliares ×
// tarifaspersonal) y cruza contra la vista real, exponiendo:
//   - diferencia peso PRODUCTO (Σ detalleoc.toneladas) vs peso BASE por
//     orden, con el factor de prorrateo (prevalece el peso base/fuente
//     de verdad de cada proyecto);
//   - órdenes sin auxiliares (facturables pero sin nadie a quien pagar —
//     puede ser vehículo no atendido por personal propio de LIP);
//   - órdenes sin tarifa vigente (reparten toneladas pero pagan $0 — se paga
//     solo donde hay tarifa asignada, p. ej. ID 4 sí, otros ID pueden no);
//   - órdenes marcadas NO facturar (pagan nómina sin ingreso);
//   - auxiliares que no cruzan con Head Count (nombre huérfano);
//   - Δ por colaborador entre este cálculo y pagonomina (vínculo/retiro/fechas).
// ---------------------------------------------------------------------------

const PLANTAS_BASCULA = new Set([1, 2]) // Indupan, Avimol — báscula física
const CEDIS = new Set([3, 4]) // Cedi Funza, Cedi Medellín — sin báscula propia

/** Replica exacta de `peso_base_calculo` (pagonomina_reemplazo.sql). */
function pesoBaseCalculo(
  idempresa: number,
  tipooperacion: string,
  pesovascula: number,
  pesoorden: number,
): { peso: number; fuente: "bascula" | "producto" } {
  if (CEDIS.has(idempresa) && tipooperacion === "Descargue") {
    if (pesovascula <= 0) return { peso: pesoorden, fuente: "producto" }
    const norm = pesoorden > 0 && pesovascula / pesoorden > 50 ? pesovascula / 1000 : pesovascula
    if (pesoorden > 0) {
      const ratio = norm / pesoorden
      if (ratio < 0.1 || ratio > 10) return { peso: pesoorden, fuente: "producto" }
    }
    return { peso: norm, fuente: "bascula" }
  }
  if (CEDIS.has(idempresa)) return { peso: pesoorden, fuente: "producto" }
  return { peso: pesovascula, fuente: "bascula" }
}

export interface OrdenConciliada {
  idorden: number
  orden: string
  fecha: string
  planta: number // 1=Indupan, 2=Avimol, 3=Cedi Funza, 4=Cedi Medellín
  tipooperacion: string
  fuente: "bascula" | "producto" // origen del peso base (ver pesoBaseCalculo)
  tonBase: number // peso base de cálculo — fuente de verdad de pago y cobro
  tonProducto: number // Σ detalleoc.toneladas (peso declarado por productos)
  factor: number // tonBase / tonProducto (prorrateo del detalle; 0 = no calculable)
  nAux: number
  auxiliares: string[]
  facturar: boolean
  tarifa: number
  valorPago: number // tonBase × tarifa (0 si no hay auxiliares)
}

export interface DetalleOrdenColaborador {
  fecha: string
  orden: string
  tipooperacion: string
  planta: number
  tonOrden: number
  nAux: number
  tonPersona: number
  tarifa: number
  pago: number
}

export interface ColaboradorConciliado {
  persona: string
  enHeadcount: boolean
  salario: number // headcount.salario (mensual); 0 si no hay match
  baseDia: number // salario/30 (mismo fallback que getRevisionNomina: 58364 si no hay salario)
  ordenes: number
  tonAsignada: number
  valorPago: number
  tonPagonomina: number
  pagoPagonomina: number
  deltaTon: number // tonPagonomina − tonAsignada
  detalle: DetalleOrdenColaborador[]
}

export interface ConciliacionData {
  quincena: { anio: number; mes: number; num: number; desde: string; hasta: string }
  resumen: {
    ordenes: number
    ordenesBascula: number // con fuente="bascula" (pesaje físico real)
    tonBase: number // Σ peso base de cálculo (báscula en 1/2, producto/báscula normalizada en 3/4)
    tonProducto: number
    tonAsignada: number
    valorCalculado: number
    tonPagonomina: number
    pagoPagonomina: number
    tonSinAsignar: number
    ordenesSinAux: number
    ordenesSinTarifa: number
    ordenesNoFacturar: number
    tonNoFacturar: number
    ordenesConDiferencia: number
    difProductoBase: number // Σ (tonBase − tonProducto) en órdenes con pesaje físico
    auxiliaresHuerfanos: string[]
  }
  ordenesConDiferencia: OrdenConciliada[]
  ordenesSinAux: OrdenConciliada[]
  ordenesSinTarifa: OrdenConciliada[]
  ordenesNoFacturar: OrdenConciliada[]
  colaboradores: ColaboradorConciliado[]
}

export async function getConciliacionQuincena(
  anio: number,
  mes: number,
  quincena: 1 | 2,
  empresa: number, // 0 = todo LIP (1-4); o un id específico
): Promise<{ success: boolean; data?: ConciliacionData; message?: string }> {
  try {
    const admin: any = await getSupabaseAdmin()
    const emps = [1, 2, 3, 4].includes(empresa) ? [empresa] : [1, 2, 3, 4]

    const diaIni = quincena === 1 ? 1 : 16
    const diaFin = quincena === 1 ? 15 : fin(anio, mes)
    const desde = `${anio}-${String(mes).padStart(2, "0")}-${String(diaIni).padStart(2, "0")}`
    const hasta = `${anio}-${String(mes).padStart(2, "0")}-${String(diaFin).padStart(2, "0")}`

    // 1) Órdenes del periodo — MISMO universo que pagonomina: fincargue no vacío
    //    (la vista liquida por fechacargue). Paginado (tope Supabase 1000).
    const ordenesRaw: any[] = []
    for (let off = 0; ; off += 1000) {
      const { data, error } = await admin
        .from("cabeceraoc")
        .select("id, ordendecargue, fechacargue, idempresa, tipooperacion, pesovascula, pesoorden, auxiliares, facturar")
        .in("idempresa", emps)
        .gte("fechacargue", desde)
        .lte("fechacargue", hasta)
        .not("fincargue", "is", null)
        .range(off, off + 999)
      if (error) return { success: false, message: error.message }
      if (!data || data.length === 0) break
      ordenesRaw.push(...data)
      if (data.length < 1000) break
    }

    // 2) Detalle de productos (Σ toneladas por orden) — en lotes de ids.
    const tonProductoPorOrden = new Map<number, number>()
    const ids = ordenesRaw.map((o) => Number(o.id))
    for (let i = 0; i < ids.length; i += 100) {
      const chunk = ids.slice(i, i + 100)
      for (let off = 0; ; off += 1000) {
        const { data, error } = await admin
          .from("detalleoc")
          .select("idorden, toneladas")
          .in("idorden", chunk)
          .range(off, off + 999)
        if (error) return { success: false, message: error.message }
        for (const d of data || []) {
          const k = Number(d.idorden)
          tonProductoPorOrden.set(k, (tonProductoPorOrden.get(k) || 0) + num(d.toneladas))
        }
        if (!data || data.length < 1000) break
      }
    }

    // 3) Tarifas de destajo vigentes (mismo join que pagonomina:
    //    empresaid + operacion + fechacargue entre fechaini/fechafin).
    const { data: tarifas, error: errTar } = await admin
      .from("tarifaspersonal")
      .select("empresaid, operacion, tarifa, fechaini, fechafin")
      .in("empresaid", emps)
    if (errTar) return { success: false, message: errTar.message }
    const tarifaDe = (planta: number, operacion: string, fecha: string): number => {
      for (const t of tarifas || []) {
        if (Number(t.empresaid) !== planta) continue
        if (String(t.operacion) !== operacion) continue
        if (String(t.fechaini) <= fecha && fecha <= String(t.fechafin)) return num(t.tarifa)
      }
      return 0
    }

    // 4) Head Count (para marcar auxiliares huérfanos por nombre y traer su
    //    salario base — misma fuente/fallback que usa getRevisionNomina).
    const nombresHc = new Set<string>()
    const salarioPorNombre = new Map<string, number>()
    for (let off = 0; ; off += 1000) {
      const { data, error } = await admin.from("headcount").select("nombre, salario").range(off, off + 999)
      if (error) break
      for (const h of data || []) {
        const key = String(h.nombre || "").trim().toUpperCase()
        nombresHc.add(key)
        if (!salarioPorNombre.has(key)) salarioPorNombre.set(key, num(h.salario))
      }
      if (!data || data.length < 1000) break
    }

    // 5) Procesar órdenes: reparto EXACTO de pagonomina (báscula ÷ n auxiliares).
    const ordenes: OrdenConciliada[] = []
    const porPersona = new Map<string, ColaboradorConciliado>()
    const huerfanos = new Set<string>()
    for (const o of ordenesRaw) {
      const planta = Number(o.idempresa)
      const tipo = String(o.tipooperacion || "").trim()
      const fecha = String(o.fechacargue).slice(0, 10)
      const auxiliares = String(o.auxiliares || "")
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean)
      const nAux = auxiliares.length
      // Peso base = MISMA fuente de verdad que usa pagonomina para pagar y
      // facturación para cobrar en cada proyecto (ver pesoBaseCalculo arriba).
      const { peso: tonBase, fuente } = pesoBaseCalculo(planta, tipo, num(o.pesovascula), num(o.pesoorden))
      const tonProducto = tonProductoPorOrden.get(Number(o.id)) || 0
      const tarifa = tarifaDe(planta, tipo, fecha)
      const valorPago = nAux > 0 ? tonBase * tarifa : 0

      const orden: OrdenConciliada = {
        idorden: Number(o.id),
        orden: String(o.ordendecargue || ""),
        fecha,
        planta,
        tipooperacion: tipo,
        fuente,
        tonBase,
        tonProducto,
        factor: tonProducto > 0 && tonBase > 0 ? tonBase / tonProducto : 0,
        nAux,
        auxiliares,
        facturar: o.facturar !== false,
        tarifa,
        valorPago,
      }
      ordenes.push(orden)

      // Reparto por persona (tonelaje ÷ n, igual que pagonomina).
      if (nAux > 0 && tonBase > 0) {
        const tonPersona = tonBase / nAux
        for (const p of auxiliares) {
          const key = p.toUpperCase()
          if (!nombresHc.has(key)) huerfanos.add(p)
          if (!porPersona.has(key)) {
            const salario = salarioPorNombre.get(key) || 0
            porPersona.set(key, {
              persona: p,
              enHeadcount: nombresHc.has(key),
              salario,
              baseDia: salario > 0 ? salario / 30 : 58364,
              ordenes: 0,
              tonAsignada: 0,
              valorPago: 0,
              tonPagonomina: 0,
              pagoPagonomina: 0,
              deltaTon: 0,
              detalle: [],
            })
          }
          const c = porPersona.get(key)!
          c.ordenes += 1
          c.tonAsignada += tonPersona
          c.valorPago += tonPersona * tarifa
          c.detalle.push({
            fecha,
            orden: orden.orden,
            tipooperacion: tipo,
            planta,
            tonOrden: tonBase,
            nAux,
            tonPersona,
            tarifa,
            pago: tonPersona * tarifa,
          })
        }
      }
    }

    // 6) Cruce contra la vista pagonomina REAL (lo que efectivamente liquida
    //    nómina, con sus filtros de vínculo/retiro/fecha). Referencia por persona.
    for (let off = 0; ; off += 1000) {
      const { data, error } = await admin
        .from("pagonomina")
        .select("persona, toneladas, pago_produccion, idempresaliquidacion")
        .gte("fecha", desde)
        .lte("fecha", hasta)
        .gt("toneladas", 0)
        .in("idempresaliquidacion", emps)
        .range(off, off + 999)
      if (error) break
      for (const r of data || []) {
        const key = String(r.persona || "").trim().toUpperCase()
        const c = porPersona.get(key)
        if (c) {
          c.tonPagonomina += num(r.toneladas)
          c.pagoPagonomina += num(r.pago_produccion)
        }
      }
      if (!data || data.length < 1000) break
    }
    for (const c of porPersona.values()) c.deltaTon = c.tonPagonomina - c.tonAsignada

    // 7) Resumen y listados de alerta.
    const conAux = ordenes.filter((o) => o.nAux > 0)
    const sinAux = ordenes.filter((o) => o.nAux === 0 && o.tonBase > 0)
    const sinTarifa = ordenes.filter((o) => o.nAux > 0 && o.tonBase > 0 && o.tarifa === 0)
    const noFacturar = ordenes.filter((o) => !o.facturar)
    const conDif = ordenes
      .filter((o) => o.fuente === "bascula" && o.tonProducto > 0 && Math.abs(o.tonBase - o.tonProducto) > 0.05)
      .sort((a, b) => Math.abs(b.tonBase - b.tonProducto) - Math.abs(a.tonBase - a.tonProducto))

    const colaboradores = Array.from(porPersona.values()).sort((a, b) => b.tonAsignada - a.tonAsignada)
    for (const c of colaboradores) c.detalle.sort((a, b) => (a.fecha < b.fecha ? -1 : a.fecha > b.fecha ? 1 : 0))

    const tonBase = ordenes.reduce((a, o) => a + o.tonBase, 0)
    const data: ConciliacionData = {
      quincena: { anio, mes, num: quincena, desde, hasta },
      resumen: {
        ordenes: ordenes.length,
        ordenesBascula: ordenes.filter((o) => o.fuente === "bascula").length,
        tonBase,
        tonProducto: ordenes.reduce((a, o) => a + o.tonProducto, 0),
        tonAsignada: conAux.reduce((a, o) => a + o.tonBase, 0),
        valorCalculado: ordenes.reduce((a, o) => a + o.valorPago, 0),
        tonPagonomina: colaboradores.reduce((a, c) => a + c.tonPagonomina, 0),
        pagoPagonomina: colaboradores.reduce((a, c) => a + c.pagoPagonomina, 0),
        tonSinAsignar: sinAux.reduce((a, o) => a + o.tonBase, 0),
        ordenesSinAux: sinAux.length,
        ordenesSinTarifa: sinTarifa.length,
        ordenesNoFacturar: noFacturar.length,
        tonNoFacturar: noFacturar.reduce((a, o) => a + o.tonBase, 0),
        ordenesConDiferencia: conDif.length,
        difProductoBase: conDif.reduce((a, o) => a + (o.tonBase - o.tonProducto), 0),
        auxiliaresHuerfanos: Array.from(huerfanos).sort(),
      },
      ordenesConDiferencia: conDif,
      ordenesSinAux: sinAux,
      ordenesSinTarifa: sinTarifa,
      ordenesNoFacturar: noFacturar,
      colaboradores,
    }
    return { success: true, data }
  } catch (e: any) {
    return { success: false, message: e?.message || "Error al armar la conciliación de la quincena." }
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

// ---------------------------------------------------------------------------
// AUXILIARES ↔ ASISTENCIA (quincena, LIP id 1-4) — verifica que quien cobró
// tonelaje en cabeceraoc.auxiliares realmente exista/asistió ese día. Las
// "4 fuentes" que pidió el negocio (Programación, Registro de asistencia,
// Tabla Asistencia, Visor de Asistencia) son en la práctica la MISMA tabla
// `registroasistencia` — solo cambia qué columna llena cada una y cuándo:
//   - Programación de turnos → horaentradaprogramada/horasalidaprogramada
//   - Registro de asistencia (kiosco, tabla `asistencia`) + Tabla Asistencia
//     (supervisor) → horaingreso/horasalida
//   - Visor de Asistencia → asistencia (código de novedad: incapacidad,
//     falta, etc.)
// "Asignación de personal" tampoco es un módulo aparte: es el diálogo
// "Asignar Personal" de Picking/Packing (`getCarguDescarguePersonnel` /
// `assignPersonnelToOrder` en lib/picking-actions.ts), que YA escribe
// directo en cabeceraoc.auxiliares tomando los nombres de registroasistencia
// del mismo día. Por eso el cruce real es solo: cabeceraoc.auxiliares (CSV
// de nombres, sin identificación) ↔ registroasistencia + asistencia del
// mismo (idempresa, fecha), por nombre normalizado (igual que hace
// app/api/attendance/table/route.ts) para recuperar la identificación.
// ---------------------------------------------------------------------------

const normalizeName = (n: string | null | undefined) => (n ?? "").trim().toLowerCase()

export type ClasificacionAuxiliar = "ok" | "sin_marcar" | "con_novedad" | "sin_registro"

export interface DetalleAuxiliarDia {
  persona: string
  clasificacion: ClasificacionAuxiliar
  identificacion: string | null
  puesto: string | null
  horaProgramada: string | null
  horaIngreso: string | null
  novedad: string | null
  tonPersona: number
  ordenes: string[]
}

export interface DiaAuxiliar {
  fecha: string
  planta: number
  toneladas: number
  ordenes: number
  auxiliares: number
  ok: number
  sinMarcar: number
  conNovedad: number
  sinRegistro: number
  detalle: DetalleAuxiliarDia[]
}

export interface AsistenciaAuditoriaData {
  quincena: { anio: number; mes: number; num: number; desde: string; hasta: string }
  resumen: {
    toneladas: number
    ordenes: number
    auxiliaresDistintos: number
    ok: number
    sinMarcar: number
    conNovedad: number
    sinRegistro: number
  }
  dias: DiaAuxiliar[]
}

export async function getAuxiliaresVsAsistencia(
  anio: number,
  mes: number,
  quincena: 1 | 2,
  empresa: number, // 0 = todo LIP (1-4); o un id específico
): Promise<{ success: boolean; data?: AsistenciaAuditoriaData; message?: string }> {
  try {
    const admin: any = await getSupabaseAdmin()
    const emps = [1, 2, 3, 4].includes(empresa) ? [empresa] : [1, 2, 3, 4]

    const diaIni = quincena === 1 ? 1 : 16
    const diaFin = quincena === 1 ? 15 : fin(anio, mes)
    const desde = `${anio}-${String(mes).padStart(2, "0")}-${String(diaIni).padStart(2, "0")}`
    const hasta = `${anio}-${String(mes).padStart(2, "0")}-${String(diaFin).padStart(2, "0")}`

    // 1) Órdenes del periodo — mismo universo/criterio de peso que la
    //    conciliación báscula↔pago (pesoBaseCalculo), paginado.
    const ordenesRaw: any[] = []
    for (let off = 0; ; off += 1000) {
      const { data, error } = await admin
        .from("cabeceraoc")
        .select("id, ordendecargue, fechacargue, idempresa, tipooperacion, pesovascula, pesoorden, auxiliares")
        .in("idempresa", emps)
        .gte("fechacargue", desde)
        .lte("fechacargue", hasta)
        .not("fincargue", "is", null)
        .range(off, off + 999)
      if (error) return { success: false, message: error.message }
      if (!data || data.length === 0) break
      ordenesRaw.push(...data)
      if (data.length < 1000) break
    }

    // 2) registroasistencia del periodo — Programación + Registro/Tabla
    //    Asistencia + Visor viven todos en esta tabla.
    const registro: any[] = []
    for (let off = 0; ; off += 1000) {
      const { data, error } = await admin
        .from("registroasistencia")
        .select("identificacion, nombre, idempresa, fecha, puesto, horaentradaprogramada, horasalidaprogramada, horaingreso, horasalida, asistencia")
        .in("idempresa", emps)
        .gte("fecha", desde)
        .lte("fecha", hasta)
        .range(off, off + 999)
      if (error) return { success: false, message: error.message }
      if (!data || data.length === 0) break
      registro.push(...data)
      if (data.length < 1000) break
    }

    // 3) asistencia (kiosco) del periodo — señal más confiable de "sí
    //    marcó ingreso" (registroasistencia.horaingreso es solo un sync
    //    best-effort, ver app/api/attendance/register/route.ts).
    const kiosco: any[] = []
    for (let off = 0; ; off += 1000) {
      const { data, error } = await admin
        .from("asistencia")
        .select("identificacion, idempresa, fecha, hora")
        .in("idempresa", emps)
        .gte("fecha", desde)
        .lte("fecha", hasta)
        .range(off, off + 999)
      if (error) break
      if (!data || data.length === 0) break
      kiosco.push(...data)
      if (data.length < 1000) break
    }
    const kioscoSet = new Set<string>(kiosco.map((k) => `${Number(k.idempresa)}|${String(k.fecha).slice(0, 10)}|${String(k.identificacion || "").trim()}`))

    // 4) Mapa (idempresa|fecha|nombreNormalizado) -> estado agregado del
    //    día (OR entre filas si hay multi-turno).
    interface Estado {
      identificacion: string | null
      puesto: string | null
      horaProgramada: string | null
      horaIngreso: string | null
      novedad: string | null
      programado: boolean
      marcoAsistencia: boolean
    }
    const estadoMap = new Map<string, Estado>()
    for (const r of registro) {
      const fecha = String(r.fecha).slice(0, 10)
      const idempresa = Number(r.idempresa)
      const key = `${idempresa}|${fecha}|${normalizeName(r.nombre)}`
      const identificacion = String(r.identificacion || "").trim() || null
      const programado = !!(r.horaentradaprogramada || r.horasalidaprogramada)
      const marcoKiosco = identificacion ? kioscoSet.has(`${idempresa}|${fecha}|${identificacion}`) : false
      const marcoAsistencia = marcoKiosco || !!r.horaingreso
      const novedad = String(r.asistencia || "").trim() || null
      const prev = estadoMap.get(key)
      if (!prev) {
        estadoMap.set(key, {
          identificacion,
          puesto: r.puesto || null,
          horaProgramada: r.horaentradaprogramada || r.horasalidaprogramada || null,
          horaIngreso: r.horaingreso || null,
          novedad,
          programado,
          marcoAsistencia,
        })
      } else {
        prev.identificacion = prev.identificacion || identificacion
        prev.puesto = prev.puesto || r.puesto || null
        prev.horaProgramada = prev.horaProgramada || r.horaentradaprogramada || r.horasalidaprogramada || null
        prev.horaIngreso = prev.horaIngreso || r.horaingreso || null
        prev.novedad = prev.novedad || novedad
        prev.programado = prev.programado || programado
        prev.marcoAsistencia = prev.marcoAsistencia || marcoAsistencia
      }
    }

    // 5) Cruzar cada auxiliar de cada orden contra el mapa y agregar por
    //    (fecha, planta).
    const porDia = new Map<string, DiaAuxiliar>()
    for (const o of ordenesRaw) {
      const planta = Number(o.idempresa)
      const tipo = String(o.tipooperacion || "").trim()
      const fecha = String(o.fechacargue).slice(0, 10)
      const auxiliares = String(o.auxiliares || "")
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean)
      if (auxiliares.length === 0) continue
      const { peso: tonBase } = pesoBaseCalculo(planta, tipo, num(o.pesovascula), num(o.pesoorden))
      if (tonBase <= 0) continue
      const tonPersona = tonBase / auxiliares.length

      const diaKey = `${fecha}|${planta}`
      if (!porDia.has(diaKey)) {
        porDia.set(diaKey, {
          fecha,
          planta,
          toneladas: 0,
          ordenes: 0,
          auxiliares: 0,
          ok: 0,
          sinMarcar: 0,
          conNovedad: 0,
          sinRegistro: 0,
          detalle: [],
        })
      }
      const dia = porDia.get(diaKey)!
      dia.ordenes += 1
      dia.toneladas += tonBase

      for (const p of auxiliares) {
        const estado = estadoMap.get(`${planta}|${fecha}|${normalizeName(p)}`)
        let clasificacion: ClasificacionAuxiliar
        if (!estado) clasificacion = "sin_registro"
        else if (estado.novedad) clasificacion = "con_novedad"
        else if (!estado.marcoAsistencia) clasificacion = "sin_marcar"
        else clasificacion = "ok"

        const existente = dia.detalle.find((d) => d.persona.toUpperCase() === p.toUpperCase())
        if (existente) {
          existente.tonPersona += tonPersona
          existente.ordenes.push(o.ordendecargue || "")
        } else {
          dia.detalle.push({
            persona: p,
            clasificacion,
            identificacion: estado?.identificacion || null,
            puesto: estado?.puesto || null,
            horaProgramada: estado?.horaProgramada || null,
            horaIngreso: estado?.horaIngreso || null,
            novedad: estado?.novedad || null,
            tonPersona,
            ordenes: [o.ordendecargue || ""],
          })
        }
      }
    }

    // 6) Totales por día (a partir del detalle ya deduplicado por persona).
    for (const dia of porDia.values()) {
      dia.auxiliares = dia.detalle.length
      for (const d of dia.detalle) {
        if (d.clasificacion === "ok") dia.ok += 1
        else if (d.clasificacion === "sin_marcar") dia.sinMarcar += 1
        else if (d.clasificacion === "con_novedad") dia.conNovedad += 1
        else dia.sinRegistro += 1
      }
      dia.detalle.sort((a, b) => {
        const ORDEN: Record<ClasificacionAuxiliar, number> = { sin_registro: 0, con_novedad: 1, sin_marcar: 2, ok: 3 }
        return ORDEN[a.clasificacion] - ORDEN[b.clasificacion] || a.persona.localeCompare(b.persona)
      })
    }

    const dias = Array.from(porDia.values()).sort((a, b) => (a.fecha < b.fecha ? 1 : a.fecha > b.fecha ? -1 : a.planta - b.planta))

    const personasDistintas = new Set<string>()
    let ok = 0,
      sinMarcar = 0,
      conNovedad = 0,
      sinRegistro = 0
    for (const dia of dias) {
      for (const d of dia.detalle) {
        personasDistintas.add(normalizeName(d.persona) + "|" + dia.planta)
        if (d.clasificacion === "ok") ok += 1
        else if (d.clasificacion === "sin_marcar") sinMarcar += 1
        else if (d.clasificacion === "con_novedad") conNovedad += 1
        else sinRegistro += 1
      }
    }

    const data: AsistenciaAuditoriaData = {
      quincena: { anio, mes, num: quincena, desde, hasta },
      resumen: {
        toneladas: dias.reduce((a, d) => a + d.toneladas, 0),
        ordenes: dias.reduce((a, d) => a + d.ordenes, 0),
        auxiliaresDistintos: personasDistintas.size,
        ok,
        sinMarcar,
        conNovedad,
        sinRegistro,
      },
      dias,
    }
    return { success: true, data }
  } catch (e: any) {
    return { success: false, message: e?.message || "Error al armar el cruce de auxiliares vs. asistencia." }
  }
}
