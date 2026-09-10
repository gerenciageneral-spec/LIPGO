"use client"

// Asociar un documento del Mapa de Procesos a los numerales de la Matriz
// Integrada.
//
// La asociación se guarda en `sig_documento_cobertura`, la MISMA tabla que ya
// usa la Matriz Integrada para saber qué documento cubre cada requisito. Por eso
// la conexión funciona en los dos sentidos sin nada extra: lo que se asocia acá
// aparece en la celda del numeral en la Matriz, y al revés.
//
// La unidad de asociación es el par (requisito, norma), no el numeral suelto: un
// mismo numeral puede aplicar en ISO 9001, 14001 y 45001, y un documento puede
// cubrir una, dos o las tres.

import { useCallback, useEffect, useMemo, useState } from "react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { useToast } from "@/hooks/use-toast"
import { Link2, Loader2, X } from "lucide-react"
import {
  desvincularNumeral,
  getNumeralesDeDocumento,
  getNumeralesDisponibles,
  type NumeralVinculado,
  type OpcionNumeral,
} from "@/lib/mapa-procesos-actions"
import { vincularDocumentoAObjetivos } from "@/lib/sig-actions"

/** Color por norma, para distinguirlas de un vistazo. */
const COLOR_NORMA: Record<string, string> = {
  ISO9001: "#0a6f6f",
  ISO14001: "#1d7c8b",
  ISO45001: "#44A6B0",
}

export function NumeralesDocumento({
  documentoId,
  documentoNombre,
  abierto,
  onCerrar,
  onCambio,
}: {
  documentoId: string
  documentoNombre: string
  abierto: boolean
  onCerrar: () => void
  onCambio?: () => void
}) {
  const { toast } = useToast()
  const [vinculados, setVinculados] = useState<NumeralVinculado[]>([])
  const [opciones, setOpciones] = useState<OpcionNumeral[]>([])
  const [cargando, setCargando] = useState(true)
  const [guardando, setGuardando] = useState(false)
  const [buscar, setBuscar] = useState("")
  const [seleccion, setSeleccion] = useState<Set<string>>(new Set())

  const clave = (o: { requisitoId: number; normaId: number }) => `${o.requisitoId}|${o.normaId}`

  const cargar = useCallback(async () => {
    setCargando(true)
    const [resVin, resOpc] = await Promise.all([
      getNumeralesDeDocumento(documentoId),
      getNumeralesDisponibles(),
    ])
    if (resVin.success && resVin.data) setVinculados(resVin.data)
    if (resOpc.success && resOpc.data) setOpciones(resOpc.data)
    setSeleccion(new Set())
    setBuscar("")
    setCargando(false)
  }, [documentoId])

  useEffect(() => {
    if (abierto) cargar()
  }, [abierto, cargar])

  const yaVinculados = useMemo(
    () => new Set(vinculados.map((v) => clave(v))),
    [vinculados],
  )

  // Fuera los que ya están asociados: volver a ofrecerlos solo confunde.
  const disponibles = useMemo(() => {
    const t = buscar.trim().toLowerCase()
    return opciones
      .filter((o) => !yaVinculados.has(clave(o)))
      .filter(
        (o) =>
          !t ||
          o.numeral.toLowerCase().includes(t) ||
          (o.titulo ?? "").toLowerCase().includes(t) ||
          o.normaCodigo.toLowerCase().includes(t),
      )
  }, [opciones, yaVinculados, buscar])

  const alternar = (o: OpcionNumeral) =>
    setSeleccion((prev) => {
      const s = new Set(prev)
      const k = clave(o)
      if (s.has(k)) s.delete(k)
      else s.add(k)
      return s
    })

  const asociar = async () => {
    const elegidos = opciones.filter((o) => seleccion.has(clave(o)))
    if (elegidos.length === 0) return
    setGuardando(true)
    const res = await vincularDocumentoAObjetivos(
      documentoId,
      elegidos.map((o) => ({ requisitoId: o.requisitoId, normaId: o.normaId })),
    )
    setGuardando(false)
    if (!res.success) {
      toast({ title: "No se pudo asociar", description: res.error, variant: "destructive" })
      return
    }
    toast({
      title: `${res.vinculados} numeral(es) asociado(s)`,
      description: "El documento ya aparece en esas celdas de la Matriz Integrada.",
    })
    cargar()
    onCambio?.()
  }

  const quitar = async (v: NumeralVinculado) => {
    const res = await desvincularNumeral(v.coberturaId)
    if (!res.success) {
      toast({ title: "No se pudo quitar", description: res.message, variant: "destructive" })
      return
    }
    toast({ title: "Asociación retirada", description: `${v.numeral} · ${v.normaCodigo}` })
    cargar()
    onCambio?.()
  }

  return (
    <Dialog open={abierto} onOpenChange={(o) => !o && onCerrar()}>
      <DialogContent className="flex max-h-[90vh] max-w-2xl flex-col overflow-hidden">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Link2 className="h-5 w-5" />
            Numerales de la norma
          </DialogTitle>
          <DialogDescription>{documentoNombre}</DialogDescription>
        </DialogHeader>

        {cargando ? (
          <div className="flex justify-center py-10">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-hidden">
            {/* Ya asociados */}
            <div>
              <p className="mb-1.5 text-xs font-medium">
                Asociado a {vinculados.length} numeral(es)
              </p>
              {vinculados.length === 0 ? (
                <p className="text-xs text-muted-foreground">
                  Todavía no está asociado a ningún requisito de la norma.
                </p>
              ) : (
                <div className="flex flex-wrap gap-1.5">
                  {vinculados.map((v) => (
                    <span
                      key={v.coberturaId}
                      className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs text-white"
                      style={{ background: COLOR_NORMA[v.normaCodigo] ?? "#14606f" }}
                      title={v.tituloRequisito ?? undefined}
                    >
                      <span className="font-mono font-medium">{v.numeral}</span>
                      <span className="opacity-80">{v.normaCodigo}</span>
                      <button
                        type="button"
                        onClick={() => quitar(v)}
                        aria-label={`Quitar ${v.numeral} de ${v.normaCodigo}`}
                        className="rounded-full p-0.5 hover:bg-white/25"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </span>
                  ))}
                </div>
              )}
            </div>

            <div className="border-t pt-3">
              <p className="mb-1.5 text-xs font-medium">Agregar numerales</p>
              <Input
                placeholder="Buscar por numeral, tema o norma…"
                value={buscar}
                onChange={(e) => setBuscar(e.target.value)}
                className="mb-2"
              />

              <div className="max-h-64 min-h-0 divide-y overflow-y-auto rounded-md border">
                {disponibles.length === 0 ? (
                  <p className="p-4 text-center text-xs text-muted-foreground">
                    {opciones.length === 0
                      ? "No hay requisitos cargados en la Matriz Integrada."
                      : "No hay numerales que coincidan."}
                  </p>
                ) : (
                  disponibles.slice(0, 200).map((o) => (
                    <label
                      key={clave(o)}
                      className="flex cursor-pointer items-center gap-2 p-2 text-sm hover:bg-muted/50"
                    >
                      <input
                        type="checkbox"
                        checked={seleccion.has(clave(o))}
                        onChange={() => alternar(o)}
                      />
                      <span className="font-mono text-xs font-medium">{o.numeral}</span>
                      <Badge
                        variant="outline"
                        className="text-[10px]"
                        style={{ borderColor: COLOR_NORMA[o.normaCodigo] ?? undefined }}
                      >
                        {o.normaCodigo}
                      </Badge>
                      <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
                        {o.titulo}
                      </span>
                    </label>
                  ))
                )}
              </div>
            </div>
          </div>
        )}

        <div className="flex justify-end gap-2 border-t pt-3">
          <Button variant="outline" onClick={onCerrar} disabled={guardando}>
            Cerrar
          </Button>
          <Button onClick={asociar} disabled={seleccion.size === 0 || guardando} className="gap-1.5">
            {guardando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Link2 className="h-4 w-4" />}
            Asociar ({seleccion.size})
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

export default NumeralesDocumento
