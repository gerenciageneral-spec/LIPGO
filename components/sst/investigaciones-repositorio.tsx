"use client"

import { useEffect, useMemo, useState } from "react"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { useAuth } from "@/components/auth-provider"
import { useToast } from "@/hooks/use-toast"
import { SST_TOKENS } from "@/components/sst/sst-utils"
import { Kpi } from "@/components/sst/sst-form-ui"
import { SoportesDocumentales } from "@/components/sst/soportes-documentales"
import { listIncidentes, updateIncidente, listAcciones, listTestigos } from "@/lib/sst-incidentes-actions"
import { generarPdfInvestigacion } from "@/lib/investigacion-pdf"
import type { IncidenteRow } from "@/lib/sst-evidencia-types"
import { RefreshCw, Loader2, Search, Eye, Upload, FileDown } from "lucide-react"

type Filtro = "todas" | "reportado" | "en_investigacion" | "cerrado"

// Dias entre el evento y la investigacion (cumplimiento plazo Res. 1401/2007: 15 dias).
function diasInvestigacion(r: IncidenteRow): number | null {
  if (!r.fecha_investigacion || !r.fecha_evento) return null
  return Math.round((new Date(r.fecha_investigacion).getTime() - new Date(r.fecha_evento).getTime()) / 86400000)
}

export function InvestigacionesRepositorio({ selectedEmpresaId: propEmpresaId }: { selectedEmpresaId?: number | null }) {
  const { selectedEmpresaId: ctxEmpresaId } = useAuth()
  const empresaId = propEmpresaId ?? ctxEmpresaId ?? null
  const { toast } = useToast()
  const [rows, setRows] = useState<IncidenteRow[]>([])
  const [loading, setLoading] = useState(true)
  const [q, setQ] = useState("")
  const [filtro, setFiltro] = useState<Filtro>("todas")
  const [anio, setAnio] = useState<string>("todos")
  const [subiendo, setSubiendo] = useState<number | null>(null)
  const [pdfId, setPdfId] = useState<number | null>(null)

  async function cargar() {
    setLoading(true)
    setRows(await listIncidentes(empresaId))
    setLoading(false)
  }

  // Años disponibles (de la fecha del evento) para el filtro.
  const anios = useMemo(() => {
    const set = new Set<string>()
    rows.forEach((r) => { const y = String(r.fecha_evento ?? "").slice(0, 4); if (y) set.add(y) })
    return Array.from(set).sort().reverse()
  }, [rows])

  // Ver = PDF NO editable, generado desde los datos (SST-FOR-21). Evita alterar la investigación.
  async function verPdf(r: IncidenteRow) {
    if (!r.id) return
    setPdfId(r.id)
    try {
      const [accs, tess] = await Promise.all([listAcciones(r.id), listTestigos(r.id)])
      await generarPdfInvestigacion(r as any, accs, tess)
    } catch (e: any) {
      toast({ title: "No se pudo generar el PDF", description: e?.message })
    } finally {
      setPdfId(null)
    }
  }

  // Sube el ORIGINAL editable (Excel/Word) al repositorio, por si hay que corregir.
  async function subirDocumento(r: IncidenteRow, file: File) {
    if (!r.id) return
    setSubiendo(r.id)
    try {
      const fd = new FormData()
      fd.append("file", file)
      fd.append("empresaId", String(r.idempresa ?? empresaId ?? 0))
      fd.append("incidenteId", String(r.id))
      const up = await fetch("/api/investigacion/doc-upload", { method: "POST", body: fd })
      const j = await up.json()
      if (!j.success) throw new Error(j.error || "Error al subir")
      const save = await updateIncidente(r.id, { documento_editable_url: j.url })
      if (!save.success) throw new Error(save.message || "Error al guardar")
      toast({ title: "Original editable adjuntado" })
      await cargar()
    } catch (e: any) {
      toast({ title: "No se pudo subir", description: e?.message })
    } finally {
      setSubiendo(null)
    }
  }
  useEffect(() => {
    cargar()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [empresaId])

  const kpis = useMemo(() => {
    const total = rows.length
    const cerradas = rows.filter((r) => r.estado === "cerrado").length
    const abiertas = total - cerradas
    const conInvestig = rows.filter((r) => r.fecha_investigacion).length
    const enPlazo = rows.filter((r) => {
      const d = diasInvestigacion(r)
      return d !== null && d <= 15
    }).length
    const cumplimiento = conInvestig ? Math.round((enPlazo / conInvestig) * 100) : 0
    return { total, cerradas, abiertas, cumplimiento }
  }, [rows])

  const filtradas = useMemo(() => {
    const t = q.trim().toLowerCase()
    return rows.filter((r) => {
      if (filtro !== "todas" && r.estado !== filtro) return false
      if (anio !== "todos" && String(r.fecha_evento ?? "").slice(0, 4) !== anio) return false
      if (!t) return true
      return [r.trabajador, r.cargo, r.tipo, r.descripcion, r.area_ocurrencia].some((v) =>
        (v ?? "").toString().toLowerCase().includes(t),
      )
    })
  }, [rows, q, filtro, anio])

  const filtros: { k: Filtro; label: string }[] = [
    { k: "todas", label: "Todas" },
    { k: "reportado", label: "Reportadas" },
    { k: "en_investigacion", label: "En investigación" },
    { k: "cerrado", label: "Cerradas" },
  ]

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold" style={{ color: SST_TOKENS.navy }}>
            Repositorio de Investigaciones de AT
          </h2>
          <p className="text-xs text-muted-foreground">
            Consulta todas las investigaciones de accidentes e incidentes realizadas, su estado y sus soportes
            documentales (SST-FOR-21).
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

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Kpi t="Investigaciones" v={kpis.total} />
        <Kpi t="Abiertas / en proceso" v={kpis.abiertas} c={SST_TOKENS.warn} />
        <Kpi t="Cerradas" v={kpis.cerradas} c={SST_TOKENS.ok} />
        <Kpi t="Cumplimiento plazo (15 días)" v={`${kpis.cumplimiento}%`} c={SST_TOKENS.navy} />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar por trabajador, cargo, tipo, área o descripción…"
            className="pl-8"
          />
        </div>
        <select
          value={anio}
          onChange={(e) => setAnio(e.target.value)}
          className="h-9 rounded-md border bg-background px-2 text-sm"
          title="Filtrar por año del evento"
        >
          <option value="todos">Todos los años</option>
          {anios.map((y) => (<option key={y} value={y}>{y}</option>))}
        </select>
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
              <th className="p-2 text-left">Fecha AT</th>
              <th className="p-2 text-left">Trabajador</th>
              <th className="p-2 text-left">Tipo</th>
              <th className="p-2 text-left">Gravedad</th>
              <th className="p-2 text-center">Días a investigar</th>
              <th className="p-2 text-left">Estado</th>
              <th className="p-2 text-center">Documento</th>
              <th className="p-2 text-left w-64">Soportes</th>
            </tr>
          </thead>
          <tbody>
            {filtradas.map((r, i) => {
              const dias = diasInvestigacion(r)
              const enPlazo = dias !== null && dias <= 15
              return (
                <tr key={r.id} style={{ background: i % 2 ? "#f7fafc" : "white" }}>
                  <td className="p-2">{r.fecha_evento}</td>
                  <td className="p-2">
                    <div className="font-medium">{r.trabajador ?? "—"}</div>
                    <div className="text-xs text-muted-foreground">{r.cargo ?? r.area_ocurrencia ?? ""}</div>
                  </td>
                  <td className="p-2 capitalize">{String(r.tipo).replace("_", " ")}</td>
                  <td className="p-2">
                    {r.gravedad ? (
                      <Badge
                        style={{
                          background:
                            r.gravedad === "mortal"
                              ? SST_TOKENS.bad
                              : r.gravedad === "grave"
                                ? SST_TOKENS.warn
                                : SST_TOKENS.ok,
                          color: "white",
                        }}
                      >
                        {r.gravedad}
                      </Badge>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="p-2 text-center">
                    {dias === null ? (
                      <span className="text-muted-foreground">pendiente</span>
                    ) : (
                      <Badge style={{ background: enPlazo ? SST_TOKENS.ok : SST_TOKENS.bad, color: "white" }}>
                        {dias} días
                      </Badge>
                    )}
                  </td>
                  <td className="p-2">
                    <Badge
                      style={{
                        background: r.estado === "cerrado" ? SST_TOKENS.ok : SST_TOKENS.warn,
                        color: "white",
                      }}
                    >
                      {String(r.estado).replace("_", " ")}
                    </Badge>
                  </td>
                  <td className="p-2 text-center whitespace-nowrap">
                    <div className="flex items-center justify-center gap-2">
                      {/* Ver = PDF NO editable (generado del SST-FOR-21) */}
                      <button
                        type="button"
                        title="Ver documento (PDF no editable)"
                        onClick={() => verPdf(r)}
                        disabled={pdfId === r.id}
                        className="inline-flex items-center gap-1 text-[12px] hover:underline disabled:opacity-50"
                        style={{ color: SST_TOKENS.navy }}
                      >
                        {pdfId === r.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Eye className="h-4 w-4" />} Ver
                      </button>
                      {/* Original editable (Excel) — para corregir */}
                      {r.documento_editable_url ? (
                        <a
                          href={r.documento_editable_url}
                          target="_blank"
                          rel="noreferrer"
                          title="Descargar original editable (Excel) para corregir"
                          className="inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:underline"
                        >
                          <FileDown className="h-3.5 w-3.5" /> Editable
                        </a>
                      ) : (
                        <label className="inline-flex cursor-pointer items-center gap-1 text-[11px] text-muted-foreground hover:underline" title="Subir soporte (cualquier formato)">
                          {subiendo === r.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />} Subir
                          <input
                            type="file"
                            className="hidden"
                            disabled={subiendo === r.id}
                            onChange={(e) => { const f = e.target.files?.[0]; if (f) subirDocumento(r, f); e.currentTarget.value = "" }}
                          />
                        </label>
                      )}
                    </div>
                  </td>
                  <td className="p-2 align-top">
                    <SoportesDocumentales
                      norma="SST 0312"
                      modulo="Investigación AT"
                      referenciaTipo="incidente"
                      referenciaId={r.id!}
                      referenciaDesc={`${String(r.tipo)} - ${r.trabajador ?? ""}`}
                      empresaId={empresaId}
                    />
                  </td>
                </tr>
              )
            })}
            {!loading && filtradas.length === 0 && (
              <tr>
                <td colSpan={8} className="p-6 text-center text-muted-foreground">
                  No hay investigaciones registradas para estos filtros.
                </td>
              </tr>
            )}
            {loading && (
              <tr>
                <td colSpan={8} className="p-6 text-center text-muted-foreground">
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
