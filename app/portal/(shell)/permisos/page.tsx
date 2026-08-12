"use client"

import { useEffect, useMemo, useState, useTransition } from "react"
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
import { Textarea } from "@/components/ui/textarea"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty"
import {
  Loader2,
  Send,
  Clock,
  XCircle,
  CheckCircle2,
  CalendarClock,
  CalendarDays,
  Info,
} from "lucide-react"
import { usePortal } from "@/components/portal/portal-provider"
import { useToast } from "@/hooks/use-toast"
import {
  getPermisosPorColaborador,
  createSolicitudPermiso,
  type SolicitudTrabajador,
} from "@/lib/gestion-solicitudes-actions"
import {
  DIAS_ANTICIPACION_PERMISO,
  cumpleAnticipacionPermiso,
  fechaMinimaPermiso,
  mensajeAnticipacionPermiso,
} from "@/lib/permisos-anticipacion"

const TIPOS_PERMISO = [
  { value: "personal", label: "Personal / Asuntos familiares" },
  { value: "medico", label: "Cita medica" },
  { value: "luto", label: "Luto" },
  { value: "estudio", label: "Estudio / academico" },
  { value: "otro", label: "Otro" },
] as const

/**
 * Schema Zod:
 *  - tipo_permiso obligatorio.
 *  - fecha_inicio con la anticipacion minima (ver lib/permisos-anticipacion.ts).
 *  - fecha_fin >= fecha_inicio.
 *  - comentarios opcional con minimo 10 caracteres si se llenan.
 */
const permisoSchema = z
  .object({
    tipo_permiso: z.string().min(1, "Selecciona un tipo de permiso"),
    fecha_inicio: z.string().min(1, "Fecha de inicio requerida"),
    fecha_fin: z.string().min(1, "Fecha de fin requerida"),
    comentarios: z
      .string()
      .optional()
      .refine((v) => !v || v.trim().length === 0 || v.trim().length >= 10, {
        message: "Si agregas comentarios deben tener al menos 10 caracteres",
      }),
  })
  .superRefine((values, ctx) => {
    // Las fechas se comparan como texto YYYY-MM-DD: en ese formato el orden
    // alfabetico es el cronologico, asi que no hay que construir `Date` ni
    // arriesgar el desfase de un dia al parsear una fecha sin hora.
    const esFecha = (v: string) => /^\d{4}-\d{2}-\d{2}$/.test(String(v ?? "").trim())

    if (!esFecha(values.fecha_inicio)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["fecha_inicio"],
        message: "Fecha invalida",
      })
      return
    }
    if (!cumpleAnticipacionPermiso(values.fecha_inicio)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["fecha_inicio"],
        message: mensajeAnticipacionPermiso(),
      })
    }
    if (esFecha(values.fecha_fin) && values.fecha_fin < values.fecha_inicio) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["fecha_fin"],
        message: "La fecha fin debe ser igual o posterior al inicio",
      })
    }
  })

type PermisoForm = z.infer<typeof permisoSchema>

export default function PortalPermisosPage() {
  const { colaborador } = usePortal()
  const { toast } = useToast()
  const [loading, setLoading] = useState(true)
  const [permisos, setPermisos] = useState<SolicitudTrabajador[]>([])
  const [isPending, startTransition] = useTransition()

  // Fecha minima memoizada (se calcula una vez por render)
  const minFecha = useMemo(() => fechaMinimaPermiso(), [])

  const {
    register,
    handleSubmit,
    reset,
    setValue,
    watch,
    formState: { errors },
  } = useForm<PermisoForm>({
    resolver: zodResolver(permisoSchema),
    defaultValues: {
      tipo_permiso: "",
      fecha_inicio: "",
      fecha_fin: "",
      comentarios: "",
    },
  })

  const tipoPermisoValue = watch("tipo_permiso")

  const load = async () => {
    if (!colaborador?.colaborador_id) return
    const res = await getPermisosPorColaborador(colaborador.colaborador_id)
    setPermisos(res.data)
    setLoading(false)
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [colaborador?.colaborador_id])

  const onSubmit = (values: PermisoForm) => {
    if (!colaborador?.colaborador_id) return
    startTransition(async () => {
      const res = await createSolicitudPermiso(colaborador.colaborador_id, {
        tipo_permiso: values.tipo_permiso,
        fecha_inicio: values.fecha_inicio,
        fecha_fin: values.fecha_fin,
        comentarios: values.comentarios || "",
      })
      if (!res.success) {
        toast({
          title: "No se pudo enviar",
          description: res.error || "Intenta de nuevo.",
          variant: "destructive",
        })
        return
      }
      toast({
        title: "Permiso solicitado",
        description:
          "Tu solicitud fue enviada a tu jefe inmediato y a RRHH para aprobacion.",
      })
      reset({ tipo_permiso: "", fecha_inicio: "", fecha_fin: "", comentarios: "" })
      await load()
    })
  }

  return (
    <div className="space-y-6">
      <Card className="border-primary/20 bg-gradient-to-br from-amber-50/50 to-transparent">
        <CardHeader className="pb-3">
          <div className="flex items-start gap-3">
            <div className="rounded-xl bg-amber-100 p-2.5">
              <CalendarClock className="h-5 w-5 text-amber-700" />
            </div>
            <div>
              <CardTitle className="text-lg">Solicitar Permiso</CardTitle>
              <CardDescription className="mt-1">
                Completa el formulario para registrar una ausencia. Debes solicitar con
                al menos{" "}
                <span className="font-semibold text-foreground">
                  {DIAS_ANTICIPACION_PERMISO} días de anticipación contando hoy
                </span>
                : la fecha más próxima es el{" "}
                <span className="font-semibold text-foreground">{minFecha}</span>.
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            {/* Tipo */}
            <div className="space-y-1.5">
              <Label htmlFor="tipo_permiso">Tipo de permiso</Label>
              <Select
                value={tipoPermisoValue}
                onValueChange={(v) => setValue("tipo_permiso", v, { shouldValidate: true })}
              >
                <SelectTrigger id="tipo_permiso" className="h-11">
                  <SelectValue placeholder="Selecciona el tipo" />
                </SelectTrigger>
                <SelectContent>
                  {TIPOS_PERMISO.map((t) => (
                    <SelectItem key={t.value} value={t.value}>
                      {t.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {errors.tipo_permiso && (
                <p className="text-xs text-red-600">{errors.tipo_permiso.message}</p>
              )}
            </div>

            {/* Fechas */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="fecha_inicio">Fecha de inicio</Label>
                <Input
                  id="fecha_inicio"
                  type="date"
                  className="h-11"
                  min={minFecha}
                  {...register("fecha_inicio")}
                />
                {errors.fecha_inicio && (
                  <p className="text-xs text-red-600">{errors.fecha_inicio.message}</p>
                )}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="fecha_fin">Fecha de fin</Label>
                <Input
                  id="fecha_fin"
                  type="date"
                  className="h-11"
                  min={minFecha}
                  {...register("fecha_fin")}
                />
                {errors.fecha_fin && (
                  <p className="text-xs text-red-600">{errors.fecha_fin.message}</p>
                )}
              </div>
            </div>

            {/* Aviso de anticipación mínima */}
            <div className="flex items-start gap-2 rounded-md bg-amber-50 border border-amber-200 px-3 py-2.5 text-xs text-amber-800">
              <Info className="h-4 w-4 shrink-0 mt-0.5" />
              <p>
                Las solicitudes con menos de {DIAS_ANTICIPACION_PERMISO} días de
                anticipación (contando hoy) no podrán ser procesadas automáticamente.
                Para emergencias contacta directamente a tu jefe inmediato.
              </p>
            </div>

            {/* Comentarios */}
            <div className="space-y-1.5">
              <Label htmlFor="comentarios">Comentarios (opcional)</Label>
              <Textarea
                id="comentarios"
                rows={3}
                placeholder="Describe brevemente el motivo del permiso..."
                {...register("comentarios")}
              />
              {errors.comentarios && (
                <p className="text-xs text-red-600">{errors.comentarios.message}</p>
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

      {/* Historial */}
      <section>
        <div className="mb-3">
          <h2 className="text-base font-semibold">Mis permisos</h2>
          <p className="text-xs text-muted-foreground">
            Revisa el estado de tus solicitudes.
          </p>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : permisos.length === 0 ? (
          <Empty>
            <EmptyHeader>
              <CalendarClock className="h-10 w-10 text-muted-foreground" />
              <EmptyTitle>No has solicitado permisos</EmptyTitle>
              <EmptyDescription>
                Cuando envies una solicitud aparecera aqui con su estado.
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <div className="grid gap-3">
            {permisos.map((p) => (
              <PermisoRow key={p.id} permiso={p} />
            ))}
          </div>
        )}
      </section>
    </div>
  )
}

function PermisoRow({ permiso: p }: { permiso: SolicitudTrabajador }) {
  const tipoLabel =
    TIPOS_PERMISO.find((t) => t.value === p.tipo_permiso)?.label ||
    p.tipo_permiso ||
    "Permiso"
  return (
    <Card>
      <CardContent className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="font-semibold text-sm">{tipoLabel}</p>
            <EstadoBadge
              estado={p.estado}
              gh={p.permiso_aprobacion_gh}
              coord={p.permiso_aprobacion_coord}
            />
          </div>
          <p className="text-xs text-muted-foreground flex items-center gap-1.5">
            <CalendarDays className="h-3 w-3" />
            {formatRango(p.fecha_inicio_permiso, p.fecha_fin_permiso)}
          </p>
          {p.comentarios && (
            <p className="text-xs text-muted-foreground line-clamp-2">{p.comentarios}</p>
          )}
          {p.estado === "rechazada" && p.motivo_rechazo && (
            <p className="text-xs mt-1 rounded bg-red-50 border border-red-200 text-red-700 px-2 py-1">
              <span className="font-medium">Motivo:</span> {p.motivo_rechazo}
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  )
}

/**
 * Badge dinamico del estado de un permiso enfocado en reducir la ansiedad
 * del trabajador: cuando el estado global es 'pendiente' mostramos el
 * progreso real de la doble aprobacion (GH + Coord) como un contador 0/2,
 * 1/2 o 2/2.
 *
 * Reglas:
 *  - estado === 'rechazada'                 -> "Rechazado" (rojo)
 *  - estado === 'aprobada' / 'completada'   -> "Permiso Aprobado" (verde, 2/2)
 *  - estado === 'pendiente':
 *      - ambos 'pendiente'                  -> "En revision inicial (0/2)"
 *      - exactamente uno 'aprobado'         -> "Aprobacion parcial (1/2)"
 *      - cualquier otra mezcla              -> "Pendiente"
 */
function EstadoBadge({
  estado,
  gh,
  coord,
}: {
  estado: SolicitudTrabajador["estado"]
  gh: SolicitudTrabajador["permiso_aprobacion_gh"]
  coord: SolicitudTrabajador["permiso_aprobacion_coord"]
}) {
  if (estado === "rechazada") {
    return (
      <Badge className="bg-red-100 text-red-700 border-red-300 hover:bg-red-100">
        <XCircle className="h-3 w-3 mr-1" />
        Rechazado
      </Badge>
    )
  }

  if (estado === "aprobada" || estado === "completada") {
    return (
      <Badge className="bg-green-100 text-green-800 border-green-300 hover:bg-green-100">
        <CheckCircle2 className="h-3 w-3 mr-1" />
        Permiso Aprobado
      </Badge>
    )
  }

  if (estado === "pendiente") {
    // Tratamos null como 'pendiente' por compatibilidad con permisos antiguos
    // donde las columnas pueden no estar inicializadas.
    const ghOk = gh === "aprobado"
    const coordOk = coord === "aprobado"
    const aprobadosCount = (ghOk ? 1 : 0) + (coordOk ? 1 : 0)

    if (aprobadosCount === 1) {
      return (
        <Badge className="bg-blue-100 text-blue-800 border-blue-300 hover:bg-blue-100 gap-1">
          <CheckCircle2 className="h-3 w-3" />
          Aprobacion parcial (1/2)
        </Badge>
      )
    }

    // 0/2 o cualquier mezcla con rechazos individuales (poco probable porque
    // un rechazo de cualquier rol fuerza estado='rechazada', pero es un
    // fallback seguro).
    return (
      <Badge className="bg-amber-100 text-amber-800 border-amber-300 hover:bg-amber-100 gap-1">
        <Clock className="h-3 w-3" />
        En revision inicial (0/2)
      </Badge>
    )
  }

  return null
}

function formatRango(ini: string | null, fin: string | null): string {
  const fmt = (iso: string) =>
    new Date(iso + "T00:00:00").toLocaleDateString("es-CO", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    })
  if (ini && fin) return `${fmt(ini)} - ${fmt(fin)}`
  if (ini) return fmt(ini)
  return "Sin fechas"
}
