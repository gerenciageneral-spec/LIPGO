"use client"

import { useEffect, useState } from "react"
import { useAuth } from "@/components/auth-provider"
import { useToast } from "@/hooks/use-toast"
import { Button } from "@/components/ui/button"
import { KpiCard } from "@/components/orders/dashboard-pedidos/kpi-card"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import {
  getVehiculosNoProcesados,
  getOrdenesRecientes,
  cerrarVehiculoConOrden,
  eliminarVehiculoNoProcesado,
  type VehiculosKpis,
  type VehiculoPendiente,
} from "@/lib/pedidos-kpis-actions"
import { Car, CheckCircle2, Truck, Trash2, Loader2 } from "lucide-react"

export function VehiculosNoProcesadosCard() {
  const { selectedEmpresaId } = useAuth()
  const { toast } = useToast()
  const [k, setK] = useState<VehiculosKpis | null>(null)
  const [loading, setLoading] = useState(true)
  const [cerrar, setCerrar] = useState<VehiculoPendiente | null>(null)
  const [ordenes, setOrdenes] = useState<{ ordendecargue: string; fechaorden: string | null }[]>([])
  const [ocSel, setOcSel] = useState("")
  const [guardando, setGuardando] = useState(false)
  const [borrandoId, setBorrandoId] = useState<number | null>(null)

  const cargar = async () => {
    setLoading(true)
    const r = await getVehiculosNoProcesados(selectedEmpresaId)
    setK(r)
    setLoading(false)
  }

  useEffect(() => {
    cargar()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedEmpresaId])

  const abrirCerrar = async (v: VehiculoPendiente) => {
    setCerrar(v)
    setOcSel("")
    setOrdenes(await getOrdenesRecientes(selectedEmpresaId))
  }

  const confirmarCerrar = async () => {
    if (!cerrar || !ocSel) {
      toast({ title: "Selecciona una orden", description: "Elige la orden de cargue para cerrar el vehículo." })
      return
    }
    setGuardando(true)
    try {
      const r = await cerrarVehiculoConOrden(cerrar.id, ocSel, selectedEmpresaId)
      if (r.success) {
        toast({ title: "Vehículo cerrado", description: `${cerrar.placa} → orden ${ocSel}` })
        setCerrar(null)
        cargar()
      } else {
        toast({ title: "Error", description: r.message })
      }
    } finally {
      setGuardando(false)
    }
  }

  const eliminar = async (v: VehiculoPendiente) => {
    if (!confirm(`¿Eliminar el registro del vehículo ${v.placa}? Esta acción no se puede deshacer.`)) return
    setBorrandoId(v.id)
    try {
      const r = await eliminarVehiculoNoProcesado(v.id, selectedEmpresaId)
      if (r.success) {
        toast({ title: "Registro eliminado", description: v.placa })
        cargar()
      } else {
        toast({ title: "Error", description: r.message })
      }
    } finally {
      setBorrandoId(null)
    }
  }

  if (loading && !k) {
    return <div className="h-[74px] animate-pulse rounded-xl border border-border/60 bg-muted/40" />
  }
  if (!k) return null

  const hay = k.noProcesados > 0

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <KpiCard
          label="Vehículos no procesados"
          value={String(k.noProcesados)}
          subtext={hay ? "por cerrar o eliminar" : "todo cerrado ✓"}
          icon={hay ? Car : CheckCircle2}
          variant={hay ? "danger" : "success"}
        />
        {hay && (
          <div className="sm:col-span-2 rounded-xl border border-border/60 bg-card p-3">
            <div className="mb-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Placas pendientes por cerrar
            </div>
            <div className="max-h-56 space-y-1.5 overflow-y-auto">
              {k.vehiculos.map((v) => (
                <div key={v.id} className="flex items-center justify-between gap-2 rounded-md border border-border/50 bg-background px-2.5 py-1.5">
                  <div className="min-w-0">
                    <span className="text-sm font-semibold text-foreground">{v.placa}</span>
                    <span className="text-xs text-muted-foreground">
                      {v.transporte ? ` · ${v.transporte}` : ""}
                      {v.conductor ? ` · ${v.conductor}` : ""}
                      {v.fechallegada ? ` · ${String(v.fechallegada).slice(0, 10)}` : ""}
                    </span>
                  </div>
                  <div className="flex flex-none gap-1">
                    <Button variant="outline" size="sm" className="h-7 gap-1 text-xs" onClick={() => abrirCerrar(v)} title="Cerrar con una orden de cargue">
                      <Truck className="h-3.5 w-3.5" /> Cerrar
                    </Button>
                    <Button variant="destructive" size="sm" className="h-7 px-2" onClick={() => eliminar(v)} disabled={borrandoId === v.id} title="Eliminar registro">
                      {borrandoId === v.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Diálogo: cerrar vehículo con una orden de cargue */}
      <Dialog open={!!cerrar} onOpenChange={(o) => !o && setCerrar(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Cerrar vehículo con orden de cargue</DialogTitle>
          </DialogHeader>
          {cerrar && (
            <div className="space-y-4">
              <div className="rounded-md border border-border bg-muted/40 px-3 py-2 text-sm">
                <span className="font-semibold text-foreground">{cerrar.placa}</span>
                {cerrar.transporte ? <span className="text-muted-foreground"> · {cerrar.transporte}</span> : null}
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Orden de cargue</label>
                <Input
                  list="ordenes-recientes"
                  placeholder="Escribe o elige la orden de cargue…"
                  value={ocSel}
                  onChange={(e) => setOcSel(e.target.value)}
                  autoFocus
                />
                <datalist id="ordenes-recientes">
                  {ordenes.map((o) => (
                    <option key={o.ordendecargue} value={o.ordendecargue}>
                      {o.fechaorden ? String(o.fechaorden).slice(0, 10) : ""}
                    </option>
                  ))}
                </datalist>
                <p className="text-[11px] text-muted-foreground">Al cerrarlo, el vehículo queda como Procesado (con esa orden) y sale del indicador.</p>
              </div>
              <div className="flex justify-end gap-2 pt-1">
                <Button variant="outline" onClick={() => setCerrar(null)} disabled={guardando}>Cancelar</Button>
                <Button onClick={confirmarCerrar} disabled={guardando || !ocSel}>
                  {guardando && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Cerrar vehículo
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
