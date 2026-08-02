// MEDIO DE PAGO ESPERADO POR PROYECTO — reglas del negocio, confirmadas una a una.
//
//   · id1 INDUPAN  → TODO se factura a crédito al owner que corresponda. No
//                    existe el contado: un "Contado" en id1 es un error a revisar.
//   · id2 AVIMOL   → el TRANSPORTE decide:
//                      TERCEROS → CONTADO sin excepción (el cliente recoge y paga).
//                      ZAMUDIO  → CRÉDITO, SALVO las placas declaradas abajo, que
//                                 sí pagan de contado. La excepción es POR PLACA
//                                 a propósito: los datos muestran que las placas
//                                 100% Zamudio no registran un solo contado, así
//                                 que si aparece otra placa de Zamudio en contado
//                                 debe salir marcada, no tragada por una regla
//                                 general.
//                      resto (AVIMOL, INDUPAN, MOLINOS…) → CRÉDITO.
//   · id3 FUNZA    → todo crédito, igual que Indupan.
//   · id4 MEDELLÍN → el contado vive SOLO en los DESCARGUES: un cargue o una
//                    distribución de contado es un error a revisar. Dentro del
//                    descargue conviven contado y crédito (terceros pagan de
//                    contado, las transportadoras a crédito), así que ahí no se
//                    impone regla dura — los datos de abr-jul 2026 muestran
//                    descargues legítimos de ambos tipos.
//
// En todos los casos el coordinador solicita la factura desde Gestión de
// Facturas; lo que cambia es la condición de pago, no el trámite.
//
// `medioPagoEsperado` acepta un contexto opcional (placa, operación) porque las
// reglas de id2 y id4 dependen de él. Sin contexto devuelve la regla que se
// puede afirmar solo con el transporte, y null donde no alcanza — nunca adivina.

export type MedioPago = "Contado" | "Crédito"

export interface MedioPagoContexto {
  placa?: unknown
  operacion?: unknown
}

/**
 * Placas de ZAMUDIO que pagan de CONTADO en Avimol (id 2). Excepción declarada
 * y cerrada: cualquier otra placa de Zamudio sigue siendo crédito.
 */
export const PLACAS_ZAMUDIO_CONTADO = new Set([
  "TTT182", "SZN117", "TSV133", "SZN395", "WOM182", "KNK646",
  "SXS322", "LRN902", "WOM415", "ESY006", "SVB693", "SVF624",
])

const norm = (s: unknown) =>
  String(s ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase()

const normPlaca = (s: unknown) => norm(s).replace(/[^A-Z0-9]/g, "")

/**
 * ¿En este proyecto el TRANSPORTE decide la condición de pago? Solo Avimol.
 * Controla dónde el Cuadro abre el resumen por transporte y muestra esas
 * columnas — en los demás proyectos la regla no pasa por el transporte y
 * abrir la tabla por él solo estorbaría.
 */
export function proyectoConReglaMedioPago(idempresa?: number | null): boolean {
  return Number(idempresa) === 2
}

/**
 * Medio de pago que corresponde, o null si con lo que hay no se puede afirmar.
 * (id4 sin operación conocida → null; id2 con transporte vacío → null.)
 */
export function medioPagoEsperado(
  idempresa: number | null | undefined,
  transporte: unknown,
  ctx?: MedioPagoContexto,
): MedioPago | null {
  const id = Number(idempresa)

  // Indupan y Funza: crédito siempre, se mire por donde se mire.
  if (id === 1 || id === 3) return "Crédito"

  if (id === 2) {
    const tr = norm(transporte)
    if (!tr) return null
    if (tr === "TERCEROS") return "Contado"
    if (tr === "ZAMUDIO") {
      // La excepción necesita la placa; sin ella se afirma la regla general.
      if (ctx && PLACAS_ZAMUDIO_CONTADO.has(normPlaca(ctx.placa))) return "Contado"
      return "Crédito"
    }
    return "Crédito"
  }

  if (id === 4) {
    // La regla es por OPERACIÓN: sin ella no se afirma nada. En el descargue
    // conviven contado y crédito legítimamente → sin medio esperado.
    const op = norm(ctx?.operacion)
    if (!op) return null
    return op === "DESCARGUE" ? null : "Crédito"
  }

  return null
}

/**
 * RELLENA el medio de pago SOLO EN ID1 (Indupan) cuando la orden no trae el
 * dato — que es el único proyecto donde se pidió corregir esto ("me sale la
 * tarjeta de cierre día en Indupan con vehículos sin definir, si Indupan todo
 * es crédito"). CADA ID ES UN CLIENTE DISTINTO CON SU PROPIA LÓGICA: id2, id3
 * e id4 NO estaban pedidos y se dejan exactamente como siempre — un campo de
 * pago vacío sigue siendo "sin definir" ahí, sin excepción. Ampliar este
 * relleno a otro ID es una decisión aparte que se toma cuando se pida, no un
 * efecto colateral de tocar la función compartida.
 */
export function medioPagoEsperadoSinAmbiguedad(
  idempresa: number | null | undefined,
  transporte: unknown,
  ctx?: MedioPagoContexto,
): MedioPago | null {
  if (Number(idempresa) !== 1) return null
  return medioPagoEsperado(idempresa, transporte, ctx)
}

/**
 * ¿El medio de pago registrado contradice la regla? Solo cuenta como
 * incumplimiento si HAY regla y HAY dato: una orden todavía sin medio de pago
 * está pendiente de gestionar, que es otra cosa distinta a estar mal.
 */
export function medioPagoInconsistente(
  idempresa: number | null | undefined,
  transporte: unknown,
  mediopago: unknown,
  ctx?: MedioPagoContexto,
): boolean {
  const esperado = medioPagoEsperado(idempresa, transporte, ctx)
  if (!esperado) return false
  const real = norm(mediopago)
  if (!real) return false
  return real !== norm(esperado)
}
