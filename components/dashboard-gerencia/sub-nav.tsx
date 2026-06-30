"use client"

import { LayoutGrid, Globe2, Target, Smile, Sparkles } from "lucide-react"
import { cn } from "@/lib/utils"

export type GerenciaSection = "operaciones" | "cobertura" | "objetivos" | "satisfaccion"

interface SubNavProps {
  active: GerenciaSection
  onChange: (section: GerenciaSection) => void
}

const ITEMS: { key: GerenciaSection; label: string; Icon: typeof LayoutGrid }[] = [
  { key: "operaciones", label: "Centro de Operaciones", Icon: LayoutGrid },
  { key: "cobertura", label: "Cobertura Nacional", Icon: Globe2 },
  { key: "objetivos", label: "Objetivos Estratégicos", Icon: Target },
  { key: "satisfaccion", label: "Satisfacción Cliente", Icon: Smile },
]

/**
 * Sub-navegacion del Dashboard Gerencia. Muestra las 4 secciones principales
 * del panel ejecutivo mas el badge "Powered by LIPGO AI" alineado a la derecha.
 */
export function SubNav({ active, onChange }: SubNavProps) {
  return (
    <nav className="flex flex-col md:flex-row md:items-center md:justify-between gap-2">
      {/* Tabs: en mobile scrollean horizontalmente manteniendo la estetica
          control-room. La barra scrollbar se oculta con scrollbar-thin. */}
      <div
        className="flex items-center gap-1.5 overflow-x-auto pb-0.5 -mx-1 px-1 [scrollbar-width:thin]"
        role="tablist"
      >
        {ITEMS.map(({ key, label, Icon }) => {
          const isActive = active === key
          return (
            <button
              key={key}
              type="button"
              role="tab"
              onClick={() => onChange(key)}
              className={cn(
                "flex items-center gap-2 px-4 py-2 rounded-xl text-xs md:text-sm font-medium transition-all duration-200 border shrink-0 whitespace-nowrap",
                isActive
                  ? "bg-[#5bc0de] text-white border-[#5bc0de] shadow-[0_8px_24px_-8px_rgba(91,192,222,0.55)]"
                  : "bg-card text-muted-foreground border-border hover:bg-muted hover:text-foreground",
              )}
              aria-selected={isActive}
              aria-current={isActive ? "page" : undefined}
            >
              <Icon className="h-4 w-4" />
              <span>{label}</span>
            </button>
          )
        })}
      </div>

      {/* Badge Powered by LIPGO AI — alineado a la derecha en desktop, full-row en mobile */}
      <div className="self-start md:self-auto flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-amber-50 border border-amber-300 shrink-0">
        <Sparkles className="h-3.5 w-3.5 text-amber-600" />
        <span className="text-[10px] md:text-xs font-semibold tracking-wide text-amber-700 whitespace-nowrap">
          Powered by{" "}
          <span className="bg-gradient-to-r from-[#5bc0de] to-[#0aa1c4] bg-clip-text text-transparent font-bold">
            LIPGO AI
          </span>
        </span>
      </div>
    </nav>
  )
}
