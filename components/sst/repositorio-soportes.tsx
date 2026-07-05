"use client"

// Repositorio documental de la Matriz de Estandares Minimos (SST 0312).
// Lista todos los archivos cargados como soporte en la matriz, con su estado
// (vigente / historico), el estandar al que pertenecen y enlace de descarga.

import { useEffect, useMemo, useState } from "react"
import { useAuth } from "@/components/auth-provider"
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
import { Loader2, Search, FileText, Download, RefreshCw, X } from "lucide-react"
import { SST_TOKENS } from "@/components/sst/sst-utils"
import { Kpi } from "@/components/sst/sst-form-ui"
import { listSoportesByModulo } from "@/lib/soportes-actions"
import type { SoporteRow } from "@/lib/soportes-types"

const MODULO = "Matriz de Estándares"

type EstadoFiltro = "vigentes" | "historicos" | "todos"
type Orden = "reciente" | "antiguo"

function fmtFecha(s: string | null) {
  if (!s) return "-"
  const d = new Date(s)
  return Number.isNaN(d.getTime())
    ? "-"
    : d.toLocaleDateString("es-CO", { year: "numeric", month: "short", day: "numeric" })
}
function fmtTamano(b: number | null) {
  if (!b) return "-"
  if (b < 1024) return `${b} B`
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(0)} KB`
  return `${(b / (1024 * 1024)).toFixed(1)} MB`
}

export function RepositorioSoportes({ selectedEmpresaId: propEmpresaId }: { selectedEmpresaId?: number | null }) {
  const { selectedEmpresaId: ctxEmpresaId } = useAuth()
  const empresaId = propEmpresaId ?? ctxEmpresaId ?? null
  const [rows, setRows] = useState<SoporteRow[]>([])
  const [loading, setLoading] = useState(true)
  const [q, setQ] = useState("")
  const [estado, setEstado] = useState<EstadoFiltro>("vigentes")
  const [numeral, setNumeral] = useState<string>("todos")
  const [orden, setOrden] = useState<Orden>("reciente")

  async function cargar() {
    setLoading(true)
    setRows(await listSoportesByModulo(MODULO, empresaId))
    setLoading(false)
  }
  useEffect(() => {
    cargar()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [empresaId])

  // Lista de numerales (estandares) presentes, para el selector de filtro.
  const numerales = useMemo(() => {
    const set = new Map<string, string>()
    for (const r of rows) {
      const id = r.referencia_id ?? ""
      if (id && !set.has(id)) set.set(id, r.referencia_desc ?? id)
    }
    return Array.from(set.entries()).sort((a, b) =>
      a[0].localeCompare(b[0], "es", { numeric: true }),
    )
  }, [rows])

  const filtradas = useMemo(() => {
    const term = q.trim().toLowerCase()
    const out = rows.filter((r) => {
      if (estado === "vigentes" && !r.vigente) return false
      if (estado === "historicos" && r.vigente) return false
      if (numeral !== "todos" && (r.referencia_id ?? "") !== numeral) return false
      if (!term) return true
      return (
        (r.referencia_id ?? "").toLowerCase().includes(term) ||
        (r.referencia_desc ?? "").toLowerCase().includes(term) ||
        (r.archivo_nombre ?? "").toLowerCase().includes(term)
      )
    })
    out.sort((a, b) => {
      const ta = new Date(a.created_at ?? 0).getTime()
      const tb = new Date(b.created_at ?? 0).getTime()
      return orden === "reciente" ? tb - ta : ta - tb
    })
    return out
  }, [rows, q, estado, numeral, orden])

  const totalVigentes = useMemo(() => rows.filter((r) => r.vigente).length, [rows])
  const estandaresConSoporte = useMemo(
    () => new Set(rows.filter((r) => r.vigente).map((r) => r.referencia_id)).size,
    [rows],
  )

  const hayFiltros = q.trim() !== "" || estado !== "vigentes" || numeral !== "todos" || orden !== "reciente"
  function limpiar() {
    setQ("")
    setEstado("vigentes")
    setNumeral("todos")
    setOrden("reciente")
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold" style={{ color: SST_TOKENS.navy }}>
          Repositorio documental — Matriz de Estándares Mínimos
        </h2>
        <p className="text-sm text-muted-foreground">
          Todos los archivos cargados como evidencia en la matriz de los 60 estándares (Resolución 0312/2019).
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
        <Kpi t="Soportes vigentes" v={String(totalVigentes)} />
        <Kpi t="Estándares con soporte" v={String(estandaresConSoporte)} />
        <Kpi t="Archivos totales (con histórico)" v={String(rows.length)} />
      </div>

      <Card className="p-4">
        <div className="mb-3 grid gap-2 md:grid-cols-12">
          <div className="relative md:col-span-5">
            <Search className="absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Buscar por numeral, estándar o archivo..."
              className="pl-8"
            />
          </div>
          <div className="md:col-span-3">
            <Select value={numeral} onValueChange={setNumeral}>
              <SelectTrigger>
                <SelectValue placeholder="Estándar" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos los estándares</SelectItem>
                {numerales.map(([id, desc]) => (
                  <SelectItem key={id} value={id}>
                    {id} — {desc}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="md:col-span-2">
            <Select value={estado} onValueChange={(v) => setEstado(v as EstadoFiltro)}>
              <SelectTrigger>
                <SelectValue placeholder="Estado" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="vigentes">Solo vigentes</SelectItem>
                <SelectItem value="historicos">Solo históricos</SelectItem>
                <SelectItem value="todos">Todos</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="md:col-span-2">
            <Select value={orden} onValueChange={(v) => setOrden(v as Orden)}>
              <SelectTrigger>
                <SelectValue placeholder="Orden" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="reciente">Más reciente</SelectItem>
                <SelectItem value="antiguo">Más antiguo</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="mb-3 flex flex-wrap items-center gap-2">
          <span className="text-xs text-muted-foreground">
            {filtradas.length} de {rows.length} archivo(s)
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
            <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Cargando soportes...
          </div>
        ) : filtradas.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center text-muted-foreground">
            <FileText className="mb-2 h-8 w-8" />
            <p className="text-sm">
              {rows.length === 0
                ? "Aún no se han cargado documentos en la matriz de estándares."
                : "No hay documentos que coincidan con el filtro."}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-xs uppercase text-muted-foreground">
                  <th className="px-3 py-2 font-semibold">Numeral</th>
                  <th className="px-3 py-2 font-semibold">Estándar</th>
                  <th className="px-3 py-2 font-semibold">Archivo</th>
                  <th className="px-3 py-2 font-semibold">Tamaño</th>
                  <th className="px-3 py-2 font-semibold">Fecha</th>
                  <th className="px-3 py-2 font-semibold">Estado</th>
                  <th className="px-3 py-2 text-center font-semibold">Ver</th>
                </tr>
              </thead>
              <tbody>
                {filtradas.map((r) => (
                  <tr key={r.id} className="border-b align-top">
                    <td className="px-3 py-2 font-medium">{r.referencia_id}</td>
                    <td className="px-3 py-2 text-muted-foreground">{r.referencia_desc ?? "-"}</td>
                    <td className="px-3 py-2">
                      <span className="flex items-center gap-1">
                        <FileText className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                        <span className="break-all">{r.archivo_nombre ?? "documento"}</span>
                      </span>
                    </td>
                    <td className="px-3 py-2 text-muted-foreground">{fmtTamano(r.tamano)}</td>
                    <td className="px-3 py-2 text-muted-foreground">{fmtFecha(r.created_at)}</td>
                    <td className="px-3 py-2">
                      <Badge
                        style={{
                          background: r.vigente ? SST_TOKENS.ok : "#8896a5",
                          color: "white",
                        }}
                      >
                        {r.vigente ? "Vigente" : "Histórico"}
                      </Badge>
                    </td>
                    <td className="px-3 py-2 text-center">
                      <a
                        href={r.archivo_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center justify-center rounded-md border p-1.5 hover:bg-muted"
                        title="Abrir / descargar"
                      >
                        <Download className="h-4 w-4" style={{ color: SST_TOKENS.navy }} />
                      </a>
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
