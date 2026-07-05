"use client"

import { useState, useEffect, useCallback } from "react"
import { getUserPermissions } from "@/lib/permissions-actions"

export interface InventarioAlert {
  idproducto: number
  codproducto: string
  nombreproducto: string
  categoria: string
  subcategoria: string
  stock_disp: number
  stock_res: number
  stock_global: number
}

export function useInventarioAlerts(empresaId?: number | null, userId?: string) {
  const [alerts, setAlerts] = useState<InventarioAlert[]>([])
  const [count, setCount] = useState(0)
  const [hasPermission, setHasPermission] = useState(false)
  const [loading, setLoading] = useState(true)

  const fetchAlerts = useCallback(async () => {
    if (!empresaId || !userId) {
      setAlerts([])
      setCount(0)
      setLoading(false)
      return
    }

    setLoading(true)

    try {
      // Check if user has saldos_producto permission
      const permissions = await getUserPermissions(userId)
      
      if (!permissions || !permissions.saldos_producto) {
        setHasPermission(false)
        setLoading(false)
        return
      }

      setHasPermission(true)

      // Fetch products with reserved stock
      const response = await fetch(`/api/inventario-alerts?empresaId=${empresaId}`)

      if (!response.ok) {
        setLoading(false)
        return
      }

      const data = await response.json()
      
      setAlerts(data.alerts || [])
      setCount(data.count || 0)
    } catch (error) {
      console.error("Error loading inventario alerts:", error)
    } finally {
      setLoading(false)
    }
  }, [empresaId, userId])

  useEffect(() => {
    fetchAlerts()

    // Refresh every 60 seconds
    const interval = setInterval(fetchAlerts, 60000)

    return () => clearInterval(interval)
  }, [fetchAlerts])

  return { alerts, count, hasPermission, loading }
}
