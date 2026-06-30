"use client"

import Link from "next/link"
import { FileText, Wallet, CalendarClock, BarChart3, Receipt, AlertCircle, ArrowRight } from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"
import { usePortal } from "@/components/portal/portal-provider"

/**
 * Acciones rapidas del Inicio del portal. Las rutas apuntan a /portal/* al
 * mismo nivel para que la navegacion sea fluida via el route group (shell).
 * Se removio Nomina segun requerimiento.
 */
const QUICK_ACTIONS = [
  {
    label: "Certificados",
    description: "Descarga tu certificado laboral",
    href: "/portal/certificados",
    icon: FileText,
    tint: "bg-blue-50 text-blue-600",
  },
  {
    label: "Anticipos",
    description: "Solicita un adelanto de nomina",
    href: "/portal/anticipos",
    icon: Wallet,
    tint: "bg-emerald-50 text-emerald-600",
  },
  {
    label: "Permisos",
    description: "Registra una ausencia",
    href: "/portal/permisos",
    icon: CalendarClock,
    tint: "bg-amber-50 text-amber-600",
  },
  {
    // Acceso directo al modulo Balance (toneladas y horas extra) para
    // que los trabajadores puedan ver su balance sin tener que pasar
    // por el menu inferior.
    label: "Balance",
    description: "Toneladas y horas extra",
    href: "/portal/balance",
    icon: BarChart3,
    tint: "bg-violet-50 text-violet-600",
  },
  {
    // Novedades de asistencia: muestra al trabajador las filas de
    // `registroasistencia` con campo `asistencia` no nulo
    // (incapacidades, permisos, ausencias, etc.) filtradas por su
    // identificacion.
    label: "Novedades",
    description: "Tus novedades de asistencia",
    href: "/portal/novedades",
    icon: AlertCircle,
    tint: "bg-orange-50 text-orange-600",
  },
  {
    // Desprendible de nomina: pendiente de implementacion. Por ahora
    // la ruta solo muestra un placeholder "En construccion" para que
    // el trabajador vea que el servicio existe y va a estar disponible
    // proximamente.
    label: "Desprendible de nomina",
    description: "Próximamente",
    href: "/portal/desprendible",
    icon: Receipt,
    tint: "bg-rose-50 text-rose-600",
  },
]

export default function PortalInicioPage() {
  const { colaborador } = usePortal()

  if (!colaborador) return null

  return (
    <div className="flex flex-col gap-6">
      {/* Accesos rapidos tipo app bancaria */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-base font-semibold">Accesos rapidos</h2>
          <span className="text-xs text-muted-foreground">Selecciona un servicio</span>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          {QUICK_ACTIONS.map((a) => {
            const Icon = a.icon
            return (
              <Link key={a.href} href={a.href} className="group">
                <Card className="h-full transition-all hover:shadow-md hover:-translate-y-0.5">
                  <CardContent className="p-4 flex flex-col gap-3">
                    <span
                      className={`inline-flex h-10 w-10 items-center justify-center rounded-xl ${a.tint}`}
                    >
                      <Icon className="h-5 w-5" aria-hidden />
                    </span>
                    <div>
                      <p className="font-semibold text-sm">{a.label}</p>
                      <p className="text-xs text-muted-foreground leading-snug">
                        {a.description}
                      </p>
                    </div>
                    <span className="text-xs text-primary inline-flex items-center gap-1 font-medium">
                      Abrir
                      <ArrowRight className="h-3 w-3 transition-transform group-hover:translate-x-0.5" />
                    </span>
                  </CardContent>
                </Card>
              </Link>
            )
          })}
        </div>
      </section>


    </div>
  )
}
