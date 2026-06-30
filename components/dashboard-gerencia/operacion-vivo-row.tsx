"use client"

import { ReciboDescargueePanel } from "./recibo-descargue-panel"
import { AlmacenamientoPanel } from "./almacenamiento-panel"
import { DespachoPanel } from "./despacho-panel"
import type {
  ReciboVehiculo,
  OcupacionAlmacen,
  RutaDespacho,
} from "@/lib/dashboard-gerencia-actions"

interface Props {
  recibo?: ReciboVehiculo[]
  almacen?: OcupacionAlmacen
  rutas?: RutaDespacho[]
}

/**
 * Fila "Operacion en Vivo" — tres paneles en 1/2/3 columnas segun breakpoint.
 *
 * Pulido Ciclo 7: cada hijo tiene un `animate-in fade-in slide-in-from-bottom-3`
 * con un `delay` escalonado (100ms, 200ms, 300ms) para un boot-up elegante.
 */
export function OperacionVivoRow({ recibo, almacen, rutas }: Props) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3 md:gap-4">
      <div className="animate-in fade-in slide-in-from-bottom-3 duration-500 [animation-delay:100ms] fill-mode-both">
        <ReciboDescargueePanel data={recibo} />
      </div>
      <div className="animate-in fade-in slide-in-from-bottom-3 duration-500 [animation-delay:200ms] fill-mode-both">
        <AlmacenamientoPanel data={almacen} />
      </div>
      <div className="md:col-span-2 xl:col-span-1 animate-in fade-in slide-in-from-bottom-3 duration-500 [animation-delay:300ms] fill-mode-both">
        <DespachoPanel data={rutas} />
      </div>
    </div>
  )
}
