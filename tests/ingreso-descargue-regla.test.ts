// Ingreso automático de un descargue: los lotes de una llave (producto + cliente) se emiten
// UNA sola vez aunque el detalle traiga varias líneas con esa llave. Caso real: Cedi Funza,
// MOL202609299667 (2-oct-2026): dos líneas de POLI PANADERIA para CEDI FUNZA (380 y 4) y cada
// una empujó la lista completa de lotes → 384 unidades fantasma. Ver lib/ingreso-descargue-regla.ts.

import { describe, expect, it } from "vitest"
import { filasDeIngreso, norm } from "@/lib/ingreso-descargue-regla"

const POLI = "PT LA INSUPERABLE POLI PANADERIA 50 KG BOGOTA"
const REPO = "PT LA INSUPERABLE REPOSTERIA 50KG"

function mapa(entries: Array<[string, Array<{ lote: string; cantidad: number }>]>) {
  return new Map(entries)
}

describe("el caso real de Cedi Funza (MOL202609299667)", () => {
  const detalle = [
    { producto: POLI, cantidad: 380, cliente: "CEDI FUNZA" },
    { producto: REPO, cantidad: 100, cliente: "CEDI FUNZA" },
    { producto: POLI, cantidad: 4, cliente: "CEDI FUNZA" },
  ]
  const lotesPorLinea = mapa([
    [norm(POLI) + "|" + norm("CEDI FUNZA"), [
      { lote: "20260922", cantidad: 39 },
      { lote: "20260928", cantidad: 40 },
      { lote: "20260929", cantidad: 301 },
      { lote: "20260929", cantidad: 4 },
    ]],
    [norm(REPO) + "|" + norm("CEDI FUNZA"), [
      { lote: "20260924", cantidad: 43 },
      { lote: "20260927", cantidad: 57 },
    ]],
  ])

  it("emite los lotes de POLI PANADERIA UNA vez: 6 filas y 484 unidades, no 10 y 868", () => {
    const { filas } = filasDeIngreso(detalle, new Map(), lotesPorLinea)
    expect(filas).toHaveLength(6)
    expect(filas.reduce((s, f) => s + f.cantidad, 0)).toBe(484)
    const poli = filas.filter((f) => f.producto === POLI)
    expect(poli.map((f) => f.cantidad)).toEqual([39, 40, 301, 4])
  })

  it("no avisa cuando la suma de lotes coincide con la suma de las líneas (380 + 4 = 384)", () => {
    const { avisos } = filasDeIngreso(detalle, new Map(), lotesPorLinea)
    expect(avisos).toEqual([])
  })
})

describe("cuando los lotes y el detalle no cuentan lo mismo", () => {
  it("conserva las cantidades por lote (el dato real) y avisa con las dos sumas", () => {
    const detalle = [{ producto: POLI, cantidad: 100, cliente: "X" }]
    const lotes = mapa([[norm(POLI) + "|X", [{ lote: "L1", cantidad: 60 }, { lote: "L2", cantidad: 30 }]]])
    const { filas, avisos } = filasDeIngreso(detalle, new Map(), lotes)
    expect(filas.map((f) => f.cantidad)).toEqual([60, 30])
    expect(avisos).toEqual([{ producto: POLI, cliente: "X", sumaLotes: 90, sumaDetalle: 100 }])
  })
})

describe("el traslado entre bodegas manda sobre el cargue madre", () => {
  it("usa los lotes del despacho, cruzando solo por producto", () => {
    const detalle = [{ producto: POLI, cantidad: 50, cliente: "Transferencia interna" }]
    const traslado = mapa([[norm(POLI), [{ lote: "T1", cantidad: 50 }]]])
    const madre = mapa([[norm(POLI) + "|" + norm("Transferencia interna"), [{ lote: "M1", cantidad: 50 }]]])
    const { filas } = filasDeIngreso(detalle, traslado, madre)
    expect(filas).toEqual([{ producto: POLI, cliente: "Transferencia interna", lote: "T1", cantidad: 50 }])
  })

  it("dos clientes del mismo producto en un traslado no gastan dos veces el mismo pool", () => {
    const detalle = [
      { producto: POLI, cantidad: 30, cliente: "A" },
      { producto: POLI, cantidad: 20, cliente: "B" },
    ]
    const traslado = mapa([[norm(POLI), [{ lote: "T1", cantidad: 50 }]]])
    const { filas, avisos } = filasDeIngreso(detalle, traslado, new Map())
    expect(filas).toHaveLength(1)
    expect(filas[0].cantidad).toBe(50)
    // La segunda llave no vuelve a emitir: queda avisada con lo que decía su línea.
    expect(avisos.some((a) => a.cliente === "B" && a.sumaDetalle === 20)).toBe(true)
  })
})

describe("sin traslado ni cargue madre", () => {
  it("usa el lote escrito a mano en la línea, y suma las líneas de la misma llave", () => {
    const detalle = [
      { producto: REPO, cantidad: 10, cliente: "Molinos", lote: "LM-1" },
      { producto: REPO, cantidad: 5, cliente: "Molinos", lote: "LM-1" },
    ]
    const { filas } = filasDeIngreso(detalle, new Map(), new Map())
    expect(filas).toEqual([{ producto: REPO, cliente: "Molinos", lote: "LM-1", cantidad: 15 }])
  })

  it("sin lote escrito nace sin lote, para completarlo a mano", () => {
    const { filas } = filasDeIngreso([{ producto: REPO, cantidad: 7, cliente: null }], new Map(), new Map())
    expect(filas).toEqual([{ producto: REPO, cliente: null, lote: null, cantidad: 7 }])
  })
})

describe("líneas que no entran", () => {
  it("cantidad cero o negativa, producto vacío", () => {
    const { filas } = filasDeIngreso(
      [
        { producto: POLI, cantidad: 0, cliente: "A" },
        { producto: POLI, cantidad: -5, cliente: "A" },
        { producto: "", cantidad: 10, cliente: "A" },
        { producto: null, cantidad: 10, cliente: "A" },
      ],
      new Map(),
      new Map(),
    )
    expect(filas).toEqual([])
  })

  it("un lote con cantidad cero dentro del pool no genera fila", () => {
    const lotes = mapa([[norm(POLI) + "|A", [{ lote: "L1", cantidad: 0 }, { lote: "L2", cantidad: 12 }]]])
    const { filas } = filasDeIngreso([{ producto: POLI, cantidad: 12, cliente: "A" }], new Map(), lotes)
    expect(filas).toEqual([{ producto: POLI, cliente: "A", lote: "L2", cantidad: 12 }])
  })
})
