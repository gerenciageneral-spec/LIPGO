"use client"

/**
 * Feature flags del cliente.
 *
 * Mantenemos aquí las banderas que controlan qué funcionalidades son
 * visibles para el usuario final vs. cuáles siguen siendo "internas" y solo
 * deberían verse en desarrollo o por ciertos usuarios.
 *
 * Todas las variables deben llevar el prefijo `NEXT_PUBLIC_` porque se
 * consultan en el navegador.
 */

import { useAuth } from "@/components/auth-provider"

/**
 * Parsea una env-var CSV a un `Set` de strings normalizadas.
 *
 *   "admin, devs , Juan" -> Set {"admin","devs","juan"}
 */
function parseCsvSet(value: string | undefined): Set<string> {
  if (!value) return new Set()
  return new Set(
    value
      .split(",")
      .map((v) => v.trim().toLowerCase())
      .filter(Boolean),
  )
}

/**
 * Decide si el usuario actual puede ver el nuevo "Dashboard Gerencia".
 *
 * Visible cuando cualquiera de estas condiciones es verdadera:
 *  1. Estamos corriendo en modo desarrollo (`NODE_ENV === "development"`).
 *     Cubre `pnpm dev` en local y previews de v0.
 *  2. Hay un override explícito:
 *       `NEXT_PUBLIC_ENABLE_DASHBOARD_GERENCIA=true`
 *     Útil para habilitarlo en una Preview de Vercel o un entorno de
 *     staging sin tocar código.
 *  3. El usuario logueado está en la allowlist:
 *       `NEXT_PUBLIC_GERENCIA_ALLOWED_USERS=usuario1,usuario2`
 *     Se compara contra `profile.usuario` en minúsculas. Esto te permite
 *     seguir viéndolo en la URL pública de producción con tu propia cuenta.
 *
 * Cuando devuelve `false`, el contenedor renderiza únicamente el dashboard
 * clásico sin el selector de pestañas — el usuario final nunca sabe que
 * existe esta otra vista.
 */
export function useDashboardGerenciaEnabled(): boolean {
  const { profile } = useAuth()

  // 1. Dev-mode automático.
  if (process.env.NODE_ENV === "development") return true

  // 2. Override global por entorno (Vercel Env Vars).
  if (process.env.NEXT_PUBLIC_ENABLE_DASHBOARD_GERENCIA === "true") return true

  // 3. Allowlist de usuarios (coma-separados, case-insensitive).
  const allowed = parseCsvSet(process.env.NEXT_PUBLIC_GERENCIA_ALLOWED_USERS)
  const usuario = profile?.usuario?.trim().toLowerCase()
  if (usuario && allowed.has(usuario)) return true

  return false
}
