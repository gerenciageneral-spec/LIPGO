import type { ReactNode } from "react"
import { PortalShell } from "@/components/portal/portal-shell"

/**
 * Layout del route group (shell) del Portal del Trabajador.
 *
 * Envuelve con PortalShell a todas las rutas autenticadas (Inicio,
 * Certificados, Anticipos, Permisos). Al estar en un route group, las
 * navegaciones entre estas secciones reutilizan el layout (la Sidebar y el
 * header de bienvenida) y solo el contenido principal se actualiza, sin
 * recargar la pagina completa.
 *
 * La pagina /portal/login queda por fuera de este grupo y por lo tanto no
 * recibe el shell autenticado.
 */
export default function PortalShellLayout({ children }: { children: ReactNode }) {
  return <PortalShell>{children}</PortalShell>
}
