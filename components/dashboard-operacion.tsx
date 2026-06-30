"use client"

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Activity, Gauge } from "lucide-react"
import DashboardOperacionDia from "@/components/dashboard-operacion-dia"
import DashboardGerencia from "@/components/dashboard-gerencia"
import { useDashboardGerenciaEnabled } from "@/lib/feature-flags"

/**
 * Contenedor del modulo "Dashboard Operacion".
 *
 * Para los **usuarios finales** este módulo es exactamente la vista clásica
 * de "Operación del Día" (sin pestañas, sin selector).
 *
 * Para **desarrolladores / QA** — controlado por el feature flag
 * `useDashboardGerenciaEnabled()` (ver `lib/feature-flags.ts`) — aparece
 * además la pestaña "Dashboard Gerencia", que es el nuevo centro de control
 * ejecutivo. El flag se activa automáticamente en `NODE_ENV=development`,
 * por env-var `NEXT_PUBLIC_ENABLE_DASHBOARD_GERENCIA=true`, o para los
 * usuarios listados en `NEXT_PUBLIC_GERENCIA_ALLOWED_USERS`.
 */
export default function DashboardOperacion() {
  const gerenciaEnabled = useDashboardGerenciaEnabled()

  // Producción pública: sin pestañas, solo la vista clásica.
  if (!gerenciaEnabled) {
    return (
      <div className="w-full min-h-screen bg-background">
        <DashboardOperacionDia />
      </div>
    )
  }

  // Desarrolladores / allowlist: contenedor con ambas pestañas.
  return (
    <div className="w-full min-h-screen bg-background">
      <Tabs defaultValue="gerencia" className="w-full">
        <div className="sticky top-0 z-30 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/70">
          <div className="px-3 py-2">
            <TabsList className="bg-muted/60 p-1 h-auto">
              <TabsTrigger
                value="operacion"
                className="flex items-center gap-2 data-[state=active]:bg-card data-[state=active]:shadow-sm px-4 py-2"
              >
                <Activity className="h-4 w-4" />
                <span className="text-sm font-medium">Operación del Día</span>
              </TabsTrigger>
              <TabsTrigger
                value="gerencia"
                className="flex items-center gap-2 data-[state=active]:bg-card data-[state=active]:shadow-sm px-4 py-2"
              >
                <Gauge className="h-4 w-4" />
                <span className="text-sm font-medium">Dashboard Gerencia</span>
              </TabsTrigger>
            </TabsList>
          </div>
        </div>

        <TabsContent value="operacion" className="mt-0">
          <DashboardOperacionDia />
        </TabsContent>

        <TabsContent value="gerencia" className="mt-0 p-2 md:p-3">
          <DashboardGerencia />
        </TabsContent>
      </Tabs>
    </div>
  )
}
