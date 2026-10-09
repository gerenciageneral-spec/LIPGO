// Qué le suma y qué le resta al inventario, según la regla que dio gerencia el 2026-10-08.
// Casos reales medidos en octubre de 2026. Ver lib/kardex-clasificacion.ts.

import { describe, expect, it } from "vitest"
import { acumular, clasificarMovimiento, resumenVacio, saldoDelPeriodo } from "@/lib/kardex-clasificacion"

const m = (cod: string | null, tipomov: string, origen = "transaccion manual") => ({ cod_movimiento: cod, tipomov, origen })

describe("lo que AUMENTA el inventario", () => {
  it("descargue, producción y LOGO entran como 101", () => {
    expect(clasificarMovimiento(m("101", "Entrada", "descargue MOL202609299667"))).toEqual({ columna: "ingresos", signo: 1, adivinado: false })
    expect(clasificarMovimiento(m("101", "Entrada", "ingreso producción"))).toEqual({ columna: "ingresos", signo: 1, adivinado: false })
  })

  it("las devoluciones (653) son INGRESO, no un ajuste — antes caían en Ajustes", () => {
    expect(clasificarMovimiento(m("653", "Entrada"))).toEqual({ columna: "ingresos", signo: 1, adivinado: false })
  })

  it("el inventario inicial (561) también suma como ingreso", () => {
    expect(clasificarMovimiento(m("561", "Entrada"))).toEqual({ columna: "ingresos", signo: 1, adivinado: false })
  })

  it("la devolución por mal cargue (654) entra como ingreso: 'entran como devolución'", () => {
    expect(clasificarMovimiento(m("654", "Entrada", "devolución por mal cargue"))).toEqual({ columna: "ingresos", signo: 1, adivinado: false })
  })
})

describe("lo que RESTA: órdenes de cargue y averías, nada más", () => {
  it("la orden de cargue (601) es la salida", () => {
    expect(clasificarMovimiento(m("601", "Salida", "orden de cargue"))).toEqual({ columna: "salidas", signo: 1, adivinado: false })
  })

  it("merma/reproceso (551) y desecho por calidad (555) son avería — el 555 antes caía en Ajustes", () => {
    expect(clasificarMovimiento(m("551", "Reproceso"))).toEqual({ columna: "averias", signo: 1, adivinado: false })
    expect(clasificarMovimiento(m("555", "Salida"))).toEqual({ columna: "averias", signo: 1, adivinado: false })
  })
})

describe("los reversos deshacen en SU columna, no en la contraria", () => {
  it("un 102 resta en Ingresos (no suma en Salidas): deshace lo que entró", () => {
    expect(clasificarMovimiento(m("102", "Salida"))).toEqual({ columna: "ingresos", signo: -1, adivinado: false })
  })

  it("un 602 resta en Salidas: deshace lo que salió", () => {
    expect(clasificarMovimiento(m("602", "Entrada"))).toEqual({ columna: "salidas", signo: -1, adivinado: false })
  })

  it("un 552 resta en Averías", () => {
    expect(clasificarMovimiento(m("552", "Entrada"))).toEqual({ columna: "averias", signo: -1, adivinado: false })
  })
})

describe("lo que NO afecta el inventario", () => {
  it("los traslados y reclasificaciones llevan el signo de su pata, y el par da cero", () => {
    const r = resumenVacio()
    acumular(r, m("311", "Salida"), 305)
    acumular(r, m("311", "Entrada"), 305)
    expect(r.traslados).toBe(0)
    expect(r.ingresos).toBe(0)
    expect(r.salidas).toBe(0)
  })

  it("309, 312, 343 y 344 también", () => {
    for (const c of ["309", "312", "343", "344"]) expect(clasificarMovimiento(m(c, "Entrada")).columna).toBe("traslados")
  })
})

describe("las correcciones del conteo", () => {
  it("701 suma y 702 resta, en su propia columna", () => {
    const r = resumenVacio()
    acumular(r, m("701", "Entrada"), 52)
    acumular(r, m("702", "Salida"), 10)
    expect(r.ajustes).toBe(42)
  })
})

describe("filas sin código (histórico): se adivina y se avisa", () => {
  it("una entrada de producción sin código cae en Ingresos y queda marcada", () => {
    const c = clasificarMovimiento(m(null, "Entrada", "ingreso producción"))
    expect(c.columna).toBe("ingresos")
    expect(c.adivinado).toBe(true)
  })

  it("una salida por orden de cargue sin código cae en Salidas", () => {
    expect(clasificarMovimiento(m(null, "Salida", "orden de cargue IND202601")).columna).toBe("salidas")
  })

  it("lo que no se reconoce cae en Ajustes, marcado como adivinado", () => {
    const c = clasificarMovimiento(m(null, "Entrada", "algo raro"))
    expect(c).toEqual({ columna: "ajustes", signo: 1, adivinado: true })
  })

  it("el resumen cuenta cuántas filas se adivinaron", () => {
    const r = resumenVacio()
    acumular(r, m("101", "Entrada"), 10)
    acumular(r, m(null, "Entrada", "algo raro"), 5)
    expect(r.adivinados).toBe(1)
  })
})

describe("la fórmula de gerencia", () => {
  it("inicial + ingresos − salidas − averías + ajustes + traslados", () => {
    const r = resumenVacio()
    acumular(r, m("101", "Entrada", "descargue 107215"), 2000) // ingreso
    acumular(r, m("653", "Entrada"), 12) // devolución
    acumular(r, m("601", "Salida", "orden de cargue"), 800) // despacho
    acumular(r, m("555", "Salida"), 3) // avería
    acumular(r, m("311", "Salida"), 100) // traslado, ida
    acumular(r, m("311", "Entrada"), 100) // traslado, vuelta
    expect(r).toEqual({ ingresos: 2012, salidas: 800, averias: 3, ajustes: 0, traslados: 0, adivinados: 0 })
    expect(saldoDelPeriodo(5000, r)).toBe(6209)
  })

  it("un mes sin movimientos deja el saldo en el inicial", () => {
    expect(saldoDelPeriodo(4836, resumenVacio())).toBe(4836)
  })
})
