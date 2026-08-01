"use client"

// Formulario para registrar una actividad de mantenimiento y para cerrar una
// pendiente. Es el MISMO componente que usan el módulo de escritorio y la
// pantalla que abre el QR en el celular: si fueran dos, se irían separando.
//
// Mobile-first: campos a una columna, botones grandes, y la cámara del
// teléfono directo con capture="environment".

import { useRef, useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Camera, Loader2, X } from "lucide-react"
import { useToast } from "@/hooks/use-toast"
import { registrarActividad, cerrarActividad, type TipoActividad } from "@/lib/montacargas-actions"

export const ETIQUETA_TIPO: Record<string, string> = {
  preventivo: "Mantenimiento preventivo",
  correctivo: "Mantenimiento correctivo",
  revision: "Revisión",
  falla_reportada: "Falla reportada",
}

/** Los que abren un pendiente. Se muestra el aviso para que nadie se sorprenda. */
const ABREN_PENDIENTE = new Set(["correctivo", "falla_reportada"])

/**
 * Comprime antes de subir. Un celular moderno saca fotos de 4-8 MB y varias
 * juntas revientan el límite de la función serverless; además la foto de un
 * hallazgo no necesita 12 megapíxeles. Calcado de gestion-facturas.tsx.
 */
async function comprimir(file: File): Promise<File> {
  if (!file.type.startsWith("image/") || file.size <= 1.2 * 1024 * 1024) return file
  try {
    const img = await new Promise<HTMLImageElement>((res, rej) => {
      const r = new FileReader()
      r.onload = () => {
        const i = new Image()
        i.onload = () => res(i)
        i.onerror = rej
        i.src = String(r.result)
      }
      r.onerror = rej
      r.readAsDataURL(file)
    })
    const MAX = 1600
    const escala = Math.min(1, MAX / Math.max(img.width, img.height))
    const canvas = document.createElement("canvas")
    canvas.width = Math.round(img.width * escala)
    canvas.height = Math.round(img.height * escala)
    canvas.getContext("2d")?.drawImage(img, 0, 0, canvas.width, canvas.height)
    const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, "image/jpeg", 0.85))
    // Si comprimir no ayudó, se conserva el original.
    if (!blob || blob.size >= file.size) return file
    return new File([blob], file.name.replace(/\.\w+$/, "") + ".jpg", { type: "image/jpeg" })
  } catch {
    return file // ante cualquier fallo, se sube tal cual: mejor pesada que perdida
  }
}

interface FotoSubida {
  url: string
  nombre: string | null
}

export function RegistroActividad({
  idempresa,
  equipoId,
  modo,
  actividadId,
  onListo,
  onCancelar,
}: {
  idempresa: number
  equipoId: number
  /** "registrar" crea una actividad; "cerrar" resuelve una pendiente. */
  modo: "registrar" | "cerrar"
  actividadId?: number
  onListo: () => void
  onCancelar?: () => void
}) {
  const { toast } = useToast()
  const inputFile = useRef<HTMLInputElement>(null)
  const [tipo, setTipo] = useState<TipoActividad>("revision")
  const [descripcion, setDescripcion] = useState("")
  const [solucion, setSolucion] = useState("")
  const [horometro, setHorometro] = useState("")
  const [proveedor, setProveedor] = useState("")
  const [costo, setCosto] = useState("")
  const [repuestos, setRepuestos] = useState("")
  const [fotos, setFotos] = useState<FotoSubida[]>([])
  const [subiendo, setSubiendo] = useState(false)
  const [guardando, setGuardando] = useState(false)

  const subirFotos = async (files: FileList | null) => {
    if (!files?.length) return
    setSubiendo(true)
    const nuevas: FotoSubida[] = []
    // De a una: el límite del cuerpo de la función es por petición.
    for (const f of Array.from(files).slice(0, 10)) {
      try {
        const fd = new FormData()
        fd.append("file", await comprimir(f))
        fd.append("equipoId", String(equipoId))
        const r = await fetch("/api/montacargas/upload-foto", { method: "POST", body: fd })
        const j = await r.json()
        if (j.success) nuevas.push({ url: j.url, nombre: j.nombre })
        else toast({ title: "No se pudo subir una foto", description: j.error, variant: "destructive" })
      } catch {
        toast({ title: "No se pudo subir una foto", variant: "destructive" })
      }
    }
    setFotos((p) => [...p, ...nuevas])
    setSubiendo(false)
    if (inputFile.current) inputFile.current.value = ""
  }

  const guardar = async () => {
    setGuardando(true)
    const r =
      modo === "registrar"
        ? await registrarActividad({ idempresa, equipoId, tipo, descripcion, horometro, proveedor, costo, fotos })
        : await cerrarActividad({ idempresa, actividadId: actividadId!, equipoId, solucion, costo, repuestos, proveedor, fotos })
    setGuardando(false)
    if (r.success) {
      toast({
        title: modo === "registrar" ? "Actividad registrada" : "Pendiente cerrado",
        description:
          modo === "registrar" && ABREN_PENDIENTE.has(tipo)
            ? "Queda como PENDIENTE hasta que alguien registre la solución."
            : undefined,
      })
      onListo()
    } else {
      toast({ title: "No se pudo guardar", description: r.error, variant: "destructive" })
    }
  }

  const puedeGuardar =
    !guardando && !subiendo && (modo === "registrar" ? descripcion.trim().length > 0 : solucion.trim().length > 0)

  return (
    <div className="space-y-4">
      {modo === "registrar" && (
        <div className="space-y-1.5">
          <Label>Tipo de actividad</Label>
          <Select value={tipo} onValueChange={(v) => setTipo(v as TipoActividad)}>
            <SelectTrigger className="h-11">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(ETIQUETA_TIPO).map(([k, v]) => (
                <SelectItem key={k} value={k}>
                  {v}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {ABREN_PENDIENTE.has(tipo) && (
            <p className="text-xs text-amber-700 dark:text-amber-400">
              Queda como <strong>pendiente</strong> hasta que se registre la solución.
            </p>
          )}
        </div>
      )}

      <div className="space-y-1.5">
        <Label>{modo === "registrar" ? "¿Qué se encontró o qué se hizo?" : "¿Qué se hizo para resolverlo?"}</Label>
        <Textarea
          value={modo === "registrar" ? descripcion : solucion}
          onChange={(e) => (modo === "registrar" ? setDescripcion(e.target.value) : setSolucion(e.target.value))}
          rows={4}
          placeholder={
            modo === "registrar"
              ? "Ej.: fuga de aceite en el cilindro de elevación, se detiene el equipo"
              : "Ej.: se cambió el empaque del cilindro y se probó en vacío"
          }
        />
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {modo === "registrar" && (
          <div className="space-y-1.5">
            <Label>Horómetro</Label>
            <Input
              type="number"
              inputMode="decimal"
              value={horometro}
              onChange={(e) => setHorometro(e.target.value)}
              placeholder="Lectura actual"
              className="h-11"
            />
            <p className="text-[11px] text-muted-foreground">Con esto se calcula el próximo preventivo.</p>
          </div>
        )}
        <div className="space-y-1.5">
          <Label>Proveedor / técnico</Label>
          <Input value={proveedor} onChange={(e) => setProveedor(e.target.value)} className="h-11" />
        </div>
        <div className="space-y-1.5">
          <Label>Costo</Label>
          <Input type="number" inputMode="decimal" value={costo} onChange={(e) => setCosto(e.target.value)} className="h-11" />
        </div>
        {modo === "cerrar" && (
          <div className="space-y-1.5">
            <Label>Repuestos usados</Label>
            <Input value={repuestos} onChange={(e) => setRepuestos(e.target.value)} className="h-11" />
          </div>
        )}
      </div>

      <div className="space-y-2">
        <Label>Fotos {modo === "registrar" ? "del hallazgo" : "del arreglo"}</Label>
        <input
          ref={inputFile}
          type="file"
          accept="image/*"
          capture="environment"
          multiple
          className="hidden"
          onChange={(e) => subirFotos(e.target.files)}
        />
        <Button type="button" variant="outline" className="h-11 w-full" onClick={() => inputFile.current?.click()} disabled={subiendo}>
          {subiendo ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Camera className="mr-2 h-4 w-4" />}
          {subiendo ? "Subiendo…" : "Tomar o adjuntar fotos"}
        </Button>
        {fotos.length > 0 && (
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
            {fotos.map((f, i) => (
              <div key={f.url} className="group relative">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={f.url} alt={f.nombre || `Foto ${i + 1}`} className="h-20 w-full rounded-md border object-cover" />
                <button
                  type="button"
                  onClick={() => setFotos((p) => p.filter((x) => x.url !== f.url))}
                  className="absolute -right-1.5 -top-1.5 rounded-full bg-red-600 p-0.5 text-white shadow"
                  aria-label="Quitar foto"
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="flex gap-2 pt-1">
        <Button className="h-11 flex-1" onClick={guardar} disabled={!puedeGuardar}>
          {guardando && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          {modo === "registrar" ? "Registrar" : "Cerrar pendiente"}
        </Button>
        {onCancelar && (
          <Button variant="outline" className="h-11" onClick={onCancelar} disabled={guardando}>
            Cancelar
          </Button>
        )}
      </div>
    </div>
  )
}

export default RegistroActividad
