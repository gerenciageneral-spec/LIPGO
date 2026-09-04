"use client"

// Calificación del Conductor (módulo del COORDINADOR · Gestión LIP).
// Captura DIDÁCTICA y EN CALIENTE (🟢🟡🔴) al finalizar el cargue, desde un
// kiosko en el dispositivo de LIP. Alimenta sig_satisfaccion (tipo='conductor')
// → sube al BSC (IND-G-02) por proyecto y gerencial. Fuente de verdad: LIPgo.

import { useEffect, useMemo, useState } from "react"
import { ResponsiveContainer, PieChart, Pie, Cell, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, BarChart, Bar } from "recharts"
import { Loader2, Smile, Meh, Frown, Star, Target, History, Wand2, Trash2, Info } from "lucide-react"
import { useAuth } from "@/components/auth-provider"
import { useToast } from "@/hooks/use-toast"
import { SST_TOKENS } from "@/components/sst/sst-utils"
import { SigHeader, SigFilterBar, SigField, SigKpi, SigSection, SigDatePicker } from "@/components/sst/sig-ui"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog"
import {
  getAnalisisCalificacionConductor,
  registrarCalificacionConductor,
  generarHistoricoCalificaciones,
  limpiarHistoricoCalificaciones,
} from "@/lib/calificacion-conductor-actions"
import { getUserPermissions } from "@/lib/permissions-actions"
import { EMOJI_PCT, type AnalisisCalificacion, type CargueCalificable } from "@/lib/calificacion-conductor"

const C_FELIZ = "#16a34a"
const C_REGULAR = "#f59e0b"
const C_MALA = "#dc2626"

const colorPct = (v: number, meta: number) => (v >= meta ? SST_TOKENS.ok : v >= meta * 0.85 ? SST_TOKENS.warn : SST_TOKENS.bad)

export function CalificacionConductor() {
  const { selectedEmpresaId, selectedEmpresaNombre } = useAuth()
  const { toast } = useToast()
  const [data, setData] = useState<AnalisisCalificacion | null>(null)
  const [loading, setLoading] = useState(true)
  // Por defecto arranca en el MES ACTUAL: la calificación es "en caliente", así
  // que los pendientes relevantes son del mes y la consulta no escanea años de
  // histórico. El usuario puede ampliar el rango o limpiarlo (todo el histórico).
  const [desde, setDesde] = useState(() => {
    const h = new Date()
    return `${h.getFullYear()}-${String(h.getMonth() + 1).padStart(2, "0")}-01`
  })
  const [hasta, setHasta] = useState("")
  const [buscar, setBuscar] = useState("")

  // Kiosko
  const [kiosko, setKiosko] = useState<CargueCalificable | null>(null)
  const [comentario, setComentario] = useState("")
  const [guardando, setGuardando] = useState(false)
  const [gracias, setGracias] = useState(false)

  // Histórico automático (solo admin)
  const [esAdmin, setEsAdmin] = useState(false)
  const [procesandoHist, setProcesandoHist] = useState(false)
  useEffect(() => {
    getUserPermissions().then((p) => setEsAdmin(!!p?.gestion_usuarios)).catch(() => setEsAdmin(false))
  }, [])

  const generarHistorico = async () => {
    if (!confirm("Generar el histórico de calificaciones por SLA (conductor + cliente) para las fechas anteriores al 15-jul-2026. Es reversible. ¿Continuar?")) return
    setProcesandoHist(true)
    const res = await generarHistoricoCalificaciones({ empresaId: selectedEmpresaId ?? null })
    setProcesandoHist(false)
    if (res.success) {
      toast({
        title: "Histórico generado",
        description: `Conductor: ${res.conductor?.creadas ?? 0} creadas (${res.conductor?.omitidas ?? 0} sin SLA) · Cliente: ${res.cliente?.creadas ?? 0} meses.`,
      })
      load()
    } else {
      toast({ title: "No se pudo generar", description: res.error })
    }
  }

  const limpiarHistorico = async () => {
    if (!confirm("Borrar SOLO las calificaciones generadas automáticamente (canal 'histórico'). Las calificaciones en línea no se tocan. ¿Continuar?")) return
    setProcesandoHist(true)
    const res = await limpiarHistoricoCalificaciones({ empresaId: selectedEmpresaId ?? null })
    setProcesandoHist(false)
    if (res.success) {
      toast({ title: "Histórico limpiado", description: `${res.borradas ?? 0} registros eliminados.` })
      load()
    } else {
      toast({ title: "No se pudo limpiar", description: res.error })
    }
  }

  const load = async () => {
    setLoading(true)
    const r = await getAnalisisCalificacionConductor(selectedEmpresaId ?? null, desde || null, hasta || null)
    if (r.success && r.data) setData(r.data)
    else toast({ title: "No se pudo cargar", description: r.error })
    setLoading(false)
  }
  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedEmpresaId, desde, hasta])

  const pendientesFiltrados = useMemo(() => {
    const q = buscar.trim().toLowerCase()
    const arr = data?.pendientes ?? []
    if (!q) return arr
    return arr.filter(
      (p) =>
        p.ref_orden.toLowerCase().includes(q) ||
        (p.conductor || "").toLowerCase().includes(q) ||
        (p.placa || "").toLowerCase().includes(q),
    )
  }, [data, buscar])

  const abrirKiosko = (c: CargueCalificable) => {
    setKiosko(c)
    setComentario("")
    setGracias(false)
  }

  const calificar = async (emoji: "feliz" | "regular" | "mala") => {
    if (!kiosko) return
    setGuardando(true)
    const r = await registrarCalificacionConductor({
      proyectoId: kiosko.proyecto_id,
      refOrden: kiosko.ref_orden,
      placa: kiosko.placa,
      conductor: kiosko.conductor,
      emoji,
      comentario,
    })
    setGuardando(false)
    if (r.success) {
      setGracias(true)
      setTimeout(() => {
        setKiosko(null)
        load()
      }, 1400)
    } else {
      toast({ title: "Error", description: r.error || "No se pudo guardar." })
    }
  }

  const r = data?.resumen
  const dist = r
    ? [
        { name: "🟢 Bueno", value: r.feliz, fill: C_FELIZ },
        { name: "🟡 Regular", value: r.regular, fill: C_REGULAR },
        { name: "🔴 Malo", value: r.mala, fill: C_MALA },
      ].filter((d) => d.value > 0)
    : []

  return (
    <div className="space-y-5">
      <SigHeader
        Icon={Star}
        title="Calificación del Conductor"
        subtitle="Calificación didáctica en caliente al fin de cargue (🟢🟡🔴). Objetivo del coordinador · alimenta la satisfacción del conductor en el BSC, por proyecto y gerencial."
      />

      <SigFilterBar cliente={selectedEmpresaNombre}>
        <SigField label="Desde">
          <SigDatePicker value={desde} onChange={setDesde} />
        </SigField>
        <SigField label="Hasta">
          <SigDatePicker value={hasta} onChange={setHasta} />
        </SigField>
        {(desde || hasta) && (
          <Button variant="ghost" size="sm" onClick={() => { setDesde(""); setHasta("") }}>Limpiar</Button>
        )}
        {loading && <Loader2 className="h-4 w-4 animate-spin" style={{ color: SST_TOKENS.teal }} />}
      </SigFilterBar>

      {/* Corte del servicio: en línea desde el 15-jul-2026; lo anterior es histórico por SLA */}
      <div className="flex flex-col gap-3 rounded-lg border p-3 sm:flex-row sm:items-center sm:justify-between" style={{ borderColor: `${SST_TOKENS.navy}22`, background: `${SST_TOKENS.navy}08` }}>
        <div className="flex items-start gap-2 text-xs" style={{ color: SST_TOKENS.ink }}>
          <Info className="mt-0.5 h-4 w-4 shrink-0" style={{ color: SST_TOKENS.navy }} />
          <span>
            La calificación <strong>en línea</strong> opera desde el <strong>15-jul-2026</strong>. Los cargues anteriores quedan como
            <strong> historial</strong> (no se califican en vivo) y se pueden poblar <strong>automáticamente por SLA</strong> para tener información y tendencia.
          </span>
        </div>
        {esAdmin && (
          <div className="flex shrink-0 gap-2">
            <Button size="sm" variant="outline" className="gap-1.5" disabled={procesandoHist} onClick={generarHistorico}>
              {procesandoHist ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wand2 className="h-4 w-4" />} Generar histórico por SLA
            </Button>
            <Button size="sm" variant="ghost" className="gap-1.5 text-muted-foreground" disabled={procesandoHist} onClick={limpiarHistorico}>
              <Trash2 className="h-4 w-4" /> Limpiar
            </Button>
          </div>
        )}
      </div>

      {!data ? (
        <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin" style={{ color: SST_TOKENS.navy }} /></div>
      ) : (
        <>
          {/* KPIs */}
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
            <SigKpi label="Satisfacción del conductor" value={r!.satisfaccion} unit="%" Icon={Smile} accent={colorPct(r!.satisfaccion, 85)} valueColor={colorPct(r!.satisfaccion, 85)} sub="meta 85% · sube al BSC" />
            <SigKpi label="Cobertura de calificación" value={r!.cobertura} unit="%" Icon={Target} accent={colorPct(r!.cobertura, 80)} valueColor={colorPct(r!.cobertura, 80)} sub={`${r!.calificados}/${r!.finalizados} cargues · objetivo coord.`} />
            <SigKpi label="🟢 Bueno" value={r!.feliz} Icon={Smile} accent={C_FELIZ} valueColor={C_FELIZ} />
            <SigKpi label="🟡 Regular" value={r!.regular} Icon={Meh} accent={C_REGULAR} valueColor={C_REGULAR} />
            <SigKpi label="🔴 Malo" value={r!.mala} Icon={Frown} accent={C_MALA} valueColor={C_MALA} />
          </div>

          {/* Charts */}
          <div className="grid gap-4 lg:grid-cols-2">
            <Card className="p-3">
              <SigSection title="Distribución de calificaciones" />
              <div className="mt-2">
                {dist.length === 0 ? (
                  <div className="flex h-[240px] items-center justify-center text-sm text-muted-foreground">Aún sin calificaciones</div>
                ) : (
                  <ResponsiveContainer width="100%" height={240}>
                    <PieChart>
                      <Pie data={dist} cx="50%" cy="50%" innerRadius={55} outerRadius={90} paddingAngle={3} dataKey="value" label={({ value }) => value}>
                        {dist.map((e, i) => <Cell key={i} fill={e.fill} />)}
                      </Pie>
                      <Tooltip />
                      <Legend />
                    </PieChart>
                  </ResponsiveContainer>
                )}
              </div>
            </Card>

            <Card className="p-3">
              <SigSection title="Satisfacción por mes" />
              <div className="mt-2">
                {data.porMes.length === 0 ? (
                  <div className="flex h-[240px] items-center justify-center text-sm text-muted-foreground">Sin datos</div>
                ) : (
                  <ResponsiveContainer width="100%" height={240}>
                    <LineChart data={data.porMes}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="mes" tick={{ fontSize: 11 }} />
                      <YAxis domain={[0, 100]} tick={{ fontSize: 11 }} />
                      <Tooltip formatter={(v: number) => [`${v}%`, "Satisfacción"]} />
                      <Line type="monotone" dataKey="satisfaccion" name="% Satisfacción" stroke={SST_TOKENS.teal} strokeWidth={2} />
                    </LineChart>
                  </ResponsiveContainer>
                )}
              </div>
            </Card>
          </div>

          {/* Por proyecto (vista gerencial) */}
          {data.verTodos && data.porProyecto.length > 0 && (
            <Card className="p-3">
              <SigSection title="Satisfacción del conductor por proyecto (gerencial)" />
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={data.porProyecto} layout="vertical" margin={{ left: 8, right: 16 }}>
                  <CartesianGrid strokeDasharray="3 3" opacity={0.15} />
                  <XAxis type="number" domain={[0, 100]} tick={{ fontSize: 11 }} />
                  <YAxis type="category" dataKey="proyecto" width={120} tick={{ fontSize: 11 }} />
                  <Tooltip formatter={(v: number, _n, p: any) => [`${v}%`, `${p?.payload?.calificados ?? 0} calificados · cobertura ${p?.payload?.cobertura ?? 0}%`]} />
                  <Bar dataKey="satisfaccion" name="% Satisfacción" radius={[0, 4, 4, 0]}>
                    {data.porProyecto.map((e, i) => <Cell key={i} fill={colorPct(e.satisfaccion, 85)} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </Card>
          )}

          {/* Cargues finalizados pendientes de calificar */}
          <Card className="p-3">
            <SigSection
              title="Cargues finalizados pendientes de calificar"
              right={<span className="text-xs text-muted-foreground">{data.resumen.pendientes} pendientes</span>}
            />
            <div className="my-2">
              <Input placeholder="Buscar por orden, conductor o placa…" value={buscar} onChange={(e) => setBuscar(e.target.value)} className="h-9 max-w-sm" />
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-[11px] uppercase text-muted-foreground">
                    <th className="px-2 py-2">Orden</th>
                    <th className="px-2 py-2">Conductor</th>
                    <th className="px-2 py-2">Placa</th>
                    {data.verTodos && <th className="px-2 py-2">Proyecto</th>}
                    <th className="px-2 py-2">Fecha</th>
                    <th className="px-2 py-2 text-right">Calificar</th>
                  </tr>
                </thead>
                <tbody>
                  {pendientesFiltrados.length === 0 ? (
                    <tr><td colSpan={6} className="py-8 text-center text-muted-foreground">No hay cargues pendientes de calificar 🎉</td></tr>
                  ) : (
                    pendientesFiltrados.map((c) => (
                      <tr key={c.ref_orden} className="border-b last:border-0">
                        <td className="px-2 py-2 font-medium" style={{ color: SST_TOKENS.ink }}>{c.ref_orden}</td>
                        <td className="px-2 py-2">{c.conductor || "—"}</td>
                        <td className="px-2 py-2">{c.placa || "—"}</td>
                        {data.verTodos && <td className="px-2 py-2">{c.proyecto}</td>}
                        <td className="px-2 py-2">{c.fecha || "—"}</td>
                        <td className="px-2 py-2 text-right">
                          {c.historico ? (
                            <span className="inline-flex items-center gap-1 rounded-full px-2 py-1 text-[11px] font-semibold text-white" style={{ background: "#94a3b8" }} title="Anterior al 15-jul-2026: no se califica en línea">
                              <History className="h-3.5 w-3.5" /> Histórico
                            </span>
                          ) : (
                            <Button size="sm" className="gap-1.5" onClick={() => abrirKiosko(c)}>
                              <Star className="h-4 w-4" /> Calificar
                            </Button>
                          )}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </Card>
        </>
      )}

      {/* ---------------- KIOSKO ---------------- */}
      <Dialog open={!!kiosko} onOpenChange={(o) => !o && !guardando && setKiosko(null)}>
        <DialogContent className="max-w-md text-center">
          <DialogTitle className="sr-only">Calificación del servicio</DialogTitle>
          {gracias ? (
            <div className="py-10">
              <div className="text-6xl">🙌</div>
              <p className="mt-4 text-2xl font-bold" style={{ color: SST_TOKENS.navy }}>¡Gracias por calificarnos!</p>
              <p className="mt-1 text-sm text-muted-foreground">Tu opinión nos ayuda a mejorar el servicio.</p>
            </div>
          ) : (
            <div className="py-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{kiosko?.proyecto}</p>
              <h2 className="mt-1 text-2xl font-bold" style={{ color: SST_TOKENS.ink }}>¿Cómo fue nuestro servicio?</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                {kiosko?.conductor || "Conductor"}{kiosko?.placa ? ` · ${kiosko.placa}` : ""} · Orden {kiosko?.ref_orden}
              </p>

              <div className="mt-6 grid grid-cols-3 gap-3">
                <button
                  type="button"
                  disabled={guardando}
                  onClick={() => calificar("mala")}
                  className="flex flex-col items-center gap-2 rounded-2xl border-2 p-4 transition hover:scale-105 hover:shadow-md disabled:opacity-50"
                  style={{ borderColor: `${C_MALA}55` }}
                >
                  <Frown className="h-14 w-14" style={{ color: C_MALA }} />
                  <span className="text-sm font-semibold" style={{ color: C_MALA }}>Malo</span>
                  <span className="text-[11px] font-bold" style={{ color: C_MALA }}>{EMOJI_PCT.mala}%</span>
                </button>
                <button
                  type="button"
                  disabled={guardando}
                  onClick={() => calificar("regular")}
                  className="flex flex-col items-center gap-2 rounded-2xl border-2 p-4 transition hover:scale-105 hover:shadow-md disabled:opacity-50"
                  style={{ borderColor: `${C_REGULAR}55` }}
                >
                  <Meh className="h-14 w-14" style={{ color: C_REGULAR }} />
                  <span className="text-sm font-semibold" style={{ color: C_REGULAR }}>Regular</span>
                  <span className="text-[11px] font-bold" style={{ color: C_REGULAR }}>{EMOJI_PCT.regular}%</span>
                </button>
                <button
                  type="button"
                  disabled={guardando}
                  onClick={() => calificar("feliz")}
                  className="flex flex-col items-center gap-2 rounded-2xl border-2 p-4 transition hover:scale-105 hover:shadow-md disabled:opacity-50"
                  style={{ borderColor: `${C_FELIZ}55` }}
                >
                  <Smile className="h-14 w-14" style={{ color: C_FELIZ }} />
                  <span className="text-sm font-semibold" style={{ color: C_FELIZ }}>Bueno</span>
                  <span className="text-[11px] font-bold" style={{ color: C_FELIZ }}>{EMOJI_PCT.feliz}%</span>
                </button>
              </div>

              <Textarea
                className="mt-4 text-left"
                rows={2}
                placeholder="Comentario (opcional)…"
                value={comentario}
                onChange={(e) => setComentario(e.target.value)}
              />
              {guardando && <Loader2 className="mx-auto mt-3 h-5 w-5 animate-spin" style={{ color: SST_TOKENS.navy }} />}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
