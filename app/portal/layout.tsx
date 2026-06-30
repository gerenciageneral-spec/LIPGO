import type { ReactNode } from "react"
import { PortalProvider } from "@/components/portal/portal-provider"
import { Toaster } from "@/components/ui/toaster"

/**
 * Layout raiz del Portal de Trabajadores.
 * Envuelve todas las rutas /portal/* con el PortalProvider para compartir la
 * sesion simulada y monta el Toaster global de shadcn/ui para notificaciones.
 */
export default function PortalLayout({ children }: { children: ReactNode }) {
  return (
    <PortalProvider>
      {children}
      <Toaster />
    </PortalProvider>
  )
}
