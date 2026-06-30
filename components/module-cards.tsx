"use client"

import { groups } from "@/lib/dashboard-data"
import type { GroupKey } from "@/lib/dashboard-data"

interface ModuleCardsProps {
  onSelectGroup: (group: GroupKey) => void
}

export function ModuleCards({ onSelectGroup }: ModuleCardsProps) {
  return (
    <div>
      <h2 className="text-sm sm:text-xl font-semibold text-foreground mb-3 sm:mb-6">
        Seleccione un módulo para continuar
      </h2>

      <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-6">
        {groups.map((group) => {
          const Icon = group.icon
          return (
            <button
              key={group.key}
              onClick={() => onSelectGroup(group.key)}
              className="flex flex-col items-center gap-3 sm:gap-4 bg-card border border-border rounded-xl sm:rounded-2xl p-4 sm:p-8 hover:shadow-lg hover:border-primary/50 transition-all duration-200 group"
            >
              <div className="rounded-full p-3 sm:p-4 bg-primary/5 group-hover:bg-primary/10 group-hover:scale-110 transition-all duration-200">
                <Icon className="h-6 w-6 sm:h-8 sm:w-8 text-primary" />
              </div>
              <p className="text-xs sm:text-base font-semibold text-foreground text-center">{group.title}</p>
            </button>
          )
        })}
      </div>
    </div>
  )
}
