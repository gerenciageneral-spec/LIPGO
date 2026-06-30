"use client"

import { useEffect, useMemo, useState } from "react"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  AlertTriangle,
  BarChart3,
  Clock,
  Loader2,
  PackageCheck,
  RefreshCw,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { CentroComandoTab } from "./dashboard-pedidos/centro-comando-tab"
import { TiemposCuellosTab } from "./dashboard-pedidos/tiempos-cuellos-tab"
import { EficienciaCargaTab } from "./dashboard-pedidos/eficiencia-carga-tab"
import { fmtCOP, fmtInt } from "./dashboard-pedidos/calculations"
import type { DashboardPedidosData } from "./dashboard-pedidos/types"
import { getDashboardPedidosData } from "@/lib/dashboard-pedidos-actions"
import { useAuth } from "@/components/auth-provider"

/**
 * Dashboard Pedidos — contenedor principal.
 *
 * Arquitectura:
 *   - Server action `getDashboardPedidosData()` (lib) consulta
 *     `pedidoscabecera` + `pedidosdetalle` filtrando por las empresas/
 *     owners accesibles al usuario y por la empresa seleccionada en la
 *     barra superior (filtro dinamico).
 *   - Este componente carga los datos en el cliente (useEffect, una vez
 *     al montar y cuando cambia la empresa seleccionada) y los pasa por
 *     props a las cuatro pestañas. Las funciones puras de calculo viven
 *     en `dashboard-pedidos/calculations.ts`.
 *   - El header muestra metadata global (fecha, totales) sin alertas
 *     intrusivas; la sub-banda inferior funciona como "stat strip"
 *     ejecutiva para que el gerente tenga contexto antes de elegir
 *     pestaña.
 */
export function DashboardPedidos() {
  const { selectedEmpresaId } = useAuth()
  const [data, setData] = useState<DashboardPedidosData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [refreshing, setRefreshing] = useState(false)

  // Reloj del header. Inicia en null para evitar mismatch SSR/CSR y
  // solo se renderiza cuando hay valor real del lado del cliente.
  const [now, setNow] = useState<Date | null>(null)
  useEffect(() => {
    setNow(new Date())
    const id = setInterval(() => setNow(new Date()), 60_000)
    return () => clearInterval(id)
  }, [])

  // Carga inicial + cuando cambia el filtro de empresa seleccionada.
  // No usamos SWR aqui porque el resto del codebase ya implementa este
  // patron con useEffect + state manuales (consistencia).
  useEffect(() => {
    let cancelled = false
    const load = async () => {
      setLoading(true)
      setError(null)
      const res = await getDashboardPedidosData(selectedEmpresaId ?? null)
      if (cancelled) return
      if (res.success && res.data) {
        setData(res.data)
      } else {
        setError(res.message || "Error al cargar el dashboard")
      }
      setLoading(false)
    }
    load()
    return () => {
      cancelled = true
    }
  }, [selectedEmpresaId])

  const handleRefresh = async () => {
    setRefreshing(true)
    const res = await getDashboardPedidosData(selectedEmpresaId ?? null)
    if (res.success && res.data) {
      setData(res.data)
      setError(null)
    } else {
      setError(res.message || "Error al recargar")
    }
    setRefreshing(false)
  }

  const dateString = useMemo(() => {
    if (!now) return ""
    const raw = new Intl.DateTimeFormat("es-CO", {
      timeZone: "America/Bogota",
      weekday: "long",
      day: "numeric",
      month: "long",
      year: "numeric",
    }).format(now)
    return raw.charAt(0).toUpperCase() + raw.slice(1)
  }, [now])

  const timeString = useMemo(() => {
    if (!now) return ""
    return new Intl.DateTimeFormat("es-CO", {
      timeZone: "America/Bogota",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).format(now)
  }, [now])

  // Stat-strip ejecutivo: 4 micro-metricas para dar contexto inmediato.
  const stripMetrics = useMemo(() => {
    if (!data) return null
    const totalPedidos = data.cabecera.length
    const totalLineas = data.detalle.length
    let facturado = 0
    for (const p of data.cabecera) facturado += Number(p.total_pagar) || 0
    const ticketProm = totalPedidos > 0 ? facturado / totalPedidos : 0
    return { totalPedidos, totalLineas, facturado, ticketProm }
  }, [data])

  return (
    <div className="space-y-4">
      {/* Header corporativo + stat strip */}
      <div className="rounded-xl border border-border/60 bg-card shadow-sm overflow-hidden">
        <div className="flex flex-col gap-3 p-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground font-bold">
              DP
            </span>
            <div className="min-w-0">
              <h2 className="text-lg sm:text-xl font-bold leading-tight">
                Dashboard Pedidos
              </h2>
              <p className="text-xs sm:text-sm text-muted-foreground capitalize">
                {dateString || "—"}
                {timeString ? (
                  <span className="ml-2 font-mono text-foreground/70">
                    {timeString}
                  </span>
                ) : null}
              </p>
            </div>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={handleRefresh}
            disabled={refreshing || loading}
            className="self-start sm:self-auto"
          >
            {refreshing ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="mr-2 h-4 w-4" />
            )}
            Actualizar
          </Button>
        </div>

        {/* Stat-strip ejecutivo (no se muestra mientras carga / falla) */}
        {data && stripMetrics ? (
          <div className="grid grid-cols-2 sm:grid-cols-4 border-t border-border/60 divide-x divide-border/60">
            <StripMetric
              label="Pedidos"
              value={fmtInt(stripMetrics.totalPedidos)}
            />
            <StripMetric
              label="Líneas"
              value={fmtInt(stripMetrics.totalLineas)}
            />
            <StripMetric
              label="Facturado"
              value={fmtCOP(stripMetrics.facturado)}
            />
            <StripMetric
              label="Ticket promedio"
              value={fmtCOP(stripMetrics.ticketProm)}
            />
          </div>
        ) : null}
      </div>

      {/* Estado de carga / error */}
      {loading ? (
        <LoadingState />
      ) : error ? (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Error al cargar el dashboard</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : data ? (
        <Tabs defaultValue="comando" className="space-y-4">
          <div className="overflow-x-auto -mx-1 px-1">
            <TabsList className="inline-flex w-auto">
              <TabsTrigger value="comando" className="gap-2">
                <BarChart3 className="h-4 w-4" />
                <span className="hidden sm:inline">
                  Centro de Comando Operativo
                </span>
                <span className="sm:hidden">Comando</span>
              </TabsTrigger>
              <TabsTrigger value="tiempos" className="gap-2">
                <Clock className="h-4 w-4" />
                <span className="hidden sm:inline">
                  Tiempos y Cuellos de Botella
                </span>
                <span className="sm:hidden">Tiempos</span>
              </TabsTrigger>
              <TabsTrigger value="eficiencia" className="gap-2">
                <PackageCheck className="h-4 w-4" />
                <span className="hidden sm:inline">
                  Eficiencia de Carga e In-Full
                </span>
                <span className="sm:hidden">Carga</span>
              </TabsTrigger>
            </TabsList>
          </div>

          <TabsContent value="comando" className="m-0">
            <CentroComandoTab
              cabecera={data.cabecera}
              detalle={data.detalle}
            />
          </TabsContent>
          <TabsContent value="tiempos" className="m-0">
            <TiemposCuellosTab
              cabecera={data.cabecera}
              detalle={data.detalle}
            />
          </TabsContent>
          <TabsContent value="eficiencia" className="m-0">
            <EficienciaCargaTab
              cabecera={data.cabecera}
              detalle={data.detalle}
            />
          </TabsContent>
        </Tabs>
      ) : null}
    </div>
  )
}

function StripMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5 px-4 py-3">
      <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
        {label}
      </span>
      <span className="text-sm sm:text-base font-bold tabular-nums break-words">
        {value}
      </span>
    </div>
  )
}

function LoadingState() {
  return (
    <div className="rounded-xl border border-border/60 bg-card p-12 flex flex-col items-center justify-center gap-3 text-muted-foreground">
      <Loader2 className="h-8 w-8 animate-spin" />
      <p className="text-sm">Cargando datos del dashboard...</p>
    </div>
  )
}

export default DashboardPedidos
