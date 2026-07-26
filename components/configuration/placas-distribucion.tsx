"use client"

import { useEffect, useMemo, useState } from "react"
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { useToast } from "@/hooks/use-toast"
import { Truck, Plus, Loader2, Trash2, Power } from "lucide-react"
import {
  getDistribucionPlacas,
  agregarPlacaDistribucion,
  setPlacaDistribucionActivo,
  eliminarPlacaDistribucion,
} from "@/lib/distribucion-placas-actions"
import { getAllEmpresas } from "@/lib/user-access-actions"
import type { DistribucionPlaca } from "@/lib/distribucion-placas-types"

export default function PlacasDistribucion() {
  const { toast } = useToast()
  const [placas, setPlacas] = useState<DistribucionPlaca[]>([])
  const [empresas, setEmpresas] = useState<{ id: number; nombre: string }[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({ idempresa: "", placa: "", observacion: "" })

  const load = async () => {
    setLoading(true)
    try {
      const [p, e] = await Promise.all([getDistribucionPlacas(), getAllEmpresas()])
      setPlacas(p)
      setEmpresas((e as any[]).map((x) => ({ id: Number(x.id), nombre: x.nombre })))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  const nombreEmpresa = useMemo(() => {
    const m = new Map(empresas.map((e) => [e.id, e.nombre]))
    return (id: number) => m.get(id) || `Empresa ${id}`
  }, [empresas])

  const agregar = async () => {
    if (!form.idempresa || !form.placa.trim()) {
      toast({ title: "Faltan datos", description: "Empresa y placa son obligatorias." })
      return
    }
    setSaving(true)
    try {
      const r = await agregarPlacaDistribucion({
        idempresa: Number(form.idempresa),
        placa: form.placa,
        observacion: form.observacion,
      })
      if (r.success) {
        toast({ title: "Placa asignada" })
        setForm({ idempresa: form.idempresa, placa: "", observacion: "" })
        load()
      } else {
        toast({ title: "Error", description: r.message })
      }
    } finally {
      setSaving(false)
    }
  }

  const toggle = async (p: DistribucionPlaca) => {
    const r = await setPlacaDistribucionActivo(p.id, !p.activo)
    if (r.success) {
      toast({ title: p.activo ? "Placa desasignada" : "Placa reactivada" })
      load()
    } else {
      toast({ title: "Error", description: r.message })
    }
  }

  const borrar = async (p: DistribucionPlaca) => {
    if (!confirm(`¿Eliminar la placa ${p.placa} de ${nombreEmpresa(p.idempresa)}? (se pierde el historial)`)) return
    const r = await eliminarPlacaDistribucion(p.id)
    if (r.success) {
      toast({ title: "Placa eliminada" })
      load()
    } else {
      toast({ title: "Error", description: r.message })
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-2">
        <Truck className="h-6 w-6 text-primary" />
        <div>
          <h1 className="text-xl font-bold text-foreground">Placas de Distribución</h1>
          <p className="text-[13px] text-muted-foreground">
            Vehículos propios que, al montar su orden de cargue, generan automáticamente la orden de distribución (+D).
            Asigna o desasigna sin necesidad de un despliegue.
          </p>
        </div>
      </div>

      {/* Alta */}
      <Card>
        <CardContent className="grid grid-cols-1 gap-3 p-3 sm:grid-cols-4">
          <div className="space-y-1">
            <Label className="text-[11px]">Empresa</Label>
            <Select value={form.idempresa} onValueChange={(v) => setForm({ ...form, idempresa: v })}>
              <SelectTrigger>
                <SelectValue placeholder="Selecciona" />
              </SelectTrigger>
              <SelectContent>
                {empresas.map((e) => (
                  <SelectItem key={e.id} value={String(e.id)}>
                    {e.nombre}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-[11px]">Placa</Label>
            <Input
              placeholder="Ej. QHC437"
              value={form.placa}
              onChange={(e) => setForm({ ...form, placa: e.target.value.toUpperCase() })}
              onKeyDown={(e) => e.key === "Enter" && agregar()}
            />
          </div>
          <div className="space-y-1">
            <Label className="text-[11px]">Observación (opcional)</Label>
            <Input
              placeholder="Nota"
              value={form.observacion}
              onChange={(e) => setForm({ ...form, observacion: e.target.value })}
            />
          </div>
          <div className="flex items-end">
            <Button onClick={agregar} disabled={saving} className="w-full gap-2">
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
              Asignar placa
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Lista */}
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Empresa</TableHead>
              <TableHead>Placa</TableHead>
              <TableHead>Estado</TableHead>
              <TableHead>Observación</TableHead>
              <TableHead className="text-right">Acciones</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={5} className="py-10 text-center text-muted-foreground">
                  <Loader2 className="mx-auto h-5 w-5 animate-spin" />
                </TableCell>
              </TableRow>
            ) : placas.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="py-10 text-center text-muted-foreground">
                  No hay placas de distribución configuradas.
                </TableCell>
              </TableRow>
            ) : (
              placas.map((p) => (
                <TableRow key={p.id} className={p.activo ? "" : "opacity-60"}>
                  <TableCell>{nombreEmpresa(p.idempresa)}</TableCell>
                  <TableCell className="font-mono font-semibold">{p.placa}</TableCell>
                  <TableCell>
                    <span
                      className={`inline-block rounded-full px-2 py-0.5 text-xs font-semibold ${
                        p.activo ? "bg-green-100 text-green-800" : "bg-gray-200 text-gray-600"
                      }`}
                    >
                      {p.activo ? "Asignada" : "Desasignada"}
                    </span>
                  </TableCell>
                  <TableCell className="text-[13px] text-muted-foreground">{p.observacion || "—"}</TableCell>
                  <TableCell>
                    <div className="flex justify-end gap-1.5">
                      <Button variant="outline" size="sm" onClick={() => toggle(p)} className="gap-1" title={p.activo ? "Desasignar" : "Reactivar"}>
                        <Power className="h-4 w-4" />
                        {p.activo ? "Desasignar" : "Reactivar"}
                      </Button>
                      <Button variant="destructive" size="sm" onClick={() => borrar(p)} title="Eliminar">
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <p className="text-[12px] text-muted-foreground">
        Nota: el "dueño" del vehículo para facturación se sigue determinando por el producto que carga (no por esta lista).
        Los cambios aquí surten efecto en ~1 minuto (o de inmediato en la siguiente operación).
      </p>
    </div>
  )
}
