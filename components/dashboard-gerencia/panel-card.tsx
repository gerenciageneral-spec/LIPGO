"use client"

import type { ReactNode } from "react"
import { cn } from "@/lib/utils"

/**
 * Wrapper visual reutilizable para los paneles del Dashboard Gerencia.
 *
 * Tema LIPGO (light): card blanca con borde gris claro (#dee2e6),
 * header con icono en cubo coloreado segun acento semantico.
 *
 * Soporta tanto `iconColor` (legacy) como `accent` (nuevo), y una
 * `bodyClassName` opcional para ajustar el padding/flex del cuerpo.
 */
export interface PanelCardProps {
  title: string
  subtitle?: string
  icon: ReactNode
  iconColor?: "cyan" | "emerald" | "amber" | "rose" | "violet" | "sky"
  accent?: "cyan" | "emerald" | "amber" | "rose" | "violet" | "sky"
  headerRight?: ReactNode
  className?: string
  bodyClassName?: string
  children: ReactNode
}

const ICON_STYLES: Record<
  NonNullable<PanelCardProps["iconColor"]>,
  string
> = {
  cyan: "bg-[#5bc0de]/15 text-[#0aa1c4] border-[#5bc0de]/40",
  emerald: "bg-emerald-100 text-emerald-700 border-emerald-300",
  amber: "bg-amber-100 text-amber-700 border-amber-300",
  rose: "bg-rose-100 text-rose-700 border-rose-300",
  violet: "bg-violet-100 text-violet-700 border-violet-300",
  sky: "bg-sky-100 text-sky-700 border-sky-300",
}

export function PanelCard({
  title,
  subtitle,
  icon,
  iconColor,
  accent,
  headerRight,
  className,
  bodyClassName,
  children,
}: PanelCardProps) {
  const colorKey = iconColor || accent || "cyan"

  return (
    <div
      className={cn(
        "relative rounded-2xl border border-border bg-card shadow-sm",
        "flex flex-col overflow-hidden h-full",
        // Hover sutil — sombra tenue del acento sin mover el card.
        "transition-shadow duration-300 hover:shadow-md",
        className,
      )}
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-3 px-4 pt-4 pb-3 border-b border-border">
        <div className="flex items-center gap-3 min-w-0">
          <div
            className={cn(
              "h-10 w-10 rounded-xl border flex items-center justify-center shrink-0",
              ICON_STYLES[colorKey],
            )}
          >
            {icon}
          </div>
          <div className="min-w-0">
            <div className="text-sm font-semibold text-foreground truncate">{title}</div>
            {subtitle && (
              <div className="text-[11px] text-muted-foreground truncate">{subtitle}</div>
            )}
          </div>
        </div>
        {headerRight && <div className="shrink-0 flex items-center gap-2">{headerRight}</div>}
      </div>

      {/* Body */}
      <div className={cn("flex-1 p-4", bodyClassName)}>{children}</div>
    </div>
  )
}
