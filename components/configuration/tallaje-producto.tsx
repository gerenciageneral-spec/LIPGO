"use client"

// Repartir el stock de un producto entre sus tallas.
//
// El reparto es una salida del producto padre y una entrada por cada talla, con
// el MISMO lote y la MISMA ubicacion. Reusa el codigo 309 del modulo de
// Transacciones de Inventario, que es el que ya sabe mover stock de un producto
// a otro conservando la trazabilidad. Ver scripts/productos_tallaje.sql.

import { useCallback, useEffect, useMemo, useState } from "react"
import { useAuth } from "@/components/auth-provider"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { useToast } from "@/hooks/use-toast"
import { AlertTriangle, Loader2, Plus, Ruler, X } from "lucide-react"
import {
  getOrigenesDisponibles,
  getTallasDeProducto,
  getTallasSugeridas,
  repartirEnTallas,
} from "@/lib/tallaje-actions"
import type { OrigenDisponible, ProductoTalla } from "@/lib/tallaje-tipos"

interface FilaTalla {
  productoId: number | null
  talla: string
  cantidad: string
}

export function TallajeProducto({
  producto,
  abierto,
  onCerrar,
  onHecho,
}: {
  producto: { id: number; nombre: string; codigo?: string | null }
  abierto: boolean
  onCerrar: () => void
  onHecho?: () => void
}) {
  const { toast } = useToast()
  const { selectedEmpresaId } = useAuth()

  const [cargando, setCargando] = useState(true)
  const [guardando, setGuardando] = useState(false)
  const [origenes, setOrigenes] = useState<OrigenDisponible[]>([])
  const [existentes, setExistentes] = useState<ProductoTalla[]>([])
  const [sugeridas, setSugeridas] = useState<string[]>([])
  const [origenIdx, setOrigenIdx] = useState<number>(-1)
  const [filas, setFilas] = useState<FilaTalla[]>([])
  const [clave, setClave] = useState("")
  const [motivo, setMotivo] = useState("")

  const cargar = useCallback(async () => {
    if (!selectedEmpresaId) return
    setCargando(true)
    const [orig, tallas, sug] = await Promise.all([
      getOrigenesDisponibles(selectedEmpresaId, producto.nombre),
      getTallasDeProducto(producto.id),
      getTallasSugeridas(selectedEmpresaId),
    ])
    if (orig.success) setOrigenes(orig.data)
    if (tallas.success) setExistentes(tallas.data)
    setSugeridas(sug)

    // Se arranca con las tallas que ya existen (en cero) para no volver a
    // escribirlas; si no hay ninguna, con las sugeridas del cliente.
    const base: FilaTalla[] = tallas.success && tallas.data.length
      ? tallas.data.map((t) => ({ productoId: t.id, talla: t.talla, cantidad: "" }))
      : sug.map((s) => ({ productoId: null, talla: s, cantidad: "" }))
    setFilas(base.length ? base : [{ productoId: null, talla: "", cantidad: "" }])
    setOrigenIdx(orig.success && orig.data.length === 1 ? 0 : -1)
    setCargando(false)
  }, [selectedEmpresaId, producto.id, producto.nombre])

  useEffect(() => {
    if (abierto) {
      setClave("")
      setMotivo("")
      cargar()
    }
  }, [abierto, cargar])

  const origen = origenIdx >= 0 ? origenes[origenIdx] : null
  const total = useMemo(
    () => filas.reduce((s, f) => s + (Math.abs(Number(f.cantidad)) || 0), 0),
    [filas],
  )
  const restante = (origen?.stock ?? 0) - total
  const excede = origen != null && total > origen.stock

  const repetidas = useMemo(() => {
    const vistas = new Set<string>()
    const dup = new Set<string>()
    for (const f of filas) {
      const t = f.talla.trim().toLowerCase()
      if (!t) continue
      if (vistas.has(t)) dup.add(f.talla.trim())
      vistas.add(t)
    }
    return dup
  }, [filas])

  const puedeGuardar =
    !!origen && total > 0 && !excede && repetidas.size === 0 && !!clave.trim() && !!motivo.trim()

  function set(i: number, campo: keyof FilaTalla, valor: string) {
    setFilas((prev) => prev.map((f, k) => (k === i ? { ...f, [campo]: valor } : f)))
  }

  async function guardar() {
    if (!origen || !selectedEmpresaId) return
    setGuardando(true)
    const res = await repartirEnTallas({
      selectedEmpresaId,
      productoPadreId: producto.id,
      lote: origen.lote,
      location: origen.location,
      asignaciones: filas
        .filter((f) => f.talla.trim() && Number(f.cantidad) > 0)
        .map((f) => ({
          productoId: f.productoId,
          talla: f.talla.trim(),
          cantidad: Number(f.cantidad),
        })),
      clave: clave.trim(),
      motivo: motivo.trim(),
    })
    setGuardando(false)

    if (!res.success) {
      toast({ title: "No se pudo repartir", description: res.message, variant: "destructive" })
      return
    }
    toast({
      title: "Reparto hecho",
      description: res.tallasCreadas?.length
        ? `${res.message} Se crearon las tallas: ${res.tallasCreadas.join(", ")}.`
        : res.message,
    })
    onHecho?.()
    onCerrar()
  }

  return (
    <Dialog open={abierto} onOpenChange={(o) => !o && onCerrar()}>
      <DialogContent className="flex max-h-[92vh] max-w-2xl flex-col overflow-hidden">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Ruler className="h-5 w-5" />
            Repartir en tallas
          </DialogTitle>
          <DialogDescription>
            {producto.nombre}
            {producto.codigo ? ` · ${producto.codigo}` : ""}
          </DialogDescription>
        </DialogHeader>

        {cargando ? (
          <div className="flex justify-center py-10">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : origenes.length === 0 ? (
          <div className="rounded-md border border-amber-300 bg-amber-50 p-4 text-sm">
            <p className="flex items-center gap-2 font-medium text-amber-900">
              <AlertTriangle className="h-4 w-4" />
              Este producto no tiene stock
            </p>
            <p className="mt-1 text-xs text-amber-800">
              Solo se puede repartir stock que exista. Registra primero la entrada del producto y
              vuelve a intentarlo.
            </p>
          </div>
        ) : (
          <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto">
            {/* De donde sale */}
            <div>
              <Label className="text-xs">Lote y ubicación de origen</Label>
              <select
                value={origenIdx}
                onChange={(e) => setOrigenIdx(Number(e.target.value))}
                className="mt-1 w-full rounded border bg-background px-2 py-1.5 text-sm"
              >
                <option value={-1}>Selecciona de dónde sale…</option>
                {origenes.map((o, i) => (
                  <option key={`${o.lote}|${o.location}`} value={i}>
                    Lote {o.lote} · {o.location} · {o.stock} disponibles
                  </option>
                ))}
              </select>
              <p className="mt-1 text-[11px] text-muted-foreground">
                Las tallas conservan este lote: así no se pierde la trazabilidad ni la fecha de
                vencimiento.
              </p>
            </div>

            {/* El reparto */}
            <div>
              <div className="mb-1 flex items-center justify-between">
                <Label className="text-xs">Cantidad por talla</Label>
                {origen && (
                  <span
                    className={`text-xs tabular-nums ${excede ? "font-medium text-red-600" : "text-muted-foreground"}`}
                  >
                    {total} de {origen.stock} · quedan {restante}
                  </span>
                )}
              </div>

              <div className="space-y-1.5">
                {filas.map((f, i) => {
                  const dup = f.talla.trim() && repetidas.has(f.talla.trim())
                  return (
                    <div key={i} className="flex items-center gap-2">
                      <Input
                        placeholder="Talla"
                        value={f.talla}
                        onChange={(e) => set(i, "talla", e.target.value)}
                        disabled={f.productoId != null}
                        className={`h-8 flex-1 text-sm ${dup ? "border-red-400" : ""}`}
                      />
                      <Input
                        type="number"
                        min={0}
                        placeholder="0"
                        value={f.cantidad}
                        onChange={(e) => set(i, "cantidad", e.target.value)}
                        className="h-8 w-24 text-sm"
                      />
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 shrink-0"
                        onClick={() => setFilas((p) => p.filter((_, k) => k !== i))}
                        aria-label="Quitar talla"
                      >
                        <X className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  )
                })}
              </div>

              {repetidas.size > 0 && (
                <p className="mt-1 text-[11px] text-red-600">
                  Talla repetida: {Array.from(repetidas).join(", ")}
                </p>
              )}

              <Button
                variant="outline"
                size="sm"
                className="mt-2"
                onClick={() => setFilas((p) => [...p, { productoId: null, talla: "", cantidad: "" }])}
              >
                <Plus className="mr-1.5 h-3.5 w-3.5" />
                Agregar talla
              </Button>

              {existentes.length > 0 && (
                <p className="mt-2 text-[11px] text-muted-foreground">
                  Las tallas que ya existen no se pueden renombrar aquí. Las nuevas se crean como
                  producto al repartir.
                </p>
              )}
            </div>

            {/* Autorización: esto mueve stock real */}
            <div className="rounded-md border p-2">
              <p className="mb-2 text-[11px] text-muted-foreground">
                Repartir mueve stock real: se registra una salida del producto y una entrada por
                cada talla.
              </p>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label className="text-xs">Clave del responsable</Label>
                  <Input
                    type="password"
                    value={clave}
                    onChange={(e) => setClave(e.target.value)}
                    className="mt-1 h-8 text-sm"
                  />
                </div>
                <div>
                  <Label className="text-xs">Motivo</Label>
                  <Input
                    value={motivo}
                    onChange={(e) => setMotivo(e.target.value)}
                    placeholder="Por qué se reparte"
                    className="mt-1 h-8 text-sm"
                  />
                </div>
              </div>
            </div>
          </div>
        )}

        <div className="flex justify-end gap-2 border-t pt-3">
          <Button variant="outline" onClick={onCerrar} disabled={guardando}>
            Cerrar
          </Button>
          <Button onClick={guardar} disabled={!puedeGuardar || guardando} className="gap-1.5">
            {guardando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Ruler className="h-4 w-4" />}
            Repartir {total > 0 ? `(${total})` : ""}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

export default TallajeProducto
