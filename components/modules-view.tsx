"use client"

import { useEffect, useState } from "react"
import { groups, type GroupKey, type Module } from "@/lib/dashboard-data"
import { ArrowLeft } from "lucide-react"
import { LipAiAssistant, type AtencionItem } from "@/components/lip-ai-assistant"
import { AreaKpis } from "@/components/area-kpis"
import { useAuth } from "@/components/auth-provider"
import { getAtencionDelDia } from "@/lib/atencion-actions"

interface ModulesViewProps {
  groupKey: GroupKey
  onBack: () => void
  onSelectModule: (moduleName: string) => void
}

const TEAL = "#00b4cc"

// Tarjeta de módulo COMPACTA (estilo Odoo): ícono teal + nombre. Homogénea
// para todos los grupos porque este componente es compartido.
function ModuleCard({ module, onSelect }: { module: Module; onSelect: (name: string) => void }) {
  const Icon = module.icon
  return (
    <button
      onClick={() => onSelect(module.name)}
      className="group flex items-center gap-3 rounded-xl border border-border bg-card p-3 text-left transition-all duration-150 hover:-translate-y-0.5 hover:shadow-md"
    >
      <span
        className="flex h-9 w-9 flex-none items-center justify-center rounded-lg transition-transform duration-150 group-hover:scale-105"
        style={{ backgroundColor: `${TEAL}1f`, color: TEAL }}
      >
        <Icon className="h-[17px] w-[17px]" />
      </span>
      <span className="min-w-0 text-[13px] font-semibold leading-tight text-foreground">
        {module.label ?? module.name}
      </span>
    </button>
  )
}

export function ModulesView({ groupKey, onBack, onSelectModule }: ModulesViewProps) {
  const { selectedEmpresaId, selectedEmpresaNombre } = useAuth()
  const [alertas, setAlertas] = useState<AtencionItem[]>([])

  const group = groups.find((g) => g.key === groupKey)

  // Atención del día (real, por empresa) para la tarjeta de IA.
  useEffect(() => {
    if (!selectedEmpresaId) return
    let cancel = false
    getAtencionDelDia()
      .then((r) => {
        if (!cancel && r.success) setAlertas(r.items as AtencionItem[])
      })
      .catch(() => {})
    return () => {
      cancel = true
    }
  }, [selectedEmpresaId, groupKey])

  if (!group) return null

  const GroupIcon = group.icon
  // Suma módulos directos + de subgrupos. (Antes daba 0 cuando `modules: []`
  // existía junto a subgrupos, porque el array vacío se tomaba como válido.)
  const totalModules =
    (group.modules?.length ?? 0) + (group.subgroups?.reduce((acc, sg) => acc + sg.modules.length, 0) ?? 0)

  return (
    <div className="space-y-5">
      {/* Header compacto */}
      <div className="flex items-center gap-3">
        <button
          onClick={onBack}
          aria-label="Volver"
          className="flex h-9 w-9 flex-none items-center justify-center rounded-lg border border-border bg-card text-muted-foreground transition-colors hover:bg-accent"
        >
          <ArrowLeft className="h-4 w-4" />
        </button>
        <span
          className="flex h-11 w-11 flex-none items-center justify-center rounded-xl"
          style={{ backgroundColor: `${TEAL}1f`, color: TEAL }}
        >
          <GroupIcon className="h-6 w-6" />
        </span>
        <div className="min-w-0">
          <h1 className="text-xl font-bold leading-tight text-foreground sm:text-2xl">{group.title}</h1>
          <p className="text-[13px] text-muted-foreground">Selecciona un módulo para continuar</p>
        </div>
        <span className="ml-auto flex-none rounded-full border border-border bg-card px-3 py-1.5 text-xs text-muted-foreground">
          {totalModules} módulo{totalModules !== 1 ? "s" : ""}
        </span>
      </div>

      {/* Asistente IA premium — con atención del día real por empresa */}
      <LipAiAssistant
        contextLabel={group.title}
        empresaLabel={selectedEmpresaNombre}
        alertas={alertas}
        onOpen={() => onSelectModule("Asistente IA")}
        onAlerta={(a) => a.modulo && onSelectModule(a.modulo)}
      />

      {/* Indicadores del área leídos del BSC (por empresa, en vivo) */}
      <AreaKpis groupKey={groupKey} />

      {/* Módulos directos */}
      {group.modules && group.modules.length > 0 && (
        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-4">
          {group.modules.map((m) => (
            <ModuleCard key={m.name} module={m} onSelect={onSelectModule} />
          ))}
        </div>
      )}

      {/* Subgrupos */}
      {group.subgroups &&
        group.subgroups.map((sg) => (
          <div key={sg.title} className="space-y-2.5">
            <h2 className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground">{sg.title}</h2>
            <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-4">
              {sg.modules.map((m) => (
                <ModuleCard key={m.name} module={m} onSelect={onSelectModule} />
              ))}
            </div>
          </div>
        ))}
    </div>
  )
}
