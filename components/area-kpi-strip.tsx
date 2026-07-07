"use client"

import { useEffect, useState } from "react"
import { useAuth } from "@/components/auth-provider"
import { KpiCard } from "@/components/orders/dashboard-pedidos/kpi-card"
import { getAreaKpisRapidas } from "@/lib/area-kpis-rapidas-actions"
import { tituloAreaKpis, type AreaKpiItem } from "@/lib/area-kpis-util"
import {
  AlertTriangle,
  Clock,
  PackageOpen,
  Lock,
  Truck,
  Car,
  Receipt,
  Stethoscope,
  FileText,
  Activity,
  ShieldCheck,
  type LucideIcon,
} from "lucide-react"

const ICONS: Record<string, LucideIcon> = {
  alert: AlertTriangle,
  clock: Clock,
  package: PackageOpen,
  lock: Lock,
  truck: Truck,
  car: Car,
  receipt: Receipt,
  stethoscope: Stethoscope,
  file: FileText,
  activity: Activity,
  shield: ShieldCheck,
}

function Skeleton({ n }: { n: number }) {
  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4">
      {Array.from({ length: n }).map((_, i) => (
        <div key={i} className="h-[74px] animate-pulse rounded-xl border border-border/60 bg-muted/40" />
      ))}
    </div>
  )
}

// Tira genérica de KPIs "a revisar" para un grupo/módulo. Rápida (conteos) + skeleton.
export function AreaKpiStrip({ groupKey }: { groupKey: string }) {
  const { selectedEmpresaId, profile } = useAuth()
  const [items, setItems] = useState<AreaKpiItem[] | null>(null)
  const [loading, setLoading] = useState(true)
  const titulo = tituloAreaKpis(groupKey)

  useEffect(() => {
    if (!titulo) {
      setItems([])
      setLoading(false)
      return
    }
    let cancel = false
    setLoading(true)
    getAreaKpisRapidas(groupKey, selectedEmpresaId, profile?.id)
      .then((r) => { if (!cancel) setItems(r.items) })
      .catch(() => { if (!cancel) setItems([]) })
      .finally(() => { if (!cancel) setLoading(false) })
    return () => { cancel = true }
  }, [groupKey, selectedEmpresaId, profile?.id, titulo])

  if (!titulo) return null
  if (loading && !items) {
    return (
      <div className="mb-5 space-y-1">
        <div className="text-sm font-semibold text-foreground">{titulo}</div>
        <Skeleton n={4} />
      </div>
    )
  }
  if (!items || items.length === 0) return null

  return (
    <div className="mb-5 space-y-1">
      <div className="text-sm font-semibold text-foreground">{titulo}</div>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4">
        {items.map((it, i) => {
          const Icon = ICONS[it.icon] || AlertTriangle
          return (
            <KpiCard key={i} label={it.label} value={it.value} subtext={it.subtext} icon={Icon} variant={it.variant} />
          )
        })}
      </div>
    </div>
  )
}
