"use client"

// Financiera › Tarifas › Metas — CRUD de la meta de toneladas por proyecto.
// meta/trabajador/día = (toneladas_mes ÷ días_operación) ÷ HC. Es la referencia de
// productividad que alimenta el módulo Revisión de nómina (solo indicador; no cambia
// la liquidación ni el bono, que siguen sobre salario/30).

import { useCallback, useEffect, useState } from "react"
import { useToast } from "@/components/ui/use-toast"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Loader2, Plus, Save, Target, Trash2 } from "lucide-react"
import {
  getMetasToneladas,
  guardarMetaToneladas,
  eliminarMetaToneladas,
  type MetaToneladas,
} from "@/lib/metas-toneladas-actions"

type Fila = {
  idempresa: number
  proyecto: string
  toneladasMes: number
  diasOperacion: number
  hc: number
  nuevo?: boolean
}

const n1 = (x: number) => (Number(x) || 0).toLocaleString("es-CO", { maximumFractionDigits: 2 })

function derivar(toneladasMes: number, diasOperacion: number, hc: number) {
  const tonDia = diasOperacion > 0 ? toneladasMes / diasOperacion : 0
  const meta = hc > 0 ? tonDia / hc : 0
  return { tonDia, meta }
}

export function MetasToneladas() {
  const { toast } = useToast()
  const [filas, setFilas] = useState<Fila[]>([])
  const [loading, setLoading] = useState(true)
  const [guardando, setGuardando] = useState<number | null>(null)

  const cargar = useCallback(async () => {
    setLoading(true)
    const r = await getMetasToneladas()
    setLoading(false)
    if (r.success) {
      setFilas(
        r.data.map((m: MetaToneladas) => ({
          idempresa: m.idempresa,
          proyecto: m.proyecto,
          toneladasMes: m.toneladasMes,
          diasOperacion: m.diasOperacion,
          hc: m.hc,
        })),
      )
    } else {
      toast({ title: "No se pudieron cargar las metas", description: r.message, variant: "destructive" })
    }
  }, [toast])

  useEffect(() => {
    cargar()
  }, [cargar])

  const setCampo = (idx: number, campo: keyof Fila, valor: any) => {
    setFilas((prev) => prev.map((f, i) => (i === idx ? { ...f, [campo]: valor } : f)))
  }

  const agregar = () => {
    const usados = new Set(filas.map((f) => f.idempresa))
    let siguiente = 1
    while (usados.has(siguiente)) siguiente++
    setFilas((prev) => [
      ...prev,
      { idempresa: siguiente, proyecto: "", toneladasMes: 0, diasOperacion: 24.7, hc: 1, nuevo: true },
    ])
  }

  const guardar = async (idx: number) => {
    const f = filas[idx]
    if (!f.idempresa) return toast({ title: "El ID de proyecto (idempresa) es obligatorio", variant: "destructive" })
    setGuardando(f.idempresa)
    const r = await guardarMetaToneladas({
      idempresa: f.idempresa,
      proyecto: f.proyecto,
      toneladasMes: f.toneladasMes,
      diasOperacion: f.diasOperacion,
      hc: f.hc,
    })
    setGuardando(null)
    if (r.success) {
      toast({ title: "Meta guardada", description: `${f.proyecto || "Proyecto " + f.idempresa}` })
      cargar()
    } else {
      toast({ title: "No se pudo guardar", description: r.message, variant: "destructive" })
    }
  }

  const eliminar = async (idx: number) => {
    const f = filas[idx]
    if (f.nuevo) {
      setFilas((prev) => prev.filter((_, i) => i !== idx))
      return
    }
    const r = await eliminarMetaToneladas(f.idempresa)
    if (r.success) {
      toast({ title: "Meta eliminada" })
      cargar()
    } else {
      toast({ title: "No se pudo eliminar", description: r.message, variant: "destructive" })
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Target className="h-4 w-4 text-primary" />
          <span>
            <strong>meta/trabajador/día = (toneladas mes ÷ días operación) ÷ HC</strong> — lo mínimo que cada
            trabajador debe cargar/descargar para ganarse la base fija. Indicador de productividad en Revisión de nómina.
          </span>
        </div>
        <Button variant="outline" size="sm" onClick={agregar}>
          <Plus className="mr-2 h-4 w-4" /> Nuevo proyecto
        </Button>
      </div>

      <div className="overflow-x-auto rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-16">ID</TableHead>
              <TableHead>Proyecto</TableHead>
              <TableHead className="text-right">Ton mes</TableHead>
              <TableHead className="text-right">Días op.</TableHead>
              <TableHead className="text-right">HC</TableHead>
              <TableHead className="text-right">Ton/día</TableHead>
              <TableHead className="text-right">Meta ton/trab/día</TableHead>
              <TableHead className="w-24 text-right">Acciones</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody className="tabular-nums">
            {loading ? (
              <TableRow>
                <TableCell colSpan={8} className="py-8 text-center text-muted-foreground">
                  <Loader2 className="mx-auto h-5 w-5 animate-spin" />
                </TableCell>
              </TableRow>
            ) : filas.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="py-8 text-center text-muted-foreground">
                  Sin metas configuradas. Usa “Nuevo proyecto”.
                </TableCell>
              </TableRow>
            ) : (
              filas.map((f, idx) => {
                const { tonDia, meta } = derivar(f.toneladasMes, f.diasOperacion, f.hc)
                return (
                  <TableRow key={idx}>
                    <TableCell>
                      <Input
                        type="number"
                        value={f.idempresa}
                        disabled={!f.nuevo}
                        onChange={(e) => setCampo(idx, "idempresa", Number(e.target.value))}
                        className="h-8 w-14"
                      />
                    </TableCell>
                    <TableCell>
                      <Input
                        value={f.proyecto}
                        onChange={(e) => setCampo(idx, "proyecto", e.target.value)}
                        className="h-8 min-w-[160px]"
                        placeholder="Nombre del proyecto"
                      />
                    </TableCell>
                    <TableCell className="text-right">
                      <Input
                        type="number"
                        value={f.toneladasMes}
                        onChange={(e) => setCampo(idx, "toneladasMes", Number(e.target.value))}
                        className="h-8 w-24 text-right"
                      />
                    </TableCell>
                    <TableCell className="text-right">
                      <Input
                        type="number"
                        step="0.1"
                        value={f.diasOperacion}
                        onChange={(e) => setCampo(idx, "diasOperacion", Number(e.target.value))}
                        className="h-8 w-20 text-right"
                      />
                    </TableCell>
                    <TableCell className="text-right">
                      <Input
                        type="number"
                        value={f.hc}
                        onChange={(e) => setCampo(idx, "hc", Number(e.target.value))}
                        className="h-8 w-16 text-right"
                      />
                    </TableCell>
                    <TableCell className="text-right text-muted-foreground">{n1(tonDia)}</TableCell>
                    <TableCell className="text-right font-semibold text-primary">{n1(meta)}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => guardar(idx)} disabled={guardando === f.idempresa}>
                          {guardando === f.idempresa ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                        </Button>
                        <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive" onClick={() => eliminar(idx)}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                )
              })
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}
