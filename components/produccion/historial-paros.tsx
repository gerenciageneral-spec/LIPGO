"use client"

// Historial y análisis de paros justificados: rango de fechas, KPIs, gráfico por
// causa (cuál se repite más), minutos por día y tabla de detalle. Lee los paros
// guardados en paros_produccion (los comentados desde "Reportar del día").

import { useCallback, useEffect, useState } from "react"
import { useAuth } from "@/components/auth-provider"
import { useToast } from "@/hooks/use-toast"
import { Card } from "@/components/ui/card"
import { Loader2 } from "lucide-react"
import { BarChart, Bar, Cell, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts"
import { getHistorialParos, type HistorialParos as Hist, type ParoComentario } from "@/lib/paros-actions"

const CAT_LABEL: Record<string, string> = {
  mecanico: "Mecánico",
  electrico: "Eléctrico",
  insumos: "Falta de insumos",
  cambio_referencia: "Cambio de referencia",
  aseo: "Aseo / sanitización",
  personal: "Falta de personal",
  calidad: "Calidad",
  otro: "Otro",
  "": "Sin categoría",
}
const catLabel = (c?: string | null) => CAT_LABEL[c || ""] ?? c ?? "Sin categoría"

const COLORS = [
  "var(--chart-1)",
  "var(--chart-2)",
  "var(--chart-3)",
  "var(--chart-4)",
  "var(--chart-5)",
  "var(--primary)",
  "var(--secondary)",
  "var(--destructive)",
]

function fmtMin(min: number): string {
  const m = Math.max(0, Math.round(min))
  const h = Math.floor(m / 60)
  return h > 0 ? `${h}h ${String(m % 60).padStart(2, "0")}m` : `${m}m`
}
const isoDay = (d: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: "UTC", year: "numeric", month: "2-digit", day: "2-digit" }).format(d)
function hoyISO() {
  return isoDay(new Date())
}
function hace(dias: number) {
  const d = new Date()
  d.setUTCDate(d.getUTCDate() - dias)
  return isoDay(d)
}
// inicio/fin se guardan como ISO UTC literal → HH:MM por slice.
const hhmm = (iso?: string | null) => (iso ? String(iso).slice(11, 16) : "—")

const TOOLTIP_STYLE = { background: "var(--popover)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 12, color: "var(--popover-foreground)" }

function Vacio({ loading, texto }: { loading: boolean; texto?: string }) {
  return (
    <div className="flex h-40 items-center justify-center text-sm text-muted-foreground">
      {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : texto || "Sin datos en el rango."}
    </div>
  )
}

export function HistorialParos() {
  const { selectedEmpresaId } = useAuth()
  const { toast } = useToast()
  const [desde, setDesde] = useState(() => hace(30))
  const [hasta, setHasta] = useState(() => hoyISO())
  const [loading, setLoading] = useState(true)
  const [data, setData] = useState<Hist | null>(null)

  const cargar = useCallback(async () => {
    setLoading(true)
    const r = await getHistorialParos(selectedEmpresaId ?? null, desde || null, hasta || null)
    if (r.success) setData(r.data ?? null)
    else toast({ title: "No se pudo cargar el historial", description: r.message })
    setLoading(false)
  }, [selectedEmpresaId, desde, hasta, toast])

  useEffect(() => {
    cargar()
  }, [cargar])

  const porCategoria = data?.porCategoria ?? []
  const porDia = data?.porDia ?? []
  const rows = data?.rows ?? []
  const catTop = porCategoria[0]

  return (
    <div className="space-y-4">
      {/* Rango */}
      <div className="flex flex-wrap items-end gap-3">
        <div className="space-y-1">
          <label className="block text-xs text-muted-foreground">Desde</label>
          <input
            type="date"
            value={desde}
            max={hasta || hoyISO()}
            onChange={(e) => setDesde(e.target.value)}
            className="rounded-md border border-border bg-card px-3 py-1.5 text-sm text-card-foreground outline-none focus:ring-2 focus:ring-primary"
          />
        </div>
        <div className="space-y-1">
          <label className="block text-xs text-muted-foreground">Hasta</label>
          <input
            type="date"
            value={hasta}
            max={hoyISO()}
            onChange={(e) => setHasta(e.target.value)}
            className="rounded-md border border-border bg-card px-3 py-1.5 text-sm text-card-foreground outline-none focus:ring-2 focus:ring-primary"
          />
        </div>
        {loading && <Loader2 className="mb-2 h-4 w-4 animate-spin text-muted-foreground" />}
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Card className="p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Paros justificados</p>
          <p className="mt-1 text-2xl font-bold tabular-nums text-foreground">{data?.total ?? 0}</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Tiempo detenido</p>
          <p className="mt-1 text-2xl font-bold tabular-nums text-destructive">{fmtMin(data?.totalMinutos ?? 0)}</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Causa más frecuente</p>
          <p className="mt-1 truncate text-lg font-bold text-foreground">{catTop ? catLabel(catTop.categoria) : "—"}</p>
          <p className="text-xs text-muted-foreground">{catTop ? `${catTop.count} paros · ${fmtMin(catTop.minutos)}` : ""}</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Días con paros</p>
          <p className="mt-1 text-2xl font-bold tabular-nums text-foreground">{porDia.length}</p>
        </Card>
      </div>

      {/* Por causa */}
      <Card className="p-4">
        <h3 className="mb-3 text-sm font-semibold text-card-foreground">Paros por causa — cuál se repite más</h3>
        {porCategoria.length === 0 ? (
          <Vacio loading={loading} />
        ) : (
          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={porCategoria.map((c) => ({ name: catLabel(c.categoria), Paros: c.count, minutos: c.minutos }))}
                margin={{ top: 8, right: 8, left: -8, bottom: 20 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                <XAxis dataKey="name" stroke="var(--muted-foreground)" fontSize={11} tickLine={false} interval={0} angle={-12} textAnchor="end" height={50} />
                <YAxis stroke="var(--muted-foreground)" fontSize={11} allowDecimals={false} />
                <Tooltip
                  contentStyle={TOOLTIP_STYLE}
                  formatter={(v: number, n: string) => (n === "minutos" ? [fmtMin(v), "Detenido"] : [v, "Paros"])}
                />
                <Bar dataKey="Paros" radius={[3, 3, 0, 0]}>
                  {porCategoria.map((_, i) => (
                    <Cell key={i} fill={COLORS[i % COLORS.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </Card>

      {/* Por día */}
      <Card className="p-4">
        <h3 className="mb-3 text-sm font-semibold text-card-foreground">Minutos detenidos por día</h3>
        {porDia.length === 0 ? (
          <Vacio loading={loading} />
        ) : (
          <div className="h-56 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={[...porDia].reverse().map((d) => ({ fecha: d.fecha.slice(5), minutos: d.minutos }))}
                margin={{ top: 8, right: 8, left: -8, bottom: 0 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                <XAxis dataKey="fecha" stroke="var(--muted-foreground)" fontSize={11} tickLine={false} />
                <YAxis stroke="var(--muted-foreground)" fontSize={11} />
                <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v: number) => [fmtMin(v), "Detenido"]} />
                <Bar dataKey="minutos" fill="var(--destructive)" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </Card>

      {/* Detalle */}
      <Card className="overflow-hidden p-0">
        <div className="border-b border-border px-4 py-3">
          <h3 className="text-sm font-semibold text-card-foreground">Detalle de paros ({rows.length})</h3>
        </div>
        {rows.length === 0 ? (
          <div className="p-4">
            <Vacio loading={loading} texto="Sin paros justificados en el rango seleccionado." />
          </div>
        ) : (
          <div className="max-h-96 overflow-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-card">
                <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="px-3 py-2">Fecha</th>
                  <th className="px-3 py-2">Franja</th>
                  <th className="px-3 py-2 text-right">Duración</th>
                  <th className="px-3 py-2">Categoría</th>
                  <th className="px-3 py-2">Motivo</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((p: ParoComentario) => (
                  <tr key={p.id} className="border-b border-border/60 last:border-0">
                    <td className="whitespace-nowrap px-3 py-2 font-mono">{p.fecha}</td>
                    <td className="whitespace-nowrap px-3 py-2 font-mono">
                      {hhmm(p.inicio)} – {hhmm(p.fin)}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 text-right font-mono">{fmtMin(p.minutos || 0)}</td>
                    <td className="whitespace-nowrap px-3 py-2">{catLabel(p.categoria)}</td>
                    <td className="px-3 py-2 text-muted-foreground">{p.motivo}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  )
}
