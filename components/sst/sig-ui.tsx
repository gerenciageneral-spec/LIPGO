"use client"

// Componentes visuales de marca LIP, reutilizables en los módulos del SIG y
// los Paneles LIP. Paleta: navy #0D3B6E, teal #00B4CC, ink #0A2540, light #E6F4F8.
// Objetivo: encabezados y filtros con identidad de marca (no el look básico).

import type { ReactNode } from "react"
import { SST_TOKENS } from "@/components/sst/sst-utils"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Calendar } from "@/components/ui/calendar"
import { format, parseISO } from "date-fns"
import { es } from "date-fns/locale"
import { cn } from "@/lib/utils"

/** Encabezado de página con banner en degradado de marca LIP. */
export function SigHeader({
  title,
  subtitle,
  Icon,
  right,
}: {
  title: ReactNode
  subtitle?: ReactNode
  Icon: any
  right?: ReactNode
}) {
  return (
    <div
      className="relative overflow-hidden rounded-2xl px-5 py-4 shadow-sm"
      style={{ background: `linear-gradient(120deg, ${SST_TOKENS.ink} 0%, ${SST_TOKENS.navy} 48%, ${SST_TOKENS.teal} 135%)` }}
    >
      {/* círculos decorativos */}
      <div className="pointer-events-none absolute -right-10 -top-14 h-44 w-44 rounded-full" style={{ background: "rgba(255,255,255,0.08)" }} />
      <div className="pointer-events-none absolute right-28 -bottom-16 h-36 w-36 rounded-full" style={{ background: "rgba(255,255,255,0.05)" }} />
      <div className="relative flex items-start justify-between gap-4">
        <div className="flex items-start gap-3.5">
          {Icon && (
            <div className="shrink-0 rounded-xl bg-white/15 p-3 ring-1 ring-white/25 backdrop-blur-sm">
              <Icon className="h-6 w-6 text-white" />
            </div>
          )}
          <div>
            <h1 className="text-lg font-bold leading-tight text-white md:text-xl">{title}</h1>
            {subtitle && <p className="mt-0.5 max-w-3xl text-[13px] leading-snug text-white/85">{subtitle}</p>}
          </div>
        </div>
        {right && <div className="relative shrink-0">{right}</div>}
      </div>
    </div>
  )
}

/** Barra de filtros con estilo de marca. Muestra el cliente del selector global. */
export function SigFilterBar({ cliente, children }: { cliente?: string | null; children?: ReactNode }) {
  return (
    <div
      className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl border bg-card px-4 py-2.5 shadow-sm"
      style={{ borderColor: `${SST_TOKENS.navy}1f` }}
    >
      {cliente !== undefined && (
        <div className="flex items-center gap-2">
          <span className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: SST_TOKENS.teal }}>
            Cliente / sitio
          </span>
          <span className="rounded-full px-2.5 py-0.5 text-xs font-semibold text-white shadow-sm" style={{ background: SST_TOKENS.navy }}>
            {cliente || "Todos los clientes"}
          </span>
          <span className="text-[10px] text-muted-foreground">(selector global)</span>
        </div>
      )}
      {children}
    </div>
  )
}

/** Campo de filtro con etiqueta (para selects/inputs dentro de SigFilterBar). */
export function SigField({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="flex items-center gap-1.5">
      <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{label}</span>
      {children}
    </label>
  )
}

/** Clase para selects/inputs con estilo de marca (fondo light, texto ink). */
export const sigControl =
  "h-9 rounded-lg border bg-[#E6F4F8]/50 px-2.5 text-sm font-medium text-[#0A2540] outline-none transition focus:ring-2 focus:ring-[#00B4CC]/40"

/**
 * Selector de fecha con estilo de marca -- reemplaza `<input type="date">`
 * dentro de `SigFilterBar`/`SigField`. Usa Popover (sin controlar open/
 * onOpenChange) + Calendar, el mismo patrón ya usado en
 * dashboard-operacion-dia.tsx/tolva.tsx/proyecciones.tsx: el calendario
 * nativo del navegador se cerraba al navegar entre meses con las flechas.
 * `value`/`onChange` siguen siendo string "YYYY-MM-DD" (o "" vacío) para no
 * tocar el resto de la lógica de cada módulo que ya filtra por ese string.
 */
export function SigDatePicker({
  value,
  onChange,
  placeholder = "Seleccionar fecha",
  className,
}: {
  value: string
  onChange: (value: string) => void
  placeholder?: string
  className?: string
}) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button type="button" className={cn(sigControl, "inline-flex w-auto items-center", className)}>
          {value ? format(parseISO(value), "dd/MM/yyyy") : <span className="text-muted-foreground">{placeholder}</span>}
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          mode="single"
          selected={value ? parseISO(value) : undefined}
          onSelect={(date) => onChange(date ? format(date, "yyyy-MM-dd") : "")}
          locale={es}
        />
      </PopoverContent>
    </Popover>
  )
}

/**
 * Tarjeta KPI premium: número grande y jerárquico, chip de ícono tintado,
 * barra de acento superior, sombra sutil con elevación al hover. Color con
 * propósito (semáforo en `valueColor`; acento de marca en `accent`).
 */
export function SigKpi({
  label,
  value,
  unit,
  Icon,
  accent = SST_TOKENS.navy,
  valueColor,
  sub,
}: {
  label: string
  value: ReactNode
  unit?: string
  Icon?: any
  accent?: string
  valueColor?: string
  sub?: ReactNode
}) {
  return (
    <div
      className="group relative overflow-hidden rounded-xl border bg-card p-3.5 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md"
      style={{ borderColor: "rgba(13,59,110,0.10)" }}
    >
      <div className="absolute inset-x-0 top-0 h-1" style={{ background: accent }} />
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</span>
        {Icon && (
          <span className="rounded-lg p-1.5 transition-transform group-hover:scale-110" style={{ background: `${accent}14` }}>
            <Icon className="h-4 w-4" style={{ color: accent }} />
          </span>
        )}
      </div>
      <div className="mt-2 flex items-end gap-1">
        <span className="text-2xl font-bold leading-none tracking-tight" style={{ color: valueColor ?? SST_TOKENS.ink }}>
          {value}
        </span>
        {unit && <span className="mb-0.5 text-xs font-medium text-muted-foreground">{unit}</span>}
      </div>
      {sub && <div className="mt-1 text-[11px] leading-snug text-muted-foreground">{sub}</div>}
    </div>
  )
}

/** Título de sección con barra de acento de marca. */
export function SigSection({ title, right }: { title: ReactNode; right?: ReactNode }) {
  return (
    <div className="flex items-center justify-between">
      <h2 className="flex items-center gap-2 text-base font-semibold" style={{ color: SST_TOKENS.ink }}>
        <span className="inline-block h-4 w-1.5 rounded-full" style={{ background: `linear-gradient(${SST_TOKENS.navy}, ${SST_TOKENS.teal})` }} />
        {title}
      </h2>
      {right}
    </div>
  )
}
