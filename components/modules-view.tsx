"use client"

import { useEffect, useMemo, useState } from "react"
import { groups, type GroupKey, type Module } from "@/lib/dashboard-data"
import { ArrowLeft } from "lucide-react"
import { LipAiAssistant, type AtencionItem } from "@/components/lip-ai-assistant"
import { AreaKpis, type ValorBsc } from "@/components/area-kpis"
import { useAuth } from "@/components/auth-provider"
import { getIndicadoresValores } from "@/lib/sig-actions"
import { AREA_KPIS, KPI_DEFS, formatKpi, kpiSev } from "@/lib/kpis-area"

interface ModulesViewProps {
  groupKey: GroupKey
  onBack: () => void
  onSelectModule: (moduleName: string) => void
  /** Navegación robusta (grupo + módulo) para el asistente IA. */
  onNavigate?: (moduleName: string) => void
  /** Abrir un módulo principal (grupo) para el asistente IA. */
  onOpenGroup?: (key: string) => void
}

const TEAL = "#00b4cc"

function monthRange() {
  const d = new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, "0")
  const day = String(d.getDate()).padStart(2, "0")
  return { desde: `${y}-${m}-01`, hasta: `${y}-${m}-${day}` }
}

/**
 * Deriva las "tareas del día" del submódulo a partir de SUS PROPIOS KPIs del
 * BSC: los indicadores del área que están por debajo de meta (crit/warn) se
 * convierten en focos de atención. Así cada submódulo muestra tareas distintas
 * y siempre alineadas con los KPIs que se ven arriba. Crit primero.
 */
function alertasDesdeKpis(groupKey: GroupKey, valores: Record<string, ValorBsc>): AtencionItem[] {
  const keys = AREA_KPIS[groupKey] ?? []
  const items = keys
    .map((k) => {
      const def = KPI_DEFS[k]
      const v = valores[k]
      if (!def || !v) return null
      const sev = kpiSev(def, v.valor)
      if (sev !== "crit" && sev !== "warn") return null
      const metaTxt = def.meta != null ? ` · meta ${formatKpi(def, def.meta)}` : ""
      return {
        label: `${def.nombre}: ${formatKpi(def, v.valor)}${metaTxt}`,
        sev: sev === "crit" ? ("crit" as const) : ("warn" as const),
      }
    })
    .filter((x): x is { label: string; sev: "crit" | "warn" } => x !== null)
  // Crit primero, luego warn.
  return items.sort((a, b) => (a.sev === "crit" ? -1 : 1) - (b.sev === "crit" ? -1 : 1))
}

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

export function ModulesView({ groupKey, onBack, onSelectModule, onNavigate, onOpenGroup }: ModulesViewProps) {
  const { selectedEmpresaId, selectedEmpresaNombre } = useAuth()
  const [valores, setValores] = useState<Record<string, ValorBsc>>({})
  const [loading, setLoading] = useState(true)

  const group = groups.find((g) => g.key === groupKey)

  // UNA sola lectura del BSC por empresa/grupo (+ refresco cada 3 min). Alimenta
  // los KPIs del área Y las tareas del día del submódulo, así siempre coinciden.
  useEffect(() => {
    const keys = AREA_KPIS[groupKey] ?? []
    if (keys.length === 0 || !selectedEmpresaId) {
      setValores({})
      setLoading(false)
      return
    }
    let cancel = false
    const load = async () => {
      try {
        const { desde, hasta } = monthRange()
        const r = await getIndicadoresValores(selectedEmpresaId, desde, hasta)
        if (!cancel && r.success) setValores(r.valores as Record<string, ValorBsc>)
      } catch {
        // silencioso
      } finally {
        if (!cancel) setLoading(false)
      }
    }
    setLoading(true)
    load()
    const interval = setInterval(load, 180000)
    return () => {
      cancel = true
      clearInterval(interval)
    }
  }, [groupKey, selectedEmpresaId])

  // Tareas del día = KPIs del área bajo meta. Memo para no recalcular en cada render.
  const alertas = useMemo(() => alertasDesdeKpis(groupKey, valores), [groupKey, valores])

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

      {/* Asistente IA premium — tareas del día PROPIAS de este submódulo (KPIs bajo meta) */}
      <LipAiAssistant
        contextLabel={group.title}
        empresaLabel={selectedEmpresaNombre}
        alertas={alertas}
        onOpen={() => onSelectModule("Asistente IA")}
        onNavigate={onNavigate ?? onSelectModule}
        onOpenGroup={onOpenGroup}
      />

      {/* Indicadores del área leídos del BSC (por empresa, en vivo) */}
      <AreaKpis groupKey={groupKey} valores={valores} loading={loading} />

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
