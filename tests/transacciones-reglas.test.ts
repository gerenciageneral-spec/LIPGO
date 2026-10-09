// Las reglas de gerencia del 2026-10-08 sobre qué se puede registrar a mano y con qué control:
//   · "Los códigos para reasignar lote solo deben permitirlo cuando el lote está en stock
//      disponible; un lote despachado es un lote que ya no se puede modificar."
//   · "Las salidas de inventario solo son con órdenes de cargue o averías."
//   · "Si el 701 y el 702 ya están por aprobación de gerencia, déjalo."
// Ver lib/transacciones-codigo.ts.

import { describe, expect, it } from "vitest"
import { CODIGOS_REQUIEREN_APROBACION, FIELDSETS } from "@/lib/transacciones-codigo"

describe("las correcciones de conteo pasan por la gerencia del proyecto", () => {
  it("el 702 (faltante) y el 701 (sobrante) requieren aprobación", () => {
    expect(CODIGOS_REQUIEREN_APROBACION.has("702")).toBe(true)
    // El 701 era el único que SUBÍA inventario sin que nadie lo aprobara, mientras su pareja
    // sí pasaba por gerencia. Entró a la lista el 2026-10-08.
    expect(CODIGOS_REQUIEREN_APROBACION.has("701")).toBe(true)
  })

  it("el despacho sin orden (601) y el desecho (555) también", () => {
    expect(CODIGOS_REQUIEREN_APROBACION.has("601")).toBe(true)
    expect(CODIGOS_REQUIEREN_APROBACION.has("555")).toBe(true)
  })

  it("un ingreso normal no pide aprobación: entra, no sale", () => {
    for (const c of ["101", "561", "653"]) expect(CODIGOS_REQUIEREN_APROBACION.has(c)).toBe(false)
  })

  it("son exactamente esos cuatro", () => {
    expect([...CODIGOS_REQUIEREN_APROBACION].sort()).toEqual(["555", "601", "701", "702"])
  })
})

describe("qué códigos consumen stock y por eso se validan contra lo DISPONIBLE", () => {
  it("reasignar lote (309) y trasladar (311) validan contra stock", () => {
    expect(FIELDSETS["309"].cantidadContra).toBe("stock")
    expect(FIELDSETS["311"].cantidadContra).toBe("stock")
  })

  it("también el despacho (601), la merma (551), la cuarentena (344/343), el desecho (555) y el faltante (702)", () => {
    for (const c of ["601", "551", "344", "343", "555", "702"]) expect(FIELDSETS[c].cantidadContra).toBe("stock")
  })

  it("los ingresos no validan stock", () => {
    for (const c of ["101", "561", "653", "701"]) expect(FIELDSETS[c].cantidadContra).toBeNull()
  })

  it("los reversos se validan contra lo que queda por reversar", () => {
    for (const c of ["102", "602", "552", "312"]) expect(FIELDSETS[c].cantidadContra).toBe("reversible")
  })
})

describe("quién puede tocar un lote", () => {
  it("reasignar lote exige clave del responsable: cambiar un lote no es un movimiento cualquiera", () => {
    expect(FIELDSETS["309"].requiereClave).toBe(true)
  })

  it("liberar de cuarentena exige la clave de la gerencia del proyecto", () => {
    expect(FIELDSETS["343"].claveGerenciaProyecto).toBe(true)
  })

  it("todo lo que sale de un lote lo elige desde el stock, nunca a mano", () => {
    for (const c of ["601", "551", "311", "309", "344", "702"]) expect(FIELDSETS[c].origen).toBe("conStock")
  })
})
