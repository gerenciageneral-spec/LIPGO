import { NextResponse } from "next/server"
import { getUserPermissions } from "@/lib/permissions-actions"
import { listarCicloFacturacion, type EstadoCiclo } from "@/lib/ciclo-facturacion-actions"

/**
 * A diferencia de los demás `*-alerts` (que solo dependen de `empresaId`),
 * este depende de la SESIÓN: cuenta lo que le corresponde actuar al usuario
 * autenticado según sus permisos (`ciclo_facturacion_jefe`/`_coordinador`),
 * no lo que pasa en una empresa. Ver lib/ciclo-facturacion-actions.ts.
 */
const PASOS_DE_JEFE: EstadoCiclo[] = ["pendiente_anexo", "pendiente_factura", "pendiente_cierre"]
const PASOS_DE_COORDINADOR: EstadoCiclo[] = ["pendiente_firma_anexo", "pendiente_firma_factura"]

export async function GET() {
  try {
    const permisos = await getUserPermissions()
    const esJefe = !!permisos?.ciclo_facturacion_jefe
    const esCoordinador = !!permisos?.ciclo_facturacion_coordinador
    if (!esJefe && !esCoordinador) return NextResponse.json({ alerts: [], count: 0 })

    const r = await listarCicloFacturacion({})
    if (!r.success) return NextResponse.json({ alerts: [], count: 0 })

    const pendientes = r.data.filter((p) => {
      if (p.estado_ciclo === "cerrado") {
        return esJefe && p.diasVencida !== null && p.diasVencida > 0 && p.estado_cobro !== "pagada"
      }
      if (esJefe && PASOS_DE_JEFE.includes(p.estado_ciclo)) return true
      if (esCoordinador && PASOS_DE_COORDINADOR.includes(p.estado_ciclo)) return true
      return false
    })

    return NextResponse.json({
      count: pendientes.length,
      alerts: pendientes.slice(0, 5).map((p) => ({
        id: p.id,
        proyecto: p.proyecto,
        owner: p.owner,
        estado_ciclo: p.estado_ciclo,
      })),
    })
  } catch (error) {
    console.error("[ciclo-facturacion-alerts] error:", error)
    return NextResponse.json({ alerts: [], count: 0 }, { status: 500 })
  }
}
