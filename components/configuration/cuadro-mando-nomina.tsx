"use client"

// Cuadro de mando de nómina: panel de parámetros legales por año (SMLV, auxilio,
// días, jornada y % de recargos) con PREVIEW en vivo del valor día, la hora
// ordinaria (HOD) y el $/hora de cada recargo. Persiste en parametros_legales_anio
// (fuente única, compartida con SST). El cálculo real por persona vive en la vista
// pagonomina (Paso 2); aquí el salario del preview es el SMLV del año.

import { useCallback, useEffect, useMemo, useState } from "react"
import { useToast } from "@/hooks/use-toast"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Button } from "@/components/ui/button"
import { Info, Loader2, Save } from "lucide-react"
import { getParametrosNomina, guardarParametrosNomina } from "@/lib/parametros-nomina-actions"
import { calcularRecargos, PARAMS_NOMINA_DEFAULTS, type ParametrosNomina } from "@/lib/parametros-nomina"

const money = (n: number) =>
  "$" + (Number(n) || 0).toLocaleString("es-CO", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const num = (n: number) => (Number(n) || 0).toLocaleString("es-CO", { maximumFractionDigits: 0 })

// Filas de recargo: cómo se muestra el factor y de dónde sale el $/hora.
type Recargos = ReturnType<typeof calcularRecargos>
const RECARGO_ROWS: {
  campo: keyof ParametrosNomina
  label: string
  tipo: "extra" | "recargo" | "dia"
  col: string
  val: (r: Recargos) => number
}[] = [
  { campo: "pctHed", label: "Hora extra diurna (HED)", tipo: "extra", col: "hed", val: (r) => r.hed },
  { campo: "pctHen", label: "Hora extra nocturna (HEN)", tipo: "extra", col: "hen", val: (r) => r.hen },
  { campo: "pctHn", label: "Recargo nocturno (HN)", tipo: "recargo", col: "hn", val: (r) => r.hn },
  { campo: "pctHedf", label: "H.E. diurna dom/festiva (HEDDF)", tipo: "extra", col: "hedf", val: (r) => r.hedf },
  { campo: "pctHef", label: "H.E. nocturna dom/festiva (HENDF)", tipo: "extra", col: "hef", val: (r) => r.hef },
  {
    campo: "pctRecargoDominical",
    label: "Recargo dominical/festivo",
    tipo: "dia",
    col: "recargodominical",
    val: (r) => r.recargoDominical,
  },
  {
    campo: "pctRecargoNocturnoDominical",
    label: "Recargo nocturno dominical",
    tipo: "recargo",
    col: "—",
    val: (r) => r.recargoNocturnoDominical,
  },
]

function factorTxt(tipo: "extra" | "recargo" | "dia", pct: number): string {
  const f = (Number(pct) || 0) / 100
  if (tipo === "extra") return `×${(1 + f).toFixed(2)}`
  if (tipo === "dia") return `día ×${f.toFixed(2)}`
  return `×${f.toFixed(2)}`
}

const AÑO_ACTUAL = 2026
const AÑOS = [2025, 2026, 2027]

const defaultParams = (anio: number): ParametrosNomina => ({
  anio,
  smlv: 0,
  auxilio: 0,
  ...PARAMS_NOMINA_DEFAULTS,
})

export function CuadroMandoNomina() {
  const { toast } = useToast()
  const [anio, setAnio] = useState(AÑO_ACTUAL)
  const [params, setParams] = useState<ParametrosNomina>(() => defaultParams(AÑO_ACTUAL))
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  const cargar = useCallback(async () => {
    setLoading(true)
    const r = await getParametrosNomina(anio)
    if (r.success && r.data) setParams(r.data)
    else {
      setParams(defaultParams(anio))
      if (!r.success) toast({ title: "No se pudieron cargar los parámetros", description: r.message })
    }
    setLoading(false)
  }, [anio, toast])

  useEffect(() => {
    cargar()
  }, [cargar])

  const set = <K extends keyof ParametrosNomina>(campo: K, value: number) =>
    setParams((p) => ({ ...p, [campo]: value }))

  const calc = useMemo(() => calcularRecargos(params.smlv, params.auxilio, params), [params])
  const divisorMensual = (Number(params.diasCalendario) || 0) * (Number(params.jornadaHoras) || 0)

  const guardar = async () => {
    setSaving(true)
    const r = await guardarParametrosNomina({ ...params, anio })
    setSaving(false)
    if (r.success) toast({ title: "Parámetros guardados", description: `Año ${anio} actualizado.` })
    else toast({ title: "No se pudo guardar", description: r.message, variant: "destructive" })
  }

  return (
    <div className="space-y-4">
      {/* Encabezado: año + guardar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Label className="text-sm text-muted-foreground">Año</Label>
          <div className="flex gap-1">
            {AÑOS.map((a) => (
              <Button
                key={a}
                size="sm"
                variant={a === anio ? "default" : "outline"}
                onClick={() => setAnio(a)}
              >
                {a}
              </Button>
            ))}
          </div>
          {loading && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
        </div>
        <Button onClick={guardar} disabled={saving || loading} size="sm">
          {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
          Guardar parámetros
        </Button>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* 1) Base salarial */}
        <Card className="space-y-3 p-4">
          <h3 className="text-sm font-semibold text-card-foreground">1. Base salarial del año</h3>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Salario mínimo (SMLV)</Label>
              <Input
                type="number"
                value={params.smlv || ""}
                onChange={(e) => set("smlv", Number(e.target.value))}
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Auxilio de transporte</Label>
              <Input
                type="number"
                value={params.auxilio || ""}
                onChange={(e) => set("auxilio", Number(e.target.value))}
              />
            </div>
          </div>
          <div className="flex items-baseline justify-between rounded-md bg-muted/50 px-3 py-2">
            <span className="text-xs text-muted-foreground">SMMLV (salario + auxilio)</span>
            <span className="text-lg font-bold tabular-nums text-foreground">{money(calc.smmlv)}</span>
          </div>
          <div className="flex items-start gap-2 text-xs text-muted-foreground">
            <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
            <p>
              En producción, para cada persona se usa <strong>su salario de contrato</strong>{" "}
              (<code>headcount.salario</code>) + este auxilio. El SMLV de arriba es el mínimo legal
              (salario de prueba del preview y fallback cuando no hay salario).
            </p>
          </div>
        </Card>

        {/* 2) Jornada */}
        <Card className="space-y-3 p-4">
          <h3 className="text-sm font-semibold text-card-foreground">2. Parámetros de jornada</h3>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Días calendario</Label>
              <Input
                type="number"
                value={params.diasCalendario || ""}
                onChange={(e) => set("diasCalendario", Number(e.target.value))}
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Jornada (horas/día)</Label>
              <Input
                type="number"
                value={params.jornadaHoras || ""}
                onChange={(e) => set("jornadaHoras", Number(e.target.value))}
              />
            </div>
          </div>
          <div className="flex items-baseline justify-between rounded-md bg-muted/50 px-3 py-2">
            <span className="text-xs text-muted-foreground">
              Divisor mensual = {num(params.diasCalendario)} × {num(params.jornadaHoras)}
            </span>
            <span className="text-lg font-bold tabular-nums text-foreground">{num(divisorMensual)} h/mes</span>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-md border border-border px-3 py-2">
              <p className="text-xs text-muted-foreground">Valor día (SMMLV ÷ {num(params.diasCalendario)})</p>
              <p className="text-base font-bold tabular-nums text-foreground">{money(calc.valorDia)}</p>
            </div>
            <div className="rounded-md border border-border px-3 py-2">
              <p className="text-xs text-muted-foreground">Hora ordinaria HOD (SMMLV ÷ {num(divisorMensual)})</p>
              <p className="text-base font-bold tabular-nums text-foreground">{money(calc.hod)}</p>
            </div>
          </div>
        </Card>
      </div>

      {/* 3) Recargos y horas extra */}
      <Card className="overflow-hidden p-0">
        <div className="border-b border-border px-4 py-3">
          <h3 className="text-sm font-semibold text-card-foreground">
            3. Recargos y horas extra — % editable · $/hora calculado
          </h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                <th className="px-4 py-2">Concepto</th>
                <th className="px-4 py-2 w-28">%</th>
                <th className="px-4 py-2">Factor</th>
                <th className="px-4 py-2 text-right">$ / hora</th>
                <th className="px-4 py-2">Columna</th>
              </tr>
            </thead>
            <tbody>
              {RECARGO_ROWS.map((row) => (
                <tr key={row.campo} className="border-b border-border/60 last:border-0">
                  <td className="px-4 py-2 text-foreground">{row.label}</td>
                  <td className="px-4 py-2">
                    <Input
                      type="number"
                      className="h-8 w-24"
                      value={(params[row.campo] as number) || ""}
                      onChange={(e) => set(row.campo, Number(e.target.value))}
                    />
                  </td>
                  <td className="px-4 py-2 font-mono text-xs text-muted-foreground">
                    {factorTxt(row.tipo, params[row.campo] as number)}
                  </td>
                  <td className="px-4 py-2 text-right font-mono font-semibold tabular-nums text-foreground">
                    {money(row.val(calc))}
                  </td>
                  <td className="px-4 py-2 font-mono text-xs text-muted-foreground">{row.col}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="flex items-start gap-2 border-t border-border bg-muted/40 px-4 py-3 text-xs text-muted-foreground">
          <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
          <p>
            <strong>hed/hen/hedf/hef</strong> son la hora completa (100% + recargo);{" "}
            <strong>hn</strong> es solo el recargo. El <strong>recargo dominical</strong> se aplica sobre el
            valor día (hoy la vista usa 80%; con estos parámetros pasa a {num(params.pctRecargoDominical)}%). El{" "}
            <strong>recargo nocturno dominical</strong> es informativo (sin columna en tarifasturnos).
          </p>
        </div>
      </Card>
    </div>
  )
}
