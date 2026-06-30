"use client"

import type { LucideIcon } from "lucide-react"
import { Inbox } from "lucide-react"
import { cn } from "@/lib/utils"

interface EmptyStateProps {
  /** Icono de cabecera. Default: Inbox. */
  icon?: LucideIcon
  /** Titulo corto — 3 a 5 palabras. */
  title?: string
  /** Descripcion amigable (pretty-balance). */
  description?: string
  /**
   * Altura minima del contenedor. Permite a los paneles mantener el layout
   * estable cuando el empty-state se monta en lugar del contenido real.
   */
  minHeight?: string
  className?: string
}

/**
 * Estado vacio unificado — tema LIPGO light.
 */
export function EmptyState({
  icon: Icon = Inbox,
  title = "Sin datos por ahora",
  description = "Cuando haya información disponible aparecerá aquí en tiempo real.",
  minHeight = "220px",
  className,
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center text-center gap-2 px-4 py-6",
        className,
      )}
      style={{ minHeight }}
    >
      <div className="h-11 w-11 rounded-xl bg-muted border border-border flex items-center justify-center">
        <Icon className="h-5 w-5 text-muted-foreground" aria-hidden="true" />
      </div>
      <p className="text-sm font-semibold text-foreground">{title}</p>
      <p className="text-[11px] text-muted-foreground leading-relaxed max-w-[260px] text-pretty">
        {description}
      </p>
      <div className="mt-1 inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-muted border border-border">
        <span className="h-1 w-1 rounded-full bg-[#5bc0de] animate-pulse" />
        <span className="text-[10px] tracking-wider text-muted-foreground uppercase">
          En vivo
        </span>
      </div>
    </div>
  )
}
