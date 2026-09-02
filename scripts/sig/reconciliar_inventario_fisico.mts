// Reconciliación de inventario físico contra el sistema, reutilizable por
// proyecto. Fases A-C: SOLO LECTURA -- produce un reporte de verificación y
// se detiene. Las fases D-G (escritura real, vía crearCuadre/
// generarAjustesCuadre/registrarAjusteInventario) se agregan en un script
// aparte, después de que el reporte de esta fase quede confirmado.
//
// Uso: npx tsx --env-file=.env.local scripts/sig/reconciliar_inventario_fisico.mts \
//        --proyecto 1 --corte 2026-09-01 --input scripts/sig/data/id1-fisico-2026-09.json

import { createClient } from "@supabase/supabase-js"
import * as fs from "fs"
import { calcularStockAlCorte } from "../../lib/sig-actions"

interface FilaFisica {
  producto: string
  lote: string
  location: string
  fisico: number
  nota: string | null
}

function parseArgs() {
  const args = process.argv.slice(2)
  const get = (flag: string) => {
    const i = args.indexOf(flag)
    return i >= 0 ? args[i + 1] : undefined
  }
  const proyectoId = Number(get("--proyecto"))
  const corte = get("--corte")
  const input = get("--input")
  if (!proyectoId || !corte || !input) {
    console.error("Uso: --proyecto <id> --corte <YYYY-MM-DD> --input <archivo.json>")
    process.exit(1)
  }
  return { proyectoId, corte, input }
}

const norm = (s: any): string => String(s ?? "").trim().replace(/\s+/g, " ").toUpperCase()

// Misma función exacta que calcularStockAlCorte -- invtrans.creado es UTC,
// Colombia es UTC-5, comparar por fecha calendario debe pasar por acá.
function fechaColombiaDe(iso: string): string {
  if (!iso) return ""
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Bogota", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(iso))
}

// Alias humano-confirmados para nombres ambiguos/abreviados del archivo fisico.
const ALIAS_PRODUCTO: Record<string, string> = {
  "NIEVE PAPEL 25": "PT000016", // confirmado por el usuario: PT LA NIEVE PAPEL PANADERIA 25KG
}

// Codigos excluidos de este reconciliado (subproductos de proceso, pendientes
// para una pasada aparte -- confirmado por el usuario: el archivo fisico
// actual solo cubre producto terminado, no subproductos).
const CODIGOS_EXCLUIDOS = new Set<string>([
  "PT000009", // Mogolla Kg. -- categoria "SUB PRODUCTO"
  "PT000012", // Salvado Kg. -- categoria "SUB PRODUCTO"
  "PT000100", // Harina de Tercera -- categoria "SUB PRODUCTO"
])

async function main() {
  const { proyectoId, corte, input } = parseArgs()
  const env = fs.readFileSync(".env.local", "utf8")
  const getEnv = (k: string) => env.match(new RegExp(`^${k}=(.*)$`, "m"))?.[1]?.trim()
  const supabase = createClient(getEnv("NEXT_PUBLIC_SUPABASE_URL")!, getEnv("SUPABASE_SERVICE_ROLE_KEY")!)

  const filasFisicas: FilaFisica[] = JSON.parse(fs.readFileSync(input, "utf8"))
  console.log(`Cargadas ${filasFisicas.length} filas de ${input}\n`)

  // ================= FASE A: resolver productos y ubicaciones =================

  // Candidatos = todo codproducto visto alguna vez en saldoinvdetalle del proyecto.
  const codsVistos = new Set<string>()
  const nombresPorCodEnSitio: Record<string, Set<string>> = {} // variantes historicas locales
  {
    let from = 0
    while (true) {
      const { data } = await supabase
        .from("saldoinvdetalle")
        .select("codproducto,nombreproducto")
        .eq("idempresa", proyectoId)
        .range(from, from + 999)
      for (const r of data ?? []) {
        if (!r.codproducto) continue
        codsVistos.add(r.codproducto)
        ;(nombresPorCodEnSitio[r.codproducto] ||= new Set()).add(r.nombreproducto || "")
      }
      if (!data || data.length < 1000) break
      from += 1000
      if (from > 60000) break
    }
  }
  console.log(`Códigos de producto vistos alguna vez en ID${proyectoId}: ${codsVistos.size}`)

  // Nombre primario (fuente confiable): productos.nombre por codigo, GLOBAL.
  const nombrePrimarioPorCod: Record<string, string> = {}
  {
    const codigos = Array.from(codsVistos)
    for (let i = 0; i < codigos.length; i += 200) {
      const { data } = await supabase.from("productos").select("codigo,nombre").in("codigo", codigos.slice(i, i + 200))
      for (const p of data ?? []) if (p.nombre) nombrePrimarioPorCod[p.codigo] = p.nombre
    }
  }

  // Mapa NORMALIZADO -> lista de codproducto candidatos (primario + variantes locales)
  const porNombreNormalizado: Record<string, { cod: string; via: "primario" | "variante_local" }[]> = {}
  for (const cod of codsVistos) {
    const primario = nombrePrimarioPorCod[cod]
    if (primario) {
      const k = norm(primario)
      ;(porNombreNormalizado[k] ||= []).push({ cod, via: "primario" })
    }
    for (const variante of nombresPorCodEnSitio[cod] ?? []) {
      if (!variante) continue
      const k = norm(variante)
      if (k === norm(primario || "")) continue // ya contado como primario
      ;(porNombreNormalizado[k] ||= []).push({ cod, via: "variante_local" })
    }
  }

  // Ubicaciones conocidas: locations (scoped) UNION observadas en saldoinvdetalle/invtrans del proyecto.
  const ubicacionesConocidas = new Set<string>()
  {
    const { data: locs } = await supabase.from("locations").select("codigo").eq("idempresa", proyectoId)
    for (const l of locs ?? []) if (l.codigo) ubicacionesConocidas.add(norm(l.codigo))
    let from = 0
    while (true) {
      const { data } = await supabase.from("saldoinvdetalle").select("location").eq("idempresa", proyectoId).range(from, from + 999)
      for (const r of data ?? []) if (r.location) ubicacionesConocidas.add(norm(r.location))
      if (!data || data.length < 1000) break
      from += 1000
      if (from > 60000) break
    }
  }

  // Resolver cada fila fisica.
  type FilaResuelta = FilaFisica & { codproducto: string | null; matchVia: string | null; candidatos: string[]; locationNueva: boolean }
  const resueltas: FilaResuelta[] = filasFisicas
    .filter((f) => {
      const cands = porNombreNormalizado[norm(f.producto)] ?? []
      const codsUnicos = Array.from(new Set(cands.map((c) => c.cod)))
      const codAlias = ALIAS_PRODUCTO[norm(f.producto)]
      const cod = codAlias ?? (codsUnicos.length === 1 ? codsUnicos[0] : null)
      return !cod || !CODIGOS_EXCLUIDOS.has(cod) // filas de codigos excluidos ni siquiera entran al reporte
    })
    .map((f) => {
      const cands = porNombreNormalizado[norm(f.producto)] ?? []
      const codsUnicos = Array.from(new Set(cands.map((c) => c.cod)))
      const codAlias = ALIAS_PRODUCTO[norm(f.producto)]
      const codproducto = codAlias ?? (codsUnicos.length === 1 ? codsUnicos[0] : null)
      const matchVia = codAlias ? "alias_confirmado" : codsUnicos.length === 1 ? cands.find((c) => c.cod === codsUnicos[0])!.via : null
      const locationNueva = !ubicacionesConocidas.has(norm(f.location))
      return { ...f, codproducto, matchVia, candidatos: codsUnicos, locationNueva }
    })

  const sinResolver = resueltas.filter((r) => r.codproducto === null)
  const viaVarianteLocal = resueltas.filter((r) => r.matchVia === "variante_local")
  const ubicacionesNuevas = Array.from(new Set(resueltas.filter((r) => r.locationNueva).map((r) => r.location)))

  // ================= FASE B: sistema real al corte =================
  // La foto representa el CIERRE del corte (despues de las salidas de ese
  // mismo dia -- confirmado por el usuario: las ordenes IND20260901... ya
  // estan descontadas ahi). Pero el conteo que se registra debe quedar con
  // fecha la APERTURA de ese dia (mismo criterio que todo el dia con ID3:
  // cuadre.fecha = primer dia del periodo, igual que calcularStockAlCorte).
  // Se calculan los DOS cortes (apertura y el dia siguiente = cierre) para
  // reconstruir, LOTE POR LOTE, cuanto salio ese dia especifico -- y sumarlo
  // de vuelta al fisico de la foto, no como ajuste global.
  const corteApertura = corte
  const corteCierre = (() => {
    const d = new Date(`${corte}T00:00:00Z`)
    d.setUTCDate(d.getUTCDate() + 1)
    return d.toISOString().slice(0, 10)
  })()
  console.log(`\nCalculando stock al corte de APERTURA ${corteApertura} (el que se va a registrar)...`)
  const { porLote: porLoteApertura } = await calcularStockAlCorte(supabase, proyectoId, corteApertura)
  console.log(`Calculando stock al corte de CIERRE ${corteCierre} (lo que representa la foto)...`)
  const { porLote: porLoteCierre } = await calcularStockAlCorte(supabase, proyectoId, corteCierre)

  const porLote: Record<string, { codproducto: string; producto: string; lote: string; location: string; valor: number }> = {}
  const todasLasClavesSistema = new Set([...Object.keys(porLoteApertura), ...Object.keys(porLoteCierre)])
  for (const k of todasLasClavesSistema) {
    const ap = porLoteApertura[k]?.valor ?? 0
    porLote[k] = { ...(porLoteApertura[k] ?? porLoteCierre[k]), valor: ap } // "sistema" = apertura (lo que se registra)
  }
  const sistemaNoCero = Object.entries(porLote).filter(([, v]) => v.valor !== 0 && !CODIGOS_EXCLUIDOS.has(v.codproducto))
  console.log(`Claves con sistema (apertura) != 0: ${sistemaNoCero.length}`)

  // ================= FASE C: reporte de verificación (no escribe nada) =================
  const keyDe = (cod: string, lote: string, location: string) => `${cod}||${lote ?? ""}||${location ?? ""}`

  // Duplicados dentro del archivo (misma clave resuelta dos veces) -- ROMPE el indice unico.
  const contadorClaves: Record<string, number> = {}
  for (const r of resueltas) {
    if (!r.codproducto) continue
    const k = keyDe(r.codproducto, r.lote, r.location)
    contadorClaves[k] = (contadorClaves[k] || 0) + 1
  }
  const duplicados = Object.entries(contadorClaves).filter(([, n]) => n > 1)

  // Merge: claves con sistema!=0 UNION claves del archivo (resueltas).
  const clavesArchivo = new Set(resueltas.filter((r) => r.codproducto).map((r) => keyDe(r.codproducto!, r.lote, r.location)))
  const clavesSistema = new Set(sistemaNoCero.map(([k]) => k))
  const todasLasClaves = new Set([...clavesArchivo, ...clavesSistema])

  const filaFisicaPorClave: Record<string, FilaResuelta> = {}
  for (const r of resueltas) if (r.codproducto) filaFisicaPorClave[keyDe(r.codproducto, r.lote, r.location)] = r

  let totalFaltante = 0, totalSobrante = 0, totalAveria = 0
  const faltantesTotales: any[] = [] // sistema!=0, ausente del archivo
  const daniadasNoFaltante: any[] = [] // NOTA=DAÑADAS pero fisico >= sistema
  const resumenLineas: any[] = []

  for (const k of todasLasClaves) {
    const sis = porLote[k]?.valor ?? 0 // sistema = apertura del corte (lo que se registra)
    // Reconstruir el fisico de APERTURA = fisico de la foto (cierre) + lo que
    // salio ESE MISMO dia para esta clave exacta (apertura - cierre, en el
    // propio sistema) -- por eso se calculan los dos cortes en Fase B.
    const deltaEseDia = (porLoteApertura[k]?.valor ?? 0) - (porLoteCierre[k]?.valor ?? 0)
    const fila = filaFisicaPorClave[k]
    const fisicoCierre = fila ? fila.fisico : 0
    const fisico = fisicoCierre + deltaEseDia // fisico reconstruido de apertura
    const diferencia = fisico - sis
    const esDaniada = fila?.nota && norm(fila.nota).includes("DAÑADA")
    resumenLineas.push({ key: k, producto: porLote[k]?.producto ?? fila?.producto, sistema: sis, fisicoCierreFoto: fisicoCierre, deltaEseDia, fisico, diferencia, nota: fila?.nota ?? null, enFoto: !!fila })
    // Solo cuenta como "faltante total" si, YA reconstruido con la salida del
    // mismo dia, sigue habiendo una diferencia negativa real -- no basta con
    // estar ausente de la foto (varias claves se explican solas con delta).
    if (!fila && diferencia < 0) faltantesTotales.push({ key: k, producto: porLote[k]?.producto, lote: porLote[k]?.lote, location: porLote[k]?.location, sistema: sis, deltaEseDia, diferencia })
    if (esDaniada && diferencia >= 0) daniadasNoFaltante.push({ key: k, producto: fila?.producto, lote: fila?.lote, location: fila?.location, sistema: sis, fisico })
    if (diferencia < 0) { if (esDaniada) totalAveria += Math.abs(diferencia); else totalFaltante += Math.abs(diferencia) }
    else if (diferencia > 0) totalSobrante += diferencia
  }

  console.log("\n" + "=".repeat(70))
  console.log("REPORTE DE VERIFICACIÓN — NO SE HA ESCRITO NADA TODAVÍA")
  console.log("=".repeat(70))

  console.log(`\n--- Productos SIN RESOLVER (${sinResolver.length}) ---`)
  for (const r of sinResolver) console.log(`  "${r.producto}" (lote=${r.lote}, loc=${r.location}, fisico=${r.fisico}) -> candidatos: [${r.candidatos.join(", ") || "ninguno"}]`)

  console.log(`\n--- Coincidencias vía nombre histórico local, NO el nombre oficial actual (${viaVarianteLocal.length}) ---`)
  for (const r of viaVarianteLocal) console.log(`  "${r.producto}" -> ${r.codproducto} (nombre oficial actual: "${nombrePrimarioPorCod[r.codproducto!] ?? "?"}")`)

  console.log(`\n--- Ubicaciones NUEVAS (no existían antes) (${ubicacionesNuevas.length}) ---`)
  for (const u of ubicacionesNuevas) console.log(`  ${u}`)

  console.log(`\n--- Claves DUPLICADAS dentro del archivo (rompería el índice único) (${duplicados.length}) ---`)
  for (const [k, n] of duplicados) console.log(`  ${k} aparece ${n} veces`)

  // ================= FASE C2: cruce con salidas reales desde el corte (por clave exacta) =================
  // Confirmado por el usuario: las salidas de una orden de cargue SÍ llevan
  // ubicación y lote exactos -- se asignan en Asignación de Lotes. Por eso
  // este cruce va por la clave exacta (codproducto+lote+location), igual que
  // calcularStockAlCorte, NO agregado por lote. Regla del usuario: si el
  // sistema registra que esa clave exacta SALIÓ (fue despachada) en algún
  // momento desde el corte hasta hoy -- no solo el día 1 -- eso PRUEBA que
  // existía en el inventario inicial, aunque el coordinador no la haya
  // contado en la foto (se le pasó por alto esa ubicación al contar el día
  // 1, y ya se despachó un día después). Se agrega a la foto con
  // fisico=sistema(apertura) y, al aplicarle esa salida real, queda en 0.
  const corteConsultaSalidas = new Date(`${corteApertura}T00:00:00Z`)
  corteConsultaSalidas.setUTCDate(corteConsultaSalidas.getUTCDate() - 1)
  const salidaPorClave: Record<string, number> = {} // codproducto||lote||location -> unidades despachadas desde el corte
  {
    let from = 0
    while (true) {
      const { data } = await supabase
        .from("invtrans")
        .select("codproducto,lote,location,tipomov,cantidad,status,creado")
        .eq("idempresa", proyectoId)
        .eq("tipomov", "Salida")
        .gte("creado", corteConsultaSalidas.toISOString())
        .order("id", { ascending: true })
        .range(from, from + 999)
      for (const r of data ?? []) {
        if (!String(r.status || "").toLowerCase().startsWith("aprob")) continue
        if (fechaColombiaDe(r.creado) < corteApertura) continue // margen UTC de 1 día -- es anterior al corte real
        const k = `${r.codproducto}||${r.lote ?? ""}||${r.location ?? ""}`
        salidaPorClave[k] = (salidaPorClave[k] || 0) + Math.abs(Number(r.cantidad) || 0)
      }
      if (!data || data.length < 1000) break
      from += 1000
      if (from > 60000) break
    }
  }

  const explicadasPorSalida: any[] = []
  const salidaParcial: any[] = []
  const faltantesGenuinos: any[] = []
  for (const f of faltantesTotales) {
    const salida = salidaPorClave[f.key] || 0
    if (salida === 0) {
      faltantesGenuinos.push(f)
    } else if (salida >= f.sistema * 0.9) {
      explicadasPorSalida.push({ ...f, salidaEncontrada: salida })
    } else {
      salidaParcial.push({ ...f, salidaEncontrada: salida })
    }
  }
  const totalExplicadoPorSalida = explicadasPorSalida.reduce((a, f) => a + Math.abs(f.diferencia), 0)
  totalFaltante -= totalExplicadoPorSalida

  console.log(`\n--- EXPLICADAS por salida real en la MISMA ubicación desde el corte -- se agregan a la foto (${explicadasPorSalida.length}) ---`)
  for (const f of explicadasPorSalida) console.log(`  ${f.producto} lote=${f.lote} loc=${f.location} sistema=${f.sistema} | salida real encontrada en esa misma ubicación=${f.salidaEncontrada} -> se agrega fisico=${f.sistema} a la foto`)

  console.log(`\n--- SALIDA PARCIAL en la misma ubicación -- NO cierra la brecha, requiere tu revisión (${salidaParcial.length}) ---`)
  for (const f of salidaParcial) console.log(`  ${f.producto} lote=${f.lote} loc=${f.location} sistema=${f.sistema} | salida real encontrada=${f.salidaEncontrada} -> solo explica una parte`)

  console.log(`\n--- FALTANTES GENUINOS: sin ninguna salida registrada en esa ubicación desde el corte (${faltantesGenuinos.length}) ---`)
  for (const f of faltantesGenuinos) console.log(`  ${f.producto} lote=${f.lote} loc=${f.location} sistema(apertura)=${f.sistema} -> diferencia real=${f.diferencia}`)

  console.log(`\n--- "DAÑADAS" pero físico >= sistema (NO se reclasifica como avería) (${daniadasNoFaltante.length}) ---`)
  for (const d of daniadasNoFaltante) console.log(`  ${d.producto} lote=${d.lote} loc=${d.location} sistema=${d.sistema} fisico=${d.fisico}`)

  console.log("\n--- TOTALES ---")
  console.log(`  Filas del archivo: ${filasFisicas.length}`)
  console.log(`  Claves a procesar (sistema≠0 ∪ archivo): ${todasLasClaves.size}`)
  console.log(`  Faltante FINAL (ya descontadas las ${explicadasPorSalida.length} explicadas por salida real): ${Math.round(totalFaltante)}`)
  console.log(`  Sobrante (unidades): ${Math.round(totalSobrante)}`)
  console.log(`  Avería/merma -- DAÑADAS con físico<sistema (unidades): ${Math.round(totalAveria)}`)
  console.log(`  Explicado por salida real (se agrega a la foto, no es faltante): ${Math.round(totalExplicadoPorSalida)}`)
  console.log(`  Sin resolver: ${sinResolver.length}  |  Ubicaciones nuevas: ${ubicacionesNuevas.length}  |  Duplicados: ${duplicados.length}`)

  const bloqueantes = sinResolver.length > 0 || duplicados.length > 0
  console.log(`\n${bloqueantes ? "⛔ HAY BLOQUEANTES — no se puede continuar hasta resolver lo de arriba." : "✅ Sin bloqueantes duros. Revisar totales y confirmar antes de escribir."}`)

  fs.writeFileSync(
    input.replace(".json", ".reporte.json"),
    JSON.stringify(
      {
        resumenLineas,
        sinResolver,
        viaVarianteLocal,
        ubicacionesNuevas,
        duplicados,
        faltantesTotales,
        explicadasPorSalida,
        salidaParcial,
        faltantesGenuinos,
        daniadasNoFaltante,
        totales: { totalFaltante, totalSobrante, totalAveria, totalExplicadoPorSalida },
      },
      null,
      2,
    ),
  )
  console.log(`\nReporte completo guardado en ${input.replace(".json", ".reporte.json")}`)
}
main()
