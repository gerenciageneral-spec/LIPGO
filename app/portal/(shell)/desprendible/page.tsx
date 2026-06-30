import { Card, CardContent } from "@/components/ui/card"
import { Receipt, Hammer } from "lucide-react"

/**
 * Placeholder del modulo "Desprendible de nomina" para el portal del
 * trabajador. La logica real (descarga del PDF mensual, historial,
 * etc.) aun esta por implementarse, por lo que de momento mostramos
 * una tarjeta limpia con un mensaje de "En construccion" para que el
 * trabajador sepa que el servicio existe y estara disponible pronto.
 */
export default function DesprendibleNominaPage() {
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold flex items-center gap-2">
          <Receipt className="h-5 w-5 text-rose-600" />
          Desprendible de nomina
        </h1>
        <p className="text-sm text-muted-foreground">
          Consulta y descarga de tu desprendible de pago mensual.
        </p>
      </div>

      <Card>
        <CardContent className="flex flex-col items-center justify-center text-center gap-3 py-12">
          <span className="inline-flex h-14 w-14 items-center justify-center rounded-full bg-rose-50 text-rose-600">
            <Hammer className="h-7 w-7" aria-hidden />
          </span>
          <p className="text-base font-semibold">En construccion</p>
          <p className="text-sm text-muted-foreground max-w-sm leading-relaxed">
            Estamos preparando este servicio. Muy pronto vas a poder
            ver y descargar aqui tu desprendible de nomina.
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
