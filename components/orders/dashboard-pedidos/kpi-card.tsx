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
}

export function KpiCard({
  label,
  value,
  subtext,
  icon: Icon,
  variant = "primary",
  footer,
}: KpiCardProps) {
  const styles = VARIANT_STYLES[variant]

  return (
    <Card className="border-border/60">
      <CardContent className="p-5 flex flex-col gap-3">
        <div className="flex items-start justify-between gap-2">
          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            {label}
          </p>
          <span
            className={cn(
              "flex h-9 w-9 items-center justify-center rounded-lg",
              styles.iconBg,
            )}
          >
            <Icon className={cn("h-4 w-4", styles.iconText)} />
          </span>
        </div>
        {/* Tamaños reducidos y escalonados por breakpoint para que valores
            largos (p.ej. "$98.500.000") no se desborden de la card. Se
            agrega `min-w-0` y `break-words` para que, si el ancho de la
            card es muy reducido, el numero corte en lugar de empujar
            horizontalmente al icono. `tabular-nums` mantiene los digitos
            alineados. */}
        <p
          className={cn(
            "font-bold tabular-nums leading-tight text-xl sm:text-2xl xl:text-3xl min-w-0 break-words",
            styles.valueText,
          )}
        >
          {value}
        </p>
        {subtext ? (
          <p className="text-xs text-muted-foreground">{subtext}</p>
        ) : null}
        {footer}
      </CardContent>
    </Card>
  )
}
