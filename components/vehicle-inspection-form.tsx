"use client"

import type React from "react"
import { useState, useRef, useEffect, useCallback } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Checkbox } from "@/components/ui/checkbox"
import { Spinner } from "@/components/ui/spinner"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Truck, ClipboardCheck, Camera, Trash2, PenLine, Save, ClipboardList, History } from "lucide-react"
import { useToast } from "@/hooks/use-toast"
import { saveVehicleInspection, type VehicleInspectionInput } from "@/lib/vehicle-inspection-actions"
import { VehicleInspectionHistory } from "@/components/vehicle-inspection-history"
import { useAuth } from "@/components/auth-provider"

/**
 * Estructura exacta del payload que se envia a la server action,
 * tal como lo exige el requerimiento de la Empresa 1.
 */
type VehicleInspectionPayload = VehicleInspectionInput

// Criterios de calidad: clave del payload + etiqueta visible.
const CRITERIOS = [
  { key: "documentos_vehiculo", label: "Documentos del Vehiculo" },
  { key: "bpms_transportador", label: "BPM's de Transportador" },
  { key: "paredes_ok", label: "Paredes" },
  { key: "piso_ok", label: "Piso" },
  { key: "estibas_ok", label: "Estibas" },
  { key: "techo_carpa_ok", label: "Techo / Carpa" },
  { key: "ausencia_plagas", label: "Ausencia de Plagas" },
  { key: "ausencia_quimicos", label: "Ausencia de Sustancias Quimicas" },
] as const

type CriterioKey = (typeof CRITERIOS)[number]["key"]

// Foto seleccionada: archivo + URL de objeto para la vista previa.
interface SelectedPhoto {
  id: string
  file: File
  previewUrl: string
}

function getTodayISO(): string {
  const now = new Date()
  const offset = now.getTimezoneOffset()
  const local = new Date(now.getTime() - offset * 60 * 1000)
  return local.toISOString().split("T")[0]
}

export function VehicleInspectionForm() {
  const { selectedEmpresaId } = useAuth()
  const { toast } = useToast()

  const [fecha, setFecha] = useState(getTodayISO())
  const [horaIngreso, setHoraIngreso] = useState("")
  const [actividad, setActividad] = useState("")
  const [transportador, setTransportador] = useState("")
  const [placaVehiculo, setPlacaVehiculo] = useState("")
  const [responsable, setResponsable] = useState("")
  const [observaciones, setObservaciones] = useState("")

  const [criterios, setCriterios] = useState<Record<CriterioKey, boolean>>({
    documentos_vehiculo: false,
    bpms_transportador: false,
    paredes_ok: false,
    piso_ok: false,
    estibas_ok: false,
    techo_carpa_ok: false,
    ausencia_plagas: false,
    ausencia_quimicos: false,
  })

  const [fotos, setFotos] = useState<SelectedPhoto[]>([])
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [isSubmitting, setIsSubmitting] = useState(false)

  // --- Signature pad (canvas) ---
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const isDrawingRef = useRef(false)
  const hasSignatureRef = useRef(false)

  // Ajusta la resolucion interna del canvas al tamano renderizado para que
  // el trazo no se vea pixelado/desplazado en pantallas de alta densidad.
  const setupCanvas = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ratio = window.devicePixelRatio || 1
    const rect = canvas.getBoundingClientRect()
    canvas.width = rect.width * ratio
    canvas.height = rect.height * ratio
    const ctx = canvas.getContext("2d")
    if (ctx) {
      ctx.scale(ratio, ratio)
      ctx.lineWidth = 2.5
      ctx.lineCap = "round"
      ctx.lineJoin = "round"
      ctx.strokeStyle = "#111827"
    }
  }, [])

  useEffect(() => {
    setupCanvas()
    window.addEventListener("resize", setupCanvas)
    return () => window.removeEventListener("resize", setupCanvas)
  }, [setupCanvas])

  const getPointerPos = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current!
    const rect = canvas.getBoundingClientRect()
    return { x: e.clientX - rect.left, y: e.clientY - rect.top }
  }

  const startDrawing = (e: React.PointerEvent<HTMLCanvasElement>) => {
    e.preventDefault()
    const ctx = canvasRef.current?.getContext("2d")
    if (!ctx) return
    isDrawingRef.current = true
    const { x, y } = getPointerPos(e)
    ctx.beginPath()
    ctx.moveTo(x, y)
  }

  const draw = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!isDrawingRef.current) return
    e.preventDefault()
    const ctx = canvasRef.current?.getContext("2d")
    if (!ctx) return
    const { x, y } = getPointerPos(e)
    ctx.lineTo(x, y)
    ctx.stroke()
    hasSignatureRef.current = true
  }

  const stopDrawing = () => {
    isDrawingRef.current = false
  }

  const clearSignature = () => {
    const canvas = canvasRef.current
    const ctx = canvas?.getContext("2d")
    if (canvas && ctx) {
      ctx.clearRect(0, 0, canvas.width, canvas.height)
      hasSignatureRef.current = false
    }
  }

  // --- Fotos ---
  const handleFilesSelected = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || [])
    if (files.length === 0) return

    const nuevas: SelectedPhoto[] = []
    for (const file of files) {
      if (!file.type.startsWith("image/")) continue
      nuevas.push({
        id: `${file.name}-${Date.now()}-${Math.random().toString(36).slice(2)}`,
        file,
        previewUrl: URL.createObjectURL(file),
      })
    }
    setFotos((prev) => [...prev, ...nuevas])
    // Permite volver a seleccionar el mismo archivo si se elimina.
    if (fileInputRef.current) fileInputRef.current.value = ""
  }

  const removeFoto = (id: string) => {
    setFotos((prev) => {
      const target = prev.find((f) => f.id === id)
      if (target) URL.revokeObjectURL(target.previewUrl)
      return prev.filter((f) => f.id !== id)
    })
  }

  // Libera las URLs de objeto al desmontar para no fugar memoria.
  useEffect(() => {
    return () => {
      fotos.forEach((f) => URL.revokeObjectURL(f.previewUrl))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const fileToBase64 = (file: File): Promise<string> =>
    new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(reader.result as string)
      reader.onerror = reject
      reader.readAsDataURL(file)
    })

  const resetForm = () => {
    setFecha(getTodayISO())
    setHoraIngreso("")
    setActividad("")
    setTransportador("")
    setPlacaVehiculo("")
    setResponsable("")
    setObservaciones("")
    setCriterios({
      documentos_vehiculo: false,
      bpms_transportador: false,
      paredes_ok: false,
      piso_ok: false,
      estibas_ok: false,
      techo_carpa_ok: false,
      ausencia_plagas: false,
      ausencia_quimicos: false,
    })
    fotos.forEach((f) => URL.revokeObjectURL(f.previewUrl))
    setFotos([])
    clearSignature()
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!placaVehiculo.trim()) {
      toast({ title: "Error", description: "La placa del vehiculo es obligatoria", variant: "destructive" })
      return
    }
    if (!responsable.trim()) {
      toast({ title: "Error", description: "El responsable de revisar es obligatorio", variant: "destructive" })
      return
    }

    setIsSubmitting(true)
    try {
      // Convertimos las fotos a base64 y exportamos la firma como PNG.
      const fotosBase64 = await Promise.all(fotos.map((f) => fileToBase64(f.file)))
      const firma = hasSignatureRef.current && canvasRef.current ? canvasRef.current.toDataURL("image/png") : ""

      const payload: VehicleInspectionPayload = {
        fecha,
        hora_ingreso: horaIngreso,
        actividad,
        transportador,
        placa_vehiculo: placaVehiculo,
        documentos_vehiculo: criterios.documentos_vehiculo,
        bpms_transportador: criterios.bpms_transportador,
        paredes_ok: criterios.paredes_ok,
        piso_ok: criterios.piso_ok,
        estibas_ok: criterios.estibas_ok,
        techo_carpa_ok: criterios.techo_carpa_ok,
        ausencia_plagas: criterios.ausencia_plagas,
        ausencia_quimicos: criterios.ausencia_quimicos,
        observaciones,
        responsable,
        fotos: fotosBase64,
        firma,
      }

      const result = await saveVehicleInspection(payload, selectedEmpresaId ?? undefined)

      if (result.success) {
        toast({ title: "Inspeccion guardada", description: "El registro se guardo correctamente." })
        resetForm()
      } else {
        toast({
          title: "Error",
          description: result.error || "No se pudo guardar la inspeccion.",
          variant: "destructive",
        })
      }
    } catch (error) {
      console.error("Error guardando inspeccion:", error)
      toast({ title: "Error", description: "Error inesperado al guardar.", variant: "destructive" })
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="container mx-auto p-4 md:p-6 max-w-3xl space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-foreground">Inspeccion Sanitaria de Vehiculos</h2>
        <p className="text-sm text-muted-foreground">Verificacion en patio de maniobras</p>
      </div>

      <Tabs defaultValue="registro" className="space-y-6">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="registro" className="gap-2">
            <ClipboardList className="h-4 w-4" />
            Registro
          </TabsTrigger>
          <TabsTrigger value="historial" className="gap-2">
            <History className="h-4 w-4" />
            Historial
          </TabsTrigger>
        </TabsList>

        <TabsContent value="registro">
          <form onSubmit={handleSubmit} className="space-y-6">
        {/* Informacion General */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg text-primary">
              <Truck className="h-5 w-5" />
              Informacion General
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="fecha">Fecha</Label>
                <Input id="fecha" type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} className="h-11" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="hora_ingreso">Hora Ingreso</Label>
                <Input
                  id="hora_ingreso"
                  type="time"
                  value={horaIngreso}
                  onChange={(e) => setHoraIngreso(e.target.value)}
                  className="h-11"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="actividad">Actividad a Realizar</Label>
                <Input
                  id="actividad"
                  value={actividad}
                  onChange={(e) => setActividad(e.target.value)}
                  placeholder="Ej. Cargue de producto"
                  className="h-11"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="transportador">Transportador</Label>
                <Input
                  id="transportador"
                  value={transportador}
                  onChange={(e) => setTransportador(e.target.value)}
                  placeholder="Nombre del transportador"
                  className="h-11"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="placa_vehiculo">
                  Placa del Vehiculo <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="placa_vehiculo"
                  value={placaVehiculo}
                  onChange={(e) => setPlacaVehiculo(e.target.value.toUpperCase())}
                  placeholder="ABC123"
                  className="h-11"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="responsable">
                  Responsable de Revisar <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="responsable"
                  value={responsable}
                  onChange={(e) => setResponsable(e.target.value)}
                  placeholder="Nombre del responsable"
                  className="h-11"
                />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Criterios de Calidad */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg text-primary">
              <ClipboardCheck className="h-5 w-5" />
              Criterios de Calidad (Marque si cumple)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {CRITERIOS.map((criterio) => (
                <label
                  key={criterio.key}
                  htmlFor={criterio.key}
                  className="flex items-center gap-3 rounded-lg border border-border p-4 cursor-pointer transition-colors hover:bg-muted/50 has-[[data-state=checked]]:border-primary has-[[data-state=checked]]:bg-primary/5"
                >
                  <Checkbox
                    id={criterio.key}
                    checked={criterios[criterio.key]}
                    onCheckedChange={(checked) =>
                      setCriterios((prev) => ({ ...prev, [criterio.key]: checked === true }))
                    }
                    className="h-6 w-6"
                  />
                  <span className="text-sm font-medium leading-tight">{criterio.label}</span>
                </label>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Novedades */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg text-primary">Novedades</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <Label htmlFor="observaciones">Observaciones y/o Acciones Correctivas</Label>
              <Textarea
                id="observaciones"
                value={observaciones}
                onChange={(e) => setObservaciones(e.target.value)}
                rows={5}
                placeholder="Describa novedades o acciones correctivas..."
              />
            </div>
          </CardContent>
        </Card>

        {/* Evidencia Fotografica */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg text-primary">
              <Camera className="h-5 w-5" />
              Evidencia Fotografica
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              multiple
              capture="environment"
              onChange={handleFilesSelected}
              className="hidden"
              id="fotos-input"
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="flex w-full flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-border p-8 text-center transition-colors hover:border-primary hover:bg-muted/50"
            >
              <Camera className="h-8 w-8 text-muted-foreground" />
              <span className="text-sm font-medium text-foreground">Tomar o seleccionar fotos</span>
              <span className="text-xs text-muted-foreground">Puede agregar varias imagenes</span>
            </button>

            {fotos.length > 0 && (
              <div className="grid grid-cols-3 sm:grid-cols-4 gap-3">
                {fotos.map((foto) => (
                  <div key={foto.id} className="relative aspect-square overflow-hidden rounded-lg border border-border">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={foto.previewUrl} alt="Evidencia de inspeccion" className="h-full w-full object-cover" />
                    <button
                      type="button"
                      onClick={() => removeFoto(foto.id)}
                      className="absolute right-1 top-1 flex h-7 w-7 items-center justify-center rounded-full bg-destructive text-destructive-foreground shadow-md"
                      aria-label="Eliminar foto"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Firma del Responsable */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg text-primary">
              <PenLine className="h-5 w-5" />
              Firma del Responsable
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="rounded-lg border-2 border-border bg-card">
              <canvas
                ref={canvasRef}
                onPointerDown={startDrawing}
                onPointerMove={draw}
                onPointerUp={stopDrawing}
                onPointerLeave={stopDrawing}
                className="h-44 w-full touch-none rounded-lg"
              />
            </div>
            <Button type="button" variant="outline" size="sm" onClick={clearSignature}>
              <Trash2 className="h-4 w-4 mr-2" />
              Limpiar firma
            </Button>
          </CardContent>
        </Card>

        <Button type="submit" size="lg" className="w-full h-14 text-base" disabled={isSubmitting}>
          {isSubmitting ? (
            <>
              <Spinner className="mr-2 h-5 w-5" />
              Guardando...
            </>
          ) : (
            <>
              <Save className="mr-2 h-5 w-5" />
              Guardar Inspeccion
            </>
          )}
        </Button>
      </form>
        </TabsContent>

        <TabsContent value="historial">
          <VehicleInspectionHistory />
        </TabsContent>
      </Tabs>
    </div>
  )
}
