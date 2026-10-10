// Hallazgos del conteo y exactitud (ERI). Regla de gerencia del 2026-10-10: el cíclico detecta y
// la diferencia no se queda quieta; o se corrige con el código de su causa o alguien explica por
// qué no aplica. Ver lib/conteo-hallazgos.ts.

import { describe, expect, it } from "vitest"
import {
  PLAZO_HALLAZGO_DIAS,
  diasEntre,
  exactitudPorConteo,
  hallazgosPendientes,
  resumirHallazgos,
  tendenciaEri,
} from "@/lib/conteo-hallazgos"

const conteo = (p: Partial<Parameters<typeof hallazgosPendientes>[0][number]> = {}) => ({
  id: 1,
  proyecto_id: 3,
  fecha: "2026-10-08",
  tipo: "ciclico",
  estado: "contado",
  ...p,
})
const linea = (p: Partial<Parameters<typeof hallazgosPendientes>[1][number]> = {}) => ({
  id: 100,
  cuadre_id: 1,
  codproducto: "PT000054",
  producto: "PT POLI PANADERIA 50 KG",
  lote: "20260922",
  location: "B42",
  sistema: 100,
  conteo: 90,
  diferencia: -10,
  observacion: "",
  contado_por: "Ander Fabian",
  ...p,
})

describe("una diferencia sin explicar es un hallazgo", () => {
  it("la línea con diferencia y sin corrección queda pendiente, con su antigüedad", () => {
    const h = hallazgosPendientes([conteo()], [linea()], [], "2026-10-10")
    expect(h).toHaveLength(1)
    expect(h[0].pendiente).toBe(-10)
    expect(h[0].diasAbierto).toBe(2)
    expect(h[0].vencido).toBe(false)
  })

  it("pasado el plazo queda vencida", () => {
    const h = hallazgosPendientes([conteo()], [linea()], [], "2026-10-12")
    expect(h[0].diasAbierto).toBe(4)
    expect(h[0].vencido).toBe(true)
    expect(PLAZO_HALLAZGO_DIAS).toBe(2)
  })

  it("si ya se corrigió con su código, deja de ser hallazgo", () => {
    const h = hallazgosPendientes(
      [conteo()],
      [linea()],
      [{ cuadre_id: 1, codproducto: "PT000054", lote: "20260922", location: "B42", cantidad: -10, cod_movimiento: "551" }],
      "2026-10-10",
    )
    expect(h).toHaveLength(0)
  })

  it("una corrección parcial deja pendiente el resto, y dice con qué código se corrigió lo demás", () => {
    const h = hallazgosPendientes(
      [conteo()],
      [linea()],
      [{ cuadre_id: 1, codproducto: "PT000054", lote: "20260922", location: "B42", cantidad: -4, cod_movimiento: "551" }],
      "2026-10-10",
    )
    expect(h[0].pendiente).toBe(-6)
    expect(h[0].codigosAplicados).toEqual(["551"])
  })

  it("una corrección de OTRO lote no tapa esta línea", () => {
    const h = hallazgosPendientes(
      [conteo()],
      [linea()],
      [{ cuadre_id: 1, codproducto: "PT000054", lote: "20260928", location: "B42", cantidad: -10, cod_movimiento: "551" }],
      "2026-10-10",
    )
    expect(h[0].pendiente).toBe(-10)
  })

  it("la línea que cuadró no es hallazgo", () => {
    expect(hallazgosPendientes([conteo()], [linea({ diferencia: 0, conteo: 100 })], [], "2026-10-10")).toHaveLength(0)
  })

  it("lo más viejo va primero", () => {
    const h = hallazgosPendientes(
      [conteo({ id: 1, fecha: "2026-10-09" }), conteo({ id: 2, fecha: "2026-10-01" })],
      [linea({ id: 1, cuadre_id: 1 }), linea({ id: 2, cuadre_id: 2, lote: "20260801" })],
      [],
      "2026-10-10",
    )
    expect(h.map((x) => x.cuadreId)).toEqual([2, 1])
  })
})

describe("el resumen dice dónde está el problema", () => {
  const h = hallazgosPendientes(
    [conteo()],
    [
      linea({ id: 1, diferencia: -10 }),
      linea({ id: 2, lote: "20260928", diferencia: 4, observacion: "devolución del cliente" }),
      linea({ id: 3, codproducto: "PT000116", producto: "PT CONCHITAS", lote: "20260920", diferencia: -30 }),
    ],
    [],
    "2026-10-15",
  )

  it("cuenta total, vencidos, sin novedad y unidades en valor absoluto", () => {
    const r = resumirHallazgos(h)
    expect(r.total).toBe(3)
    expect(r.vencidos).toBe(3)
    expect(r.sinNovedad).toBe(2)
    expect(r.unidadesPendientes).toBe(44) // 10 + 4 + 30, sin compensarse
  })

  it("ordena los productos por unidades pendientes", () => {
    const r = resumirHallazgos(h)
    expect(r.porProducto[0].producto).toBe("PT CONCHITAS")
    expect(r.porProducto[0].unidades).toBe(30)
  })
})

describe("exactitud (ERI): el valor absoluto es lo que no se puede esconder", () => {
  it("un sobrante y un faltante iguales NO dan inventario perfecto", () => {
    const e = exactitudPorConteo(
      [conteo()],
      [linea({ id: 1, sistema: 100, diferencia: 10 }), linea({ id: 2, lote: "20260928", sistema: 100, diferencia: -10 })],
    )
    expect(e[0].unidadesErradas).toBe(20)
    expect(e[0].unidadesSistema).toBe(200)
    expect(e[0].eriUnidades).toBe(90)
    expect(e[0].eriLineas).toBe(0)
  })

  it("todo cuadrado da 100 por ciento", () => {
    const e = exactitudPorConteo([conteo()], [linea({ diferencia: 0, conteo: 100 })])
    expect(e[0].eriLineas).toBe(100)
    expect(e[0].eriUnidades).toBe(100)
  })

  it("una línea sin digitar no cuenta como acierto", () => {
    const e = exactitudPorConteo(
      [conteo()],
      [linea({ id: 1, diferencia: 0, conteo: 100 }), linea({ id: 2, lote: "20260928", contado_por: "", diferencia: 0 })],
    )
    expect(e[0].lineas).toBe(1)
  })

  it("una línea marcada para recontar tampoco", () => {
    const e = exactitudPorConteo([conteo()], [linea({ contado_por: "RECONTAR · Jairo" })])
    expect(e[0].lineas).toBe(0)
    expect(e[0].eriUnidades).toBe(0)
  })
})

describe("tendencia", () => {
  const serie = (vals: number[]) =>
    vals.map((v, i) => ({
      cuadreId: i + 1,
      fecha: `2026-10-${String(i + 1).padStart(2, "0")}`,
      tipo: "ciclico",
      lineas: 10,
      lineasExactas: 9,
      eriLineas: 90,
      unidadesSistema: 1000,
      unidadesErradas: 1000 - v * 10,
      eriUnidades: v,
    }))

  it("compara los últimos con los anteriores", () => {
    const t = tendenciaEri(serie([90, 90, 92, 94, 96, 98]), 3)
    expect(t.antes).toBe(90.67)
    expect(t.ahora).toBe(96)
    expect(t.delta).toBe(5.33)
  })

  it("sin historia suficiente no inventa una mejora", () => {
    const t = tendenciaEri(serie([95]), 3)
    expect(t.ahora).toBe(95)
    expect(t.delta).toBe(0)
  })

  it("una serie vacía no rompe", () => {
    expect(tendenciaEri([])).toEqual({ antes: 0, ahora: 0, delta: 0 })
  })
})

describe("diasEntre", () => {
  it("cuenta días completos y no se confunde con la hora", () => {
    expect(diasEntre("2026-10-08", "2026-10-10")).toBe(2)
    expect(diasEntre("2026-10-10T23:00:00Z", "2026-10-10")).toBe(0)
    expect(diasEntre(null, "2026-10-10")).toBe(0)
  })
})
