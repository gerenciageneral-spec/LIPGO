// Escritor del archivo plano PILA de ancho fijo real (NO el .xlsx de plantilla
// que se generaba antes). Fuente: Anexo Técnico 2 "Aportes a Seguridad Social
// de Activos" (AT2 v09, 16-09-2019), anexo del Art. 1 de la Resolución 2388 de
// 2016 del Ministerio de Salud y Protección Social -- verificado que las
// resoluciones de 2025 (467, 2064) NO cambian posiciones ni longitudes del
// registro tipo 2. Las posiciones de abajo fueron validadas campo por campo
// contra el archivo real de agosto-2026 (`Agosto_2026_LIPPROGRESSIVEINTEGRAL
// LOGISTICSSAS_Pila.txt`) y datos reales de 5 trabajadores -- ver el plan de
// este cambio para el detalle de la validación.
//
// Reglas generales del anexo: los campos "N" (numérico) van justificados a la
// derecha y rellenos con CEROS a la izquierda; los campos "A" (alfanumérico)
// van justificados a la izquierda y rellenos con ESPACIOS a la derecha. Un
// campo "N" que no aplica (ej. sin novedad de ese tipo) se deja en blanco
// (espacios) en vez de ceros -- así aparece en el archivo real, no es una
// desviación del formato.
//
// DOS DESVIACIONES CONFIRMADAS entre la especificación oficial y lo que
// realmente produce el operador (Aportes en Línea) en el archivo aceptado de
// agosto-2026 -- se replican tal cual para que el archivo nuevo se comporte
// igual que el histórico que SÍ subió sin problemas:
//   1. El registro tipo 02 real mide 693 caracteres, no 686: trae 7
//      caracteres extra al final con la `actividad_economica` (ej.
//      "3522401"), fuera de la especificación oficial.
//   2. La posición 201 ("salario integral" según el anexo, valores X/blanco)
//      en la práctica trae "V" o "F" -- variable/fijo esa quincena, no
//      salario integral. Y la posición 507-512 ("código de la ARL") trae
//      literalmente "14-28" en el 100% de las 138 filas reales, no un código
//      de administradora reconocible. Ver `lib/pila-codigos-oficiales.ts`.

import { CODIGO_ARL_OBSERVADO } from "./pila-codigos-oficiales"

function campoN(valor: number | null | undefined, longitud: number): string {
  if (valor == null || !Number.isFinite(valor)) return " ".repeat(longitud)
  const texto = String(Math.round(valor))
  if (texto.length > longitud) throw new Error(`Valor numérico ${texto} excede longitud ${longitud}`)
  return texto.padStart(longitud, "0")
}

function campoA(valor: string | null | undefined, longitud: number): string {
  const texto = String(valor ?? "")
  if (texto.length > longitud) return texto.slice(0, longitud)
  return texto.padEnd(longitud, " ")
}

function campoFecha(iso: string | null | undefined): string {
  return campoA(iso ? iso.slice(0, 10) : null, 10)
}

// Tarifa como fracción "0.NNNNN..." -- `pct` en PORCENTAJE (ej. 16 = 16%),
// `decimales` = dígitos después del punto (5 para pensión/salud/CCF/SENA/
// ICBF -> campo de 7; 7 para ARL -> campo de 9).
function campoTarifa(pct: number | null | undefined, decimales: number): string {
  const frac = Math.max(0, Number(pct) || 0) / 100
  return frac.toFixed(decimales)
}

export interface DatosEncabezadoPila01 {
  anio: number
  mes: number
  numCotizantes: number
  valorTotalNomina: number
}

const NIT_APORTANTE = "901725963"
const DV_APORTANTE = "8"
const RAZON_SOCIAL_APORTANTE = "LIP PROGRESSIVE INTEGRAL LOGISTICS SAS"

export function armarRegistroTipo01(d: DatosEncabezadoPila01): string {
  const periodo = `${d.anio}-${String(d.mes).padStart(2, "0")}`
  // HALLAZGO (ver validación del plan): en el archivo real el período de
  // salud viaja UN MES ADELANTE del período de los demás sistemas
  // (ej. "2026-08" / "2026-09" para la planilla de agosto). Se replica igual
  // -- confirmar con el usuario si es la convención correcta antes de radicar.
  const mesSalud = d.mes === 12 ? 1 : d.mes + 1
  const anioSalud = d.mes === 12 ? d.anio + 1 : d.anio
  const periodoSalud = `${anioSalud}-${String(mesSalud).padStart(2, "0")}`

  return [
    campoN(1, 2), // tipo de registro "01"
    campoN(1, 1), // modalidad: 1 = electrónica
    campoN(1, 4), // secuencia
    campoA(RAZON_SOCIAL_APORTANTE, 200),
    campoA("NI", 2),
    campoA(NIT_APORTANTE, 16),
    campoN(Number(DV_APORTANTE), 1),
    campoA("E", 1), // tipo de planilla: empleados
    campoA(null, 10), // núm. planilla asociada (solo correcciones/UGPP)
    campoA(null, 10), // fecha pago planilla asociada
    campoA("U", 1), // forma de presentación: único
    campoA(null, 10), // código sucursal
    campoA(null, 40), // nombre sucursal
    campoA(CODIGO_ARL_OBSERVADO, 6),
    campoA(periodo, 7),
    campoA(periodoSalud, 7),
    campoA(null, 10), // número de radicación (lo asigna el operador)
    campoA(null, 10), // fecha de pago (la asigna el operador)
    campoN(d.numCotizantes, 5),
    campoN(d.valorTotalNomina, 12),
    campoN(1, 2), // tipo de aportante: 1 = empleador
    campoN(0, 2), // código del operador (lo asigna el sistema)
  ].join("")
}

export interface DatosDetallePila02 {
  secuencia: number
  identificacion: string
  tipoCotizante: string // ya resuelto a 2 dígitos, ej. "01"
  subtipoCotizante: string // ya resuelto a 2 dígitos, ej. "00"
  divipolaDepto: string // 2 dígitos
  divipolaMunicipio: string // 3 dígitos
  apellido1: string
  apellido2: string
  nombre1: string
  nombre2: string

  // Novedades (casillas de 1 char, "" = blanco)
  ing: string
  ret: string
  vst: string
  sln: string
  ige: string
  lma: string
  vacLr: string

  codAfp: string | null
  codEps: string | null
  codCcf: string | null

  diasPension: number
  diasSalud: number
  diasArl: number
  diasCcf: number

  salario: number
  tipoSalario: "V" | "F" // variable/fijo -- ver nota de cabecera del archivo
  ibcPension: number
  ibcSalud: number
  ibcArl: number
  ibcCcf: number

  tarifaPensionPct: number
  cotizacionPension: number
  tarifaSaludPct: number
  cotizacionSalud: number
  tarifaArlPct: number
  centroTrabajo: number
  cotizacionArl: number
  tarifaCcfPct: number
  valorCcf: number
  tarifaSenaPct: number
  valorSena: number
  tarifaIcbfPct: number
  valorIcbf: number

  exonerado: boolean
  claseRiesgo: string // "1".."5"
  fechaIngreso: string | null
  fechaRetiro: string | null
  fechaInicioSln: string | null
  fechaFinSln: string | null
  fechaInicioIge: string | null
  fechaFinIge: string | null
  fechaInicioVacLr: string | null
  fechaFinVacLr: string | null

  ibcOtrosParafiscales: number
  horasLaboradas: number
  actividadEconomica: string // los 7 caracteres extra no oficiales (ver cabecera del archivo)
}

export function armarRegistroTipo02(d: DatosDetallePila02): string {
  return [
    campoN(2, 2), // tipo de registro "02"
    campoN(d.secuencia, 5),
    campoA("CC", 2),
    campoA(d.identificacion, 16),
    campoA(d.tipoCotizante, 2),
    campoA(d.subtipoCotizante, 2),
    campoA(null, 1), // extranjero no obligado a pensión
    campoA(null, 1), // colombiano en el exterior
    campoA(d.divipolaDepto, 2),
    campoA(d.divipolaMunicipio, 3),
    campoA(d.apellido1, 20),
    campoA(d.apellido2, 30),
    campoA(d.nombre1, 20),
    campoA(d.nombre2, 30),
    campoA(d.ing, 1),
    campoA(d.ret, 1),
    campoA(null, 1), // TDE
    campoA(null, 1), // TAE
    campoA(null, 1), // TDP
    campoA(null, 1), // TAP
    campoA(null, 1), // VSP
    campoA(null, 1), // correcciones (solo planilla tipo N)
    campoA(d.vst, 1),
    campoA(d.sln, 1),
    campoA(d.ige, 1),
    campoA(d.lma, 1),
    campoA(d.vacLr, 1),
    campoA(null, 1), // AVP
    campoA(null, 1), // VCT
    campoA("00", 2), // IRL: días de incapacidad AT (LIPgo no distingue EG/AT dentro de INCAP hoy)
    campoA(d.codAfp, 6),
    campoA(null, 6), // AFP traslado
    campoA(d.codEps, 6),
    campoA(null, 6), // EPS traslado
    campoA(d.codCcf, 6),
    campoN(d.diasPension, 2),
    campoN(d.diasSalud, 2),
    campoN(d.diasArl, 2),
    campoN(d.diasCcf, 2),
    campoN(d.salario, 9),
    campoA(d.tipoSalario, 1),
    campoN(d.ibcPension, 9),
    campoN(d.ibcSalud, 9),
    campoN(d.ibcArl, 9),
    campoN(d.ibcCcf, 9),
    campoTarifa(d.tarifaPensionPct, 5),
    campoN(d.cotizacionPension, 9),
    campoN(0, 9), // aporte voluntario afiliado RAIS
    campoN(0, 9), // aporte voluntario aportante RAIS
    campoN(d.cotizacionPension, 9), // total cotización SG pensiones
    campoN(0, 9), // fondo solidaridad -- solidaridad
    campoN(0, 9), // fondo solidaridad -- subsistencia
    campoN(0, 9), // valor no retenido por aportes voluntarios
    campoTarifa(d.tarifaSaludPct, 5),
    campoN(d.cotizacionSalud, 9),
    campoN(0, 9), // valor UPC adicional
    campoA(null, 15), // núm. autorización incapacidad EG
    campoN(0, 9), // valor incapacidad EG (legado, se reporta en cero)
    campoA(null, 15), // núm. autorización licencia mat/pat
    campoN(0, 9), // valor licencia mat/pat (legado, se reporta en cero)
    campoTarifa(d.tarifaArlPct, 7),
    campoN(d.centroTrabajo, 9),
    campoN(d.cotizacionArl, 9),
    campoTarifa(d.tarifaCcfPct, 5),
    campoN(d.valorCcf, 9),
    campoTarifa(d.tarifaSenaPct, 5),
    campoN(d.valorSena, 9),
    campoTarifa(d.tarifaIcbfPct, 5),
    campoN(d.valorIcbf, 9),
    campoTarifa(0, 5), // tarifa ESAP -- no aplica a LIP
    campoN(0, 9), // valor ESAP
    campoTarifa(0, 5), // tarifa MEN -- no aplica a LIP
    campoN(0, 9), // valor MEN
    campoA(null, 2), // tipo doc cotizante principal (beneficiario UPC adicional)
    campoA(null, 16), // id cotizante principal
    campoA(d.exonerado ? "S" : "N", 1),
    campoA(CODIGO_ARL_OBSERVADO, 6),
    campoA(d.claseRiesgo, 1),
    campoA(null, 1), // indicador tarifa especial pensiones
    campoFecha(d.fechaIngreso),
    campoFecha(d.fechaRetiro),
    campoFecha(null), // fecha inicio VSP
    campoFecha(d.fechaInicioSln),
    campoFecha(d.fechaFinSln),
    campoFecha(d.fechaInicioIge),
    campoFecha(d.fechaFinIge),
    campoFecha(null), // fecha inicio LMA
    campoFecha(null), // fecha fin LMA
    campoFecha(d.fechaInicioVacLr),
    campoFecha(d.fechaFinVacLr),
    campoFecha(null), // fecha inicio VCT
    campoFecha(null), // fecha fin VCT
    campoFecha(null), // fecha inicio IRL
    campoFecha(null), // fecha fin IRL
    campoN(d.ibcOtrosParafiscales, 9),
    campoN(d.horasLaboradas, 3),
    campoA(null, 10), // fecha radicación en el exterior
    campoA(d.actividadEconomica, 7), // extensión no oficial de este operador
  ].join("")
}
