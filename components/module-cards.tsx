"use client"

import { groups } from "@/lib/dashboard-data"
import type { GroupKey } from "@/lib/dashboard-data"

interface ModuleCardsProps {
  onSelectGroup: (group: GroupKey) => void
}

// Launcher estilo Odoo: color de dominio por grupo (mismos tonos que el
// sidebar) para que cada "app" tenga identidad visual. Solo presentación.
const TINT: Record<string, string> = {
  integral: "#5b6b7f",
  pedidos: "#4f63c4",
  despachos: "#1f8fb0",
  inventarios: "#0e9c9c",
  mrp: "#b5852a",
  produccion: "#c56a2a",
  lip: "#7b57c9",
  financiera: "#2f9b64",
  rrhh: "#c65893",
  certificaciones_lip: "#c8492f",
  configuracion: "#6b7683",
}

function countModules(group: (typeof groups)[number]): number {
  const direct = group.modules?.length ?? 0
  const sub = group.subgroups?.reduce((acc, sg) => acc + sg.modules.length, 0) ?? 0
  return direct + sub
}

export function ModuleCards({ onSelectGroup }: ModuleCardsProps) {
  return (
    <div>
      <h2 className="mb-3 text-sm font-semibold text-foreground sm:mb-5 sm:text-lg">Aplicaciones</h2>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-4">
        {groups.map((group) => {
          const Icon = group.icon
          const color = TINT[group.key] ?? "#5b6b7f"
          const count = countModules(group)
          return (
            <button
              key={group.key}
              onClick={() => onSelectGroup(group.key as GroupKey)}
              className="group flex flex-col items-start gap-3 rounded-2xl border border-border bg-card p-4 text-left transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg sm:p-5"
            >
              <span
                className="flex h-12 w-12 items-center justify-center rounded-2xl transition-transform duration-200 group-hover:scale-105"
                style={{ backgroundColor: `${color}33`, color, boxShadow: `inset 0 0 0 1px ${color}40` }}
              >
                <Icon className="h-6 w-6" />
              </span>
              <span className="min-w-0">
                <span className="block text-sm font-bold leading-tight text-foreground sm:text-[15px]">
                  {group.title}
                </span>
                <span className="mt-0.5 block text-xs text-muted-foreground">{count} módulos</span>
              </span>
            </button>
          )
        })}
      </div>
    </div>
  )
}
