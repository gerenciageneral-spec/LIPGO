"use client"

import { useEffect, useMemo, useRef, useState, useTransition } from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  Loader2,
  Wallet,
  Send,
  Clock,
  XCircle,
  CheckCircle2,
  DollarSign,
  Info,
  Mail,
  PenLine,
  Upload,
  FileDown,
  Eraser,
  Receipt,
} from "lucide-react"
import { usePortal } from "@/components/portal/portal-provider"
import { useToast } from "@/hooks/use-toast"
import {
  getAnticiposPorColaborador,
  createSolicitudAnticipo,
  subirFirmaAnticipo,
  type SolicitudTrabajador,
} from "@/lib/gestion-solicitudes-actions"
import { tieneNovedadesUltimos30Dias } from "@/lib/portal-actions"

/**
 * Schema Zod: monto obligatorio, positivo y no mayor a 300.000 COP.
 */
const MAX_ANTICIPO = 300000
const anticipoSchema = z.object({
  monto: z.coerce
    .number({
      invalid_type_error: "Ingresa un monto valido",
    })
    .positive("El monto debe ser mayor a cero")
    .max(MAX_ANTICIPO, `El monto maximo es ${MAX_ANTICIPO.toLocaleString("es-CO")}`),
})

type AnticipoForm = z.infer<typeof anticipoSchema>

/**
 * Helper: determina si una fecha ISO/string corresponde al mes y anio
 * actuales en zona horaria local del navegador. Tolera valores invalidos.
 */
function esDelMesActual(iso: string | null | undefined): boolean {
  if (!iso) return false
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return false
  const ahora = new Date()
  return d.getMonth() === ahora.getMonth() && d.getFullYear() === ahora.getFullYear()
}

export default function PortalAnticiposPage() {
  const { colaborador } = usePortal()
  const { toast } = useToast()
  const [loading, setLoading] = useState(true)
  const [anticipos, setAnticipos] = useState<SolicitudTrabajador[]>([])
  const [isPending, startTransition] = useTransition()
  // Bloqueo por novedades de asistencia en los ultimos 30 dias.
  // Cargamos el flag en paralelo a los anticipos y, si es true,
  // ocultamos el formulario y mostramos un Alert. La cantidad se usa
  // solo para enriquecer el mensaje (no es estrictamente necesaria).
  const [novedades30, setNovedades30] = useState<{
    tiene: boolean
    cantidad: number
  }>({ tiene: false, cantidad: 0 })

  // Dialog para subir firma sobre un anticipo aprobado.
  const [firmaDialog, setFirmaDialog] = useState<{
    open: boolean
    solicitud: SolicitudTrabajador | null
  }>({ open: false, solicitud: null })

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
    watch,
  } = useForm<AnticipoForm>({
    resolver: zodResolver(anticipoSchema),
    defaultValues: { monto: 0 },
  })

  const montoActual = watch("monto")

  const load = async () => {
    if (!colaborador?.colaborador_id) return
    // Cargamos anticipos y flag de novedades en paralelo. La consulta
    // de novedades usa `identificacion` (no el id) porque
    // `registroasistencia` indexa por cedula.
    const [resAnticipos, resNov] = await Promise.all([
      getAnticiposPorColaborador(colaborador.colaborador_id),
      colaborador.identificacion
        ? tieneNovedadesUltimos30Dias(colaborador.identificacion)
        : Promise.resolve({ tieneNovedades: false, cantidad: 0 }),
    ])
    setAnticipos(resAnticipos.data)
    setNovedades30({ tiene: resNov.tieneNovedades, cantidad: resNov.cantidad })
    setLoading(false)
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [colaborador?.colaborador_id])

  /**
   * Solicitud del mes actual que CONSUME el cupo mensual: un anticipo creado
   * dentro del mes corriente que no haya sido rechazado. Se usa para bloquear
   * el formulario y mostrar el Alert con la politica mensual.
   *
   * Las RECHAZADAS no cuentan. La politica es una solicitud atendida por mes,
   * no un intento por mes: si a alguien le niegan el anticipo, quedaba sin
   * poder volver a pedirlo hasta el mes siguiente aunque nunca hubiera
   * recibido un peso. Las pendientes SI bloquean —hay uno en curso— y las
   * aprobadas/completadas tambien, que es el caso que la politica cubre.
   */
  const solicitudDelMes = useMemo(
    () => anticipos.find((a) => a.estado !== "rechazada" && esDelMesActual(a.created_at)),
    [anticipos],
  )

  /** Rechazada de este mes: solo para explicar por que el formulario sigue
   *  disponible. Antes bloqueaba, asi que sin esta nota parece un error. */
  const rechazadaDelMes = useMemo(
    () => anticipos.find((a) => a.estado === "rechazada" && esDelMesActual(a.created_at)),
    [anticipos],
  )

  const onSubmit = (values: AnticipoForm) => {
    if (!colaborador?.colaborador_id) return
    // Cinturon de seguridad: aunque el formulario este oculto cuando hay
    // solicitud del mes, validamos en el handler para evitar duplicados.
    if (solicitudDelMes) {
      toast({
        title: "Solicitud bloqueada",
        description:
          "Ya tienes una solicitud de anticipo en curso o aprobada este mes. Solo se permite una mensual.",
        variant: "destructive",
      })
      return
    }
    // Bloqueo por novedades en los ultimos 30 dias. Misma logica:
    // ademas de ocultar el formulario, validamos en el submit por si
    // el flag cambio entre la carga y el envio.
    if (novedades30.tiene) {
      toast({
        title: "No cumples con el requisito",
        description:
          "Tienes novedades en asistencia en los últimos 30 días, no cumples con el requisito para solicitar anticipo",
        variant: "destructive",
      })
      return
    }
    startTransition(async () => {
      const res = await createSolicitudAnticipo(colaborador.colaborador_id, values.monto)
      if (!res.success) {
        toast({
          title: "No se pudo enviar",
          description: res.error || "Intenta de nuevo.",
          variant: "destructive",
        })
        return
      }
      toast({
        title: "Anticipo solicitado",
        description:
          "Tu solicitud fue enviada a RRHH. Recibiras una notificacion cuando sea procesada.",
      })
      reset({ monto: 0 })
      await load()
    })
  }

  return (
    <div className="space-y-6">
      {/* Bloqueo por novedades de asistencia en los ultimos 30 dias.
          Tiene prioridad sobre el bloqueo mensual: si ambos aplican,
          mostramos primero este porque el mensaje es mas explicito
          sobre el requisito de elegibilidad. */}
      {!loading && novedades30.tiene ? (
        <Alert className="border-red-300 bg-red-50 text-red-900">
          <XCircle className="h-4 w-4 !text-red-700" />
          <AlertTitle className="text-red-900 font-semibold">
            No cumples con el requisito
          </AlertTitle>
          <AlertDescription className="text-red-800">
            Tienes novedades en asistencia en los últimos 30 días, no cumples
            con el requisito para solicitar anticipo. Las vacaciones no cuentan
            como novedad para este requisito.
          </AlertDescription>
        </Alert>
      ) : !loading && solicitudDelMes ? (
        <Alert className="border-amber-300 bg-amber-50 text-amber-900">
          <Info className="h-4 w-4 !text-amber-700" />
          <AlertTitle className="text-amber-900 font-semibold">
            Ya tienes una solicitud este mes
          </AlertTitle>
          <AlertDescription className="text-amber-800">
            {solicitudDelMes.estado === "pendiente"
              ? "Tienes una solicitud de anticipo en revisión este mes. Espera la respuesta antes de enviar otra: solo se permite una solicitud mensual según las políticas de la empresa."
              : "Ya tienes un anticipo aprobado este mes. Solo se permite una solicitud mensual según las políticas de la empresa."}
          </AlertDescription>
        </Alert>
      ) : (
        // Formulario solo visible cuando NO hay bloqueo
        <Card className="border-primary/20 bg-gradient-to-br from-emerald-50/50 to-transparent">
          <CardHeader className="pb-3">
            <div className="flex items-start gap-3">
              <div className="rounded-xl bg-emerald-100 p-2.5">
                <Wallet className="h-5 w-5 text-emerald-700" />
              </div>
              <div>
                <CardTitle className="text-lg">Solicitar Anticipo</CardTitle>
                <CardDescription className="mt-1">
                  Adelanto sobre tu nomina por un maximo de{" "}
                  <span className="font-semibold text-foreground">
                    {MAX_ANTICIPO.toLocaleString("es-CO")} COP
                  </span>
                  . Se descontara automaticamente del proximo pago.
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {rechazadaDelMes && (
              <p className="mb-4 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                Tu solicitud anterior de este mes fue rechazada, así que{" "}
                <strong>puedes volver a solicitar</strong>: una solicitud rechazada no consume
                el cupo mensual.
              </p>
            )}
            <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="monto">Monto a solicitar (COP)</Label>
                <div className="relative">
                  <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
                  <Input
                    id="monto"
                    type="number"
                    inputMode="numeric"
                    min={0}
                    max={MAX_ANTICIPO}
                    step={1000}
                    placeholder="150000"
                    className="pl-9 h-12 text-lg tabular-nums font-semibold"
                    {...register("monto")}
                  />
                </div>
                {errors.monto ? (
                  <p className="text-xs text-red-600">{errors.monto.message}</p>
                ) : (
                  <p className="text-xs text-muted-foreground">
                    Ingresa un valor entre 1 y {MAX_ANTICIPO.toLocaleString("es-CO")}.
                    {Number(montoActual) > 0 && (
                      <>
                        {" "}
                        Vas a solicitar{" "}
                        <span className="font-semibold text-foreground">
                          {Number(montoActual).toLocaleString("es-CO")} COP
                        </span>
                        .
                      </>
                    )}
                  </p>
                )}
              </div>

              <Button
                type="submit"
                size="lg"
                className="w-full h-12 text-base font-semibold"
                disabled={isPending}
              >
                {isPending ? (
                  <>
                    <Loader2 className="h-5 w-5 mr-2 animate-spin" />
                    Enviando...
                  </>
                ) : (
                  <>
                    <Send className="h-5 w-5 mr-2" />
                    Enviar solicitud
                  </>
                )}
              </Button>
            </form>
          </CardContent>
        </Card>
      )}

      {/* Historial */}
      <section>
        <div className="mb-3">
          <h2 className="text-base font-semibold">Mis Solicitudes</h2>
          <p className="text-xs text-muted-foreground">
            Todas tus solicitudes y su estado actual.
          </p>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : anticipos.length === 0 ? (
          <Empty>
            <EmptyHeader>
              <Wallet className="h-10 w-10 text-muted-foreground" />
              <EmptyTitle>No has solicitado anticipos</EmptyTitle>
              <EmptyDescription>
                Cuando envies una solicitud aparecera aqui con su estado.
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <div className="grid gap-3">
            {anticipos.map((a) => (
              <AnticipoRow
                key={a.id}
                anticipo={a}
                email={colaborador?.email ?? null}
                onFirmar={() => setFirmaDialog({ open: true, solicitud: a })}
              />
            ))}
          </div>
        )}
      </section>

      {/* Dialog: Firmar anticipo aprobado */}
      <FirmarAnticipoDialog
        open={firmaDialog.open}
        solicitud={firmaDialog.solicitud}
        onOpenChange={(open) =>
          setFirmaDialog({ open, solicitud: open ? firmaDialog.solicitud : null })
        }
        onCompletada={async () => {
          setFirmaDialog({ open: false, solicitud: null })
          await load()
        }}
      />
    </div>
  )
}

/* -------------------------------------------------------------------------
 * Fila de anticipo
 * ------------------------------------------------------------------------- */

function AnticipoRow({
  anticipo: a,
  email,
  onFirmar,
}: {
  anticipo: SolicitudTrabajador
  email: string | null
  onFirmar: () => void
}) {
  const fecha = formatFecha(a.created_at)
  const montoFmt =
    a.monto != null
      ? new Intl.NumberFormat("es-CO", {
          style: "currency",
          currency: "COP",
          maximumFractionDigits: 0,
        }).format(a.monto)
      : "-"

  return (
    <Card
      className={
        a.estado === "aprobada"
          ? "border-emerald-300 bg-emerald-50/40"
          : undefined
      }
    >
      <CardContent className="p-4 space-y-3">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-lg font-bold tabular-nums leading-tight">{montoFmt}</p>
            <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
              <Clock className="h-3 w-3" /> {fecha}
            </p>
          </div>
          <EstadoBadge estado={a.estado} />
        </div>

        {a.estado === "rechazada" && a.motivo_rechazo && (
          <p className="text-xs rounded bg-red-50 border border-red-200 text-red-700 px-2 py-1.5">
            <span className="font-medium">Motivo:</span> {a.motivo_rechazo}
          </p>
        )}

        {/* Aviso resaltado + boton de firma cuando esta aprobada */}
        {a.estado === "aprobada" && (
          <div className="rounded-lg border border-emerald-300 bg-white p-3 space-y-2.5">
            <div className="flex items-start gap-2.5">
              <div className="rounded-md bg-emerald-100 p-1.5 shrink-0">
                <Mail className="h-4 w-4 text-emerald-700" />
              </div>
              <div className="text-sm">
                <p className="font-semibold text-emerald-900">
                  Tu anticipo fue aprobado!
                </p>
                <p className="text-emerald-800 mt-0.5">
                  Debes firmar el documento enviado a tu correo:{" "}
                  <span className="font-semibold break-all">
                    {email || "(correo registrado)"}
                  </span>
                  .
                </p>
              </div>
            </div>
            <Button onClick={onFirmar} size="sm" className="w-full">
              <PenLine className="h-3.5 w-3.5 mr-1.5" />
              Subir firma escaneada / Firmar aqui
            </Button>
          </div>
        )}

        {/* Documento firmado disponible cuando esta completada */}
        {a.estado === "completada" && a.url_documento_final && (
          <div className="flex items-center justify-between rounded-md bg-muted/50 px-3 py-2">
            <p className="text-xs text-muted-foreground">
              Documento firmado registrado.
            </p>
            <Button
              variant="outline"
              size="sm"
              onClick={() => window.open(a.url_documento_final!, "_blank")}
            >
              <FileDown className="h-3.5 w-3.5 mr-1" />
              Ver firma
            </Button>
          </div>
        )}

        {/*
          Evidencia de Pago y Firma subida por RRHH. Se muestra al
          trabajador cuando su anticipo esta aprobado o completado para
          que ambas partes vean el mismo comprobante.
        */}
        {(a.estado === "aprobada" || a.estado === "completada") &&
          a.soporte_url && (
            <div className="flex items-center justify-between rounded-md border border-emerald-200 bg-emerald-50/60 px-3 py-2">
              <div className="flex items-center gap-2 min-w-0">
                <Receipt className="h-4 w-4 text-emerald-700 shrink-0" />
                <p className="text-xs text-emerald-900 truncate">
                  <span className="font-semibold">Evidencia de pago</span>{" "}
                  registrada por RRHH.
                </p>
              </div>
              <Button
                variant="outline"
                size="sm"
                className="border-emerald-300 hover:bg-emerald-100"
                onClick={() => window.open(a.soporte_url!, "_blank")}
              >
                <FileDown className="h-3.5 w-3.5 mr-1" />
                Ver
              </Button>
            </div>
          )}
      </CardContent>
    </Card>
  )
}

function EstadoBadge({ estado }: { estado: SolicitudTrabajador["estado"] }) {
  if (estado === "pendiente") {
    return (
      <Badge className="bg-amber-100 text-amber-800 border-amber-300 hover:bg-amber-100 shrink-0">
        <Clock className="h-3 w-3 mr-1" />
        Pendiente
      </Badge>
    )
  }
  if (estado === "aprobada") {
    return (
      <Badge className="bg-emerald-100 text-emerald-800 border-emerald-300 hover:bg-emerald-100 shrink-0">
        <CheckCircle2 className="h-3 w-3 mr-1" />
        Aprobado
      </Badge>
    )
  }
  if (estado === "completada") {
    return (
      <Badge className="bg-green-100 text-green-800 border-green-300 hover:bg-green-100 shrink-0">
        <CheckCircle2 className="h-3 w-3 mr-1" />
        Completado
      </Badge>
    )
  }
  if (estado === "rechazada") {
    return (
      <Badge className="bg-red-100 text-red-700 border-red-300 hover:bg-red-100 shrink-0">
        <XCircle className="h-3 w-3 mr-1" />
        Rechazado
      </Badge>
    )
  }
  return null
}

function formatFecha(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString("es-CO", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    })
  } catch {
    return iso
  }
}

/* -------------------------------------------------------------------------
 * Dialog: Firmar anticipo (subir escaneo o firmar en canvas)
 * ------------------------------------------------------------------------- */

function FirmarAnticipoDialog({
  open,
  solicitud,
  onOpenChange,
  onCompletada,
}: {
  open: boolean
  solicitud: SolicitudTrabajador | null
  onOpenChange: (open: boolean) => void
  onCompletada: () => void | Promise<void>
}) {
  const { toast } = useToast()
  const [tab, setTab] = useState<"upload" | "draw">("upload")
  const [file, setFile] = useState<File | null>(null)
  const [submitting, setSubmitting] = useState(false)

  // Reset al abrir/cerrar
  useEffect(() => {
    if (!open) {
      setFile(null)
      setTab("upload")
    }
  }, [open])

  /** Convierte un Blob/File a base64 puro (sin prefijo data:). */
  const fileToBase64 = (blob: Blob): Promise<string> =>
    new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => {
        const result = reader.result as string
        const idx = result.indexOf(",")
        resolve(idx >= 0 ? result.slice(idx + 1) : result)
      }
      reader.onerror = () => reject(reader.error)
      reader.readAsDataURL(blob)
    })

  // Refs/estado para canvas de firma
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const [drawing, setDrawing] = useState(false)
  const [hasSignature, setHasSignature] = useState(false)

  // Inicializa el canvas con fondo blanco al montar/abrir
  useEffect(() => {
    if (!open || tab !== "draw") return
    const canvas = canvasRef.current
    if (!canvas) return
    // Ajusta tamaño real para nitidez en pantallas Retina
    const ratio = window.devicePixelRatio || 1
    const rect = canvas.getBoundingClientRect()
    canvas.width = rect.width * ratio
    canvas.height = rect.height * ratio
    const ctx = canvas.getContext("2d")
    if (!ctx) return
    ctx.scale(ratio, ratio)
    ctx.fillStyle = "#ffffff"
    ctx.fillRect(0, 0, rect.width, rect.height)
    ctx.lineWidth = 2.2
    ctx.lineCap = "round"
    ctx.lineJoin = "round"
    ctx.strokeStyle = "#0f172a"
    setHasSignature(false)
  }, [open, tab])

  const getPointerPos = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current!
    const rect = canvas.getBoundingClientRect()
    return { x: e.clientX - rect.left, y: e.clientY - rect.top }
  }

  const onPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const ctx = canvasRef.current?.getContext("2d")
    if (!ctx) return
    const { x, y } = getPointerPos(e)
    ctx.beginPath()
    ctx.moveTo(x, y)
    setDrawing(true)
    canvasRef.current?.setPointerCapture(e.pointerId)
  }
  const onPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawing) return
    const ctx = canvasRef.current?.getContext("2d")
    if (!ctx) return
    const { x, y } = getPointerPos(e)
    ctx.lineTo(x, y)
    ctx.stroke()
    if (!hasSignature) setHasSignature(true)
  }
  const onPointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    setDrawing(false)
    canvasRef.current?.releasePointerCapture(e.pointerId)
  }

  const limpiarCanvas = () => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext("2d")
    if (!ctx) return
    const rect = canvas.getBoundingClientRect()
    ctx.fillStyle = "#ffffff"
    ctx.fillRect(0, 0, rect.width, rect.height)
    setHasSignature(false)
  }

  const canvasToBlob = (): Promise<Blob> =>
    new Promise((resolve, reject) => {
      const canvas = canvasRef.current
      if (!canvas) return reject(new Error("Canvas no disponible"))
      canvas.toBlob((b) => {
        if (!b) return reject(new Error("No se pudo generar la imagen"))
        resolve(b)
      }, "image/png")
    })

  const submit = async () => {
    if (!solicitud) return
    setSubmitting(true)
    try {
      let base64 = ""
      let fileName = `firma_${solicitud.id}.png`
      let contentType = "image/png"

      if (tab === "upload") {
        if (!file) {
          toast({
            title: "Selecciona un archivo",
            description: "Adjunta el documento firmado (PDF, JPG o PNG).",
            variant: "destructive",
          })
          setSubmitting(false)
          return
        }
        // Validacion ligera de tipo
        const allowed = ["image/png", "image/jpeg", "image/jpg", "application/pdf"]
        if (!allowed.includes(file.type)) {
          toast({
            title: "Tipo de archivo invalido",
            description: "Solo se aceptan PDF, JPG o PNG.",
            variant: "destructive",
          })
          setSubmitting(false)
          return
        }
        base64 = await fileToBase64(file)
        fileName = file.name
        contentType = file.type
      } else {
        if (!hasSignature) {
          toast({
            title: "Firma vacia",
            description: "Dibuja tu firma en el recuadro antes de continuar.",
            variant: "destructive",
          })
          setSubmitting(false)
          return
        }
        const blob = await canvasToBlob()
        base64 = await fileToBase64(blob)
        fileName = `firma_canvas_${solicitud.id}.png`
        contentType = "image/png"
      }

      const res = await subirFirmaAnticipo(solicitud.id, base64, fileName, contentType)
      if (!res.success) {
        toast({
          title: "No se pudo subir la firma",
          description: res.error || "Intenta nuevamente.",
          variant: "destructive",
        })
        setSubmitting(false)
        return
      }

      toast({
        title: "Firma registrada",
        description: "Tu anticipo quedo marcado como completado.",
      })
      await onCompletada()
    } catch (err: any) {
      toast({
        title: "Error",
        description: err?.message || "Intenta nuevamente.",
        variant: "destructive",
      })
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => (!submitting ? onOpenChange(o) : null)}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <PenLine className="h-5 w-5 text-emerald-600" />
            Firmar anticipo
          </DialogTitle>
          <DialogDescription>
            Sube el documento firmado o realiza la firma directamente aqui. Al
            confirmar, tu solicitud quedara marcada como completada.
          </DialogDescription>
        </DialogHeader>

        <Tabs value={tab} onValueChange={(v) => setTab(v as "upload" | "draw")}>
          <TabsList className="grid grid-cols-2 w-full">
            <TabsTrigger value="upload">
              <Upload className="h-3.5 w-3.5 mr-1.5" />
              Subir escaneado
            </TabsTrigger>
            <TabsTrigger value="draw">
              <PenLine className="h-3.5 w-3.5 mr-1.5" />
              Firmar aqui
            </TabsTrigger>
          </TabsList>

          <TabsContent value="upload" className="space-y-2 pt-3">
            <Label htmlFor="firma-file">Documento firmado *</Label>
            <Input
              id="firma-file"
              type="file"
              accept="application/pdf,image/png,image/jpeg"
              disabled={submitting}
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            />
            <p className="text-xs text-muted-foreground">
              Acepta PDF, JPG o PNG. Sube el mismo documento que recibiste por
              correo, ya firmado.
            </p>
            {file && (
              <p className="text-xs text-emerald-700 font-medium truncate">
                Seleccionado: {file.name}
              </p>
            )}
          </TabsContent>

          <TabsContent value="draw" className="space-y-2 pt-3">
            <Label>Firma digital *</Label>
            <div className="rounded-md border border-dashed border-input bg-white">
              <canvas
                ref={canvasRef}
                className="block w-full h-44 touch-none cursor-crosshair rounded-md"
                onPointerDown={onPointerDown}
                onPointerMove={onPointerMove}
                onPointerUp={onPointerUp}
                onPointerLeave={onPointerUp}
              />
            </div>
            <div className="flex items-center justify-between">
              <p className="text-xs text-muted-foreground">
                Dibuja tu firma con el mouse o con el dedo en la tableta.
              </p>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={limpiarCanvas}
                disabled={submitting}
                className="h-7 text-xs"
              >
                <Eraser className="h-3 w-3 mr-1" />
                Limpiar
              </Button>
            </div>
          </TabsContent>
        </Tabs>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={submitting}
          >
            Cancelar
          </Button>
          <Button onClick={submit} disabled={submitting}>
            {submitting ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Subiendo...
              </>
            ) : (
              <>
                <CheckCircle2 className="h-4 w-4 mr-2" />
                Confirmar firma
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
