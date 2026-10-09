// Las reglas de gerencia del 2026-10-08 sobre qué se puede registrar a mano y con qué control:
//   · "Los códigos para reasignar lote solo deben permitirlo cuando el lote está en stock
//      disponible; un lote despachado es un lote que ya no se puede modificar."
//   · "Las salidas de inventario solo son con órdenes de cargue o averías."
//   · "Si el 701 y el 702 ya están por aprobación de gerencia, déjalo."
// Ver lib/transacciones-codigo.ts.

import { describe, expect, it } from "vitest"
import { CEDIS_SIN_INGRESO_MANUAL, CODIGOS_REQUIEREN_APROBACION, exigeOrdenEnIngreso, FIELDSETS, MENSAJE_INGRESO_EXIGE_ORDEN } from "@/lib/transacciones-codigo"

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

describe("en un CEDI no hay ingresos manuales sueltos", () => {
  // Gerencia (9-oct): "en el ID3 no se permitan ingresos manuales, ya que en este proyecto no
  // hay producción: todo llega de órdenes de descargue o autodescargue, más las devoluciones".
  it("ID3 y ID4 exigen el número de orden en un 101", () => {
    expect(exigeOrdenEnIngreso(3)).toBe(true)
    expect(exigeOrdenEnIngreso(4)).toBe(true)
    expect(CEDIS_SIN_INGRESO_MANUAL.sort()).toEqual([3, 4])
  })

  it("ID1 e ID2 no: ahí sí hay producción propia", () => {
    expect(exigeOrdenEnIngreso(1)).toBe(false)
    expect(exigeOrdenEnIngreso(2)).toBe(false)
  })

  it("sin proyecto no exige nada (no se puede saber)", () => {
    expect(exigeOrdenEnIngreso(null)).toBe(false)
    expect(exigeOrdenEnIngreso(undefined)).toBe(false)
  })

  it("el mensaje dice el camino correcto, no solo el no", () => {
    // Las dos salidas reales: aprobar el automático con la cantidad real, o usar el código de
    // devolución que corresponda.
    expect(MENSAJE_INGRESO_EXIGE_ORDEN).toContain("Aprobación de ingreso")
    expect(MENSAJE_INGRESO_EXIGE_ORDEN).toContain("653")
    expect(MENSAJE_INGRESO_EXIGE_ORDEN).toContain("654")
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
