// Cuenta los huecos (%) y los parámetros de cada RAISE en un script .sql.
//
// POR QUÉ EXISTE: un `raise notice 'a: % b: %', x, y, z` no falla al escribirlo ni al revisarlo a
// ojo, pero Postgres lo rechaza al COMPILAR el bloque con "42601: too many parameters specified
// for RAISE", y el script completo no corre. Pasó con el 277 el 2026-10-10 y costó un viaje de
// ida y vuelta con gerencia.
//
// Uso:  node scripts/verificar_sql_raise.mjs scripts/277_*.sql scripts/278_*.sql
//       node scripts/verificar_sql_raise.mjs scripts/*.sql
// Sale con código 1 si alguno descuadra, así se puede encadenar antes de mandar un script.
import { readFileSync } from "node:fs"
let malos = 0
for (const f of process.argv.slice(2)) {
  const txt = readFileSync(f, "utf8")
  // Cada sentencia raise hasta el ; final (puede ocupar varias lineas).
  const re = /raise\s+(notice|exception|warning)\s+'((?:[^']|'')*)'\s*(,([\s\S]*?))?;/gi
  let m
  while ((m = re.exec(txt)) !== null) {
    const linea = txt.slice(0, m.index).split(/\r?\n/).length
    const fmt = m[2]
    const huecos = (fmt.replace(/%%/g, "").match(/%/g) ?? []).length
    const cola = (m[4] ?? "").trim()
    // Parametros separados por comas de primer nivel (respeta parentesis).
    let params = 0, prof = 0, actual = ""
    for (const ch of cola) {
      if (ch === "(") prof++
      if (ch === ")") prof--
      if (ch === "," && prof === 0) { if (actual.trim()) params++; actual = ""; continue }
      actual += ch
    }
    if (actual.trim()) params++
    if (huecos !== params) {
      malos++
      console.log(`  ${f}:${linea}  ${huecos} hueco(s) % y ${params} parametro(s)  →  ${fmt.slice(0, 70)}`)
    }
  }
}
console.log(malos === 0 ? "\nTodos los RAISE cuadran." : `\n${malos} RAISE descuadrado(s).`)

process.exit(malos === 0 ? 0 : 1)
