"use client"

import type React from "react"
import { useEffect, useState } from "react"
import { Loader2 } from "lucide-react"

interface PermissionGuardProps {
  moduleName: string
  children: React.ReactNode
}

/**
 * Envuelve a un modulo y verifica el permiso del usuario actual.
 *
 * Comportamiento:
 *  - Mientras se consulta el permiso: muestra un spinner.
 *  - Si el usuario tiene permiso: renderiza el contenido.
 *  - Si NO tiene permiso: NO renderiza nada (return null). Antes se
 *    mostraba una tarjeta "Sin permisos", pero por solicitud del negocio
 *    ahora simplemente se oculta el modulo. Combinado con el filtrado
 *    del sidebar (los modulos sin permiso no aparecen en el menu), el
 *    usuario solo veria una pantalla en blanco si llega por deep-link.
 */
export function PermissionGuard({ moduleName, children }: PermissionGuardProps) {
  const [hasPermission, setHasPermission] = useState<boolean | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const checkPermission = async () => {
      try {
        setLoading(true)

        const response = await fetch("/api/check-permission", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ moduleName }),
        })

        if (!response.ok) {
          setHasPermission(false)
          return
        }

        const data = await response.json()
        setHasPermission(data.hasPermission)
      } catch (error) {
        console.error("[v0] PermissionGuard: Error checking permission for", moduleName, ":", error)
        setHasPermission(false)
      } finally {
        setLoading(false)
      }
    }

    checkPermission()
  }, [moduleName])

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    )
  }

  // Sin permiso: ocultar el modulo por completo en lugar de mostrar la
  // tarjeta de error. El usuario tampoco lo ve en el sidebar.
  if (!hasPermission) {
    return null
  }

  return <>{children}</>
}
