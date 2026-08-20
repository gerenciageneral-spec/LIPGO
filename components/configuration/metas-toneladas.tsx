"use client"

// Financiera › Tarifas › Metas — SOLO LECTURA desde ago-2026.
// meta ton/día = Ton/mes (Cargue + Distribución del acuerdo) ÷ 24,7 días
// hábiles. El HC ya no es un número fijo: se recalcula cada día con la
// asistencia real — ver Operación LIP › Centro de Coordinación para el
// avance en vivo del turno, día a día por proyecto.

import { useCallback, useEffect, useState } from "react"
import { useToast } from "@/components/ui/use-toast"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Loader2, Target } from "lucide-react"
import { getMetasToneladasResumen, type MetaToneladasResumen } from "@/lib/metas-toneladas-actions"

const n1 = (x: number) => (Number(x) || 0).toLocaleString("es-CO", { maximumFractionDigits: 2 })

export function MetasToneladas() {
  const { toast } = useToast()
  const [filas, setFilas] = useState<MetaToneladasResumen[]>([])
  const [loading, setLoading] = useState(true)

  const cargar = useCallback(async () => {
    setLoading(true)
    const r = await getMetasToneladasResumen()
    setLoading(false)
    if (r.success) {
      setFilas(r.data)
    } else {
      toast({ title: "No se pudieron cargar las metas", variant: "destructive" })
    }
  }, [toast])

  useEffect(() => {
    cargar()
  }, [cargar])

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Target className="h-4 w-4 text-primary" />
        <span>
          <strong>meta/día = Ton mes (Cargue + Distribución del acuerdo) ÷ 24,7 días hábiles.</strong> El personal
          (HC) ya no es un número fijo — se recalcula cada día con la asistencia real. Ver Operación LIP › Centro
          de Coordinación para el avance en vivo del turno.
        </span>
      </div>

      <div className="overflow-x-auto rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-16">ID</TableHead>
              <TableHead>Proyecto</TableHead>
              <TableHead className="text-right">Ton mes</TableHead>
              <TableHead className="text-right">Días op.</TableHead>
              <TableHead className="text-right">Meta ton/día</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody className="tabular-nums">
            {loading ? (
              <TableRow>
                <TableCell colSpan={5} className="py-8 text-center text-muted-foreground">
                  <Loader2 className="mx-auto h-5 w-5 animate-spin" />
                </TableCell>
              </TableRow>
            ) : (
              filas.map((f) => (
                <TableRow key={f.idempresa}>
                  <TableCell className="text-muted-foreground">{f.idempresa}</TableCell>
                  <TableCell className="font-medium">{f.proyecto}</TableCell>
                  <TableCell className="text-right">{n1(f.toneladasMes)}</TableCell>
                  <TableCell className="text-right text-muted-foreground">{n1(f.diasOperacion)}</TableCell>
                  <TableCell className="text-right font-semibold text-primary">{n1(f.metaTonDia)}</TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}
