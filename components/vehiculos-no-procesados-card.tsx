"use client"

import { useEffect, useState } from "react"
import { useAuth } from "@/components/auth-provider"
import { KpiCard } from "@/components/orders/dashboard-pedidos/kpi-card"
import { getVehiculosNoProcesados, type VehiculosKpis } from "@/lib/pedidos-kpis-actions"
import { Car, CheckCircle2 } from "lucide-react"

// Tarjeta "Vehículos no procesados": cuenta los vehículos con estatus abierto
// (citasvehiculos.estatus IS NULL) para que el cliente sepa cuáles debe cerrar.
export function VehiculosNoProcesadosCard() {
  const { selectedEmpresaId } = useAuth()
  const [k, setK] = useState<VehiculosKpis | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancel = false
    setLoading(true)
    getVehiculosNoProcesados(selectedEmpresaId)
      .then((r) => { if (!cancel) setK(r) })
      .catch(() => {})
      .finally(() => { if (!cancel) setLoading(false) })
    return () => { cancel = true }
  }, [selectedEmpresaId])

  if (loading || !k) return null

  const hay = k.noProcesados > 0
  return (
    <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
      <KpiCard
        label="Vehículos no procesados"
        value={String(k.noProcesados)}
        subtext={hay ? "por cerrar / asignar a orden de cargue" : "todo cerrado ✓"}
        icon={hay ? Car : CheckCircle2}
        variant={hay ? "danger" : "success"}
      />
      {hay && k.placas.length > 0 && (
        <div className="sm:col-span-2 rounded-xl border border-border/60 bg-card p-4">
          <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground mb-2">
            Placas pendientes de cerrar
          </div>
          <div className="flex flex-wrap gap-1.5">
            {k.placas.map((p) => (
              <span key={p} className="rounded-md bg-red-50 px-2 py-1 text-xs font-semibold text-red-700 ring-1 ring-red-200">
                {p}
              </span>
            ))}
            {k.noProcesados > k.placas.length && (
              <span className="rounded-md px-2 py-1 text-xs text-muted-foreground">+{k.noProcesados - k.placas.length} más</span>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
