"use client"

import { useEffect, useMemo, useState } from "react"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { useToast } from "@/hooks/use-toast"
import { useAuth } from "@/components/auth-provider"
import { SST_TOKENS } from "@/components/sst/sst-utils"
import { Kpi } from "@/components/sst/sst-form-ui"
import { getAlertasAT, crearInvestigacionDesdeAusentismo, type AlertaAT } from "@/lib/sst-alertas-at-actions"
import { AlertTriangle, RefreshCw, Loader2, FilePlus2, CheckCircle2, Search } from "lucide-react"

type Filtro = "todas" | "pendiente" | "en_proceso" | "cerrada" | "vencida"

const ESTADO_LABEL: Record<AlertaAT["estadoAlerta"], string> = {
  pendiente: "Investigación pendiente",
  en_proceso: "En investigación",
  cerrada: "Cerrada",
}

function estadoColor(a: AlertaAT) {
  if (a.vencida) return SST_TOKENS.bad
  if (a.estadoAlerta === "cerrada") return SST_TOKENS.ok
  if (a.estadoAlerta === "en_proceso") return SST_TOKENS.warn
  return SST_TOKENS.grey
}

export function AlertasAT({ selectedEmpresaId: propEmpresaId }: { selectedEmpresaId?: number | null }) {
  const { selectedEmpresaId: ctxEmpresaId } = useAuth()
  const empresaId = propEmpresaId ?? ctxEmpresaId ?? null
  const { toast } = useToast()
  const [rows, setRows] = useState<AlertaAT[]>([])
  const [loading, setLoading] = useState(true)
  const [creando, setCreando] = useState<string | null>(null)
  const [q, setQ] = useState("")
  const [filtro, setFiltro] = useState<Filtro>("todas")

  async function cargar() {
    setLoading(true)
    setRows(await getAlertasAT(empresaId))
    setLoading(false)
  }
  useEffect(() => {
    cargar()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [empresaId])

  const kpis = useMemo(() => {
    const total = rows.length
    const pendientes = rows.filter((r) => r.estadoAlerta === "pendiente").length
    const enProceso = rows.filter((r) => r.estadoAlerta === "en_proceso").length
    const cerradas = rows.filter((r) => r.estadoAlerta === "cerrada").length
    const vencidas = rows.filter((r) => r.vencida).length
    const cobertura = total ? Math.round(((enProceso + cerradas) / total) * 100) : 0
    return { total, pendientes, enProceso, cerradas, vencidas, cobertura }
  }, [rows])

  const filtradas = useMemo(() => {
    const t = q.trim().toLowerCase()
    return rows.filter((r) => {
      if (filtro === "vencida" && !r.vencida) return false
      if (filtro !== "todas" && filtro !== "vencida" && r.estadoAlerta !== filtro) return false
      if (!t) return true
      return [r.nombre, r.cargo, r.area, r.diagnostico].some((v) => (v ?? "").toLowerCase().includes(t))
    })
  }, [rows, q, filtro])

  async function generar(a: AlertaAT) {
    setCreando(a.ausentismoId)
    const res = await crearInvestigacionDesdeAusentismo(a.ausentismoId, empresaId)
    setCreando(null)
    if (res.success) {
      toast({
        title: res.yaExistia ? "Ya existía una investigación" : "Investigación generada",
        description: res.yaExistia
          ? "Este AT ya tiene una investigación. Complétala en el módulo Investigación AT."
          : "Se creó el borrador prellenado. Ve a Investigación AT para completarla y subir soportes.",
      })
      cargar()
    } else {
      toast({ title: "No se pudo generar", description: res.message })
    }
  }

  const filtros: { k: Filtro; label: string }[] = [
    { k: "todas", label: "Todas" },
    { k: "pendiente", label: "Pendientes" },
    { k: "en_proceso", label: "En investigación" },
    { k: "cerrada", label: "Cerradas" },
    { k: "vencida", label: "Vencidas" },
  ]

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold" style={{ color: SST_TOKENS.navy }}>
            Alertas de Accidentes de Trabajo (AT)
          </h2>
          <p className="text-xs text-muted-foreground">
            Conectado con Gestión Humana · Ausentismos. Cada ausentismo registrado con tipo{" "}
            <strong>AT</strong> genera una alerta y una investigación pendiente (Res. 1401/2007: plazo de 15
            días).
          </p>
        </div>
        <Button
          onClick={cargar}
          variant="outline"
          disabled={loading}
          style={{ borderColor: SST_TOKENS.navy, color: SST_TOKENS.navy }}
        >
          {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
          Actualizar
        </Button>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        <Kpi t="AT registrados" v={kpis.total} />
        <Kpi t="Pendientes" v={kpis.pendientes} c={SST_TOKENS.grey} />
        <Kpi t="En investigación" v={kpis.enProceso} c={SST_TOKENS.warn} />
        <Kpi t="Cerradas" v={kpis.cerradas} c={SST_TOKENS.ok} />
        <Kpi t="Vencidas (>15 días)" v={kpis.vencidas} c={SST_TOKENS.bad} />
      </div>

      {kpis.vencidas > 0 && (
        <Card className="flex items-center gap-3 border-l-4 p-3" style={{ borderLeftColor: SST_TOKENS.bad }}>
          <AlertTriangle className="h-5 w-5 shrink-0" style={{ color: SST_TOKENS.bad }} />
          <p className="text-sm text-foreground">
            Hay <strong>{kpis.vencidas}</strong> investigación(es) de AT vencida(s) (más de 15 días sin
            cerrar). Priorízalas para cumplir el plazo legal.
          </p>
        </Card>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar por colaborador, cargo, área o diagnóstico…"
            className="pl-8"
          />
        </div>
        <div className="flex flex-wrap gap-1">
          {filtros.map((f) => (
            <Button
              key={f.k}
              size="sm"
              variant={filtro === f.k ? "default" : "outline"}
              onClick={() => setFiltro(f.k)}
              style={filtro === f.k ? { background: SST_TOKENS.navy, color: "white" } : undefined}
            >
              {f.label}
            </Button>
          ))}
        </div>
      </div>

      <Card className="overflow-x-auto p-0">
        <table className="w-full text-sm">
          <thead>
            <tr style={{ background: SST_TOKENS.navy, color: "white" }}>
              <th className="p-2 text-left">Colaborador</th>
              <th className="p-2 text-left">Cargo / Área</th>
              <th className="p-2 text-left">Fecha AT</th>
              <th className="p-2 text-center">Días incap.</th>
              <th className="p-2 text-center">Días transcurridos</th>
              <th className="p-2 text-left">Estado</th>
              <th className="p-2 text-center">Acción</th>
            </tr>
          </thead>
          <tbody>
            {filtradas.map((a, i) => (
              <tr key={a.ausentismoId} style={{ background: i % 2 ? "#f7fafc" : "white" }}>
                <td className="p-2">
                  <div className="font-medium">{a.nombre}</div>
                  {a.diagnostico ? <div className="text-xs text-muted-foreground">{a.diagnostico}</div> : null}
                </td>
                <td className="p-2">
                  <div>{a.cargo ?? "—"}</div>
                  <div className="text-xs text-muted-foreground">{a.area ?? a.centroTrabajo ?? ""}</div>
                </td>
                <td className="p-2">{a.fechaEvento ?? "—"}</td>
                <td className="p-2 text-center">{a.diasIncapacidad ?? 0}</td>
                <td className="p-2 text-center">
                  {a.diasTranscurridos === null ? (
                    "—"
                  ) : (
                    <span style={{ color: a.vencida ? SST_TOKENS.bad : undefined, fontWeight: a.vencida ? 700 : 400 }}>
                      {a.diasTranscurridos}
                    </span>
                  )}
                </td>
                <td className="p-2">
                  <Badge style={{ background: estadoColor(a), color: "white" }}>
                    {a.vencida ? "Vencida" : ESTADO_LABEL[a.estadoAlerta]}
                  </Badge>
                </td>
                <td className="p-2 text-center">
                  {a.investigacionId ? (
                    <span className="inline-flex items-center gap-1 text-xs" style={{ color: SST_TOKENS.ok }}>
                      <CheckCircle2 className="h-4 w-4" /> Investigación creada
                    </span>
                  ) : (
                    <Button
                      size="sm"
                      disabled={creando === a.ausentismoId}
                      onClick={() => generar(a)}
                      style={{ background: SST_TOKENS.navy, color: "white" }}
                    >
                      {creando === a.ausentismoId ? (
                        <Loader2 className="mr-1 h-4 w-4 animate-spin" />
                      ) : (
                        <FilePlus2 className="mr-1 h-4 w-4" />
                      )}
                      Generar investigación
                    </Button>
                  )}
                </td>
              </tr>
            ))}
            {!loading && filtradas.length === 0 && (
              <tr>
                <td colSpan={7} className="p-6 text-center text-muted-foreground">
                  No hay accidentes de trabajo registrados en ausentismos para estos filtros.
                </td>
              </tr>
            )}
            {loading && (
              <tr>
                <td colSpan={7} className="p-6 text-center text-muted-foreground">
                  <Loader2 className="mx-auto h-5 w-5 animate-spin" />
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </Card>
    </div>
  )
}
