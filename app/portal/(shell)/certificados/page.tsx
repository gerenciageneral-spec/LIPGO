"use client"

import { useEffect, useState, useTransition } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty"
import {
  Download,
  FileText,
  Loader2,
  Clock,
  XCircle,
  FileCheck2,
  FilePlus2,
} from "lucide-react"
import { usePortal } from "@/components/portal/portal-provider"
import { useToast } from "@/hooks/use-toast"
import {
  getCertificadosPorColaborador,
  createSolicitudCertificado,
  type SolicitudTrabajador,
} from "@/lib/gestion-solicitudes-actions"
import { DatosCompletosGuard } from "@/components/portal/datos-completos-guard"

/**
 * Pagina de Certificados del Portal del Trabajador.
 *
 * Estructura:
 *  - Card superior "Certificado Laboral" con boton principal grande
 *    "Solicitar Nuevo Certificado" que inserta un registro en
 *    solicitudes_trabajadores (tipo='certificado', estado='pendiente') y
 *    muestra un toast indicando el plazo de 24-48h.
 *  - Listado inferior con el historial: estado visual del tramite y boton
 *    verde de descarga cuando ya hay url_documento_final.
 */
function PortalCertificadosPage() {
  const { colaborador } = usePortal()
  const { toast } = useToast()
  const [loading, setLoading] = useState(true)
  const [certificados, setCertificados] = useState<SolicitudTrabajador[]>([])
  const [isPending, startTransition] = useTransition()

  const load = async () => {
    if (!colaborador?.colaborador_id) return
    const res = await getCertificadosPorColaborador(colaborador.colaborador_id)
    setCertificados(res.data)
    setLoading(false)
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [colaborador?.colaborador_id])

  /**
   * Envia la solicitud de un nuevo certificado al backend y, en caso de exito,
   * muestra el toast con el plazo y refresca la lista para ver el nuevo item
   * en estado 'pendiente' / 'En proceso'.
   */
  const handleSolicitar = () => {
    if (!colaborador?.colaborador_id || isPending) return
    startTransition(async () => {
      const res = await createSolicitudCertificado(colaborador.colaborador_id)
      if (!res.success) {
        toast({
          title: "No se pudo enviar la solicitud",
          description: res.error || "Intentalo de nuevo en unos minutos.",
          variant: "destructive",
        })
        return
      }
      toast({
        title: "Solicitud recibida",
        description:
          "Tu solicitud fue recibida. Este documento se encontrara disponible de 24 a 48 horas en este mismo panel.",
      })
      await load()
    })
  }

  return (
    <div className="space-y-6">
      {/* Card de accion principal */}
      <Card className="border-primary/20 bg-gradient-to-br from-primary/5 to-transparent">
        <CardHeader className="pb-3">
          <div className="flex items-start gap-3">
            <div className="rounded-xl bg-primary/10 p-2.5">
              <FileText className="h-5 w-5 text-primary" />
            </div>
            <div>
              <CardTitle className="text-lg">Certificado Laboral</CardTitle>
              <CardDescription className="mt-1">
                Documento oficial que acredita tu vinculacion actual con la empresa, cargo
                y salario. Lo puedes usar para tramites bancarios, visados o referencias
                laborales.
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <Button
            size="lg"
            onClick={handleSolicitar}
            disabled={isPending || !colaborador}
            className="w-full h-12 text-base font-semibold"
          >
            {isPending ? (
              <>
                <Loader2 className="h-5 w-5 mr-2 animate-spin" />
                Enviando solicitud...
              </>
            ) : (
              <>
                <FilePlus2 className="h-5 w-5 mr-2" />
                Solicitar Nuevo Certificado
              </>
            )}
          </Button>
          <p className="text-xs text-muted-foreground text-center mt-3">
            Tiempo estimado de entrega: 24 a 48 horas habiles
          </p>
        </CardContent>
      </Card>

      {/* Historial */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <div>
            <h2 className="text-base font-semibold">Historial de solicitudes</h2>
            <p className="text-xs text-muted-foreground">
              Revisa el estado y descarga tus certificados anteriores.
            </p>
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : certificados.length === 0 ? (
          <Empty>
            <EmptyHeader>
              <FileText className="h-10 w-10 text-muted-foreground" />
              <EmptyTitle>Aun no has solicitado certificados</EmptyTitle>
              <EmptyDescription>
                Cuando solicites un certificado aqui podras ver su estado y descargarlo.
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <div className="grid gap-3">
            {certificados.map((c) => (
              <CertificadoCard key={c.id} certificado={c} />
            ))}
          </div>
        )}
      </section>
    </div>
  )
}

/**
 * Tarjeta individual de certificado. Muestra estado de forma clara y, cuando
 * el PDF esta listo, un boton verde prominente de descarga.
 */
function CertificadoCard({ certificado: c }: { certificado: SolicitudTrabajador }) {
  const fecha = formatFecha(c.created_at)
  const tieneDescarga = c.estado === "completada" && !!c.url_documento_final

  return (
    <Card className="overflow-hidden">
      <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
        <CardTitle className="flex items-center gap-2 text-base font-semibold">
          <FileText className="h-4 w-4 text-primary" />
          Certificado laboral
        </CardTitle>
        {renderStatusBadge(c.estado)}
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Clock className="h-3.5 w-3.5" />
          <span>Solicitado el {fecha}</span>
        </div>

        {c.estado === "rechazada" && c.motivo_rechazo && (
          <p className="text-sm rounded-md bg-red-50 border border-red-200 text-red-700 px-3 py-2">
            <span className="font-medium">Motivo:</span> {c.motivo_rechazo}
          </p>
        )}

        {tieneDescarga ? (
          <Button
            asChild
            size="lg"
            className="w-full h-12 bg-green-600 hover:bg-green-700 text-white font-semibold text-base shadow-sm"
          >
            <a
              href={c.url_documento_final!}
              target="_blank"
              rel="noopener noreferrer"
              download
            >
              <Download className="h-5 w-5 mr-2" />
              Descargar Certificado Oficial
            </a>
          </Button>
        ) : c.estado === "pendiente" || c.estado === "aprobada" ? (
          <div className="flex items-center gap-2 rounded-md bg-amber-50 border border-amber-200 px-3 py-2.5 text-sm text-amber-800">
            <Clock className="h-4 w-4 shrink-0" />
            <span>
              Tu certificado esta siendo procesado por el equipo de RRHH. Estara listo en
              24-48h.
            </span>
          </div>
        ) : null}
      </CardContent>
    </Card>
  )
}

function renderStatusBadge(estado: SolicitudTrabajador["estado"]) {
  if (estado === "pendiente" || estado === "aprobada") {
    return (
      <Badge className="bg-amber-100 text-amber-800 border-amber-300 hover:bg-amber-100">
        <Clock className="h-3 w-3 mr-1" />
        En proceso (24-48h)
      </Badge>
    )
  }
  if (estado === "completada") {
    return (
      <Badge className="bg-green-100 text-green-800 border-green-300 hover:bg-green-100">
        <FileCheck2 className="h-3 w-3 mr-1" />
        Listo
      </Badge>
    )
  }
  if (estado === "rechazada") {
    return (
      <Badge className="bg-red-100 text-red-700 border-red-300 hover:bg-red-100">
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
      month: "long",
      year: "numeric",
    })
  } catch {
    return iso
  }
}

/**
 * El tramite queda detras de la guarda de datos personales: no se puede
 * solicitar un certificado sin tener la ficha MEDEVAC y el perfil sociodemografico
 * completos. La guarda falla-abierto, asi que un error de red no bloquea a nadie.
 */
export default function Page() {
  return (
    <DatosCompletosGuard tramite="solicitar un certificado">
      <PortalCertificadosPage />
    </DatosCompletosGuard>
  )
}
