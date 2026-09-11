// Piezas puras del Ciclo de Facturación, compartidas entre `lib/ciclo-facturacion-actions.ts`
// (`"use server"`, solo puede exportar funciones async) y consumidores que
// necesitan una función síncrona o una constante (el cron en
// app/api/cron/anexos-pendientes/route.ts, el componente
// components/ciclo-facturacion.tsx). Mismo patrón que lib/tarifas-turno-shared.ts.

/** Owner de una prefactura -- en la práctica siempre uno solo (confirmado con el negocio); si trae más de uno, se marca para revisión manual en vez de ocultarlo. */
export function ownerDePrefactura(lineas: any[]): { owner: string; ownerMezclado: boolean } {
  const owners = Array.from(new Set((lineas || []).map((l) => String(l?.owner || "").trim()).filter(Boolean)))
  return { owner: owners[0] || "(sin owner)", ownerMezclado: owners.length > 1 }
}

export const DIAS_SEMANA_LABEL = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"]
