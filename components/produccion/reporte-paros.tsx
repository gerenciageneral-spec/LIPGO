"use client"

// Reporte / justificación de tiempos de PARO de la máquina de producción.
// Módulo hermano del Dashboard de Producción (mismo permiso `controlpiso`).
// Detecta las franjas de paro del día (celdas de 2 min sin producción del
// contador `historial_intervalos`) y permite escribirles el motivo. Lo guardado
// se refleja en el Dashboard de Producción (paros comentados vs sin comentar).

import { useCallback, useEffect, useMemo, useState } from "react"
import { supabase } from "@/lib/supabase"
import { useAuth } from "@/components/auth-provider"
import { useToast } from "@/hooks/use-toast"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card } from "@/components/ui/card"
import { AlertTriangle, Calendar, Check, Loader2, Save, Trash2, MessageSquare } from "lucide-react"
import {
  detectarParos,
  utcDateStr,
  nextDateStr,
  bogotaWallAsUtcMs,
  parseTs,
  pad2,
  type ParoDetectado,
} from "@/lib/paros-produccion"
import { getParos, guardarParo, eliminarParo, type ParoComentario } from "@/lib/paros-actions"

const DEFAULT_SHIFT_START = 6
const DEFAULT_SHIFT_END = 20

const CATEGORIAS = [
  { v: "", l: "Sin categoría" },
  { v: "mecanico", l: "Mecánico" },
  { v: "electrico", l: "Eléctrico" },
  { v: "insumos", l: "Falta de insumos" },
  { v: "cambio_referencia", l: "Cambio de referencia" },
  { v: "aseo", l: "Aseo / sanitización" },
  { v: "personal", l: "Falta de personal" },
  { v: "calidad", l: "Calidad" },
  { v: "otro", l: "Otro" },
] as const

interface HistRow {
  fecha_hora: string
  produccion_2min: number | null
}

function fmtMin(min: number): string {
  const m = Math.max(0, Math.round(min))
  const h = Math.floor(m / 60)
  return h > 0 ? `${h}h ${pad2(m % 60)}m` : `${m}m`
}

export default function ReporteParos() {
  const { selectedEmpresaId } = useAuth()
  const { toast } = useToast()
  const [selectedDate, setSelectedDate] = useState<string>(() => utcDateStr())
  const isToday = selectedDate === utcDateStr()
  const [histRows, setHistRows] = useState<HistRow[]>([])
  const [comentarios, setComentarios] = useState<Record<string, ParoComentario>>({})
  const [shiftStart, setShiftStart] = useState(DEFAULT_SHIFT_START)
  const [shiftEnd, setShiftEnd] = useState(DEFAULT_SHIFT_END)
  const [loading, setLoading] = useState(true)
  const [edits, setEdits] = useState<Record<string, { motivo: string; categoria: string }>>({})
  const [seleccion, setSeleccion] = useState<Record<string, boolean>>({})
  const [bulkMotivo, setBulkMotivo] = useState("")
  const [bulkCat, setBulkCat] = useState("")
  const [guardando, setGuardando] = useState<string | null>(null)

  const cargar = useCallback(async () => {
    setLoading(true)
    const desde = `${selectedDate}T00:00:00-05:00`
    const hasta = `${nextDateStr(selectedDate)}T00:00:00-05:00`
    const [histRes, turnoRes, comRes] = await Promise.all([
      supabase
        .from("historial_intervalos")
        .select("fecha_hora,produccion_2min")
        .gte("fecha_hora", desde)
        .lt("fecha_hora", hasta)
        .order("fecha_hora", { ascending: true }),
      supabase
        .from("registroasistencia")
        .select("horaentradaprogramada,horasalidaprogramada")
        .eq("fecha", selectedDate)
        .eq("puesto", "Auxiliar Mixto")
        .order("id", { ascending: true })
        .limit(1)
        .maybeSingle(),
      getParos(selectedEmpresaId ?? null, selectedDate),
    ])
    setHistRows(((histRes.data as HistRow[]) || []).filter(Boolean))

    const parseHora = (v: any): number | null => {
      const m = String(v ?? "").match(/^(\d{1,2}):/)
      if (!m) return null
      const h = Number(m[1])
      return h >= 0 && h <= 23 ? h : null
    }
    const ini = parseHora(turnoRes?.data?.horaentradaprogramada)
    const fin = parseHora(turnoRes?.data?.horasalidaprogramada)
    if (ini != null && fin != null && fin > ini) {
      setShiftStart(ini)
      setShiftEnd(fin)
    } else {
      setShiftStart(DEFAULT_SHIFT_START)
      setShiftEnd(DEFAULT_SHIFT_END)
    }

    const map: Record<string, ParoComentario> = {}
    if (comRes.success) for (const c of comRes.data) map[c.inicio] = c
    setComentarios(map)
    setEdits({})
    setSeleccion({})
    setLoading(false)
  }, [selectedDate, selectedEmpresaId])

  useEffect(() => {
    cargar()
  }, [cargar])

  // Corte "ahora": para HOY, el último registro del contador; para días pasados,
  // el fin del turno (el día ya terminó).
  const nowMs = useMemo(() => {
    if (!isToday) return Date.parse(`${selectedDate}T${pad2(shiftEnd)}:00:00Z`)
    return histRows.length ? parseTs(histRows[histRows.length - 1].fecha_hora).getTime() : bogotaWallAsUtcMs(new Date())
  }, [isToday, histRows, selectedDate, shiftEnd])

  const paros = useMemo(
    () => detectarParos(histRows, selectedDate, shiftStart, shiftEnd, nowMs),
    [histRows, selectedDate, shiftStart, shiftEnd, nowMs],
  )

  const resumen = useMemo(() => {
    let comentados = 0
    let minCom = 0
    let minSin = 0
    for (const p of paros) {
      if (comentarios[p.inicioISO]?.motivo) {
        comentados++
        minCom += p.minutos
      } else {
        minSin += p.minutos
      }
    }
    return { total: paros.length, comentados, sinComentar: paros.length - comentados, minCom, minSin, minTot: minCom + minSin }
  }, [paros, comentarios])

  const motivoDe = (iso: string) => edits[iso]?.motivo ?? comentarios[iso]?.motivo ?? ""
  const categoriaDe = (iso: string) => edits[iso]?.categoria ?? comentarios[iso]?.categoria ?? ""

  const setEdit = (iso: string, patch: Partial<{ motivo: string; categoria: string }>) =>
    setEdits((e) => ({
      ...e,
      [iso]: { motivo: motivoDe(iso), categoria: categoriaDe(iso), ...patch },
    }))

  const handleGuardar = async (p: ParoDetectado) => {
    const motivo = motivoDe(p.inicioISO)
    if (!motivo.trim()) {
      toast({ title: "Falta el motivo", description: "Escribe por qué se detuvo la máquina." })
      return
    }
    setGuardando(p.inicioISO)
    const res = await guardarParo({
      empresaId: selectedEmpresaId,
      fecha: selectedDate,
      inicio: p.inicioISO,
      fin: p.finISO,
      minutos: p.minutos,
      motivo,
      categoria: categoriaDe(p.inicioISO) || null,
    })
    setGuardando(null)
    if (res.success) {
      toast({ title: "Paro justificado" })
      setComentarios((m) => ({
        ...m,
        [p.inicioISO]: {
          ...(m[p.inicioISO] || ({} as ParoComentario)),
          inicio: p.inicioISO,
          fin: p.finISO,
          minutos: p.minutos,
          motivo: motivo.trim(),
          categoria: categoriaDe(p.inicioISO) || null,
        } as ParoComentario,
      }))
    } else {
      toast({ title: "No se pudo guardar", description: res.message })
    }
  }

  const handleLimpiar = async (p: ParoDetectado) => {
    const res = await eliminarParo({ empresaId: selectedEmpresaId, fecha: selectedDate, inicio: p.inicioISO })
    if (res.success) {
      setComentarios((m) => {
        const n = { ...m }
        delete n[p.inicioISO]
        return n
      })
      setEdits((e) => {
        const n = { ...e }
        delete n[p.inicioISO]
        return n
      })
      toast({ title: "Comentario eliminado" })
    } else {
      toast({ title: "Error", description: res.message })
    }
  }

  const seleccionados = paros.filter((p) => seleccion[p.inicioISO])

  const handleBulk = async () => {
    if (!bulkMotivo.trim() || seleccionados.length === 0) return
    setGuardando("bulk")
    for (const p of seleccionados) {
      await guardarParo({
        empresaId: selectedEmpresaId,
        fecha: selectedDate,
        inicio: p.inicioISO,
        fin: p.finISO,
        minutos: p.minutos,
        motivo: bulkMotivo,
        categoria: bulkCat || null,
      })
    }
    setGuardando(null)
    toast({ title: `${seleccionados.length} paro(s) justificados` })
    setBulkMotivo("")
    setBulkCat("")
    cargar()
  }

  return (
    <div className="space-y-6">
      {/* Encabezado */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold text-foreground">
            <AlertTriangle className="h-6 w-6 text-primary" />
            Reporte de Paros
          </h1>
          <p className="text-sm text-muted-foreground">
            Justifica los tiempos en que la máquina estuvo detenida. Lo comentado se refleja en el Dashboard de Producción.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Calendar className="h-4 w-4 text-muted-foreground" />
          <input
            type="date"
            value={selectedDate}
            max={utcDateStr()}
            onChange={(e) => setSelectedDate(e.target.value || utcDateStr())}
            className="rounded-md border border-border bg-card px-3 py-1.5 text-sm text-card-foreground outline-none focus:ring-2 focus:ring-primary"
          />
          {!isToday && (
            <Button variant="outline" size="sm" onClick={() => setSelectedDate(utcDateStr())}>
              Hoy
            </Button>
          )}
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Card className="p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Paros del día</p>
          <p className="mt-1 text-2xl font-bold tabular-nums text-foreground">{resumen.total}</p>
          <p className="text-xs text-muted-foreground">{fmtMin(resumen.minTot)} detenida</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Comentados</p>
          <p className="mt-1 text-2xl font-bold tabular-nums text-chart-3">{resumen.comentados}</p>
          <p className="text-xs text-muted-foreground">{fmtMin(resumen.minCom)} justificados</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Sin comentar</p>
          <p className="mt-1 text-2xl font-bold tabular-nums text-destructive">{resumen.sinComentar}</p>
          <p className="text-xs text-muted-foreground">{fmtMin(resumen.minSin)} sin justificar</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Cobertura</p>
          <p className="mt-1 text-2xl font-bold tabular-nums text-foreground">
            {resumen.total ? Math.round((resumen.comentados / resumen.total) * 100) : 100}%
          </p>
          <p className="text-xs text-muted-foreground">paros justificados</p>
        </Card>
      </div>

      {/* Barra de acción masiva */}
      {seleccionados.length > 0 && (
        <Card className="flex flex-col gap-2 border-primary/40 bg-primary/5 p-3 sm:flex-row sm:items-center">
          <span className="text-sm font-medium text-foreground">{seleccionados.length} seleccionado(s):</span>
          <select
            value={bulkCat}
            onChange={(e) => setBulkCat(e.target.value)}
            className="h-9 rounded-md border border-input bg-card px-2 text-sm"
          >
            {CATEGORIAS.map((c) => (
              <option key={c.v} value={c.v}>{c.l}</option>
            ))}
          </select>
          <Input
            value={bulkMotivo}
            onChange={(e) => setBulkMotivo(e.target.value)}
            placeholder="Motivo para aplicar a los seleccionados"
            className="flex-1"
          />
          <Button size="sm" onClick={handleBulk} disabled={guardando === "bulk" || !bulkMotivo.trim()}>
            {guardando === "bulk" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
            Aplicar
          </Button>
        </Card>
      )}

      {/* Tabla de paros */}
      <Card className="overflow-hidden p-0">
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : paros.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 py-16 text-center text-muted-foreground">
            <Check className="h-8 w-8 text-chart-3" />
            <p>Sin paros detectados este día. La máquina no se detuvo dentro del turno.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="w-8 px-3 py-2.5">
                    <input
                      type="checkbox"
                      checked={seleccionados.length === paros.length && paros.length > 0}
                      onChange={(e) => {
                        const all = e.target.checked
                        const next: Record<string, boolean> = {}
                        if (all) for (const p of paros) next[p.inicioISO] = true
                        setSeleccion(next)
                      }}
                    />
                  </th>
                  <th className="px-3 py-2.5">Franja</th>
                  <th className="px-3 py-2.5 text-right">Duración</th>
                  <th className="px-3 py-2.5">Categoría</th>
                  <th className="px-3 py-2.5">Motivo del paro</th>
                  <th className="px-3 py-2.5">Estado</th>
                  <th className="px-3 py-2.5 text-right">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {paros.map((p) => {
                  const comentado = !!comentarios[p.inicioISO]?.motivo
                  return (
                    <tr key={p.inicioISO} className="border-b border-border/60 last:border-0">
                      <td className="px-3 py-2 align-top">
                        <input
                          type="checkbox"
                          checked={!!seleccion[p.inicioISO]}
                          onChange={(e) => setSeleccion((s) => ({ ...s, [p.inicioISO]: e.target.checked }))}
                        />
                      </td>
                      <td className="whitespace-nowrap px-3 py-2 align-top font-mono font-medium text-foreground">
                        {p.inicio} – {p.fin}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2 text-right align-top font-mono">{fmtMin(p.minutos)}</td>
                      <td className="px-3 py-2 align-top">
                        <select
                          value={categoriaDe(p.inicioISO)}
                          onChange={(e) => setEdit(p.inicioISO, { categoria: e.target.value })}
                          className="h-9 w-full min-w-[140px] rounded-md border border-input bg-card px-2 text-sm"
                        >
                          {CATEGORIAS.map((c) => (
                            <option key={c.v} value={c.v}>{c.l}</option>
                          ))}
                        </select>
                      </td>
                      <td className="px-3 py-2 align-top">
                        <Input
                          value={motivoDe(p.inicioISO)}
                          onChange={(e) => setEdit(p.inicioISO, { motivo: e.target.value })}
                          placeholder="¿Por qué se detuvo?"
                          className="min-w-[200px]"
                        />
                      </td>
                      <td className="px-3 py-2 align-top">
                        {comentado ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-chart-3/15 px-2 py-0.5 text-xs font-medium text-chart-3">
                            <Check className="h-3 w-3" /> Comentado
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 rounded-full bg-destructive/15 px-2 py-0.5 text-xs font-medium text-destructive">
                            <MessageSquare className="h-3 w-3" /> Sin comentar
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-right align-top">
                        <div className="flex justify-end gap-1">
                          <Button size="sm" onClick={() => handleGuardar(p)} disabled={guardando === p.inicioISO}>
                            {guardando === p.inicioISO ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                          </Button>
                          {comentado && (
                            <Button size="sm" variant="outline" onClick={() => handleLimpiar(p)} title="Quitar comentario">
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  )
}
