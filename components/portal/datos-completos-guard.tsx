"use client"

// Guarda de datos personales del portal.
//
// Envuelve los trámites —Anticipos, Permisos, Certificados— y no los deja abrir
// mientras el trabajador no tenga su ficha MEDEVAC (SST-FOR-33) y su Perfil
// Sociodemográfico (SST-FOR-32) completos. El resto del portal (Inicio,
// Novedades, Balance, Mi aporte, Inducciones) queda libre a propósito: se exige
// en el momento en que va a PEDIR algo, no para consultar lo suyo.
//
// FALLA-ABIERTO: si la consulta de estado falla, deja pasar. Un error de red no
// puede impedirle a alguien pedir su anticipo.

import { useEffect, useState, type ReactNode } from "react"
import Link from "next/link"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Loader2, ShieldAlert, HeartPulse, ClipboardList, ArrowRight, CheckCircle2 } from "lucide-react"
import { usePortal } from "@/components/portal/portal-provider"
import { getEstadoDatosPersonales, type EstadoDatosPersonales } from "@/lib/portal-datos-personales-actions"

export function DatosCompletosGuard({ children, tramite }: { children: ReactNode; tramite: string }) {
  const { colaborador } = usePortal()
  const identificacion = colaborador?.identificacion
  const [estado, setEstado] = useState<EstadoDatosPersonales | null>(null)

  useEffect(() => {
    if (!identificacion) return
    let vigente = true
    getEstadoDatosPersonales(identificacion).then((e) => {
      if (vigente) setEstado(e)
    })
    return () => { vigente = false }
  }, [identificacion])

  if (!identificacion) return <>{children}</>

  if (!estado) {
    return (
      <div className="flex items-center justify-center py-16 text-sm text-muted-foreground">
        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
        Verificando tus datos...
      </div>
    )
  }

  if (estado.todoCompleto) return <>{children}</>

  return (
    <div className="mx-auto w-full max-w-2xl">
      <Card className="border-amber-300 bg-amber-50/60">
        <CardHeader>
          <div className="flex items-start gap-3">
            <div className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-amber-100 text-amber-700">
              <ShieldAlert className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <CardTitle className="text-lg">Antes de continuar, completa tus datos</CardTitle>
              <CardDescription className="mt-1">
                Para poder {tramite} necesitamos tener tus datos de emergencia al dia. Es
                obligatorio para el Sistema de Gestion de Seguridad y Salud en el Trabajo, y es lo
                que permite ubicar a tu familia si te pasa algo en la operacion.
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          <RequisitoItem
            completo={estado.medevacCompleto}
            icono={<HeartPulse className="h-4 w-4" />}
            titulo="Datos de emergencia (MEDEVAC)"
            detalle="Tu grupo sanguineo, alergias, EPS y a quien llamar si te pasa algo."
          />
          <RequisitoItem
            completo={estado.perfilCompleto}
            icono={<ClipboardList className="h-4 w-4" />}
            titulo="Perfil sociodemografico"
            detalle="Datos de tu hogar y tus habitos. Sirven para los programas de salud de la empresa."
          />
          <Button asChild className="w-full sm:w-auto">
            <Link href="/portal/mis-datos">
              Completar mis datos
              <ArrowRight className="ml-2 h-4 w-4" />
            </Link>
          </Button>
          <p className="text-xs text-muted-foreground">
            Toma unos minutos y solo hay que hacerlo una vez. Despues podras usar esta seccion
            normalmente.
          </p>
        </CardContent>
      </Card>
    </div>
  )
}

function RequisitoItem({
  completo, icono, titulo, detalle,
}: { completo: boolean; icono: ReactNode; titulo: string; detalle: string }) {
  return (
    <div className="flex items-start gap-3 rounded-lg border bg-white p-3">
      <div className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${completo ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-500"}`}>
        {completo ? <CheckCircle2 className="h-4 w-4" /> : icono}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-medium">{titulo}</span>
          <Badge variant={completo ? "default" : "secondary"} className={completo ? "bg-emerald-600" : ""}>
            {completo ? "Listo" : "Falta"}
          </Badge>
        </div>
        <p className="mt-0.5 text-xs text-muted-foreground">{detalle}</p>
      </div>
    </div>
  )
}
