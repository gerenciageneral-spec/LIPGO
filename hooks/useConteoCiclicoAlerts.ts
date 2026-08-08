"use client"

import { useState, useEffect } from "react"
import { getUserPermissions } from "@/lib/permissions-actions"

interface ConteoCiclicoAlerta {
  tipo: "vencido" | "diferencia"
  mensaje: string
  cuadre_id?: number
  ultima_fecha?: string | null
  dias_desde_ultimo?: number | null
  total_diferencia?: number
  estado?: string
}

interface UseConteoCiclicoAlertsResult {
  alerts: ConteoCiclicoAlerta[]
  count: number
  loading: boolean
  hasPermission: boolean
}

/**
 * Hook que expone el conteo y detalle de alertas de conteo cíclico de
 * inventario (vencido o con diferencia sin resolver) para la empresa activa.
 * Solo habilita la alerta si el usuario tiene permiso `auditoria_inventario`.
 */
export function useConteoCiclicoAlerts(
  empresaId: number | null,
  userId?: string,
): UseConteoCiclicoAlertsResult {
  const [alerts, setAlerts] = useState<ConteoCiclicoAlerta[]>([])
  const [count, setCount] = useState(0)
  const [loading, setLoading] = useState(true)
  const [hasPermission, setHasPermission] = useState(false)

  useEffect(() => {
    const checkPermissionAndLoadAlerts = async () => {
      if (!empresaId) {
        setLoading(false)
        return
      }

      try {
        const permissions = await getUserPermissions(userId)

        if (!permissions || !(permissions as any).auditoria_inventario) {
          setHasPermission(false)
          setLoading(false)
          return
        }

        setHasPermission(true)

        const response = await fetch(`/api/conteo-ciclico-alerts?empresaId=${empresaId}`)

        if (!response.ok) {
          setLoading(false)
          return
        }

        const data = await response.json()
        setAlerts(data.alerts || [])
        setCount(data.count || 0)
      } catch (error) {
        console.error("Error loading conteo ciclico alerts:", error)
      } finally {
        setLoading(false)
      }
    }

    checkPermissionAndLoadAlerts()

    const interval = setInterval(checkPermissionAndLoadAlerts, 60000)
    return () => clearInterval(interval)
  }, [empresaId, userId])

  return {
    alerts,
    count,
    loading,
    hasPermission,
  }
}
