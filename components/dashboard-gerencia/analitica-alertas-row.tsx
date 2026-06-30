"use client"

import { ProductividadSemanalPanel } from "./productividad-semanal-panel"
import { PickingPackingPanel } from "./picking-packing-panel"
import type {
  ProductividadDia,
  PickingPacking,
} from "@/lib/dashboard-gerencia-actions"

interface Props {
  productividad?: ProductividadDia[]
  pickingPacking?: PickingPacking
}

/**
 * Fila "Analítica" — dos paneles (Productividad Semanal + Picking/Packing)
 * con entrada escalonada (delays 400/500ms) para reforzar la lectura de
 * arriba hacia abajo. La tarjeta "Alertas Activas" se retiró por decisión
 * del equipo de gerencia.
 */
export function AnaliticaAlertasRow({ productividad, pickingPacking }: Props) {
  return (
    <div className="grid gap-4 grid-cols-1 md:grid-cols-2">
      <div className="animate-in fade-in slide-in-from-bottom-3 duration-500 [animation-delay:400ms] fill-mode-both">
        <ProductividadSemanalPanel data={productividad} />
      </div>
      <div className="animate-in fade-in slide-in-from-bottom-3 duration-500 [animation-delay:500ms] fill-mode-both">
        <PickingPackingPanel data={pickingPacking} />
      </div>
    </div>
  )
}
