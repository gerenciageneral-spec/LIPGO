'use client'

import { Card } from '@/components/ui/card'
import { groups, type GroupKey } from '@/lib/dashboard-data'

interface GroupsGridProps {
  onSelectGroup: (groupKey: GroupKey) => void
}

export function GroupsGrid({ onSelectGroup }: GroupsGridProps) {
  return (
    <div className="space-y-4 sm:space-y-6">
      <div className="space-y-1 sm:space-y-2">
        <h1 className="text-xl sm:text-3xl font-bold tracking-tight text-balance md:text-4xl">
          Bienvenido a <span className="text-foreground">LiP</span><span className="text-primary">Go</span>
        </h1>
        <p className="text-muted-foreground text-sm sm:text-lg">
          Selecciona un grupo para acceder a sus módulos
        </p>
      </div>

      <div className="grid gap-2 grid-cols-3 sm:grid-cols-2 sm:gap-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6">
        {groups.map((group) => {
          const Icon = group.icon
          // El grupo puede tener modulos directos o subgrupos; contamos ambos.
          const moduleCount = group.modules
            ? group.modules.length
            : group.subgroups?.reduce((acc, sg) => acc + sg.modules.length, 0) || 0
          return (
            <Card
              key={group.key}
              className="group relative overflow-hidden border-2 transition-all hover:border-primary hover:shadow-lg cursor-pointer"
              onClick={() => onSelectGroup(group.key as GroupKey)}
            >
              <div className="p-1 sm:p-3 space-y-0.5 sm:space-y-2 flex flex-col items-center text-center min-h-[60px] sm:min-h-0">
                <div className="flex h-6 w-6 sm:h-9 sm:w-9 items-center justify-center rounded-lg bg-primary/10 text-primary transition-colors group-hover:bg-primary group-hover:text-primary-foreground">
                  <Icon className="h-3 w-3 sm:h-4 sm:w-4" />
                </div>
                <div className="space-y-0.5">
                  <h3 className="text-[10px] sm:text-sm font-semibold tracking-tight text-balance leading-tight">
                    {group.title}
                  </h3>
                  <p className="text-[8px] sm:text-xs text-muted-foreground">
                    {moduleCount} módulos
                  </p>
                </div>
              </div>
              <div className="absolute bottom-0 left-0 right-0 h-0.5 sm:h-1 bg-gradient-to-r from-primary to-accent transform scale-x-0 transition-transform group-hover:scale-x-100" />
            </Card>
          )
        })}
      </div>
    </div>
  )
}
