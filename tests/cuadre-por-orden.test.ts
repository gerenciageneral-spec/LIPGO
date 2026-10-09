// Cuadre por orden: cada orden contra lo que movió en el inventario. Casos reales de ID3
// (Cedi Funza) medidos el 2026-10-08. Ver lib/cuadre-por-orden.ts.

import { describe, expect, it } from "vitest"
import { armarLineas, buscarCandidatos, clasificar, correccionesDeLaOrden, marcaDeCorreccion, resumirMovimientos, sentidoDe } from "@/lib/cuadre-por-orden"

describe("sentido de la orden", () => {
  it("cargue = salida, descargue (manual o auto) = ingreso, distribución/tolva no mueven", () => {
    expect(sentidoDe("Cargue")).toBe("salida")
    expect(sentidoDe("Descargue")).toBe("ingreso")
    expect(sentidoDe("Distribucion")).toBe("ninguno")
    expect(sentidoDe("Tolva")).toBe("ninguno")
    expect(sentidoDe(null)).toBe("ninguno")
  })
})

describe("líneas: detalle contra inventario, producto normalizado", () => {
  it("suma líneas repetidas del detalle y cruza aunque el nombre venga con espacios o minúsculas", () => {
    const lineas = armarLineas(
      [
        { producto: "PT LA INSUPERABLE POLI PANADERIA 50 KG BOGOTA", cantidad: 15 },
        { producto: "PT LA INSUPERABLE POLI PANADERIA 50 KG BOGOTA", cantidad: 72 },
        { producto: "PT LA INSUPERABLE REPOSTERIA 50KG", cantidad: 50 },
      ],
      [
        { producto: "pt la insuperable poli panaderia 50 kg  bogota", cantidad: 27 },
        { producto: "PT LA INSUPERABLE POLI PANADERIA 50 KG BOGOTA ", cantidad: 60 },
        { producto: "PT LA INSUPERABLE REPOSTERIA 50KG", cantidad: 50 },
      ],
    )
    expect(lineas).toEqual([
      { producto: "PT LA INSUPERABLE POLI PANADERIA 50 KG BOGOTA", orden: 87, inventario: 87, diferencia: 0 },
      { producto: "PT LA INSUPERABLE REPOSTERIA 50KG", orden: 50, inventario: 50, diferencia: 0 },
    ])
  })

  it("un producto que se movió y la orden no decía queda como línea con orden 0", () => {
    const lineas = armarLineas([{ producto: "A", cantidad: 10 }], [{ producto: "A", cantidad: 10 }, { producto: "B", cantidad: 3 }])
    expect(lineas[1]).toEqual({ producto: "B", orden: 0, inventario: 3, diferencia: 3 })
  })
})

describe("devoluciones por mal cargue (654): lo que volvió baja de lo despachado", () => {
  it("la orden despachó 39 y volvieron 10: el neto entregado es 29", () => {
    const lineas = armarLineas([{ producto: "POLI", cantidad: 39 }], [{ producto: "POLI", cantidad: 39 }], [{ producto: "POLI", cantidad: 10 }])
    expect(lineas[0]).toEqual({ producto: "POLI", orden: 39, inventario: 29, diferencia: -10, devuelto: 10 })
  })

  it("sin devoluciones la línea no cambia ni gana el campo", () => {
    const lineas = armarLineas([{ producto: "POLI", cantidad: 39 }], [{ producto: "POLI", cantidad: 39 }], [])
    expect(lineas[0]).toEqual({ producto: "POLI", orden: 39, inventario: 39, diferencia: 0 })
  })

  it("devolver todo deja el despacho en cero", () => {
    const lineas = armarLineas([{ producto: "A", cantidad: 50 }], [{ producto: "A", cantidad: 50 }], [{ producto: "A", cantidad: 50 }])
    expect(lineas[0].inventario).toBe(0)
    expect(lineas[0].diferencia).toBe(-50)
  })

  it("una devolución de un producto que la orden no traía igual se ve, no desaparece", () => {
    const lineas = armarLineas([{ producto: "A", cantidad: 10 }], [{ producto: "A", cantidad: 10 }], [{ producto: "RARO", cantidad: 4 }])
    expect(lineas.find((l) => l.producto === "RARO")).toEqual({ producto: "RARO", orden: 0, inventario: -4, diferencia: -4, devuelto: 4 })
  })

  it("una orden con devolución se clasifica como 'salió menos', que es lo que pasó", () => {
    const lineas = armarLineas([{ producto: "POLI", cantidad: 39 }], [{ producto: "POLI", cantidad: 39 }], [{ producto: "POLI", cantidad: 10 }])
    expect(clasificar({ sentido: "salida", status: "finalizado", lineas, pendientes: 0 })).toBe("salio_menos")
  })
})

describe("clasificación", () => {
  const ok = [{ producto: "A", orden: 139, inventario: 139, diferencia: 0 }]

  it("MOL202610089979: cargue finalizado 139/139 → cuadra", () => {
    expect(clasificar({ sentido: "salida", status: "finalizado", lineas: ok, pendientes: 0 })).toBe("cuadra")
  })

  it("107131: descargue 3.760 en la orden, 2.100 en inventario → recibió menos", () => {
    const lineas = [
      { producto: "CONCHAS", orden: 400, inventario: 400, diferencia: 0 },
      { producto: "LA NIEVE", orden: 1660, inventario: 0, diferencia: -1660 },
    ]
    expect(clasificar({ sentido: "ingreso", status: "finalizado", lineas, pendientes: 0 })).toBe("recibio_menos")
  })

  it("107055: descargue finalizado sin una sola entrada → sin inventario (se digitó a mano sin la orden)", () => {
    const lineas = [{ producto: "ESPAGUETI", orden: 2655, inventario: 0, diferencia: -2655 }]
    expect(clasificar({ sentido: "ingreso", status: "finalizado", lineas, pendientes: 0 })).toBe("sin_inventario")
  })

  it("autodescargue con el ingreso automático aún sin aprobar → por aprobar, no 'sin inventario'", () => {
    const lineas = [{ producto: "ESPAGUETI", orden: 100, inventario: 0, diferencia: -100 }]
    expect(clasificar({ sentido: "ingreso", status: "finalizado", lineas, pendientes: 1 })).toBe("pendiente")
  })

  it("106964: entraron productos que la orden no decía → fuera de la orden", () => {
    const lineas = [
      { producto: "LA NIEVE", orden: 1277, inventario: 967, diferencia: -310 },
      { producto: "FIDEO 250", orden: 0, inventario: 3000, diferencia: 3000 },
    ]
    expect(clasificar({ sentido: "ingreso", status: "finalizado", lineas, pendientes: 0 })).toBe("fuera_de_la_orden")
  })

  it("salió más de lo autorizado → SALIÓ MÁS (nunca puede pasar)", () => {
    const lineas = [{ producto: "A", orden: 100, inventario: 120, diferencia: 20 }]
    expect(clasificar({ sentido: "salida", status: "Finalizado", lineas, pendientes: 0 })).toBe("salio_mas")
  })

  it("una unidad dañada en el cargue → salió menos", () => {
    const lineas = [{ producto: "A", orden: 100, inventario: 99, diferencia: -1 }]
    expect(clasificar({ sentido: "salida", status: "finalizado", lineas, pendientes: 0 })).toBe("salio_menos")
  })

  it("media unidad de redondeo no es diferencia", () => {
    const lineas = [{ producto: "A", orden: 100, inventario: 100.4, diferencia: 0.4 }]
    expect(clasificar({ sentido: "salida", status: "finalizado", lineas, pendientes: 0 })).toBe("cuadra")
  })

  it("orden abierta → en curso, aunque ya tenga salidas parciales", () => {
    const lineas = [{ producto: "A", orden: 100, inventario: 40, diferencia: -60 }]
    expect(clasificar({ sentido: "salida", status: null, lineas, pendientes: 0 })).toBe("en_curso")
  })

  it("clon de distribución → no mueve inventario (no es una diferencia)", () => {
    const lineas = [{ producto: "A", orden: 190, inventario: 0, diferencia: -190 }]
    expect(clasificar({ sentido: "ninguno", status: "finalizado", lineas, pendientes: 0 })).toBe("no_mueve")
  })
})

describe("lo que falta está digitado a mano: buscar el ingreso suelto que calza", () => {
  // Caso real: descargue 107215 del 8-oct, PT CONCHAS 500GR*24PQ. La orden decía 100, el
  // ingreso automático se rechazó y el coordinador digitó 100 a mano sin el número de orden.
  const suelto = (invtransId: number, cantidad: number) => ({ invtransId, cantidad, lote: "20260928", location: "A4", creado: "2026-10-08T16:53:00", creadopor: "Ander Fabian" })

  it("el que coincide en cantidad calza exacto", () => {
    const r = buscarCandidatos(100, [suelto(35045, 100)])
    expect(r).toHaveLength(1)
    expect(r[0].calce).toBe("exacto")
    expect(r[0].invtransId).toBe(35045)
  })

  it("primero el exacto, después los aproximados por cercanía", () => {
    const r = buscarCandidatos(100, [suelto(1, 300), suelto(2, 100), suelto(3, 110)])
    expect(r.map((c) => c.invtransId)).toEqual([2, 3, 1])
    expect(r.map((c) => c.calce)).toEqual(["exacto", "parcial", "parcial"])
  })

  it("media unidad de diferencia sigue siendo exacto", () => {
    expect(buscarCandidatos(100, [suelto(1, 100.4)])[0].calce).toBe("exacto")
    expect(buscarCandidatos(100, [suelto(1, 102)])[0].calce).toBe("parcial")
  })

  it("sin faltante no se sugiere nada, aunque haya ingresos sueltos", () => {
    expect(buscarCandidatos(0, [suelto(1, 100)])).toEqual([])
    expect(buscarCandidatos(-5, [suelto(1, 100)])).toEqual([])
  })

  it("sin ingresos sueltos no hay candidatos", () => {
    expect(buscarCandidatos(100, [])).toEqual([])
  })
})

describe("¿a la orden le corrigieron algo después de despachar?", () => {
  // Textos reales de las observaciones que dejaron los scripts 265/268/269 y la pantalla de
  // movimientos por código, en octubre de 2026.
  it("reconoce cada forma de corrección por su rastro", () => {
    expect(marcaDeCorreccion("Movimiento por código 311 · traslado de producto")).toBe("reclasificado")
    expect(marcaDeCorreccion(" · Lote corregido por 268 (8-oct-2026): el lote 20260917 era del ingreso borrado")).toBe("lote corregido")
    expect(marcaDeCorreccion(" · Corregido por 265 (8-oct-2026): saldo inflado por el ingreso doble")).toBe("cantidad corregida")
    expect(marcaDeCorreccion(" · Anulado por 269 (8-oct-2026): el conteo decía 840")).toBe("anulado")
    expect(marcaDeCorreccion("Movimiento por código 102 · reversa invtrans #33251 [rev#33251]")).toBe("reversado")
    expect(marcaDeCorreccion(" · Asignación rehecha por el coordinador el 2-oct")).toBe("asignación rehecha")
  })

  it("un despacho normal no lleva marca", () => {
    expect(marcaDeCorreccion("orden de cargue MOL202610089979")).toBeNull()
    expect(marcaDeCorreccion("")).toBeNull()
    expect(marcaDeCorreccion(null)).toBeNull()
  })

  it("solo devuelve los movimientos que sí se corrigieron", () => {
    const r = correccionesDeLaOrden([
      { id: 35017, nombreproducto: "POLI", observaciones: "Movimiento por código 311 · Corregido por 265 (era 610)" },
      { id: 35002, nombreproducto: "POLI", observaciones: "orden de cargue MOL202610089979" },
    ])
    expect(r).toEqual([{ invtransId: 35017, producto: "POLI", que: "cantidad corregida" }])
  })

  it("una orden sin correcciones devuelve lista vacía, no null", () => {
    expect(correccionesDeLaOrden([{ id: 1, nombreproducto: "A", observaciones: "" }])).toEqual([])
  })
})

describe("resumen del período: cerrar el universo", () => {
  it("separa ingresos por orden de los digitados a mano, y los traslados no suman", () => {
    const r = resumirMovimientos([
      { tipomov: "Entrada", cod_movimiento: "101", cantidad: 484, ocargue: "MOL202609299667", status: "Aprobado" },
      { tipomov: "Entrada", cod_movimiento: "101", cantidad: 100, ocargue: null, status: "aprobado" },
      { tipomov: "Entrada", cod_movimiento: "653", cantidad: 12, ocargue: null, status: "aprobado" },
      { tipomov: "Entrada", cod_movimiento: "701", cantidad: 5, ocargue: null, status: "aprobado" },
      { tipomov: "Salida", cod_movimiento: "601", cantidad: 139, ocargue: "MOL202610089979", status: "aprobado" },
      { tipomov: "Salida", cod_movimiento: "601", cantidad: 50, ocargue: null, status: "aprobado" },
      { tipomov: "Salida", cod_movimiento: "702", cantidad: 7, ocargue: null, status: "aprobado" },
      { tipomov: "Salida", cod_movimiento: "555", cantidad: 43, ocargue: null, status: "aprobado" },
      { tipomov: "Reproceso", cod_movimiento: "551", cantidad: 14, ocargue: null, status: "aprobado" },
      { tipomov: "Salida", cod_movimiento: "311", cantidad: 610, ocargue: null, status: "aprobado" },
      { tipomov: "Entrada", cod_movimiento: "311", cantidad: 610, ocargue: null, status: "aprobado" },
      { tipomov: "Entrada", cod_movimiento: "101", cantidad: 100, ocargue: "107215", status: "rechazado" },
      { tipomov: "Entrada", cod_movimiento: "101", cantidad: 100, ocargue: "X", status: null },
    ])
    expect(r.ingresosPorOrden).toBe(484)
    expect(r.ingresosAMano).toBe(100)
    expect(r.devoluciones).toBe(12)
    expect(r.sobrantes).toBe(5)
    expect(r.salidasPorOrden).toBe(139)
    expect(r.salidasAMano).toBe(50)
    expect(r.faltantes).toBe(7)
    expect(r.averias).toBe(57)
    expect(r.trasladosFilas).toBe(2)
    expect(r.totalEntradas).toBe(601)
    expect(r.totalSalidas).toBe(253)
  })
})
