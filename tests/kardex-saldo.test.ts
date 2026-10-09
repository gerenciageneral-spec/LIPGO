// El saldo que va quedando en el Kardex: un traslado no lo mueve. Caso real: POLI PANADERIA
// en ID3 (8-oct-2026), donde un 311 de 305 unidades dejaba el saldo en −233.
// Ver lib/kardex-saldo.ts.

import { describe, expect, it } from "vitest"
import { efectoEnElSaldo, esTraslado, saldoCorrido } from "@/lib/kardex-saldo"

const mov = (tipomov: string, cantidad: number, cod: string, creado: string, status = "aprobado") =>
  ({ tipomov, cantidad, cod_movimiento: cod, creado, status })

describe("el caso real de POLI PANADERIA (ID3, 8-oct-2026)", () => {
  // Saldo base 93. Dos despachos y tres traslados de ubicación (B43 → B42).
  const movimientos = [
    mov("Salida", 39, "601", "2026-10-08T08:28:21"),
    mov("Salida", 21, "601", "2026-10-08T08:28:22"),
    mov("Salida", 305, "311", "2026-10-08T09:55:28"),
    mov("Entrada", 305, "311", "2026-10-08T09:55:28"),
    mov("Salida", 40, "311", "2026-10-08T09:56:53"),
    mov("Entrada", 40, "311", "2026-10-08T09:56:53"),
  ]

  it("el saldo nunca cae a -233: los traslados no lo mueven", () => {
    const filas = saldoCorrido(movimientos, 132)
    expect(filas.map((f) => f.despues)).toEqual([93, 72, 72, 72, 72, 72])
  })

  it("las dos patas de cada traslado tienen efecto cero", () => {
    const e = efectoEnElSaldo(movimientos)
    expect(movimientos.slice(2).map((m) => e.get(m))).toEqual([0, 0, 0, 0])
  })

  it("los despachos sí mueven, con su signo", () => {
    const e = efectoEnElSaldo(movimientos)
    expect(e.get(movimientos[0])).toBe(-39)
    expect(e.get(movimientos[1])).toBe(-21)
  })

  it("el orden entre las dos patas ya no cambia el resultado", () => {
    const alReves = [...movimientos]
    ;[alReves[2], alReves[3]] = [alReves[3], alReves[2]]
    expect(saldoCorrido(alReves, 132).map((f) => f.despues)).toEqual([93, 72, 72, 72, 72, 72])
  })
})

describe("una reclasificación que cruza de producto SÍ mueve", () => {
  it("si el producto solo ve una pata, esa pata cuenta", () => {
    // Un 309 que saca 212 de este producto para pasarlas a otro: aquí solo está la salida.
    const movimientos = [mov("Entrada", 100, "101", "2026-10-01T08:00:00"), mov("Salida", 212, "309", "2026-10-02T10:00:00")]
    const filas = saldoCorrido(movimientos, 4000)
    expect(filas.map((f) => f.despues)).toEqual([4100, 3888])
  })

  it("un par incompleto (patas que no se compensan) mueve el remanente", () => {
    const movimientos = [mov("Salida", 50, "309", "2026-10-02T10:00:00"), mov("Entrada", 30, "309", "2026-10-02T10:00:00")]
    const filas = saldoCorrido(movimientos, 100)
    expect(filas.map((f) => f.despues)).toEqual([50, 80])
  })
})

describe("qué suma y qué resta", () => {
  it("los códigos de traslado son 309, 311, 312, 343 y 344", () => {
    for (const c of ["309", "311", "312", "343", "344"]) expect(esTraslado(c)).toBe(true)
    for (const c of ["101", "601", "653", "701", "702", "551", "555", "561", "102", "602"]) expect(esTraslado(c)).toBe(false)
    expect(esTraslado(null)).toBe(false)
  })

  it("entradas suman y salidas restan, con el saldo corriendo", () => {
    const movimientos = [
      mov("Entrada", 500, "101", "2026-10-01T08:00:00"),
      mov("Salida", 120, "601", "2026-10-02T08:00:00"),
      mov("Entrada", 12, "653", "2026-10-03T08:00:00"),
      mov("Salida", 7, "702", "2026-10-04T08:00:00"),
      mov("Entrada", 5, "701", "2026-10-05T08:00:00"),
      mov("Salida", 3, "555", "2026-10-06T08:00:00"),
    ]
    expect(saldoCorrido(movimientos, 1000).map((f) => f.despues)).toEqual([1500, 1380, 1392, 1385, 1390, 1387])
  })

  it("un reproceso resta", () => {
    expect(saldoCorrido([mov("Reproceso", 14, "551", "2026-10-01T08:00:00")], 100)[0].despues).toBe(86)
  })
})

describe("movimientos que no cuentan", () => {
  it("un ingreso sin aprobar no mueve el saldo, pero se lista", () => {
    const movimientos = [mov("Entrada", 100, "101", "2026-10-01T08:00:00", ""), mov("Entrada", 50, "101", "2026-10-02T08:00:00")]
    const filas = saldoCorrido(movimientos, 10)
    expect(filas.map((f) => f.despues)).toEqual([10, 60])
    expect(filas).toHaveLength(2)
  })

  it("uno rechazado tampoco", () => {
    expect(saldoCorrido([mov("Salida", 116, "102", "2026-10-01T08:00:00", "rechazado")], 500)[0].despues).toBe(500)
  })

  it("un traslado sin aprobar no cuenta como pata: no compensa a nadie", () => {
    const movimientos = [mov("Salida", 50, "311", "2026-10-01T08:00:00"), mov("Entrada", 50, "311", "2026-10-01T08:00:00", "")]
    // La salida está aprobada y su pareja no: el par no se compensa, así que la salida sí mueve.
    expect(saldoCorrido(movimientos, 100).map((f) => f.despues)).toEqual([50, 50])
  })
})
