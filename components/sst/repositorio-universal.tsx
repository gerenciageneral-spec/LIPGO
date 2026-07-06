"use client"

import { useEffect, useMemo, useState } from "react"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { useAuth } from "@/components/auth-provider"
import { getRepositorioUniversal, type DocUniversal } from "@/lib/repositorio-universal-actions"
import { FolderArchive, Search, Eye, Download, Loader2, FileText, Layers, X } from "lucide-react"

const TODOS = "__todos__"

export default function RepositorioUniversal() {
  const { selectedEmpresaId } = useAuth()
  const [docs, setDocs] = useState<DocUniversal[]>([])
  const [loading, setLoading] = useState(true)
  const [q, setQ] = useState("")
  const [modulo, setModulo] = useState<string>(TODOS)
  const [norma, setNorma] = useState<string>(TODOS)
  const [tipo, setTipo] = useState<string>(TODOS)
  const [desde, setDesde] = useState("")
  const [hasta, setHasta] = useState("")

  const cargar = async () => {
    setLoading(true)
    const r = await getRepositorioUniversal(selectedEmpresaId)
    setDocs(r.success ? r.data : [])
    setLoading(false)
  }

  useEffect(() => {
    cargar()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedEmpresaId])

  // Opciones de los selects, derivadas de los datos.
  const modulos = useMemo(() => Array.from(new Set(docs.map((d) => d.modulo))).sort(), [docs])
  const normas = useMemo(() => Array.from(new Set(docs.map((d) => d.norma).filter(Boolean))).sort() as string[], [docs])
  const tipos = useMemo(() => Array.from(new Set(docs.map((d) => d.tipo))).sort(), [docs])

  const filtrados = useMemo(() => {
    const s = q.trim().toLowerCase()
    return docs.filter((d) => {
      if (modulo !== TODOS && d.modulo !== modulo) return false
      if (norma !== TODOS && (d.norma || "") !== norma) return false
      if (tipo !== TODOS && d.tipo !== tipo) return false
      if (desde && (!d.fecha || d.fecha.slice(0, 10) < desde)) return false
      if (hasta && (!d.fecha || d.fecha.slice(0, 10) > hasta)) return false
      if (s) {
        const hay = `${d.titulo} ${d.submodulo} ${d.modulo} ${d.archivo_nombre} ${d.norma || ""}`.toLowerCase()
        if (!hay.includes(s)) return false
      }
      return true
    })
  }, [docs, q, modulo, norma, tipo, desde, hasta])

  const porModulo = useMemo(() => {
    const m: Record<string, number> = {}
    for (const d of filtrados) m[d.modulo] = (m[d.modulo] || 0) + 1
    return Object.entries(m).sort((a, b) => b[1] - a[1])
  }, [filtrados])

  const hayFiltros = q || modulo !== TODOS || norma !== TODOS || tipo !== TODOS || desde || hasta
  const limpiar = () => {
    setQ("")
    setModulo(TODOS)
    setNorma(TODOS)
    setTipo(TODOS)
    setDesde("")
    setHasta("")
  }

  const fmtFecha = (f: string | null) => (f ? String(f).slice(0, 10) : "—")

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
          <FolderArchive className="h-6 w-6 text-primary" />
          Repositorio Universal de Documentos
        </h1>
        <p className="text-sm text-muted-foreground max-w-3xl">
          Todos los documentos soporte de la empresa en un solo lugar, filtrables por módulo,
          submódulo, norma, tipo y fecha. Respeta el selector de empresa.
        </p>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <div className="rounded-lg border border-border bg-card p-3">
          <div className="flex items-center gap-2 text-xs text-muted-foreground"><FileText className="h-4 w-4 text-primary" /> Documentos</div>
          <div className="mt-1 text-2xl font-bold text-foreground">{filtrados.length}</div>
          <div className="mt-0.5 text-[11px] text-muted-foreground">de {docs.length} totales</div>
        </div>
        <div className="rounded-lg border border-border bg-card p-3">
          <div className="flex items-center gap-2 text-xs text-muted-foreground"><Layers className="h-4 w-4 text-primary" /> Módulos</div>
          <div className="mt-1 text-2xl font-bold text-foreground">{modulos.length}</div>
        </div>
        <div className="col-span-2 rounded-lg border border-border bg-card p-3">
          <div className="text-xs text-muted-foreground mb-1">Por módulo</div>
          <div className="flex flex-wrap gap-1.5">
            {porModulo.slice(0, 6).map(([m, n]) => (
              <Badge key={m} variant="outline" className="text-[11px]">{m}: {n}</Badge>
            ))}
            {porModulo.length === 0 && <span className="text-xs text-muted-foreground">—</span>}
          </div>
        </div>
      </div>

      {/* Filtros */}
      <div className="flex flex-wrap items-end gap-2">
        <div className="relative min-w-[220px] flex-1">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Buscar por persona, documento, submódulo..." value={q} onChange={(e) => setQ(e.target.value)} className="pl-8" />
        </div>
        <Select value={modulo} onValueChange={setModulo}>
          <SelectTrigger className="w-[180px]"><SelectValue placeholder="Módulo" /></SelectTrigger>
          <SelectContent>
            <SelectItem value={TODOS}>Todos los módulos</SelectItem>
            {modulos.map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={norma} onValueChange={setNorma}>
          <SelectTrigger className="w-[150px]"><SelectValue placeholder="Norma" /></SelectTrigger>
          <SelectContent>
            <SelectItem value={TODOS}>Todas las normas</SelectItem>
            {normas.map((n) => <SelectItem key={n} value={n}>{n}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={tipo} onValueChange={setTipo}>
          <SelectTrigger className="w-[120px]"><SelectValue placeholder="Tipo" /></SelectTrigger>
          <SelectContent>
            <SelectItem value={TODOS}>Todo tipo</SelectItem>
            {tipos.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
          </SelectContent>
        </Select>
        <div className="flex items-center gap-1">
          <Input type="date" value={desde} onChange={(e) => setDesde(e.target.value)} className="w-[150px]" title="Desde" />
          <span className="text-muted-foreground text-xs">a</span>
          <Input type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} className="w-[150px]" title="Hasta" />
        </div>
        {hayFiltros && (
          <Button variant="ghost" size="sm" onClick={limpiar}><X className="mr-1 h-4 w-4" /> Limpiar</Button>
        )}
      </div>

      {/* Tabla */}
      <div className="rounded-lg border border-border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Módulo</TableHead>
              <TableHead>Submódulo</TableHead>
              <TableHead>Norma</TableHead>
              <TableHead>Documento</TableHead>
              <TableHead>Tipo</TableHead>
              <TableHead>Fecha</TableHead>
              <TableHead className="text-right">Ver</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow><TableCell colSpan={7} className="py-10 text-center text-muted-foreground"><Loader2 className="mx-auto h-5 w-5 animate-spin" /></TableCell></TableRow>
            ) : filtrados.length === 0 ? (
              <TableRow><TableCell colSpan={7} className="py-10 text-center text-muted-foreground">No hay documentos con estos filtros.</TableCell></TableRow>
            ) : (
              filtrados.slice(0, 500).map((d) => (
                <TableRow key={d.id}>
                  <TableCell className="text-sm font-medium">{d.modulo}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{d.submodulo}</TableCell>
                  <TableCell>{d.norma ? <Badge variant="outline" className="text-[10px]">{d.norma}</Badge> : <span className="text-muted-foreground">—</span>}</TableCell>
                  <TableCell className="max-w-[280px]"><span className="line-clamp-1 text-sm" title={d.titulo}>{d.titulo}</span></TableCell>
                  <TableCell><Badge variant="secondary" className="text-[10px]">{d.tipo}</Badge></TableCell>
                  <TableCell className="text-sm text-muted-foreground tabular-nums">{fmtFecha(d.fecha)}</TableCell>
                  <TableCell>
                    <div className="flex justify-end gap-1">
                      <Button variant="outline" size="sm" asChild title="Ver">
                        <a href={d.archivo_url} target="_blank" rel="noopener noreferrer"><Eye className="h-4 w-4" /></a>
                      </Button>
                      <Button variant="outline" size="sm" asChild title="Descargar">
                        <a href={d.archivo_url} download={d.archivo_nombre || undefined}><Download className="h-4 w-4" /></a>
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
      {filtrados.length > 500 && (
        <p className="text-center text-xs text-muted-foreground">Mostrando 500 de {filtrados.length}. Afina los filtros para ver el resto.</p>
      )}
    </div>
  )
}
