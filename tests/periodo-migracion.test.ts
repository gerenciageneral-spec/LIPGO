// La migración al software (ene–feb 2026) y el período de las vistas de cruce.
// Regla de gerencia del 2026-10-10. Ver lib/periodo-migracion.ts.

import { describe, expect, it } from "vitest"
import {
  MIGRACION_DESDE,
  MIGRACION_HASTA,
  dentroDelPeriodo,
  esDeLaMigracion,
  fechaEfectivaCruce,
  mesDe,
  rangoDelMes,
} from "@/lib/periodo-migracion"

describe("la migración son enero y febrero de 2026", () => {
  it("reconoce sus meses y solo esos", () => {
    expect(MIGRACION_DESDE).toBe("2026-01")
    expect(MIGRACION_HASTA).toBe("2026-02")
    expect(esDeLaMigracion("2026-01-15")).toBe(true)
    expect(esDeLaMigracion("2026-02-28")).toBe(true)
    expect(esDeLaMigracion("2026-03-01")).toBe(false)
    expect(esDeLaMigracion("2025-12-31")).toBe(false)
    expect(esDeLaMigracion("2026-10-10")).toBe(false)
  })

  it("una fecha vacía no es de la migración (no se inventa)", () => {
    expect(esDeLaMigracion("")).toBe(false)
    expect(esDeLaMigracion(null)).toBe(false)
    expect(mesDe(null)).toBe("")
    expect(mesDe("2026-10-10T13:00:00Z")).toBe("2026-10")
  })
})

describe("la fecha con la que se ubica una fila del cruce orden ↔ salidas", () => {
  it("usa la fecha de cargue cuando está", () => {
    expect(fechaEfectivaCruce({ fechacargue: "2026-10-09", primera_salida: "2026-10-08T12:00:00Z", fechaorden: "2026-10-07" })).toBe("2026-10-09")
  })

  it("LA TRAMPA: en las filas fuera de la orden no hay fecha de cargue, y son las graves", () => {
    // Si se filtra por fechacargue, esas filas desaparecen del tablero. Pasó de verdad el
    // 2026-10-07 en el chequeo de convergencia.
    expect(fechaEfectivaCruce({ fechacargue: null, primera_salida: "2026-01-20T10:00:00Z", fechaorden: null })).toBe("2026-01-20")
  })

  it("si no hay ninguna, devuelve vacío en vez de una fecha falsa", () => {
    expect(fechaEfectivaCruce({})).toBe("")
  })
})

describe("el período", () => {
  it("deja pasar lo que está dentro y corta lo de afuera", () => {
    expect(dentroDelPeriodo("2026-10-09", "2026-10-01", "2026-10-31")).toBe(true)
    expect(dentroDelPeriodo("2026-10-01", "2026-10-01", "2026-10-31")).toBe(true)
    expect(dentroDelPeriodo("2026-10-31", "2026-10-01", "2026-10-31")).toBe(true)
    expect(dentroDelPeriodo("2026-09-30", "2026-10-01", "2026-10-31")).toBe(false)
    expect(dentroDelPeriodo("2026-11-01", "2026-10-01", "2026-10-31")).toBe(false)
  })

  it("sin período, todo entra (ver todo el histórico)", () => {
    expect(dentroDelPeriodo("2026-01-05")).toBe(true)
    expect(dentroDelPeriodo("")).toBe(true)
  })

  it("una fila sin fecha solo entra si no hay período", () => {
    expect(dentroDelPeriodo("", "2026-10-01", "2026-10-31")).toBe(false)
  })

  it("el rango de un mes incluye su último día, también en febrero", () => {
    expect(rangoDelMes(2026, 10)).toEqual({ desde: "2026-10-01", hasta: "2026-10-31" })
    expect(rangoDelMes(2026, 2)).toEqual({ desde: "2026-02-01", hasta: "2026-02-28" })
    expect(rangoDelMes(2024, 2)).toEqual({ desde: "2024-02-01", hasta: "2024-02-29" })
    expect(rangoDelMes("2026", "01")).toEqual({ desde: "2026-01-01", hasta: "2026-01-31" })
  })

  it("un mes inválido no devuelve un rango inventado", () => {
    expect(rangoDelMes(2026, 13)).toBeNull()
    expect(rangoDelMes(null, null)).toBeNull()
    expect(rangoDelMes(2026, 0)).toBeNull()
  })
})
