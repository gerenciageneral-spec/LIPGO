"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { History, Search, Loader2, ChevronLeft, ChevronRight, User, X } from "lucide-react"
import { getAuditoria, getAuditoriaActores, getAuditoriaModulos } from "@/lib/auditoria-actions"
import { calcularDiff, type AuditoriaRow, type DiffCampo } from "@/lib/auditoria-types"

const PAGE_SIZE = 50

const fmtFecha = (iso: string) => {
  try {
    return new Date(iso).toLocaleString("es-CO", {
      day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit",
    })
  } catch {
    return iso
  }
}

const opBadge = (op: string) =>
  op === "INSERT"
    ? "bg-green-100 text-green-800"
    : op === "DELETE"
      ? "bg-red-100 text-red-800"
      : "bg-blue-100 text-blue-800"

const opLabel = (op: string) => (op === "INSERT" ? "Creó" : op === "DELETE" ? "Eliminó" : "Editó")

function valorTexto(v: any): string {
  if (v === null || v === undefined) return "—"
  if (typeof v === "object") return JSON.stringify(v)
  return String(v)
}

export default function BitacoraAuditoria() {
  const [rows, setRows] = useState<AuditoriaRow[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(0)
  const [loading, setLoading] = useState(true)
  const [actores, setActores] = useState<{ id: string; usuario: string }[]>([])
  const [modulos, setModulos] = useState<string[]>([])
  const [sel, setSel] = useState<AuditoriaRow | null>(null)

  // Filtros
  const [desde, setDesde] = useState("")
  const [hasta, setHasta] = useState("")
  const [actorId, setActorId] = useState("todos")
  const [modulo, setModulo] = useState("todos")
  const [operacion, setOperacion] = useState("todos")
  const [busqueda, setBusqueda] = useState("")
  const [busquedaAplicada, setBusquedaAplicada] = useState("")

  useEffect(() => {
    getAuditoriaActores().then(setActores).catch(() => setActores([]))
    getAuditoriaModulos().then(setModulos).catch(() => setModulos([]))
  }, [])

  const cargar = useCallback(async () => {
    setLoading(true)
    try {
      const r = await getAuditoria({
        desde: desde || undefined,
        hasta: hasta || undefined,
        actorId: actorId !== "todos" ? actorId : undefined,
        modulo: modulo !== "todos" ? modulo : undefined,
        operacion: operacion !== "todos" ? (operacion as any) : undefined,
        busqueda: busquedaAplicada || undefined,
        page,
        pageSize: PAGE_SIZE,
      })
      setRows(r.rows)
      setTotal(r.total)
    } finally {
      setLoading(false)
    }
  }, [desde, hasta, actorId, modulo, operacion, busquedaAplicada, page])

  useEffect(() => {
    cargar()
  }, [cargar])

  // Al cambiar un filtro, volver a la página 0.
  useEffect(() => {
    setPage(0)
  }, [desde, hasta, actorId, modulo, operacion, busquedaAplicada])

  const totalPaginas = Math.max(1, Math.ceil(total / PAGE_SIZE))
  const diff = useMemo<DiffCampo[]>(
    () => (sel ? calcularDiff(sel.antes, sel.despues, sel.campos_cambiados) : []),
    [sel],
  )

  const limpiar = () => {
    setDesde(""); setHasta(""); setActorId("todos"); setModulo("todos"); setOperacion("todos"); setBusqueda(""); setBusquedaAplicada("")
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-2">
        <History className="h-6 w-6 text-primary" />
        <div>
          <h1 className="text-xl font-bold text-foreground">Bitácora de Auditoría</h1>
          <p className="text-[13px] text-muted-foreground">
            Historial de cada cambio (crear, editar, eliminar) en la aplicación. Click en una fila para ver el antes y después.
          </p>
        </div>
      </div>

      {/* Filtros */}
      <Card>
        <CardContent className="grid grid-cols-2 gap-3 p-3 md:grid-cols-3 lg:grid-cols-6">
          <div className="space-y-1">
            <Label className="text-[11px]">Desde</Label>
            <Input type="date" value={desde} onChange={(e) => setDesde(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label className="text-[11px]">Hasta</Label>
            <Input type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label className="text-[11px]">Usuario</Label>
            <Select value={actorId} onValueChange={setActorId}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos</SelectItem>
                {actores.map((a) => (
                  <SelectItem key={a.id} value={a.id}>{a.usuario}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-[11px]">Módulo</Label>
            <Select value={modulo} onValueChange={setModulo}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos</SelectItem>
                {modulos.map((m) => (
                  <SelectItem key={m} value={m}>{m}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-[11px]">Acción</Label>
            <Select value={operacion} onValueChange={setOperacion}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todas</SelectItem>
                <SelectItem value="INSERT">Creación</SelectItem>
                <SelectItem value="UPDATE">Edición</SelectItem>
                <SelectItem value="DELETE">Eliminación</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-[11px]">Buscar</Label>
            <div className="flex gap-1">
              <div className="relative flex-1">
                <Search className="absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                <Input
                  className="pl-7"
                  placeholder="descripción, registro…"
                  value={busqueda}
                  onChange={(e) => setBusqueda(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && setBusquedaAplicada(busqueda)}
                />
              </div>
              <Button variant="outline" size="icon" onClick={() => setBusquedaAplicada(busqueda)} title="Buscar">
                <Search className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="flex items-center justify-between">
        <div className="text-[13px] text-muted-foreground">
          {loading ? "Cargando…" : `${total.toLocaleString("es-CO")} registro(s)`}
        </div>
        <Button variant="ghost" size="sm" onClick={limpiar} className="gap-1 text-muted-foreground">
          <X className="h-3.5 w-3.5" /> Limpiar filtros
        </Button>
      </div>

      {/* Tabla */}
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Fecha y hora</TableHead>
              <TableHead>Usuario</TableHead>
              <TableHead>Módulo</TableHead>
              <TableHead>Acción</TableHead>
              <TableHead>Descripción</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={5} className="py-10 text-center text-muted-foreground">
                  <Loader2 className="mx-auto h-5 w-5 animate-spin" />
                </TableCell>
              </TableRow>
            ) : rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="py-10 text-center text-muted-foreground">
                  No hay cambios con los filtros actuales.
                </TableCell>
              </TableRow>
            ) : (
              rows.map((r) => (
                <TableRow key={r.id} className="cursor-pointer" onClick={() => setSel(r)}>
                  <TableCell className="whitespace-nowrap tabular-nums text-[13px]">{fmtFecha(r.ts)}</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1.5">
                      <User className="h-3.5 w-3.5 text-muted-foreground" />
                      <span className="font-medium">{r.actor_nombre}</span>
                    </div>
                  </TableCell>
                  <TableCell className="text-[13px]">{r.modulo || r.tabla}</TableCell>
                  <TableCell>
                    <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-semibold ${opBadge(r.operacion)}`}>
                      {opLabel(r.operacion)}
                    </span>
                  </TableCell>
                  <TableCell className="max-w-md truncate text-[13px] text-muted-foreground">{r.descripcion}</TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* Paginación */}
      <div className="flex items-center justify-between">
        <div className="text-[12px] text-muted-foreground">
          Página {page + 1} de {totalPaginas}
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" disabled={page <= 0 || loading} onClick={() => setPage((p) => Math.max(0, p - 1))} className="gap-1">
            <ChevronLeft className="h-4 w-4" /> Anterior
          </Button>
          <Button variant="outline" size="sm" disabled={page >= totalPaginas - 1 || loading} onClick={() => setPage((p) => p + 1)} className="gap-1">
            Siguiente <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Modal detalle antes/después */}
      <Dialog open={!!sel} onOpenChange={(o) => !o && setSel(null)}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle className="flex flex-wrap items-center gap-2">
              {sel && (
                <>
                  <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-semibold ${opBadge(sel.operacion)}`}>
                    {opLabel(sel.operacion)}
                  </span>
                  <span>{sel.modulo || sel.tabla}</span>
                  <span className="text-sm font-normal text-muted-foreground">
                    · {sel.actor_nombre} · {fmtFecha(sel.ts)}
                  </span>
                </>
              )}
            </DialogTitle>
          </DialogHeader>
          {sel && (
            <div className="space-y-3">
              <div className="text-[13px] text-muted-foreground">
                Tabla <code className="rounded bg-muted px-1">{sel.tabla}</code>
                {sel.registro_id ? <> · registro <code className="rounded bg-muted px-1">{sel.registro_id}</code></> : null}
                {" — "}{sel.descripcion}
              </div>
              <div className="max-h-[55vh] overflow-auto rounded-md border">
                <table className="w-full text-[13px]">
                  <thead className="sticky top-0 bg-muted/60">
                    <tr className="text-left">
                      <th className="px-3 py-2 font-semibold">Campo</th>
                      <th className="px-3 py-2 font-semibold">Antes</th>
                      <th className="px-3 py-2 font-semibold">Después</th>
                    </tr>
                  </thead>
                  <tbody>
                    {diff.map((d) => {
                      const resalta = d.estado !== "igual"
                      return (
                        <tr key={d.campo} className={`border-t align-top ${resalta ? "bg-amber-50" : ""}`}>
                          <td className="px-3 py-1.5 font-medium">{d.campo}</td>
                          <td className={`px-3 py-1.5 ${d.estado === "cambiado" || d.estado === "eliminado" ? "text-red-700" : "text-muted-foreground"}`}>
                            {sel.operacion === "INSERT" ? "—" : valorTexto(d.antes)}
                          </td>
                          <td className={`px-3 py-1.5 ${d.estado === "cambiado" || d.estado === "agregado" ? "text-green-700" : "text-muted-foreground"}`}>
                            {sel.operacion === "DELETE" ? "—" : valorTexto(d.despues)}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
