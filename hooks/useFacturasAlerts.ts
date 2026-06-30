"use client"

import { useState, useEffect } from "react"
import { getUserPermissions } from "@/lib/permissions-actions"

interface FacturaAlerta {
  id: number
  ordendecargue: string
  placa: string
  transporte: string
  tipooperacion: string
  fechaorden: string
}

interface UseFacturasAlertsResult {
  alerts: FacturaAlerta[]
  count: number
  loading: boolean
  hasPermission: boolean
}

export function useFacturasAlerts(empresaId: number | null, userId?: string): UseFacturasAlertsResult {
  const [alerts, setAlerts] = useState<FacturaAlerta[]>([])
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
        // Check if user has gestionfacturas permission
        const permissions = await getUserPermissions(userId)
        
        if (!permissions || !permissions.gestionfacturas) {
          setHasPermission(false)
          setLoading(false)
          return
        }

        setHasPermission(true)

        // Fetch pending facturas
        const response = await fetch(`/api/facturas-alerts?empresaId=${empresaId}`)

        if (!response.ok) {
          setLoading(false)
          return
        }

        const data = await response.json()
        
        setAlerts(data.alerts || [])
        setCount(data.count || 0)
      } catch (error) {
        console.error("Error loading facturas alerts:", error)
      } finally {
        setLoading(false)
      }
    }

    checkPermissionAndLoadAlerts()
    
    // Refresh every 60 seconds
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
