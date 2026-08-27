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
import { Warehouse, Plus, Loader2, Trash2, Power } from "lucide-react"
import {
  getMuellesEmpresaList,
  agregarMuelleEmpresa,
  setMuelleEmpresaActivo,
  eliminarMuelleEmpresa,
} from "@/lib/muelles-empresa-actions"
import { getAllEmpresas } from "@/lib/user-access-actions"
import type { MuelleEmpresa } from "@/lib/muelles-empresa-types"

export default function MuellesEmpresaConfig() {
  const { toast } = useToast()
  const [muelles, setMuelles] = useState<MuelleEmpresa[]>([])
  const [empresas, setEmpresas] = useState<{ id: number; nombre: string }[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({ idempresa: "", muelle: "", observacion: "" })

  const load = async () => {
    setLoading(true)
    try {
      const [m, e] = await Promise.all([getMuellesEmpresaList(), getAllEmpresas()])
      setMuelles(m)
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

  const siguienteMuelleSugerido = useMemo(() => {
    if (!form.idempresa) return ""
    const idempresa = Number(form.idempresa)
    const usados = muelles.filter((m) => m.idempresa === idempresa).map((m) => m.muelle)
    return usados.length > 0 ? String(Math.max(...usados) + 1) : "1"
  }, [form.idempresa, muelles])

  const agregar = async () => {
    if (!form.idempresa || !form.muelle.trim()) {
      toast({ title: "Faltan datos", description: "Empresa y número de muelle son obligatorios." })
      return
    }
    setSaving(true)
    try {
      const r = await agregarMuelleEmpresa({
        idempresa: Number(form.idempresa),
        muelle: Number(form.muelle),
        observacion: form.observacion,
      })
      if (r.success) {
        toast({ title: "Muelle agregado" })
        setForm({ idempresa: form.idempresa, muelle: "", observacion: "" })
        load()
      } else {
        toast({ title: "Error", description: r.message })
      }
    } finally {
      setSaving(false)
    }
  }

  const toggle = async (m: MuelleEmpresa) => {
    const r = await setMuelleEmpresaActivo(m.id, !m.activo)
    if (r.success) {
      toast({ title: m.activo ? "Muelle desactivado" : "Muelle reactivado" })
      load()
    } else {
      toast({ title: "Error", description: r.message })
    }
  }

  const borrar = async (m: MuelleEmpresa) => {
    if (!confirm(`¿Eliminar el muelle ${m.muelle} de ${nombreEmpresa(m.idempresa)}? (se pierde el historial)`)) return
    const r = await eliminarMuelleEmpresa(m.id)
    if (r.success) {
      toast({ title: "Muelle eliminado" })
      load()
    } else {
      toast({ title: "Error", description: r.message })
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-2">
        <Warehouse className="h-6 w-6 text-primary" />
        <div>
          <h1 className="text-xl font-bold text-foreground">Muelles de Cargue</h1>
          <p className="text-[13px] text-muted-foreground">
            Muelles físicos disponibles por proyecto para Centro de Coordinación. Agrega, desactiva o elimina sin
            necesidad de un despliegue.
          </p>
        </div>
      </div>

      {/* Alta */}
      <Card>
        <CardContent className="grid grid-cols-1 gap-3 p-3 sm:grid-cols-4">
          <div className="space-y-1">
            <Label className="text-[11px]">Empresa</Label>
            <Select
              value={form.idempresa}
              onValueChange={(v) => setForm({ ...form, idempresa: v, muelle: "" })}
            >
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
            <Label className="text-[11px]">Número de muelle</Label>
            <Input
              type="number"
              min={1}
              placeholder={siguienteMuelleSugerido || "Ej. 1"}
              value={form.muelle}
              onChange={(e) => setForm({ ...form, muelle: e.target.value })}
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
              Agregar muelle
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
              <TableHead>Muelle</TableHead>
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
            ) : muelles.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="py-10 text-center text-muted-foreground">
                  No hay muelles configurados.
                </TableCell>
              </TableRow>
            ) : (
              muelles.map((m) => (
                <TableRow key={m.id} className={m.activo ? "" : "opacity-60"}>
                  <TableCell>{nombreEmpresa(m.idempresa)}</TableCell>
                  <TableCell className="font-mono font-semibold">Muelle {m.muelle}</TableCell>
                  <TableCell>
                    <span
                      className={`inline-block rounded-full px-2 py-0.5 text-xs font-semibold ${
                        m.activo ? "bg-green-100 text-green-800" : "bg-gray-200 text-gray-600"
                      }`}
                    >
                      {m.activo ? "Activo" : "Inactivo"}
                    </span>
                  </TableCell>
                  <TableCell className="text-[13px] text-muted-foreground">{m.observacion || "—"}</TableCell>
                  <TableCell>
                    <div className="flex justify-end gap-1.5">
                      <Button variant="outline" size="sm" onClick={() => toggle(m)} className="gap-1" title={m.activo ? "Desactivar" : "Reactivar"}>
                        <Power className="h-4 w-4" />
                        {m.activo ? "Desactivar" : "Reactivar"}
                      </Button>
                      <Button variant="destructive" size="sm" onClick={() => borrar(m)} title="Eliminar">
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
        Los cambios aquí surten efecto en Centro de Coordinación en ~1 minuto (o de inmediato en la siguiente
        operación). No se puede desactivar ni eliminar un muelle que tenga una orden activa en este momento.
      </p>
    </div>
  )
}
