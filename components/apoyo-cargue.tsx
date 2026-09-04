"use client"

import { useState, useEffect, useCallback } from "react"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { DatePickerField } from "@/components/ui/date-picker-field"
import { Badge } from "@/components/ui/badge"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { useAuth } from "@/components/auth-provider"
import { useToast } from "@/hooks/use-toast"
import { UserPlus, Loader2, X, Users, Package, RefreshCw } from "lucide-react"
import {
  getOrdenesApoyoDelDia,
  getPersonalApoyoDisponible,
  previsualizarApoyo,
  agregarApoyoAOrden,
  quitarApoyoDeOrden,
  type OrdenApoyo,
  type PersonalApoyoDisponible,
  type PreviewApoyo,
} from "@/lib/apoyo-cargue-actions"

function hoyColombia(): string {
  const colombiaDate = new Date().toLocaleString("en-US", { timeZone: "America/Bogota" })
  return new Date(colombiaDate).toISOString().split("T")[0]
}

const money = (n: number) => "$" + Math.round(Number(n) || 0).toLocaleString("es-CO")
const ton = (n: number) => (Number(n) || 0).toLocaleString("es-CO", { maximumFractionDigits: 3 })

export function ApoyoCargue() {
  const { selectedEmpresaId } = useAuth()
  const { toast } = useToast()

  const [fecha, setFecha] = useState(hoyColombia())
  const [ordenes, setOrdenes] = useState<OrdenApoyo[]>([])
  const [loading, setLoading] = useState(false)

  const [ordenActiva, setOrdenActiva] = useState<OrdenApoyo | null>(null)
  const [personal, setPersonal] = useState<PersonalApoyoDisponible[]>([])
  const [seleccionados, setSeleccionados] = useState<string[]>([])
  const [preview, setPreview] = useState<PreviewApoyo | null>(null)
  const [busyModal, setBusyModal] = useState(false)
  const [filtroPersonal, setFiltroPersonal] = useState("")

  const cargarOrdenes = useCallback(async () => {
    setLoading(true)
    const res = await getOrdenesApoyoDelDia(fecha, selectedEmpresaId)
    if (res.success) {
      setOrdenes(res.data)
    } else {
      toast({ title: "Error", description: res.message || "No se pudieron cargar las órdenes", variant: "destructive" })
    }
    setLoading(false)
  }, [fecha, selectedEmpresaId, toast])

  useEffect(() => {
    cargarOrdenes()
  }, [cargarOrdenes])

  const abrirModal = async (orden: OrdenApoyo) => {
    setOrdenActiva(orden)
    setSeleccionados([])
    setPreview(null)
    setFiltroPersonal("")
    const res = await getPersonalApoyoDisponible(fecha, selectedEmpresaId)
    if (res.success) {
      setPersonal(res.data.filter((p) => !orden.auxiliares.some((a) => a.toUpperCase() === p.nombre.toUpperCase())))
    } else {
      toast({ title: "Error", description: res.message || "No se pudo cargar el personal", variant: "destructive" })
    }
  }

  const cerrarModal = () => {
    setOrdenActiva(null)
    setSeleccionados([])
    setPreview(null)
  }

  const toggleSeleccion = async (nombre: string) => {
    const nuevaLista = seleccionados.includes(nombre)
      ? seleccionados.filter((n) => n !== nombre)
      : [...seleccionados, nombre]
    setSeleccionados(nuevaLista)

    if (!ordenActiva) return
    if (nuevaLista.length === 0) {
      setPreview(null)
      return
    }
    const res = await previsualizarApoyo(ordenActiva.id, nuevaLista)
    if (res.success && res.data) setPreview(res.data)
  }

  const confirmarApoyo = async () => {
    if (!ordenActiva || seleccionados.length === 0) return
    setBusyModal(true)
    const res = await agregarApoyoAOrden(ordenActiva.id, seleccionados)
    setBusyModal(false)
    if (res.success) {
      toast({ title: "Apoyo agregado", description: `${seleccionados.length} persona(s) agregada(s) a ${ordenActiva.ordendecargue}.` })
      cerrarModal()
      cargarOrdenes()
    } else {
      toast({ title: "Error", description: res.message || "No se pudo agregar el apoyo", variant: "destructive" })
    }
  }

  const quitar = async (orden: OrdenApoyo, persona: string) => {
    const res = await quitarApoyoDeOrden(orden.id, persona)
    if (res.success) {
      toast({ title: "Apoyo retirado", description: `${persona} se quitó de ${orden.ordendecargue}.` })
      cargarOrdenes()
    } else {
      toast({ title: "No se pudo quitar", description: res.message || "", variant: "destructive" })
    }
  }

  const personalFiltrado = personal.filter((p) => p.nombre.toLowerCase().includes(filtroPersonal.toLowerCase()))

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="h-5 w-5" />
            Asignación de apoyo en cargue
          </CardTitle>
          <CardDescription>
            Agrega personal extra (por ejemplo, de turno fijo) a una orden de Cargue o Descargue del día para que
            también entre en el reparto de toneladas de esa orden. No reemplaza al personal ya asignado en
            Picking/Packing, solo se le suma.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-3">
            <label className="text-sm font-medium">Fecha</label>
            <DatePickerField value={fecha} onChange={setFecha} className="w-44" />
            <Button variant="outline" size="sm" onClick={cargarOrdenes} disabled={loading} className="gap-2">
              <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
              Actualizar
            </Button>
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-10 text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin mr-2" /> Cargando órdenes...
            </div>
          ) : ordenes.length === 0 ? (
            <div className="py-10 text-center text-sm text-muted-foreground">
              No hay órdenes de Cargue/Descargue para esta fecha.
            </div>
          ) : (
            <div className="space-y-3">
              {ordenes.map((orden) => (
                <div key={orden.id} className="rounded-lg border p-4 space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <Package className="h-4 w-4 text-muted-foreground" />
                      <span className="font-semibold">{orden.ordendecargue}</span>
                      <Badge variant="outline">{orden.tipooperacion}</Badge>
                      {orden.placa && <span className="text-sm text-muted-foreground">{orden.placa}</span>}
                    </div>
                    <div className="flex items-center gap-4 text-sm">
                      <span>
                        Peso base: <strong>{ton(orden.pesoBase)} t</strong>
                      </span>
                      <span>
                        Tarifa: <strong>{money(orden.tarifa)}</strong>
                      </span>
                      <Button size="sm" className="gap-1" onClick={() => abrirModal(orden)}>
                        <UserPlus className="h-4 w-4" />
                        Agregar apoyo
                      </Button>
                    </div>
                  </div>

                  {orden.pagoActualPorPersona.length === 0 ? (
                    <p className="text-sm text-muted-foreground">Sin auxiliares asignados todavía.</p>
                  ) : (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Persona</TableHead>
                          <TableHead className="text-right">Toneladas</TableHead>
                          <TableHead className="text-right">Pago actual</TableHead>
                          <TableHead className="w-10" />
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {orden.pagoActualPorPersona.map((p) => (
                          <TableRow key={p.persona}>
                            <TableCell>{p.persona}</TableCell>
                            <TableCell className="text-right">{ton(p.toneladas)} t</TableCell>
                            <TableCell className="text-right">{money(p.pago)}</TableCell>
                            <TableCell>
                              <Button
                                size="icon"
                                variant="ghost"
                                className="h-7 w-7"
                                title="Quitar apoyo (solo si fue agregado desde este módulo)"
                                onClick={() => quitar(orden, p.persona)}
                              >
                                <X className="h-3.5 w-3.5" />
                              </Button>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={!!ordenActiva} onOpenChange={(open) => !open && cerrarModal()}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Agregar apoyo — {ordenActiva?.ordendecargue}</DialogTitle>
            <DialogDescription>
              Selecciona el personal presente hoy que apoyará esta orden. Se suma al reparto de toneladas, no
              reemplaza a nadie.
            </DialogDescription>
          </DialogHeader>

          <Input
            placeholder="Buscar persona..."
            value={filtroPersonal}
            onChange={(e) => setFiltroPersonal(e.target.value)}
          />

          <div className="max-h-56 overflow-y-auto border rounded-md divide-y">
            {personalFiltrado.length === 0 ? (
              <p className="p-3 text-sm text-muted-foreground">No hay personal disponible con ese filtro.</p>
            ) : (
              personalFiltrado.map((p) => (
                <label key={p.id} className="flex items-center gap-2 p-2 text-sm cursor-pointer hover:bg-muted/50">
                  <input
                    type="checkbox"
                    checked={seleccionados.includes(p.nombre)}
                    onChange={() => toggleSeleccion(p.nombre)}
                  />
                  <span className="flex-1">{p.nombre}</span>
                  {p.puesto && <span className="text-xs text-muted-foreground">{p.puesto}</span>}
                  {p.especialidad && (
                    <Badge variant="secondary" className="text-xs">
                      Turno fijo
                    </Badge>
                  )}
                </label>
              ))
            )}
          </div>

          {preview && (
            <div className="space-y-2">
              <p className="text-sm font-medium">Así queda el pago por persona de esta orden:</p>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Persona</TableHead>
                    <TableHead className="text-right">Antes</TableHead>
                    <TableHead className="text-right">Después</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {preview.personas.map((p) => (
                    <TableRow key={p.persona}>
                      <TableCell>{p.persona}</TableCell>
                      <TableCell className="text-right">{p.antes == null ? "—" : money(p.antes)}</TableCell>
                      <TableCell className="text-right font-medium">{money(p.despues)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={cerrarModal}>
              Cancelar
            </Button>
            <Button onClick={confirmarApoyo} disabled={seleccionados.length === 0 || busyModal}>
              {busyModal && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              Confirmar apoyo ({seleccionados.length})
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
