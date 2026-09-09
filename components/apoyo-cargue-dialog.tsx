"use client"

// Diálogo para agregar personal de apoyo a UNA orden de cargue/descargue.
//
// Vive aparte porque lo usan DOS pantallas: el módulo "Asignación de apoyo en
// cargue" (que primero hace elegir la orden de una lista del día) y Centro de
// Coordinación (que ya sabe cuál es la orden — la del muelle que se está
// mirando). Si cada una tuviera su copia, el reparto de toneladas se mostraría
// distinto según por dónde se entre, y ese número es plata.
//
// El cálculo NO vive aquí: lo hace `previsualizarApoyo` en el servidor,
// replicando la fórmula de `pagonomina`. Este componente solo lo muestra.

import { useEffect, useState } from "react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { useToast } from "@/hooks/use-toast"
import { Loader2 } from "lucide-react"
import {
  agregarApoyoAOrden,
  getPersonalApoyoDisponible,
  previsualizarApoyo,
  type PersonalApoyoDisponible,
  type PreviewApoyo,
} from "@/lib/apoyo-cargue-actions"

const money = (n: number) => "$" + Math.round(Number(n) || 0).toLocaleString("es-CO")

export interface OrdenParaApoyo {
  /** `cabeceraoc.id`. En Centro de Coordinación es `OrdenOperativa.orderId`. */
  id: number
  ordendecargue: string
  /** Quiénes ya están en el reparto: se excluyen de la lista para no duplicar. */
  auxiliares: string[]
}

export function ApoyoCargueDialog({
  orden,
  fecha,
  empresaId,
  onCerrar,
  onAgregado,
}: {
  /** null = cerrado. */
  orden: OrdenParaApoyo | null
  /** Día del que se lista el personal presente (YYYY-MM-DD). */
  fecha: string
  empresaId?: number | null
  onCerrar: () => void
  onAgregado: () => void
}) {
  const { toast } = useToast()
  const [personal, setPersonal] = useState<PersonalApoyoDisponible[]>([])
  const [seleccionados, setSeleccionados] = useState<string[]>([])
  const [preview, setPreview] = useState<PreviewApoyo | null>(null)
  const [filtro, setFiltro] = useState("")
  const [cargandoPersonal, setCargandoPersonal] = useState(false)
  const [guardando, setGuardando] = useState(false)

  // Al abrir se parte de cero y se trae el personal presente hoy.
  useEffect(() => {
    if (!orden) return
    let vigente = true
    setSeleccionados([])
    setPreview(null)
    setFiltro("")
    setCargandoPersonal(true)
    getPersonalApoyoDisponible(fecha, empresaId).then((res) => {
      if (!vigente) return
      setCargandoPersonal(false)
      if (!res.success) {
        toast({
          title: "Error",
          description: res.message || "No se pudo cargar el personal",
          variant: "destructive",
        })
        return
      }
      // Fuera quien ya está en el reparto de ESTA orden: agregarlo otra vez no
      // le sumaría nada y confundiría el preview.
      setPersonal(
        res.data.filter(
          (p) => !orden.auxiliares.some((a) => a.toUpperCase() === p.nombre.toUpperCase()),
        ),
      )
    })
    return () => {
      vigente = false
    }
  }, [orden, fecha, empresaId, toast])

  const alternar = async (nombre: string) => {
    const nueva = seleccionados.includes(nombre)
      ? seleccionados.filter((n) => n !== nombre)
      : [...seleccionados, nombre]
    setSeleccionados(nueva)

    if (!orden) return
    if (nueva.length === 0) {
      setPreview(null)
      return
    }
    // El preview se recalcula en el servidor con la MISMA fórmula que usará el
    // guardado, así que lo que se ve es lo que va a quedar.
    const res = await previsualizarApoyo(orden.id, nueva)
    if (res.success && res.data) setPreview(res.data)
  }

  const confirmar = async () => {
    if (!orden || seleccionados.length === 0) return
    setGuardando(true)
    const res = await agregarApoyoAOrden(orden.id, seleccionados)
    setGuardando(false)
    if (!res.success) {
      toast({
        title: "Error",
        description: res.message || "No se pudo agregar el apoyo",
        variant: "destructive",
      })
      return
    }
    toast({
      title: "Apoyo agregado",
      description: `${seleccionados.length} persona(s) agregada(s) a ${orden.ordendecargue}.`,
    })
    onCerrar()
    onAgregado()
  }

  const filtrados = personal.filter((p) => p.nombre.toLowerCase().includes(filtro.toLowerCase()))

  return (
    <Dialog open={!!orden} onOpenChange={(abierto) => !abierto && onCerrar()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Agregar personal de apoyo — {orden?.ordendecargue}</DialogTitle>
          <DialogDescription>
            Selecciona el personal presente hoy que apoyará esta orden. Se suma al reparto de
            toneladas, no reemplaza a nadie.
          </DialogDescription>
        </DialogHeader>

        <Input
          placeholder="Buscar persona..."
          value={filtro}
          onChange={(e) => setFiltro(e.target.value)}
        />

        <div className="max-h-56 divide-y overflow-y-auto rounded-md border">
          {cargandoPersonal ? (
            <div className="flex items-center justify-center py-6 text-sm text-muted-foreground">
              <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Cargando personal...
            </div>
          ) : filtrados.length === 0 ? (
            <p className="p-3 text-sm text-muted-foreground">
              {personal.length === 0
                ? "No hay personal disponible para apoyar esta orden."
                : "No hay personal disponible con ese filtro."}
            </p>
          ) : (
            filtrados.map((p) => (
              <label
                key={p.id}
                className="flex cursor-pointer items-center gap-2 p-2 text-sm hover:bg-muted/50"
              >
                <input
                  type="checkbox"
                  checked={seleccionados.includes(p.nombre)}
                  onChange={() => alternar(p.nombre)}
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
            <div className="max-h-48 overflow-y-auto">
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
                      <TableCell className="text-right">
                        {p.antes == null ? "—" : money(p.antes)}
                      </TableCell>
                      <TableCell className="text-right font-medium">{money(p.despues)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            <p className="text-xs text-muted-foreground">
              El reparto se divide entre más personas, así que a quien ya estaba le baja su parte.
            </p>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={onCerrar} disabled={guardando}>
            Cancelar
          </Button>
          <Button onClick={confirmar} disabled={seleccionados.length === 0 || guardando}>
            {guardando && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Confirmar apoyo ({seleccionados.length})
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export default ApoyoCargueDialog
