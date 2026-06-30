"use client"

import { Card } from "@/components/ui/card"
import { groups, type GroupKey } from "@/lib/dashboard-data"

interface ModulesViewProps {
  groupKey: GroupKey
  onBack: () => void
  onSelectModule: (moduleName: string) => void
}

export function ModulesView({ groupKey, onBack, onSelectModule }: ModulesViewProps) {
  const group = groups.find((g) => g.key === groupKey)

  if (!group) return null

  const GroupIcon = group.icon

  const totalModules = group.modules
    ? group.modules.length
    : group.subgroups?.reduce((acc, subgroup) => acc + subgroup.modules.length, 0) || 0

  return (
    <div className="space-y-8">
      {/* Header Section */}
      <div className="space-y-4">
        <div className="flex items-center gap-4">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10 text-primary">
            <GroupIcon className="h-8 w-8" />
          </div>
          <div>
            <h1 className="text-3xl font-bold text-foreground">{group.title}</h1>
            <p className="text-base text-muted-foreground">
              {totalModules} módulo{totalModules !== 1 ? "s" : ""} disponible{totalModules !== 1 ? "s" : ""}
            </p>
          </div>
        </div>
      </div>

      {/* Modules */}
      {group.modules && (
        <div className="grid gap-6 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {group.modules.map((module) => {
            const Icon = module.icon
            return (
              <Card
                key={module.name}
                onClick={() => onSelectModule(module.name)}
                className="group relative overflow-hidden border-2 transition-all hover:border-primary hover:shadow-lg cursor-pointer bg-card"
              >
                <div className="p-6 space-y-4 flex flex-col items-center text-center">
                  <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 text-primary transition-all group-hover:bg-primary group-hover:text-primary-foreground group-hover:scale-110">
                    <Icon className="h-6 w-6" />
                  </div>
                  <h3 className="text-sm font-semibold leading-tight text-foreground text-pretty">{module.name}</h3>
                </div>
                <div className="absolute bottom-0 left-0 right-0 h-1 bg-primary transform scale-x-0 transition-transform group-hover:scale-x-100" />
              </Card>
            )
          })}
        </div>
      )}

      {/* Subgroups */}
      {group.subgroups && (
        <div className="space-y-8">
          {group.subgroups.map((subgroup) => (
            <div key={subgroup.title} className="space-y-4">
              {/* Subgroup Title */}
              <h2 className="text-2xl font-semibold text-foreground border-b pb-2">{subgroup.title}</h2>

              {/* Subgroup Modules as Cards */}
              <div className="grid gap-6 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {subgroup.modules.map((module) => {
                  const Icon = module.icon
                  return (
                    <Card
                      key={module.name}
                      onClick={() => onSelectModule(module.name)}
                      className="group relative overflow-hidden border-2 transition-all hover:border-primary hover:shadow-lg cursor-pointer bg-card"
                    >
                      <div className="p-6 space-y-4 flex flex-col items-center text-center">
                        <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 text-primary transition-all group-hover:bg-primary group-hover:text-primary-foreground group-hover:scale-110">
                          <Icon className="h-6 w-6" />
                        </div>
                        <h3 className="text-sm font-semibold leading-tight text-foreground text-pretty">
                          {module.name}
                        </h3>
                      </div>
                      <div className="absolute bottom-0 left-0 right-0 h-1 bg-primary transform scale-x-0 transition-transform group-hover:scale-x-100" />
                    </Card>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
