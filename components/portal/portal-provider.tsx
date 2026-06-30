"use client"

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react"
import { type PortalColaborador, getEmpresaNombrePortal } from "@/lib/portal-actions"

const STORAGE_KEY = "portal_colaborador"

interface PortalContextValue {
  colaborador: PortalColaborador | null
  isHydrated: boolean
  login: (c: PortalColaborador) => void
  logout: () => void
}

const PortalContext = createContext<PortalContextValue | undefined>(undefined)

/**
 * Provider del Portal de Trabajadores.
 * - Hidrata la sesion desde localStorage al montar (evita hydration mismatch
 *   inicializando en null y sincronizando en useEffect).
 * - Expone login/logout para que los formularios y el menu puedan modificar el
 *   estado global sin tocar localStorage directamente.
 */
export function PortalProvider({ children }: { children: React.ReactNode }) {
  const [colaborador, setColaborador] = useState<PortalColaborador | null>(null)
  const [isHydrated, setIsHydrated] = useState(false)

  useEffect(() => {
    try {
      const raw = typeof window !== "undefined" ? window.localStorage.getItem(STORAGE_KEY) : null
      if (raw) {
        const parsed = JSON.parse(raw) as PortalColaborador
        setColaborador(parsed)
      }
    } catch {
      // Ignorar errores de parseo o acceso a localStorage.
    } finally {
      setIsHydrated(true)
    }
  }, [])

  // Re-hidratacion del nombre de la empresa para sesiones antiguas:
  // colaboradores que iniciaron sesion antes de que `empresa_nombre`
  // existiera tienen el objeto cacheado en localStorage sin ese campo
  // (`undefined`/`null`), asi que la UI mobile (header del portal) no
  // logra mostrar la empresa. Cuando detectamos esa situacion y
  // tenemos `idempresa`, llamamos a la action server para resolver el
  // nombre y actualizar tanto el state como el storage. Solo se
  // dispara una vez por sesion porque despues el campo queda poblado.
  useEffect(() => {
    if (!isHydrated || !colaborador) return
    if (colaborador.empresa_nombre) return
    if (colaborador.idempresa == null) return

    let cancelled = false
    ;(async () => {
      try {
        const { nombre } = await getEmpresaNombrePortal(colaborador.idempresa as number)
        if (cancelled || !nombre) return
        setColaborador((prev) => {
          if (!prev) return prev
          const next = { ...prev, empresa_nombre: nombre }
          try {
            window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
          } catch {
            // Ignorar quota o modo privado.
          }
          return next
        })
      } catch {
        // Si falla, dejamos el campo en null. Reintentar en cada
        // navegacion seria ruidoso y la empresa no es critica para el
        // funcionamiento del portal.
      }
    })()

    return () => {
      cancelled = true
    }
  }, [isHydrated, colaborador])

  const login = useCallback((c: PortalColaborador) => {
    setColaborador(c)
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(c))
    } catch {
      // Ignorar quota o modo privado.
    }
  }, [])

  const logout = useCallback(() => {
    setColaborador(null)
    try {
      window.localStorage.removeItem(STORAGE_KEY)
    } catch {
      // Ignorar.
    }
  }, [])

  const value = useMemo(
    () => ({ colaborador, isHydrated, login, logout }),
    [colaborador, isHydrated, login, logout],
  )

  return <PortalContext.Provider value={value}>{children}</PortalContext.Provider>
}

export function usePortal() {
  const ctx = useContext(PortalContext)
  if (!ctx) {
    throw new Error("usePortal debe usarse dentro de <PortalProvider>")
  }
  return ctx
}
