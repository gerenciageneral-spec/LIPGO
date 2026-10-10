// Novedad del conteo físico → código de corrección (lib/conteo-novedades.ts).
// Regla de gerencia 2026-10-02: el contador escribe la novedad, el sistema propone el código.
import { describe, expect, it } from "vitest"
import { codigoPermitidoEnConteo, codigoReversoDe, compilarPatron, esConteoCiclico, normalizarNovedad, opcionesPara, proponerCodigo, propuestaParaConteo } from "@/lib/conteo-novedades"

describe("proponerCodigo", () => {
  it("sin novedad: 701 si sobra, 702 si falta", () => {
    expect(proponerCodigo("", 5).codigo).toBe("701")
    expect(proponerCodigo(null, -5).codigo).toBe("702")
  })
  it("reconoce cruce de lote y mal ubicado con su pareja", () => {
    const l = proponerCodigo("Es del lote 20260920", -10)
    expect(l.codigo).toBe("309")
    expect(l.pareja).toBe("lote")
    const u = proponerCodigo("Estaba en otra ubicación", 10)
    expect(u.codigo).toBe("311")
    expect(u.pareja).toBe("ubicacion")
  })
  it("avería en un faltante es 551; avería en un sobrante vuelve al 701 con aviso", () => {
    expect(proponerCodigo("bultos rotos y mojados", -3).codigo).toBe("551")
    const s = proponerCodigo("avería", 3)
    expect(s.codigo).toBe("701")
    expect(s.aviso).toMatch(/sobrante/)
  })
  it("devolución de cliente solo aplica a sobrantes; cuarentena no se aplica desde el conteo", () => {
    expect(proponerCodigo("devolución del cliente", 4).codigo).toBe("653")
    const q = proponerCodigo("retenido por calidad", -4)
    expect(q.codigo).toBe("344")
    expect(q.aplicable).toBe(false)
  })
  it("ignora tildes y mayúsculas y respeta el diccionario editable", () => {
    expect(normalizarNovedad("  AVERÍA   Múltiple ")).toBe("averia multiple")
    const propio = proponerCodigo("cliente lo regresó", 2, [{ codigo: "653", patron: "regres", orden: 1 }])
    expect(propio.codigo).toBe("653")
  })
})

describe("utilidades", () => {
  it("compila texto simple escapado y regex; regex inválida devuelve null", () => {
    expect(compilarPatron("cruce de lote")?.test("hubo cruce de lote")).toBe(true)
    expect(compilarPatron("/\\bfalta/")?.test("falta producto")).toBe(true)
    expect(compilarPatron("/[/")).toBeNull()
  })
  it("opciones por signo y códigos de reverso", () => {
    expect(opcionesPara(-1).map((o) => o.codigo)).toEqual(["702", "309", "311", "551", "344"])
    expect(opcionesPara(1).map((o) => o.codigo)).toEqual(["701", "309", "311", "653", "344"])
    expect(codigoReversoDe("701", null)?.codigo).toBe("102")
    expect(codigoReversoDe("702", null)?.codigo).toBe("602")
    expect(codigoReversoDe("551", null)?.codigo).toBe("552")
    expect(codigoReversoDe("311", null)?.codigo).toBe("312")
    expect(codigoReversoDe("309", "salida")?.etiqueta).toContain("vuelve a entrar")
    expect(codigoReversoDe("102", null)).toBeNull()
  })
})

// Los dos conteos no son lo mismo (gerencia, 2026-10-10): el TOTAL del primer día del mes fija
// el inventario inicial y es el único donde el ajuste genérico tiene sentido; el CÍCLICO es de
// todos los días y corrige SOLO con el código de la causa, porque un 701/702 ahí borra la
// evidencia del problema que el conteo acababa de encontrar.
describe("el conteo cíclico no admite el ajuste genérico", () => {
  it("el selector de un cíclico no ofrece 701 ni 702", () => {
    expect(opcionesPara(-1, "ciclico").map((o) => o.codigo)).toEqual(["309", "311", "551", "344"])
    expect(opcionesPara(1, "ciclico").map((o) => o.codigo)).toEqual(["309", "311", "653", "344"])
  })

  it("el del total sigue ofreciéndolos, que es donde sí van", () => {
    expect(opcionesPara(-1, "total")).toEqual(opcionesPara(-1))
    expect(opcionesPara(1, "total").map((o) => o.codigo)).toContain("701")
  })

  it("codigoPermitidoEnConteo: 701 y 702 solo en el total", () => {
    expect(codigoPermitidoEnConteo("702", "ciclico")).toBe(false)
    expect(codigoPermitidoEnConteo("701", "ciclico")).toBe(false)
    expect(codigoPermitidoEnConteo("551", "ciclico")).toBe(true)
    expect(codigoPermitidoEnConteo("653", "ciclico")).toBe(true)
    expect(codigoPermitidoEnConteo("309", "ciclico")).toBe(true)
    expect(codigoPermitidoEnConteo("702", "total")).toBe(true)
    expect(codigoPermitidoEnConteo("702", null)).toBe(true)
  })

  it("en un cíclico, una diferencia SIN causa queda como hallazgo y no se corrige", () => {
    const p = propuestaParaConteo("", -10, "ciclico")
    expect(p.requiereCausa).toBe(true)
    expect(p.aviso).toContain("551")
    expect(p.aviso).toContain("no se puede ajustar con 701 ni 702")
  })

  it("en un cíclico, una diferencia CON causa sí se corrige, con su código", () => {
    const averia = propuestaParaConteo("bultos rotos y mojados", -3, "ciclico")
    expect(averia.codigo).toBe("551")
    expect(averia.requiereCausa).toBe(false)

    const dev = propuestaParaConteo("devolución del cliente", 4, "ciclico")
    expect(dev.codigo).toBe("653")
    expect(dev.requiereCausa).toBe(false)

    const lote = propuestaParaConteo("es del lote 20260920", -10, "ciclico")
    expect(lote.codigo).toBe("309")
    expect(lote.requiereCausa).toBe(false)
  })

  it("en el total, una diferencia sin causa sigue proponiendo el genérico como hoy", () => {
    const p = propuestaParaConteo("", -10, "total")
    expect(p.codigo).toBe("702")
    expect(p.requiereCausa).toBe(false)
  })

  it("esConteoCiclico no se deja engañar por mayúsculas ni espacios", () => {
    expect(esConteoCiclico(" Ciclico ")).toBe(true)
    expect(esConteoCiclico("total")).toBe(false)
    expect(esConteoCiclico(null)).toBe(false)
  })
})
