"use client"

import { FileText, TrendingUp, Package } from "lucide-react"
import { useEffect, useState } from "react"
import { getDailySummaryStats } from "@/lib/dashboard-summary-actions"
import { useAuth } from "@/components/auth-provider"

interface DailySummaryStats {
  ordenesHoy: number
  pedidosHoy: number
  toneladasMovidas: number
}

export function DailySummary() {
  const { selectedEmpresaId } = useAuth()
  const [stats, setStats] = useState<DailySummaryStats>({
    ordenesHoy: 0,
    pedidosHoy: 0,
    toneladasMovidas: 0,
  })
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!selectedEmpresaId) return

    const loadStats = async () => {
      try {
        const result = await getDailySummaryStats()
        if (result.success && result.data) {
          setStats(result.data)
        }
      } catch (error) {
        console.error("Error loading daily summary:", error)
      } finally {
        setLoading(false)
      }
    }

    loadStats()
    // Refresh every 5 minutes
    const interval = setInterval(loadStats, 300000)
    return () => clearInterval(interval)
  }, [selectedEmpresaId])

  const cards = [
    {
      title: "Órdenes hoy",
      value: loading ? "..." : stats.ordenesHoy.toString(),
      icon: FileText,
      bgColor: "bg-blue-50",
      iconColor: "text-blue-500",
    },
    {
      title: "Pedidos Hoy",
      value: loading ? "..." : stats.pedidosHoy.toString(),
      icon: TrendingUp,
      bgColor: "bg-green-50",
      iconColor: "text-green-500",
    },
    {
      title: "Toneladas movidas",
      value: loading ? "..." : `${stats.toneladasMovidas} t`,
      icon: Package,
      bgColor: "bg-purple-50",
      iconColor: "text-purple-500",
    },
  ]

  return (
    <div className="mb-4 sm:mb-8">
      <h2 className="text-base sm:text-2xl font-semibold text-foreground mb-2 sm:mb-4">Resumen del día</h2>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-2 sm:gap-4">
        {cards.map((stat) => {
          const Icon = stat.icon

          return (
            <div
              key={stat.title}
              className="bg-card border border-border rounded-lg sm:rounded-xl p-2 sm:p-4 hover:shadow-md transition-shadow"
            >
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-[10px] sm:text-xs text-muted-foreground mb-0.5 sm:mb-1">{stat.title}</h3>
                  <p className="text-lg sm:text-2xl font-bold text-foreground">{stat.value}</p>
                </div>
                <div className={`p-1.5 sm:p-2.5 rounded-lg ${stat.bgColor}`}>
                  <Icon className={`h-3.5 w-3.5 sm:h-5 sm:w-5 ${stat.iconColor}`} />
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
