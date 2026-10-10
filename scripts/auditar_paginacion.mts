// AUDITORÍA DE PAGINACIÓN. Solo lee archivos del repo: no toca la base ni el código.
//
// Uso:  npx tsx scripts/auditar_paginacion.mts
//       npx tsx scripts/auditar_paginacion.mts --todo     (lista también lo que está bien)
//
// LA REGLA (ver lib/orden-paginacion.ts). Cada página de un `.range()` es una consulta distinta y
// Postgres NO garantiza el mismo desempate entre una página y la siguiente: sin un ORDER BY por
// una llave única, en el corte de página una fila se repite y otra se pierde. Pasó de verdad:
// dos retirados cobraban un día duplicado de vacaciones (2026-09-27).
//
// QUÉ DISTINGUE, porque no son el mismo problema:
//   PAGINADO → el `.range()` está en un bucle que recorre todas las filas (`from += 1000`,
//              `fetchAllRows`, `while`). Si le falta el orden único, es un DEFECTO.
//   TRUNCADO → un `.range(0, N)` fijo, que solo trae las primeras N filas. Ese es el problema del
//              techo, no el de la paginación, y ponerle un orden CAMBIA qué filas trae: se
//              reporta aparte y no se "arregla" con un order.
//
// QUÉ ACEPTA COMO ORDEN VÁLIDO:
//   · `aplicarOrdenEstable(q, "<tabla>")`, que es la forma preferida.
//   · Un `.order()` por `id` (las tablas reales lo tienen; las vistas de este proyecto no).
//   · Que los `.order()` incluyan TODAS las columnas de la llave declarada en `ORDEN_PAGINACION`
//     para esa tabla. El orden de significancia entre ellas no importa para la unicidad, así que
//     una pantalla puede ordenar por fecha primero y completar la llave detrás.
import { readdirSync, readFileSync, statSync } from "node:fs"
import { join, relative } from "node:path"
import { ORDEN_PAGINACION } from "../lib/orden-paginacion"

const RAIZ = process.cwd()
const DIRS = ["lib", "app", "components", "scripts"]
const TODO = process.argv.includes("--todo")

const archivos: string[] = []
const caminar = (d: string) => {
  for (const e of readdirSync(d, { withFileTypes: true })) {
    const p = join(d, e.name)
    if (e.isDirectory()) { if (!/node_modules|\.next|\.git/.test(p)) caminar(p) }
    else if (/\.(ts|tsx|mts|mjs)$/.test(e.name)) archivos.push(p)
  }
}
for (const d of DIRS) { try { if (statSync(join(RAIZ, d)).isDirectory()) caminar(join(RAIZ, d)) } catch {} }

type Hallazgo = {
  archivo: string; linea: number; tabla: string; tipo: "PAGINADO" | "TRUNCADO"
  ordenes: string[]; via: string; ok: boolean; motivo: string
}
const hallazgos: Hallazgo[] = []

for (const f of archivos) {
  if (/scripts[\\/]auditar_paginacion\.mts$/.test(f)) continue
  const txt = readFileSync(f, "utf8")
  if (!txt.includes(".range(")) continue
  const lineas = txt.split(/\r?\n/)
  let i = -1
  while ((i = txt.indexOf(".range(", i + 1)) !== -1) {
    const linea = txt.slice(0, i).split(/\r?\n/).length
    const desde = txt.lastIndexOf(".from(", i)
    const cadena = desde === -1 ? "" : txt.slice(desde, i)
    // Una consulta armada por partes (`let q = sb.from(...)` … `q.range(...)`) no cabe en la
    // cadena, así que para esos casos se mira el bloque de 45 líneas anterior.
    const bloque = lineas.slice(Math.max(0, linea - 45), linea + 3).join("\n")
    const fuente = cadena.includes(".from(") ? cadena : bloque
    const tabla = (/\.from\(\s*["'`]([^"'`]+)/.exec(cadena) ?? /\.from\(\s*["'`]([^"'`]+)/.exec(bloque) ?? [])[1] ?? "?"
    const ordenes = [...fuente.matchAll(/\.order\(\s*["'`]([^"'`]+)["'`]/g)].map((m) => m[1].trim())
    const args = txt.slice(i + 7, txt.indexOf(")", i + 7))
    const fijo = /^\s*\d+\s*,\s*[\d_]+\s*$/.test(args)
    const enBucle = /fetchAllRows|traerPaginasEnParalelo|for\s*\(|while\s*\(|\+=\s*(1000|PAGE|pageSize)|offset|desde\s*\+|from\s*\+/i.test(bloque)
    const tipo: "PAGINADO" | "TRUNCADO" = !fijo && enBucle ? "PAGINADO" : "TRUNCADO"

    const usaAyuda = /aplicarOrdenEstable\s*\(/.test(fuente) || /aplicarOrdenEstable\s*\(/.test(bloque)
    const porId = ordenes.includes("id")
    const llave = ORDEN_PAGINACION[tabla]
    const llaveCompleta = !!llave && llave.every((c) => ordenes.includes(c))
    const ok = usaAyuda || porId || llaveCompleta
    const via = usaAyuda ? "aplicarOrdenEstable" : porId ? "order(id)" : llaveCompleta ? "llave declarada" : ""
    const motivo = ok
      ? ""
      : llave
        ? `faltan de la llave declarada: ${llave.filter((c) => !ordenes.includes(c)).join(", ")}`
        : ordenes.length
          ? `ordena por [${ordenes.join(", ")}], que no se sabe único y la tabla no está declarada`
          : "no ordena por nada"
    hallazgos.push({ archivo: relative(RAIZ, f).replace(/\\/g, "/"), linea, tabla, tipo, ordenes, via, ok, motivo })
    i += 6
  }
}

const pag = hallazgos.filter((h) => h.tipo === "PAGINADO")
const malos = pag.filter((h) => !h.ok)
const trunc = hallazgos.filter((h) => h.tipo === "TRUNCADO")

console.log(`\n=========== AUDITORÍA DE PAGINACIÓN ===========`)
console.log(`  .range() encontrados: ${hallazgos.length} en ${new Set(hallazgos.map((h) => h.archivo)).size} archivos`)
console.log(`  PAGINADO (bucle que recorre todo): ${pag.length}`)
console.log(`     con orden único:  ${pag.length - malos.length}`)
console.log(`     SIN orden único:  ${malos.length}`)
console.log(`  TRUNCADO (.range(0,N) fijo, otro problema): ${trunc.length}`)

if (malos.length) {
  console.log(`\n----- PAGINADO SIN ORDEN ÚNICO (${malos.length}) -----`)
  for (const h of malos) console.log(`  ${h.archivo}:${h.linea}\n      tabla ${h.tabla} · ${h.motivo}`)
} else {
  console.log(`\n  Ningún bucle de paginación quedó sin orden único.`)
}

if (TODO) {
  console.log(`\n----- PAGINADO CORRECTO (${pag.length - malos.length}) -----`)
  for (const h of pag.filter((x) => x.ok)) console.log(`  ${h.archivo}:${h.linea}  ${h.tabla} · ${h.via}`)
  console.log(`\n----- TRUNCADO, revisar el techo aparte (${trunc.length}) -----`)
  for (const h of trunc) console.log(`  ${h.archivo}:${h.linea}  ${h.tabla}`)
}

process.exit(malos.length ? 1 : 0)
