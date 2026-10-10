// Novedades del conteo físico → código de corrección (nomenclatura LIPgo).
//
// El contador escribe la novedad en la línea (lote por lote); el revisor, en
// "Diferencias", ve el código que el sistema propone a partir de ese texto y
// lo confirma o lo cambia antes de aplicar. Es la lógica del documento de
// inventario físico de SAP: contar → analizar la diferencia con su causa →
// contabilizar con el tipo de movimiento que corresponde.
//
// Puro: sin acceso a datos, usable en cliente y servidor. Las reglas vienen
// del diccionario editable (tabla sig_conteo_novedad_regla, SQL 214); si no
// hay reglas guardadas se usan las fijas de REGLAS_FIJAS. Decisión de
// gerencia 2026-10-02.

export type CodigoNovedad = "701" | "702" | "309" | "311" | "653" | "551" | "344" | "654"

/**
 * LOS DOS CONTEOS NO SON LO MISMO, y de aquí sale casi todo lo demás (gerencia, 2026-10-10):
 *
 *   TOTAL    Se hace el primer día (o los primeros días) del mes y FIJA el inventario inicial.
 *            Es el único donde el 701 (sobrante) y el 702 (faltante) tienen sentido: la
 *            diferencia ya se investigó durante el mes y se cierra con documento soporte y
 *            aprobación de gerencia.
 *   CÍCLICO  Se hace TODOS LOS DÍAS y compara la foto del día contra el sistema de ese día.
 *            Aquí la diferencia **no es el problema, es el síntoma**: casi siempre es una avería
 *            que nadie pasó por el 551 o una devolución que no se entró. Así que el cíclico
 *            corrige, pero **con el código que es**, nunca con un ajuste genérico: un 701/702
 *            iguala el número y borra la evidencia justo del problema que el conteo encontró.
 *
 * Es la misma disciplina del código de causa de los sistemas de clase mundial (SAP, Manhattan):
 * el ajuste y su explicación son un solo registro, no dos cosas distintas.
 */
export type TipoConteo = "total" | "ciclico"

/** Códigos que NO se pueden usar en un conteo cíclico: son el ajuste sin causa. */
export const CODIGOS_SOLO_CONTEO_TOTAL: CodigoNovedad[] = ["701", "702"]

export function esConteoCiclico(tipo: string | null | undefined): boolean {
  return String(tipo ?? "total").trim().toLowerCase() === "ciclico"
}

/** ¿Ese código se puede aplicar en un conteo de este tipo? */
export function codigoPermitidoEnConteo(codigo: string | null | undefined, tipo: string | null | undefined): boolean {
  if (!esConteoCiclico(tipo)) return true
  return !CODIGOS_SOLO_CONTEO_TOTAL.includes(String(codigo ?? "") as CodigoNovedad)
}

export const MOTIVO_CODIGO_NO_PERMITIDO =
  "En un conteo cíclico no se puede ajustar con 701 ni 702: esos son del Conteo total de cierre de mes. " +
  "La diferencia se corrige con el código de su causa (551 avería, 653 devolución, 309 cruce de lote, 311 mal ubicado). " +
  "Si todavía no se sabe la causa, el hallazgo queda informado y sin corregir."

export interface OpcionCodigo {
  codigo: CodigoNovedad
  etiqueta: string
  /** Para qué signo de diferencia aplica: sobrante (+), faltante (−) o ambos. */
  aplicaA: "sobrante" | "faltante" | "ambos"
  /** Necesita una línea pareja del mismo producto: otro lote (309) u otra ubicación (311). */
  pareja: "lote" | "ubicacion" | null
  /** Se puede aplicar desde el conteo. 344 (cuarentena) se hace en Transacciones de Inventario. */
  aplicable: boolean
  /** tipo que se guarda en la corrección (postCorreccionInvtrans trata "averia" como Reproceso). */
  tipo: string
}

export const OPCIONES_CODIGO: OpcionCodigo[] = [
  { codigo: "701", etiqueta: "701 · Sobrante", aplicaA: "sobrante", pareja: null, aplicable: true, tipo: "sobrante" },
  { codigo: "702", etiqueta: "702 · Faltante", aplicaA: "faltante", pareja: null, aplicable: true, tipo: "faltante" },
  { codigo: "309", etiqueta: "309 · Cruce de lote (pareja: otro lote)", aplicaA: "ambos", pareja: "lote", aplicable: true, tipo: "reclasificacion" },
  { codigo: "311", etiqueta: "311 · Mal ubicado (pareja: otra ubicación)", aplicaA: "ambos", pareja: "ubicacion", aplicable: true, tipo: "traslado" },
  { codigo: "653", etiqueta: "653 · Devolución de cliente", aplicaA: "sobrante", pareja: null, aplicable: true, tipo: "devolucion" },
  { codigo: "551", etiqueta: "551 · Avería / merma", aplicaA: "faltante", pareja: null, aplicable: true, tipo: "averia" },
  { codigo: "344", etiqueta: "344 · Cuarentena (se aplica en Transacciones)", aplicaA: "ambos", pareja: null, aplicable: false, tipo: "cuarentena" },
  // Un sobrante por error de cargue es producto que volvió, y eso se corrige con el 654, que
  // DESCUENTA de la orden despachada. Sin el número de la orden no se puede hacer, y un conteo no
  // lo sabe: gerencia, 2026-10-10, "sin orden no debe funcionar". Así que el conteo lo PROPONE y
  // manda a Transacciones de Inventario, pero no lo aplica (igual que el 344 de cuarentena).
  { codigo: "654", etiqueta: "654 · Devolución por mal cargue (se aplica en Transacciones, con la orden)", aplicaA: "sobrante", pareja: null, aplicable: false, tipo: "devolucion_mal_cargue" },
]

/**
 * Novedades que NO son una causa: dicen que todavía se está mirando. Esas líneas no se corrigen
 * con ningún código, se RECUENTAN — que es el paso que el estándar pone antes de creerle a una
 * diferencia, y el que mata la mayoría de ellas (producto en otra ubicación, una entrada sin
 * ubicar, un picking sin confirmar). Gerencia, 2026-10-10: "en verificación no es una causa".
 */
const PATRONES_RECUENTO = [
  /\ben verificaci/,
  /\bverificand/,
  /\bpor (confirmar|verificar|revisar)\b/,
  /\brevisand/,
  /\bpendiente de (revis|confirm|verific)/,
  /\bse esta (contando|revisando|verificando)/,
]

/** ¿La novedad dice "todavía estoy mirando" en vez de dar una causa? */
export function sugiereRecuento(novedad: string | null | undefined): boolean {
  const t = normalizarNovedad(novedad)
  return t !== "" && PATRONES_RECUENTO.some((re) => re.test(t))
}

export function opcionDe(codigo: string | null | undefined): OpcionCodigo | undefined {
  return OPCIONES_CODIGO.find((o) => o.codigo === codigo)
}

/** Minúsculas, sin tildes, espacios colapsados. */
export function normalizarNovedad(texto: string | null | undefined): string {
  return String(texto ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\s+/g, " ")
    .trim()
}

/** Regla del diccionario: un patrón (texto simple o /regex/) que lleva a un código. */
export interface ReglaNovedad {
  id?: number
  codigo: string
  /** Texto simple (se busca normalizado) o expresión regular si empieza por "/". */
  patron: string
  etiqueta?: string | null
  orden?: number
}

// Diccionario fijo (semilla del editable). Orden: lo más específico primero.
export const REGLAS_FIJAS: ReglaNovedad[] = [
  { codigo: "344", patron: "cuarentena", etiqueta: "Cuarentena", orden: 10 },
  { codigo: "344", patron: "/\\bcalidad\\b/", etiqueta: "Retenido por calidad", orden: 11 },
  { codigo: "344", patron: "/bloquead|retenid/", etiqueta: "Bloqueado / retenido", orden: 12 },
  // DEVUELTO A LA PLANTA POR AVERÍA. Va ANTES del 311 a propósito: el 311 se queda con cualquier
  // frase que diga "traslado" y exige una línea pareja en otra ubicación, así que
  // "traslado a indupan por averia" quedaba trabada sin pareja posible. Lo que manda aquí es la
  // avería: gerencia, 2026-10-10, "el coordinador lo envió de regreso a la planta porque estaba
  // dañado". Exige las DOS cosas en el texto (que se movió y que estaba dañado) para no robarle
  // al 311 un traslado normal.
  { codigo: "551", patron: "/(traslad|envi|regres|devolv|retorn)[\\s\\S]{0,40}(aver|danad|mal estado|vencid|mojad|rot)/", etiqueta: "Devuelto a la planta por avería", orden: 18 },
  { codigo: "551", patron: "/(aver|danad|mal estado)[\\s\\S]{0,40}(traslad|envi|regres|devolv|retorn)/", etiqueta: "Devuelto a la planta por avería", orden: 19 },
  { codigo: "309", patron: "cruce de lote", etiqueta: "Cruce de lote", orden: 20 },
  { codigo: "309", patron: "/lote (equivocad|cruzad|cambiad|errad|trocad|incorrect)/", etiqueta: "Lote equivocado", orden: 21 },
  { codigo: "309", patron: "/\\bes del lote\\b|\\botro lote\\b|\\bmal lote\\b|lote mal|cambio de lote|lote diferente/", etiqueta: "Es de otro lote", orden: 22 },
  { codigo: "311", patron: "/mal ubicad|otra ubicaci|ubicaci\\S* (equivocad|errad|incorrect)|cambio de ubicaci/", etiqueta: "Mal ubicado", orden: 30 },
  { codigo: "311", patron: "/\\btraslad|\\bmovid[oa]|\\best(a|aba|an|aban) en [a-z]{1,3}-?\\d|\\ben (otra )?(bodega|estiba|posicion)/", etiqueta: "Está en otra ubicación", orden: 31 },
  // ERROR DE CARGUE: producto que volvió porque se cargó mal. Se corrige con el 654, que descuenta
  // de la orden despachada, así que necesita la orden y NO se aplica desde el conteo.
  { codigo: "654", patron: "/error de cargue|mal cargue|mal cargad|cargue errad|se cargo mal/", etiqueta: "Volvió por error de cargue (necesita la orden)", orden: 35 },
  { codigo: "653", patron: "/devoluci|devuelt|\\bregres|rechaz|reingres/", etiqueta: "Devolución de cliente", orden: 40 },
  // PASADO A GRANEL. Gerencia, 2026-10-10: "lo pasan a granel porque le falta producto al total
  // original" — el bulto no tiene las unidades que debería, así que lo que falta es merma.
  { codigo: "551", patron: "/\\bgranel/", etiqueta: "Pasado a granel: al bulto le falta producto", orden: 45 },
  { codigo: "551", patron: "/aver[i]a|\\brot[oa]s?\\b|danad|mojad|\\bmerma|reproces|vencid|contaminad|\\bplaga|humed|rasgad|desperdici|\\bmal estado/", etiqueta: "Avería / merma", orden: 50 },
  { codigo: "702", patron: "/faltante|\\bfalta|de menos|\\brobo\\b|hurto|perdid|no aparec|no esta|no hay/", etiqueta: "Faltante", orden: 60 },
  { codigo: "701", patron: "/sobrante|\\bsobra|de mas\\b|aparecio|encontrad/", etiqueta: "Sobrante", orden: 70 },
]

/** Compila el patrón de una regla: /regex/ o texto simple normalizado (escapado). Null si la regex es inválida. */
export function compilarPatron(patron: string): RegExp | null {
  const p = String(patron ?? "").trim()
  if (!p) return null
  try {
    if (p.startsWith("/")) {
      const fin = p.lastIndexOf("/")
      const cuerpo = fin > 0 ? p.slice(1, fin) : p.slice(1)
      // El texto ya viene normalizado (minúsculas, sin tildes); el patrón se escribe igual.
      return new RegExp(cuerpo, "i")
    }
    const simple = normalizarNovedad(p).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
    return new RegExp(simple, "i")
  } catch {
    return null
  }
}

export interface PropuestaNovedad {
  codigo: CodigoNovedad
  etiqueta: string
  tipo: string
  /** Qué parte de la novedad disparó la propuesta (para mostrarla); null si es el valor por defecto. */
  coincidencia: string | null
  pareja: "lote" | "ubicacion" | null
  aplicable: boolean
  /** Aviso cuando la novedad sugiere un código que no cuadra con el signo de la diferencia. */
  aviso: string | null
}

/**
 * Propone el código para una línea con diferencia a partir de su novedad.
 * Sin novedad o sin coincidencia: 701 si sobra, 702 si falta (como hoy).
 * Si la novedad sugiere un código que no admite ese signo (p. ej. "avería" en
 * un sobrante), se vuelve al código por defecto y se deja el aviso.
 * `reglas`: diccionario editable; si no se pasa (o está vacío) se usan las fijas.
 */
export function proponerCodigo(novedad: string | null | undefined, diferencia: number, reglas?: ReglaNovedad[] | null): PropuestaNovedad {
  const signo: "sobrante" | "faltante" = diferencia < 0 ? "faltante" : "sobrante"
  const porDefecto = opcionDe(signo === "faltante" ? "702" : "701")!
  const texto = normalizarNovedad(novedad)
  const base = (o: OpcionCodigo, coincidencia: string | null, aviso: string | null): PropuestaNovedad => ({
    codigo: o.codigo,
    etiqueta: o.etiqueta,
    tipo: o.tipo,
    coincidencia,
    pareja: o.pareja,
    aplicable: o.aplicable,
    aviso,
  })
  if (!texto) return base(porDefecto, null, null)
  const lista = (reglas && reglas.length ? reglas : REGLAS_FIJAS).slice().sort((a, b) => (a.orden ?? 100) - (b.orden ?? 100))
  for (const regla of lista) {
    const o = opcionDe(regla.codigo)
    if (!o) continue
    const re = compilarPatron(regla.patron)
    if (!re) continue
    const m = texto.match(re)
    if (!m) continue
    if (o.aplicaA !== "ambos" && o.aplicaA !== signo) {
      return base(porDefecto, null, `La novedad sugiere ${o.etiqueta}, pero la línea es un ${signo}; se propone ${porDefecto.etiqueta}.`)
    }
    return base(o, m[0], null)
  }
  return base(porDefecto, null, null)
}

/**
 * Opciones válidas para el selector de una línea según el signo de su diferencia y el TIPO de
 * conteo. En un cíclico no se ofrecen 701 ni 702: si no hay causa, no hay corrección.
 */
export function opcionesPara(diferencia: number, tipo?: string | null): OpcionCodigo[] {
  const signo = diferencia < 0 ? "faltante" : "sobrante"
  return OPCIONES_CODIGO.filter(
    (o) => (o.aplicaA === "ambos" || o.aplicaA === signo) && codigoPermitidoEnConteo(o.codigo, tipo),
  )
}

export interface PropuestaConteo extends PropuestaNovedad {
  /**
   * true = esta línea NO se puede corregir todavía: es un cíclico y su novedad no dice ninguna
   * causa real, así que el único código posible sería el genérico, y ese está prohibido aquí.
   * El hallazgo se informa y se guarda, y espera a que alguien escriba qué pasó.
   */
  requiereCausa: boolean
  /** true = la novedad dice que todavía están mirando: lo que toca es RECONTAR, no corregir. */
  recontar: boolean
}

/**
 * La propuesta de código para una línea, ya mirando el tipo de conteo.
 *
 * En un conteo TOTAL se comporta igual que `proponerCodigo` (701/702 por defecto). En un CÍCLICO,
 * si la novedad no lleva a una causa real, no se propone nada: `requiereCausa` queda en true y el
 * `codigo` es el genérico solo como referencia de lo que NO se va a aplicar. Esto es lo que evita
 * que el conteo diario tape con un ajuste lo que debería salir por avería o devolución.
 */
export function propuestaParaConteo(
  novedad: string | null | undefined,
  diferencia: number,
  tipo?: string | null,
  reglas?: ReglaNovedad[] | null,
): PropuestaConteo {
  const p = proponerCodigo(novedad, diferencia, reglas)
  const recontar = sugiereRecuento(novedad)
  const requiereCausa = esConteoCiclico(tipo) && !codigoPermitidoEnConteo(p.codigo, tipo)
  return {
    ...p,
    requiereCausa,
    recontar,
    aviso: recontar
      ? "La novedad dice que todavía se está verificando, y eso no es una causa: lo que toca es RECONTAR la línea, no corregirla. La mayoría de las diferencias se caen en el recuento."
      : requiereCausa
        ? MOTIVO_CODIGO_NO_PERMITIDO
        : p.aviso,
  }
}

/** Umbral por defecto (unidades) a partir del cual una corrección del conteo exige clave personal. */
export const UMBRAL_CLAVE_UNIDADES_DEFECTO = 50

/** Código de reverso de una corrección contabilizada (catálogo LIPgo). 309 se reversa con 309 en sentido contrario. */
export function codigoReversoDe(cod: string | null | undefined, direccion: string | null | undefined): { codigo: string; etiqueta: string } | null {
  switch (String(cod ?? "")) {
    case "701":
    case "653":
      return { codigo: "102", etiqueta: "102 · Reverso de ingreso" }
    case "702":
      return { codigo: "602", etiqueta: "602 · Reverso de salida" }
    case "551":
      return { codigo: "552", etiqueta: "552 · Reverso de merma" }
    case "311":
      return { codigo: "312", etiqueta: "312 · Reverso de traslado" }
    case "309":
      return { codigo: "309", etiqueta: `309 · Reclasificación en sentido contrario (${direccion === "salida" ? "vuelve a entrar" : "vuelve a salir"})` }
    default:
      return null // 102/602/552/312 y otros: no se reversan desde aquí
  }
}
