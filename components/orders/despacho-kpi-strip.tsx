"use client"

import { useEffect, useState } from "react"
import { useAuth } from "@/components/auth-provider"
import { KpiCard } from "@/components/orders/dashboard-pedidos/kpi-card"
import { getDespachoKpis, type DespachoKpis } from "@/lib/pedidos-kpis-actions"
import { Truck, AlertTriangle, CheckCircle2, Timer } from "lucide-react"

// KPIs de gestión del cliente para Despacho (Gestión de Órdenes): operativo del día
// y eficiencia (tiempos), en vez de solo la tabla. Alineado a objetivos del área.
export function DespachoKpiStrip() {
  const { selectedEmpresaId } = useAuth()
  const [k, setK] = useState<DespachoKpis | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancel = false
    setLoading(true)
    getDespachoKpis(selectedEmpresaId)
      .then((r) => { if (!cancel) setK(r) })
      .catch(() => {})
      .finally(() => { if (!cancel) setLoading(false) })
    return () => { cancel = true }
  }, [selectedEmpresaId])

  if (loading && !k) {
    return (
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-[74px] animate-pulse rounded-xl border border-border/60 bg-muted/40" />
        ))}
      </div>
    )
  }
  if (!k) return null

  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
      <KpiCard
        label="Órdenes de hoy"
        value={String(k.ordenesHoy)}
        subtext={`${k.finalizadasHoy} finalizadas`}
        icon={Truck}
        variant="primary"
      />
      <KpiCard
        label="Sin cerrar"
        value={String(k.sinCerrar)}
        subtext={k.sinCerrar > 0 ? "iniciadas sin finalizar" : "todo cerrado ✓"}
        icon={AlertTriangle}
        variant={k.sinCerrar > 0 ? "danger" : "success"}
      />
      <KpiCard
        label="Finalizadas hoy"
        value={String(k.finalizadasHoy)}
        subtext="operación completada"
        icon={CheckCircle2}
        variant="success"
      />
      <KpiCard
        label="Tiempo prom. operación"
        value={k.tiempoPromOperacion ? `${k.tiempoPromOperacion} min` : "—"}
        subtext={k.operacionesMedidas ? `${k.operacionesMedidas} operaciones` : "sin datos"}
        icon={Timer}
        variant="warning"
      />
    </div>
  )
}
