"use client"

import { useEffect, useState } from "react"
import { getUserPermissions } from "@/lib/permissions-actions"

interface CicloFacturacionAlerta {
  id: number
  proyecto: string | null
  owner: string
  estado_ciclo: string
}

interface UseCicloFacturacionAlertsResult {
  alerts: CicloFacturacionAlerta[]
  count: number
  loading: boolean
  hasPermission: boolean
}

/** Pendientes del Ciclo de Facturación que le corresponden al usuario autenticado (jefe/coordinador). */
export function useCicloFacturacionAlerts(): UseCicloFacturacionAlertsResult {
  const [alerts, setAlerts] = useState<CicloFacturacionAlerta[]>([])
  const [count, setCount] = useState(0)
  const [loading, setLoading] = useState(true)
  const [hasPermission, setHasPermission] = useState(false)

  useEffect(() => {
    const cargar = async () => {
      try {
        const permisos = await getUserPermissions()
        const permiso = !!permisos?.ciclo_facturacion_jefe || !!permisos?.ciclo_facturacion_coordinador
        setHasPermission(permiso)
        if (!permiso) {
          setLoading(false)
          return
        }
        const res = await fetch("/api/ciclo-facturacion-alerts")
        if (!res.ok) {
          setLoading(false)
          return
        }
        const data = await res.json()
        setAlerts(data.alerts || [])
        setCount(data.count || 0)
      } catch (error) {
        console.error("Error loading ciclo-facturacion alerts:", error)
      } finally {
        setLoading(false)
      }
    }

    cargar()
    const interval = setInterval(cargar, 60000)
    return () => clearInterval(interval)
  }, [])

  return { alerts, count, loading, hasPermission }
}
