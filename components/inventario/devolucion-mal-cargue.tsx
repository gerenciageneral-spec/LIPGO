"use client"

// DEVOLUCIÓN POR MAL CARGUE (654). Vive dentro de Transacciones de Inventario › Movimiento por
// código: al escribir 654 se abre este panel en vez del formulario genérico, porque el flujo es
// al revés — primero la orden, y de ella salen el producto y el lote.
//
// Gerencia (2026-10-08): "este módulo llama la orden y toda la línea de sus productos para
// realizar el descuento en el producto exacto en que se hizo el mal cargue; se escoge la
// cantidad, con dos efectos inmediatos: le suma al pedido como pendiente de entrega, y regresa
// la cantidad a invtrans para normalizar el inventario".

import { useEffect, useState } from "react"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Textarea } from "@/components/ui/textarea"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { AyudaClaveAutorizacion } from "@/components/mi-clave-autorizacion"
import { useToast } from "@/hooks/use-toast"
import { useAuth } from "@/components/auth-provider"
import { AlertTriangle, Loader2, RotateCcw, Search } from "lucide-react"
import { getDestinationLocationsFromLocationsTable } from "@/lib/inventory-actions"
import { getOrdenParaDevolver, registrarDevolucionMalCargue, type OrdenParaDevolver } from "@/lib/devolucion-mal-cargue-actions"
import { MOTIVOS_DEVOLUCION, validarCantidad, type MotivoDevolucion } from "@/lib/devolucion-mal-cargue"

const NUM = new Intl.NumberFormat("es-CO")

export function DevolucionMalCargue({ onRegistrada }: { onRegistrada?: () => void }) {
  const { toast } = useToast()
  const { selectedEmpresaId } = useAuth()
  const [ocargue, setOcargue] = useState("")
  const [orden, setOrden] = useState<OrdenParaDevolver | null>(null)
  const [buscando, setBuscando] = useState(false)
  const [elegida, setElegida] = useState<number | null>(null)
  const [cantidad, setCantidad] = useState("")
  const [location, setLocation] = useState("")
  const [ubicaciones, setUbicaciones] = useState<string[]>([])
  const [motivo, setMotivo] = useState<MotivoDevolucion>("cantidad_de_mas")
  const [detalle, setDetalle] = useState("")
  const [clave, setClave] = useState("")
  const [guardando, setGuardando] = useState(false)

  useEffect(() => {
    if (!selectedEmpresaId) return
    getDestinationLocationsFromLocationsTable(selectedEmpresaId).then(setUbicaciones)
    limpiar()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedEmpresaId])

  function limpiar() {
    setOrden(null)
    setElegida(null)
    setCantidad("")
    setLocation("")
    setDetalle("")
    setClave("")
  }

  async function buscar() {
    if (!ocargue.trim()) return
    setBuscando(true)
    const r = await getOrdenParaDevolver(ocargue, selectedEmpresaId)
    setBuscando(false)
    setElegida(null)
    setCantidad("")
    if (!r.success || !r.data) {
      setOrden(null)
      toast({ title: "No se encontró la orden", description: r.message, variant: "destructive" })
      return
    }
    setOrden(r.data)
    if (r.data.lineas.length === 0) {
      toast({ title: "Nada por devolver", description: `La orden ${r.data.ordendecargue} no tiene salidas pendientes de devolver (o ya se devolvió todo).` })
    }
  }

  const linea = orden?.lineas.find((l) => l.invtransId === elegida)
  const chequeo = validarCantidad(linea, Number(cantidad))
  const listo = !!linea && chequeo.ok && !!location && !!clave.trim() && !guardando

  async function registrar() {
    if (!linea) return
    setGuardando(true)
    const r = await registrarDevolucionMalCargue({
      selectedEmpresaId,
      ocargue: orden!.ordendecargue,
      invtransOrigen: linea.invtransId,
      cantidad: Number(cantidad),
      location,
      motivo,
      detalle: detalle.trim() || null,
      clave,
    })
    setGuardando(false)
    if (r.success) {
      toast({ title: "Devolución registrada", description: r.message })
      if (r.avisoPeso) toast({ title: "El peso de la orden no se tocó", description: r.avisoPeso })
      limpiar()
      setOcargue("")
      onRegistrada?.()
    } else {
      toast({ title: "No se pudo registrar", description: r.message, variant: "destructive" })
    }
  }

  if (!selectedEmpresaId) return <Card className="p-8 text-center text-sm text-muted-foreground">Selecciona un proyecto en el selector global.</Card>

  return (
    <div className="space-y-4">
      <Card className="space-y-3 p-4">
        <div>
          <Label className="text-xs uppercase text-muted-foreground">Orden de cargue despachada</Label>
          <div className="mt-1 flex gap-2">
            <Input
              value={ocargue}
              onChange={(e) => setOcargue(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && buscar()}
              placeholder="Ej: MOL202610089979"
              className="max-w-xs font-mono"
            />
            <Button onClick={buscar} disabled={buscando || !ocargue.trim()}>
              {buscando ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Search className="mr-1 h-4 w-4" />} Buscar
            </Button>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            Para cuando el camión cargó <b>menos</b> de lo que la orden descontó: lo que no salió vuelve al inventario y el pedido
            recupera esas unidades como pendientes.
          </p>
        </div>

        {orden && (
          <div className="flex flex-wrap items-center gap-2 rounded-md border bg-muted/30 px-3 py-2 text-xs">
            <Badge variant="outline" className="font-mono">{orden.ordendecargue}</Badge>
            <span className="text-muted-foreground">
              {orden.fechacargue ?? "sin fecha"} · placa {orden.placa ?? "—"}
              {orden.cliente ? ` · ${orden.cliente}` : ""} · {orden.estado ?? "sin estado"}
              {orden.pesoOrden != null ? ` · peso ${orden.pesoOrden}` : ""}
            </span>
          </div>
        )}

        {orden?.avisoQuincena && (
          <div className="flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span>{orden.avisoQuincena}</span>
          </div>
        )}
      </Card>

      {orden && orden.lineas.length > 0 && (
        <Card className="overflow-hidden">
          <p className="border-b px-3 py-2 text-xs font-medium">Lo que esa orden despachó — elige de qué línea vuelve el producto</p>
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-[11px] uppercase text-muted-foreground">
              <tr>
                <th className="px-3 py-2 text-left">Producto</th>
                <th className="px-2 py-2 text-left">Lote · ubic.</th>
                <th className="px-2 py-2 text-right">Despachó</th>
                <th className="px-2 py-2 text-right">Ya devuelto</th>
                <th className="px-2 py-2 text-right">Por devolver</th>
                <th className="px-3 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {orden.lineas.map((l) => (
                <tr key={l.invtransId} className={`border-t ${elegida === l.invtransId ? "bg-muted/60" : ""}`}>
                  <td className="px-3 py-2">{l.producto}</td>
                  <td className="px-2 py-2 text-xs text-muted-foreground">{l.lote} · {l.location}</td>
                  <td className="px-2 py-2 text-right tabular-nums">{NUM.format(l.despachado)}</td>
                  <td className="px-2 py-2 text-right tabular-nums text-muted-foreground">{l.devuelto ? NUM.format(l.devuelto) : "—"}</td>
                  <td className="px-2 py-2 text-right font-semibold tabular-nums">{NUM.format(l.porDevolver)}</td>
                  <td className="px-3 py-2 text-right">
                    <Button
                      size="sm"
                      variant={elegida === l.invtransId ? "default" : "ghost"}
                      className="h-6 text-xs"
                      onClick={() => { setElegida(l.invtransId); setCantidad(""); setLocation(l.location) }}
                    >
                      {elegida === l.invtransId ? "Elegida" : "Elegir"}
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      {linea && (
        <Card className="space-y-4 p-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label className="text-xs uppercase text-muted-foreground">Cuántas vuelven (máx. {NUM.format(linea.porDevolver)})</Label>
              <Input
                type="number"
                min="0.01"
                step="0.01"
                value={cantidad}
                onChange={(e) => setCantidad(e.target.value)}
                className="mt-1"
                placeholder={String(linea.porDevolver)}
              />
              {cantidad && !chequeo.ok && <p className="mt-1 text-xs text-destructive">{chequeo.error}</p>}
            </div>
            <div>
              <Label className="text-xs uppercase text-muted-foreground">Vuelve a la ubicación</Label>
              <Select value={location} onValueChange={setLocation}>
                <SelectTrigger className="mt-1"><SelectValue placeholder="Ubicación" /></SelectTrigger>
                <SelectContent>{ubicaciones.map((u) => <SelectItem key={u} value={u}>{u}</SelectItem>)}</SelectContent>
              </Select>
              <p className="mt-1 text-xs text-muted-foreground">Vuelve al lote {linea.lote}, del que salió.</p>
            </div>
          </div>

          <div>
            <Label className="text-xs uppercase text-muted-foreground">Motivo</Label>
            <RadioGroup value={motivo} onValueChange={(v) => setMotivo(v as MotivoDevolucion)} className="mt-1 flex flex-wrap gap-4">
              {MOTIVOS_DEVOLUCION.map((m) => (
                <div key={m.valor} className="flex items-center gap-2">
                  <RadioGroupItem value={m.valor} id={`mot-${m.valor}`} />
                  <Label htmlFor={`mot-${m.valor}`} className="cursor-pointer text-sm" title={m.ayuda}>{m.etiqueta}</Label>
                </div>
              ))}
            </RadioGroup>
            <Textarea
              value={detalle}
              onChange={(e) => setDetalle(e.target.value)}
              rows={1}
              className="mt-2"
              placeholder="Qué pasó (opcional pero recomendado: queda en el movimiento y en el 360 de la orden)"
            />
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label className="text-xs uppercase text-muted-foreground">Tu clave de autorización</Label>
              <Input type="password" value={clave} onChange={(e) => setClave(e.target.value)} className="mt-1" placeholder="••••••" autoComplete="off" />
              <AyudaClaveAutorizacion />
            </div>
            <div className="flex items-end justify-end">
              <Button onClick={registrar} disabled={!listo} className="gap-1.5">
                {guardando ? <Loader2 className="h-4 w-4 animate-spin" /> : <RotateCcw className="h-4 w-4" />} Registrar devolución
              </Button>
            </div>
          </div>

          <p className="text-xs text-muted-foreground">
            Al registrarla: entran {cantidad || "—"} al inventario en el lote {linea.lote}, el pedido recupera esas unidades como
            pendientes y {orden?.quincenaAbierta ? "el peso de la orden baja en proporción" : "el peso de la orden NO se toca (quincena ya pagada)"}.
            Lo que la orden <b>autorizó</b> no cambia: queda el rastro de que salió y volvió.
          </p>
        </Card>
      )}
    </div>
  )
}
