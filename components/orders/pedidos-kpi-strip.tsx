"use client"

import { useEffect, useState } from "react"
import { useAuth } from "@/components/auth-provider"
import { KpiCard } from "@/components/orders/dashboard-pedidos/kpi-card"
import { getPedidosKpis, type PedidosKpis } from "@/lib/pedidos-kpis-actions"
import { AlertTriangle, CalendarClock, Clock, PackageOpen, CheckCircle2 } from "lucide-react"

const COP = (n: number) => "$" + (Number(n) || 0).toLocaleString("es-CO")

// Tira de KPIs de gestión del cliente para el módulo de Pedidos: cumplimiento de
// entregas (vencidos, por vencer), no solo conteos básicos. Misma definición del
// Dashboard Pedidos (fecha_programada vs hoy, sin fechaordencargue).
export function PedidosKpiStrip() {
  const { selectedEmpresaId } = useAuth()
  const [k, setK] = useState<PedidosKpis | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancel = false
    setLoading(true)
    getPedidosKpis(selectedEmpresaId)
      .then((r) => { if (!cancel) setK(r) })
      .catch(() => {})
      .finally(() => { if (!cancel) setLoading(false) })
    return () => { cancel = true }
  }, [selectedEmpresaId])

  if (loading || !k) return null

  return (
    <div className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-5">
      <KpiCard
        label="Pedidos vencidos"
        value={String(k.vencidos)}
        subtext={k.valorVencido > 0 ? `${COP(k.valorVencido)} sin entregar` : "entrega prometida ya pasó"}
        icon={AlertTriangle}
        variant="danger"
      />
      <KpiCard
        label="Vence hoy"
        value={String(k.venceHoy)}
        subtext="entregar hoy"
        icon={CalendarClock}
        variant="warning"
      />
      <KpiCard
        label="Por vencer (7 días)"
        value={String(k.porVencer7)}
        subtext="promesa próxima"
        icon={Clock}
        variant="warning"
      />
      <KpiCard
        label="Pendientes de entrega"
        value={String(k.pendientes)}
        subtext={`de ${k.total} pedidos`}
        icon={PackageOpen}
        variant="primary"
      />
      <KpiCard
        label="Cumplimiento entregas"
        value={`${k.cumplimientoPct}%`}
        subtext="entregadas a tiempo"
        icon={CheckCircle2}
        variant="success"
      />
    </div>
  )
}
