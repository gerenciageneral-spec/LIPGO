// Fase D-G: ESCRITURA real del cuadre de inventario físico, a partir del
// reporte ya confirmado por el usuario (scripts/sig/reconciliar_inventario_fisico.mts).
// Reutiliza las funciones reales (crearCuadre, guardarConteoCuadre,
// generarAjustesCuadre, registrarAjusteInventario) -- nunca reimplementa esa
// lógica ni llama aprobarAjusteInventario/cerrarMesCuadre (eso lo hace el
// usuario en la pantalla, a propósito).
//
// Uso: npx tsx --env-file=.env.local scripts/sig/aplicar_cuadre_inventario_fisico.mts \
//        --proyecto 1 --corte 2026-09-01 --input scripts/sig/data/id1-fisico-2026-09.json \
//        --actor gerenciageneral@lip-sas.com

import { createClient } from "@supabase/supabase-js"
import * as fs from "fs"
import { crearCuadre, guardarConteoCuadre, generarAjustesCuadre, registrarAjusteInventario } from "../../lib/sig-actions"

function parseArgs() {
  const args = process.argv.slice(2)
  const get = (flag: string) => {
    const i = args.indexOf(flag)
    return i >= 0 ? args[i + 1] : undefined
  }
  const proyectoId = Number(get("--proyecto"))
  const corte = get("--corte")
  const input = get("--input")
  const actor = get("--actor") || "gerenciageneral@lip-sas.com"
  if (!proyectoId || !corte || !input) {
    console.error("Uso: --proyecto <id> --corte <YYYY-MM-DD> --input <archivo.json> [--actor <email>]")
    process.exit(1)
  }
  return { proyectoId, corte, input, actor }
}

const norm = (s: any): string => String(s ?? "").trim().replace(/\s+/g, " ").toUpperCase()

async function main() {
  const { proyectoId, corte, input, actor } = parseArgs()
  const env = fs.readFileSync(".env.local", "utf8")
  const getEnv = (k: string) => env.match(new RegExp(`^${k}=(.*)$`, "m"))?.[1]?.trim()
  const supabase = createClient(getEnv("NEXT_PUBLIC_SUPABASE_URL")!, getEnv("SUPABASE_SERVICE_ROLE_KEY")!)

  const reportePath = input.replace(".json", ".reporte.json")
  const reporte = JSON.parse(fs.readFileSync(reportePath, "utf8"))
  const { resumenLineas, explicadasPorSalida, salidaParcial, sinResolver, duplicados } = reporte

  if (sinResolver.length > 0 || duplicados.length > 0) {
    console.error("⛔ El reporte tiene bloqueantes (sin resolver o duplicados). No se escribe nada.")
    process.exit(1)
  }

  // --------- Salvaguarda de idempotencia: no debe existir ya un cuadre total para esta fecha ---------
  const { data: existentes } = await supabase
    .from("sig_inventario_cuadre")
    .select("id,estado,fecha,tipo")
    .eq("proyecto_id", proyectoId)
    .eq("tipo", "total")
    .eq("fecha", corte)
  if (existentes && existentes.length > 0) {
    console.error(`⛔ Ya existe un cuadre "total" para proyecto ${proyectoId} fecha ${corte}: id(s) ${existentes.map((e: any) => e.id).join(", ")}. No se crea otro.`)
    process.exit(1)
  }

  // --------- Reconstruir salidaEncontrada por clave (de las 2 listas parciales/explicadas) ---------
  const salidaEncontradaPorKey: Record<string, number> = {}
  for (const f of [...explicadasPorSalida, ...salidaParcial]) salidaEncontradaPorKey[f.key] = f.salidaEncontrada

  // --------- Construir el detalle final a escribir ---------
  const lineas: { codproducto: string; producto: string; lote: string; location: string; sistema: number; conteo: number; observacion: string | null }[] = []
  for (const l of resumenLineas) {
    const [codproducto, lote, location] = l.key.split("||")
    let conteo = l.fisico
    let observacion = l.nota
    if (!l.enFoto) {
      // Ausente de la foto: el conteo no viene del físico reconstruido (que
      // asume 0), sino de la evidencia de salida real cruzada en Fase C2.
      const salida = salidaEncontradaPorKey[l.key] ?? 0
      conteo = Math.min(salida, l.sistema)
      observacion = salida > 0
        ? `Confirmado por salida real desde el corte (no contado en la foto) — salida encontrada: ${salida}`
        : `Faltante: sin conteo físico ni salida registrada desde el corte`
    }
    lineas.push({ codproducto, producto: l.producto, lote, location, sistema: l.sistema, conteo: Math.round(conteo * 100) / 100, observacion })
  }

  const totalSistema = lineas.reduce((s, l) => s + l.sistema, 0)
  const totalConteo = lineas.reduce((s, l) => s + l.conteo, 0)
  console.log(`Líneas a escribir: ${lineas.length} | total sistema=${totalSistema} | total conteo=${totalConteo} | diferencia neta=${Math.round((totalConteo - totalSistema) * 100) / 100}`)

  // --------- Fase D: crear cuadre + detalle ---------
  const crear = await crearCuadre(proyectoId, { fecha: corte, tipo: "total", responsable: actor, creado_por: actor })
  if (!crear.success || !crear.id) {
    console.error("⛔ crearCuadre falló:", crear.error)
    process.exit(1)
  }
  const cuadreId: number = crear.id!
  console.log(`✅ Cuadre creado: id=${cuadreId} (seed inicial de ${crear.items} líneas, se reemplaza con el conteo físico real)`)

  const guardar = await guardarConteoCuadre(cuadreId, lineas)
  if (!guardar.success) {
    console.error("⛔ guardarConteoCuadre falló:", guardar.error)
    process.exit(1)
  }
  console.log(`✅ Conteo físico guardado en cuadre #${cuadreId} (estado -> contado)`)

  // --------- Fase E: generar ajustes (correcciones) ---------
  const ajustes = await generarAjustesCuadre(cuadreId)
  if (!ajustes.success) {
    console.error("⛔ generarAjustesCuadre falló:", ajustes.error)
    process.exit(1)
  }
  console.log(`✅ Correcciones generadas: ${ajustes.creados} (cuadre -> cerrado)`)

  // --------- Fase F: reclasificar DAÑADAS a avería (551) ---------
  const daniadas = resumenLineas.filter((l: any) => l.nota && norm(l.nota).includes("DAÑADA") && l.diferencia < 0)
  console.log(`\nReclasificando ${daniadas.length} líneas DAÑADAS a avería/551...`)
  const { data: ajustesCreados } = await supabase.from("sig_inventario_ajuste").select("*").eq("cuadre_id", cuadreId)
  let reclasificadas = 0
  for (const d of daniadas) {
    const [codproducto, lote, location] = d.key.split("||")
    const aj = (ajustesCreados ?? []).find((a: any) => a.codproducto === codproducto && (a.lote ?? "") === lote && (a.location ?? "") === location)
    if (!aj) {
      console.log(`  ⚠️ No se encontró ajuste para DAÑADA ${d.producto} lote=${lote} loc=${location} (¿diferencia=0?) — se omite`)
      continue
    }
    const r = await registrarAjusteInventario(proyectoId, {
      id: aj.id,
      fecha: aj.fecha,
      codproducto: aj.codproducto,
      producto: aj.producto,
      lote: aj.lote,
      location: aj.location,
      direccion: "salida",
      cod_movimiento: "551",
      cantidad: aj.cantidad,
      tipo: "averia",
      motivo: `Avería/daño reportado en conteo físico (${d.nota})`,
      responsable: actor,
      estado: "registrado",
    })
    if (!r.success) {
      console.log(`  ⚠️ No se pudo reclasificar ajuste #${aj.id}: ${r.error}`)
      continue
    }
    reclasificadas++
    console.log(`  ✅ ${d.producto} lote=${lote} loc=${location}: ajuste #${aj.id} -> avería/551`)
  }

  console.log(`\n${"=".repeat(70)}`)
  console.log(`Cuadre #${cuadreId} listo para tu revisión en "Cuadre y Correcciones de Inventario".`)
  console.log(`Correcciones generadas: ${ajustes.creados} (de las cuales ${reclasificadas} reclasificadas a avería/551)`)
  console.log(`El script NO aprobó ni cerró el mes -- eso lo haces tú en la pantalla.`)
}
main()
