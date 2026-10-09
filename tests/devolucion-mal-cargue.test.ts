// Devolución por mal cargue (654): lo que la orden descontó y el camión no se llevó.
// Reglas de gerencia del 2026-10-08. Ver lib/devolucion-mal-cargue.ts.

import { describe, expect, it } from "vitest"
import {
  ajustaPesoElMotivo,
  decidirPeso,
  esMotivoDevolucion,
  etiquetaMotivo,
  lineasDevolvibles,
  MOTIVOS_DEVOLUCION,
  observacionDevolucion,
  repartirEnPedidos,
  validarCantidad,
} from "@/lib/devolucion-mal-cargue"

const linea = (p: Partial<Parameters<typeof lineasDevolvibles>[0][number]> = {}) => ({
  invtransId: 35002,
  producto: "PT LA INSUPERABLE POLI PANADERIA 50 KG BOGOTA",
  codproducto: "PT000054",
  lote: "20260922",
  location: "B42",
  despachado: 39,
  devuelto: 0,
  ...p,
})

describe("qué se puede devolver de una orden", () => {
  it("lo despachado menos lo ya devuelto", () => {
    const l = lineasDevolvibles([linea(), linea({ invtransId: 35003, despachado: 50, devuelto: 20 })])
    expect(l.map((x) => x.porDevolver)).toEqual([39, 30])
  })

  it("una línea ya devuelta por completo no se ofrece", () => {
    expect(lineasDevolvibles([linea({ despachado: 39, devuelto: 39 })])).toEqual([])
  })

  it("tampoco una que de alguna forma quedó devuelta de más", () => {
    expect(lineasDevolvibles([linea({ despachado: 39, devuelto: 45 })])).toEqual([])
  })
})

describe("el tope: no se devuelve lo que la orden nunca sacó", () => {
  const [l] = lineasDevolvibles([linea({ despachado: 39, devuelto: 10 })])

  it("deja devolver lo que queda", () => {
    expect(validarCantidad(l, 29)).toEqual({ ok: true })
  })

  it("no deja pasarse, y el mensaje dice los tres números", () => {
    const r = validarCantidad(l, 30)
    expect(r.ok).toBe(false)
    expect(r.error).toContain("39")
    expect(r.error).toContain("ya se devolvieron 10")
    expect(r.error).toContain("quedan 29")
  })

  it("exige elegir la línea y una cantidad mayor que cero", () => {
    expect(validarCantidad(undefined, 5).ok).toBe(false)
    expect(validarCantidad(l, 0).ok).toBe(false)
    expect(validarCantidad(l, -3).ok).toBe(false)
  })
})

describe("lo devuelto vuelve a pendiente en el pedido", () => {
  it("con un solo pedido, todo va ahí", () => {
    const r = repartirEnPedidos([{ transid: 100, idpedido: 12345, unidadesEnLibro: 39 }], 10)
    expect(r).toEqual([{ transid: 100, idpedido: 12345, devolver: 10, unidadesEnLibro: 39, unidadesNuevasEnLibro: 29 }])
  })

  it("con varios pedidos reparte del más grande al más pequeño", () => {
    const r = repartirEnPedidos(
      [
        { transid: 1, idpedido: 10, unidadesEnLibro: 20 },
        { transid: 2, idpedido: 11, unidadesEnLibro: 60 },
      ],
      70,
    )
    expect(r).toEqual([
      { transid: 2, idpedido: 11, devolver: 60, unidadesEnLibro: 60, unidadesNuevasEnLibro: 0 },
      { transid: 1, idpedido: 10, devolver: 10, unidadesEnLibro: 20, unidadesNuevasEnLibro: 10 },
    ])
  })

  it("nunca le baja a un pedido más de lo que esa orden le había cargado", () => {
    const r = repartirEnPedidos([{ transid: 1, idpedido: 10, unidadesEnLibro: 5 }], 50)
    expect(r).toEqual([{ transid: 1, idpedido: 10, devolver: 5, unidadesEnLibro: 5, unidadesNuevasEnLibro: 0 }])
  })

  it("sin líneas del pedido no reparte nada (orden sin pedido ligado)", () => {
    expect(repartirEnPedidos([], 10)).toEqual([])
  })
})

describe("el peso de la orden: solo si la quincena sigue abierta", () => {
  const base = { pesoOrden: 10, toneladasLinea: 1.95, cantidadLinea: 39, cantidadDevuelta: 10 }

  it("quincena en curso: baja en proporción a lo devuelto", () => {
    // 1,95 t por 39 unidades = 0,05 t cada una; 10 devueltas = 0,5 t.
    const r = decidirPeso({ ...base, fechaCargue: "2026-10-08", hoyISO: "2026-10-09" })
    expect(r.ajustar).toBe(true)
    expect(r.pesoNuevo).toBe(9.5)
  })

  it("quincena ya pagada: NO se toca, y el motivo dice por qué", () => {
    // En los CEDIs la nómina se calcula con el peso de la orden: bajarlo le quitaría plata a
    // los auxiliares por un cargue que ya hicieron y ya cobraron.
    const r = decidirPeso({ ...base, fechaCargue: "2026-09-20", hoyISO: "2026-10-09" })
    expect(r.ajustar).toBe(false)
    expect(r.pesoNuevo).toBeNull()
    expect(r.motivo).toContain("ya se pagó")
    expect(r.motivo).toContain("360")
  })

  it("el límite es la quincena, no el mes: el 1 de octubre ya es otra quincena que el 30 de septiembre", () => {
    expect(decidirPeso({ ...base, fechaCargue: "2026-09-30", hoyISO: "2026-10-02" }).ajustar).toBe(false)
    expect(decidirPeso({ ...base, fechaCargue: "2026-10-02", hoyISO: "2026-10-09" }).ajustar).toBe(true)
  })

  it("el mismo día 15 y el 16 caen en quincenas distintas", () => {
    expect(decidirPeso({ ...base, fechaCargue: "2026-10-15", hoyISO: "2026-10-16" }).ajustar).toBe(false)
    expect(decidirPeso({ ...base, fechaCargue: "2026-10-16", hoyISO: "2026-10-16" }).ajustar).toBe(true)
  })

  it("sin fecha de cargue o sin peso registrado no se toca nada", () => {
    expect(decidirPeso({ ...base, fechaCargue: null }).ajustar).toBe(false)
    expect(decidirPeso({ ...base, fechaCargue: "2026-10-08", hoyISO: "2026-10-09", pesoOrden: 0 }).ajustar).toBe(false)
    expect(decidirPeso({ ...base, fechaCargue: "2026-10-08", hoyISO: "2026-10-09", toneladasLinea: 0 }).ajustar).toBe(false)
  })

  it("devolver la línea entera deja el peso en lo que valen las demás", () => {
    const r = decidirPeso({ ...base, cantidadDevuelta: 39, fechaCargue: "2026-10-08", hoyISO: "2026-10-09" })
    expect(r.pesoNuevo).toBe(8.05) // 10 − 1,95
  })

  it("nunca deja el peso en negativo", () => {
    const r = decidirPeso({ pesoOrden: 1, toneladasLinea: 5, cantidadLinea: 10, cantidadDevuelta: 10, fechaCargue: "2026-10-08", hoyISO: "2026-10-09" })
    expect(r.pesoNuevo).toBe(0)
  })

  it("los productos por unidad (Huevos) funcionan igual: su 'tonelada' son unidades", () => {
    const r = decidirPeso({ pesoOrden: 500, toneladasLinea: 500, cantidadLinea: 500, cantidadDevuelta: 20, fechaCargue: "2026-10-08", hoyISO: "2026-10-09" })
    expect(r.pesoNuevo).toBe(480)
  })
})

// Regla de gerencia del 2026-10-09: la cuadrilla cobra por el peso que cargó de verdad al
// camión. De ahí sale la única diferencia entre los tres motivos.
describe("el motivo decide el peso de la orden y con él la nómina", () => {
  const base = { pesoOrden: 10, toneladasLinea: 1.95, cantidadLinea: 39, cantidadDevuelta: 10, fechaCargue: "2026-10-08", hoyISO: "2026-10-09" }

  it("son tres, y solo 'cantidad de más' deja el peso quieto", () => {
    expect(MOTIVOS_DEVOLUCION.map((m) => m.valor)).toEqual(["trocado", "cantidad_de_mas", "cantidad_de_menos"])
    expect(ajustaPesoElMotivo("trocado")).toBe(true)
    expect(ajustaPesoElMotivo("cantidad_de_menos")).toBe(true)
    expect(ajustaPesoElMotivo("cantidad_de_mas")).toBe(false)
  })

  it("trocado: ese producto no se cargó, así que el peso baja", () => {
    const r = decidirPeso({ ...base, motivo: "trocado" })
    expect(r.ajustar).toBe(true)
    expect(r.pesoNuevo).toBe(9.5)
  })

  it("cantidad de menos: tampoco se cargó, el peso baja", () => {
    expect(decidirPeso({ ...base, motivo: "cantidad_de_menos" }).ajustar).toBe(true)
  })

  it("cantidad de más: volvió en el mismo camión, el peso NO se toca aunque la quincena esté abierta", () => {
    const r = decidirPeso({ ...base, motivo: "cantidad_de_mas" })
    expect(r.ajustar).toBe(false)
    expect(r.pesoNuevo).toBeNull()
    expect(r.motivo).toContain("Cantidad de más")
    expect(r.motivo).toContain("cargó ese peso")
  })

  it("el motivo no le gana a una quincena pagada: con trocado viejo tampoco se toca", () => {
    const r = decidirPeso({ ...base, fechaCargue: "2026-09-20", motivo: "trocado" })
    expect(r.ajustar).toBe(false)
    expect(r.motivo).toContain("ya se pagó")
  })

  it("sin motivo se comporta como antes (compatibilidad): manda la quincena", () => {
    expect(decidirPeso(base).ajustar).toBe(true)
  })

  it("un motivo inventado no pasa la puerta del servidor", () => {
    expect(esMotivoDevolucion("trocado")).toBe(true)
    expect(esMotivoDevolucion("cantidad_de_mas")).toBe(true)
    expect(esMotivoDevolucion("cantidad_de_menos")).toBe(true)
    expect(esMotivoDevolucion("")).toBe(false)
    expect(esMotivoDevolucion("sin_peso")).toBe(false)
    expect(esMotivoDevolucion(undefined)).toBe(false)
    expect(esMotivoDevolucion(654)).toBe(false)
  })

  it("cada motivo dice en una línea qué le hace al peso", () => {
    for (const m of MOTIVOS_DEVOLUCION) {
      expect(m.efectoCorto.length).toBeGreaterThan(0)
      expect(etiquetaMotivo(m.valor)).toBe(m.etiqueta)
    }
  })
})

describe("el porqué viaja con el dato", () => {
  it("la observación dice orden, motivo, detalle, de qué salida viene y quién autorizó", () => {
    const o = observacionDevolucion({
      ocargue: "MOL202610089979",
      motivo: "trocado",
      detalle: "iba Repostería, cargaron Panadería",
      invtransOrigen: 35002,
      autorizadoPor: "Ander Fabián",
    })
    expect(o).toContain("MOL202610089979")
    expect(o).toContain("Trocado")
    expect(o).toContain("iba Repostería")
    expect(o).toContain("#35002")
    expect(o).toContain("Ander Fabián")
  })

  it("sin detalle ni autorizador no deja separadores sueltos", () => {
    const o = observacionDevolucion({ ocargue: "X", motivo: "cantidad_de_mas", invtransOrigen: 1 })
    expect(o).toBe("Devolución por mal cargue (654) de la orden X · Cantidad de más · vuelve de la salida invtrans #1")
  })

  it("dice qué pasó con el peso, para poder auditar la nómina meses después", () => {
    const peso = decidirPeso({ pesoOrden: 10, toneladasLinea: 1.95, cantidadLinea: 39, cantidadDevuelta: 10, fechaCargue: "2026-10-08", hoyISO: "2026-10-09", motivo: "cantidad_de_mas" })
    const o = observacionDevolucion({ ocargue: "X", motivo: "cantidad_de_mas", invtransOrigen: 1, pesoNota: peso.motivo })
    expect(o).toContain("peso:")
    expect(o).toContain("no se toca")
  })

  it("la salida de la que viene se puede leer aunque el usuario escriba 'invtrans #' en su comentario", () => {
    // `getOrdenParaDevolver` saca el id de la frase 'vuelve de la salida invtrans #N' para que
    // el tope por línea no se mezcle por una coincidencia en el texto libre.
    const o = observacionDevolucion({
      ocargue: "X",
      motivo: "trocado",
      detalle: "ver invtrans #99999",
      invtransOrigen: 35002,
    })
    expect(/vuelve de la salida invtrans #(\d+)/.exec(o)?.[1]).toBe("35002")
  })
})
