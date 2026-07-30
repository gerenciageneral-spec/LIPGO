"use client"

import type { LucideIcon } from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"
import { cn } from "@/lib/utils"

/**
 * KPI Card reusable para el Dashboard Pedidos.
 *
 * Estilo "SaaS Enterprise": numero principal grande en tabular-nums,
 * label superior compacto y un slot inferior para subtexto/progreso.
 * El acento visual (color del icono y de la barra) lo controla la
 * variante para mantener la paleta corporativa cohesiva.
 */
type KpiVariant = "primary" | "success" | "warning" | "danger"

const VARIANT_STYLES: Record<
  KpiVariant,
  { iconBg: string; iconText: string; valueText: string }
> = {
  // Acento cyan corporativo (primary)
  primary: {
    iconBg: "bg-primary/10",
    iconText: "text-primary",
    valueText: "text-foreground",
  },
  // Verde "metrica positiva" (chart-3)
  success: {
    iconBg: "bg-[var(--chart-3)]/10",
    iconText: "text-[var(--chart-3)]",
    valueText: "text-[var(--chart-3)]",
  },
  // Amarillo/ambar (chart-4)
  warning: {
    iconBg: "bg-[var(--chart-4)]/15",
    iconText: "text-[var(--chart-4)]",
    valueText: "text-foreground",
  },
  // Rojo destructive
  danger: {
    iconBg: "bg-destructive/10",
    iconText: "text-destructive",
    valueText: "text-destructive",
  },
}

interface KpiCardProps {
  label: string
  value: string
  subtext?: React.ReactNode
  icon: LucideIcon
  variant?: KpiVariant
  /** Slot para contenido extra debajo del numero (progreso, comparativa). */
  footer?: React.ReactNode
  /** Si se pasa, la tarjeta se vuelve clickeable (p. ej. abrir el detalle completo). */
  onClick?: () => void
}

export function KpiCard({
  label,
  value,
  subtext,
  icon: Icon,
  variant = "primary",
  footer,
  onClick,
}: KpiCardProps) {
  const styles = VARIANT_STYLES[variant]

  return (
    <Card
      className={cn(
        "border-border/60 shadow-none transition-colors hover:border-border",
        onClick && "cursor-pointer hover:ring-1 hover:ring-ring/40",
      )}
      role={onClick ? "button" : undefined}
      tabIndex={onClick ? 0 : undefined}
      onClick={onClick}
      onKeyDown={
        onClick
          ? (e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault()
                onClick()
              }
            }
          : undefined
      }
    >
      <CardContent className="flex flex-col p-3">
        {/* Fila superior: etiqueta compacta + icono pequeño tintado por variante. */}
        <div className="flex items-center justify-between gap-2">
          <p className="min-w-0 truncate text-[10.5px] font-semibold uppercase tracking-wide text-muted-foreground">
            {label}
          </p>
          <span
            className={cn(
              "flex h-6 w-6 flex-none items-center justify-center rounded-md",
              styles.iconBg,
            )}
          >
            <Icon className={cn("h-3.5 w-3.5", styles.iconText)} />
          </span>
        </div>
        {/* Número protagonista. `break-words`/`min-w-0` evitan desbordes en valores
            largos (p. ej. "$1.096.586.746"); escalonado por breakpoint. */}
        <p
          className={cn(
            "mt-1.5 min-w-0 break-words text-lg font-bold leading-none tabular-nums sm:text-xl xl:text-[1.6rem]",
            styles.valueText,
          )}
        >
          {value}
        </p>
        {subtext ? (
          <p className="mt-1 truncate text-[11px] leading-tight text-muted-foreground">{subtext}</p>
        ) : null}
        {footer ? <div className="mt-1.5">{footer}</div> : null}
      </CardContent>
    </Card>
  )
}
