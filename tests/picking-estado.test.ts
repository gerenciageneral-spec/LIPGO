// Las ubicaciones que NO despachan: cuarentena (calidad) y averías.
// Ver lib/picking-estado.ts.

import { describe, expect, it } from "vitest"
import {
  bloqueoDeUbicacion,
  esCuarentena,
  esUbicacionBloqueada,
  textoReparos,
  validarAntesDeEscribir,
} from "@/lib/picking-estado"

// AVERÍAS: lo que está en esa posición existe en el inventario pero NO se despacha.
// Gerencia, 2026-10-10: "esos productos que están en AV que son averías no pueden estar
// habilitadas para despacho, pues tienen alguna novedad; si las necesitan deben realizar otros
// movimientos, pero si están ahí se bloquean para despacho".
describe("ubicaciones que no despachan", () => {
  it("reconoce la cuarentena y la avería, con su salida distinta", () => {
    expect(bloqueoDeUbicacion("CUARENTENA")?.tipo).toBe("cuarentena")
    expect(bloqueoDeUbicacion("CUARENTENA")?.comoSalir).toContain("343")
    expect(bloqueoDeUbicacion("AV")?.tipo).toBe("averia")
    expect(bloqueoDeUbicacion("AV")?.comoSalir).toContain("averías no se despacha")
  })

  it("la posición de averías se llama distinto en cada proyecto y las coge todas", () => {
    // ID1 "AV" (Localización Averías) · ID3 "AV" (Localizacion Reprocesos) · ID4 "CASA (AVERIAS)".
    expect(esUbicacionBloqueada("AV")).toBe(true)
    expect(esUbicacionBloqueada(" av ")).toBe(true)
    expect(esUbicacionBloqueada("CASA (AVERIAS)")).toBe(true)
    expect(esUbicacionBloqueada("REPROCESO")).toBe(true)
    expect(esUbicacionBloqueada("Cuarentena")).toBe(true)
  })

  it("una posición normal NO se bloquea, ni las que empiezan por A", () => {
    for (const l of ["A1", "A11", "A30", "AV12", "B3", "E13", "GRANEL", "V27"]) {
      expect(esUbicacionBloqueada(l), l).toBe(false)
    }
    expect(esUbicacionBloqueada("")).toBe(false)
    expect(esUbicacionBloqueada(null)).toBe(false)
  })

  it("esCuarentena sigue siendo solo la cuarentena, no la avería", () => {
    expect(esCuarentena("CUARENTENA")).toBe(true)
    expect(esCuarentena("AV")).toBe(false)
  })

  it("el picking se niega a confirmar una estiba en averías, y lo dice con su remedio", () => {
    const filas = [
      { id: 1, nombreproducto: "PT LA NIEVE 25LB", lote: "20260914", location: "AV", status: "por descontar", ocargue: "IND1" },
      { id: 2, nombreproducto: "PT ESPAGUETI", lote: "20260801", location: "A5", status: "por descontar", ocargue: "IND1" },
    ] as any[]
    const reparos = validarAntesDeEscribir(filas, [1, 2], "IND1")
    expect(reparos).toHaveLength(1)
    expect(reparos[0].tipo).toBe("averia")
    const texto = textoReparos(reparos)
    expect(texto).toContain("AVERÍAS")
    expect(texto).toContain("PT LA NIEVE 25LB")
    expect(texto).not.toContain("343")
  })
})
