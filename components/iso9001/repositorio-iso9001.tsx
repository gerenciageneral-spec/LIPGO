"use client"

// Repositorio documental del Centro de Evidencia ISO 9001.
// Lista todas las clausulas que tienen evidencia adjunta, con filtros por
// capitulo, estado y busqueda, y enlace de descarga del archivo.

import { useEffect, useMemo, useState } from "react"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Loader2, Search, FileText, Download, RefreshCw, X, ShieldCheck } from "lucide-react"
import { Kpi } from "@/components/sst/sst-form-ui"
import { getResumenISO, type ClausulaISO } from "@/lib/iso9001-actions"

type EvidFiltro = "con" | "sin" | "todos"

function fmtFecha(s: string | null) {
  if (!s) return "-"
  const d = new Date(s)
  return Number.isNaN(d.getTime())
    ? "-"
    : d.toLocaleDateString("es-CO", { year: "numeric", month: "short", day: "numeric" })
}

const ESTADO_LABEL: Record<string, string> = {
  cumple: "Cumple",
  parcial: "Parcial",
  documental: "Documental",
  pendiente: "Pendiente",
}

export function RepositorioISO9001() {
  const [rows, setRows] = useState<ClausulaISO[]>([])
  const [loading, setLoading] = useState(true)
  const [q, setQ] = useState("")
  const [capitulo, setCapitulo] = useState("todos")
  const [evid, setEvid] = useState<EvidFiltro>("con")

  async function cargar() {
    setLoading(true)
    try {
      const res = await getResumenISO()
      setRows(res?.clausulas ?? [])
    } catch (err) {
      console.error("[v0] RepositorioISO9001 error:", err)
      setRows([])
    } finally {
      setLoading(false)
    }
  }
  useEffect(() => {
    cargar()
  }, [])

  const capitulos = useMemo(() => {
    const set = new Set<string>()
    for (const c of rows) if (c.capitulo) set.add(c.capitulo)
    return Array.from(set)
  }, [rows])

  const filtradas = useMemo(() => {
    const term = q.trim().toLowerCase()
    return rows.filter((c) => {
      const tieneEvid = !!c.evidenciaUrl
      if (evid === "con" && !tieneEvid) return false
      if (evid === "sin" && tieneEvid) return false
      if (capitulo !== "todos" && c.capitulo !== capitulo) return false
      if (!term) return true
      return (
        c.numero.toLowerCase().includes(term) ||
        c.titulo.toLowerCase().includes(term) ||
        (c.evidenciaNombre ?? "").toLowerCase().includes(term) ||
        (c.codigo_sig ?? "").toLowerCase().includes(term)
      )
    })
  }, [rows, q, capitulo, evid])

  const conEvidencia = useMemo(() => rows.filter((c) => c.evidenciaUrl).length, [rows])

  const hayFiltros = q.trim() !== "" || capitulo !== "todos" || evid !== "con"
  function limpiar() {
    setQ("")
    setCapitulo("todos")
    setEvid("con")
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="flex items-center gap-2 text-lg font-semibold text-foreground">
          <ShieldCheck className="h-5 w-5 text-[var(--chart-3)]" />
          Repositorio documental — ISO 9001
        </h2>
        <p className="text-sm text-muted-foreground">
          Todos los archivos de evidencia adjuntos a las cláusulas del sistema de gestión de calidad.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
        <Kpi t="Cláusulas con evidencia" v={String(conEvidencia)} />
        <Kpi t="Cláusulas totales" v={String(rows.length)} />
        <Kpi t="Capítulos" v={String(capitulos.length)} />
      </div>

      <Card className="p-4">
        <div className="mb-3 grid gap-2 md:grid-cols-12">
          <div className="relative md:col-span-6">
            <Search className="absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Buscar por cláusula, requisito, archivo o código SIG..."
              className="pl-8"
            />
          </div>
          <div className="md:col-span-4">
            <Select value={capitulo} onValueChange={setCapitulo}>
              <SelectTrigger>
                <SelectValue placeholder="Capítulo" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos los capítulos</SelectItem>
                {capitulos.map((c) => (
                  <SelectItem key={c} value={c}>
                    {c}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="md:col-span-2">
            <Select value={evid} onValueChange={(v) => setEvid(v as EvidFiltro)}>
              <SelectTrigger>
                <SelectValue placeholder="Evidencia" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="con">Con evidencia</SelectItem>
                <SelectItem value="sin">Sin evidencia</SelectItem>
                <SelectItem value="todos">Todas</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="mb-3 flex flex-wrap items-center gap-2">
          <span className="text-xs text-muted-foreground">
            {filtradas.length} de {rows.length} cláusula(s)
          </span>
          {hayFiltros && (
            <Button type="button" size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={limpiar}>
              <X className="h-3.5 w-3.5" />
              <span className="ml-1">Limpiar filtros</span>
            </Button>
          )}
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="ml-auto"
            onClick={cargar}
            disabled={loading}
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            <span className="ml-1">Actualizar</span>
          </Button>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-12 text-muted-foreground">
            <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Cargando evidencias...
          </div>
        ) : filtradas.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center text-muted-foreground">
            <FileText className="mb-2 h-8 w-8" />
            <p className="text-sm">
              {conEvidencia === 0
                ? "Aún no se han cargado evidencias en las cláusulas ISO 9001."
                : "No hay cláusulas que coincidan con el filtro."}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-xs uppercase text-muted-foreground">
                  <th className="px-3 py-2 font-semibold">Cláusula</th>
                  <th className="px-3 py-2 font-semibold">Requisito</th>
                  <th className="px-3 py-2 font-semibold">Capítulo</th>
                  <th className="px-3 py-2 font-semibold">Doc. SIG</th>
                  <th className="px-3 py-2 font-semibold">Archivo</th>
                  <th className="px-3 py-2 font-semibold">Fecha</th>
                  <th className="px-3 py-2 text-center font-semibold">Ver</th>
                </tr>
              </thead>
              <tbody>
                {filtradas.map((c) => (
                  <tr key={c.id} className="border-b align-top">
                    <td className="px-3 py-2 font-mono text-xs font-medium">{c.numero}</td>
                    <td className="px-3 py-2">{c.titulo}</td>
                    <td className="px-3 py-2 text-muted-foreground">{c.capitulo}</td>
                    <td className="px-3 py-2">
                      {c.codigo_sig ? (
                        <code className="rounded bg-muted px-1.5 py-0.5 text-xs">{c.codigo_sig}</code>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      {c.evidenciaUrl ? (
                        <span className="flex items-center gap-1">
                          <FileText className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                          <span className="break-all">{c.evidenciaNombre ?? "documento"}</span>
                        </span>
                      ) : (
                        <Badge variant="outline" className="text-muted-foreground">
                          Sin evidencia
                        </Badge>
                      )}
                    </td>
                    <td className="px-3 py-2 text-muted-foreground">{fmtFecha(c.evidenciaFecha)}</td>
                    <td className="px-3 py-2 text-center">
                      {c.evidenciaUrl ? (
                        <a
                          href={c.evidenciaUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center justify-center rounded-md border p-1.5 hover:bg-muted"
                          title="Abrir / descargar"
                        >
                          <Download className="h-4 w-4 text-[var(--chart-2)]" />
                        </a>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
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
