"use client"

import { useEffect, useMemo, useState } from "react"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { useAuth } from "@/components/auth-provider"
import { getExamenesPeriodicos, type ExamenPeriodico } from "@/lib/examenes-medicos-actions"
import { Search, Loader2, AlertTriangle, CalendarClock, CheckCircle2, Wallet, Users } from "lucide-react"

const COP = (n: number) => "$" + (Number(n) || 0).toLocaleString("es-CO")

// Badge de estado según los días para el próximo periódico.
function EstadoPeriodico({ dias, vencido }: { dias: number; vencido: boolean }) {
  if (vencido)
    return <Badge className="gap-1 bg-red-100 text-red-700 hover:bg-red-100"><AlertTriangle className="h-3 w-3" /> Vencido</Badge>
  if (dias <= 30)
    return <Badge className="gap-1 bg-amber-100 text-amber-700 hover:bg-amber-100"><CalendarClock className="h-3 w-3" /> Vence pronto</Badge>
  return <Badge className="gap-1 bg-emerald-100 text-emerald-700 hover:bg-emerald-100"><CheckCircle2 className="h-3 w-3" /> Programado</Badge>
}

export default function ExamenesPeriodicos() {
  const { selectedEmpresaId } = useAuth()
  const [filas, setFilas] = useState<ExamenPeriodico[]>([])
  const [resumen, setResumen] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [q, setQ] = useState("")
  const [soloAlerta, setSoloAlerta] = useState(false)

  const cargar = async () => {
    setLoading(true)
    const r = await getExamenesPeriodicos(selectedEmpresaId)
    setFilas(r.success ? r.data : [])
    setResumen(r.resumen)
    setLoading(false)
  }

  useEffect(() => {
    cargar()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedEmpresaId])

  const filtradas = useMemo(() => {
    const s = q.trim().toLowerCase()
    return filas.filter((f) => {
      if (soloAlerta && f.dias_restantes > 30) return false
      if (!s) return true
      return f.nombre.toLowerCase().includes(s) || f.cedula.includes(s) || (f.cargo || "").toLowerCase().includes(s)
    })
  }, [filas, q, soloAlerta])

  // Texto del countdown de días.
  const countdown = (f: ExamenPeriodico) =>
    f.vencido ? `Vencido hace ${Math.abs(f.dias_restantes)} d` : `Faltan ${f.dias_restantes} d`

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-foreground flex items-center gap-2">
          <CalendarClock className="h-5 w-5 text-primary" />
          Exámenes Médicos Periódicos
        </h2>
        <p className="text-sm text-muted-foreground max-w-3xl">
          Personal activo que debe realizar el examen médico periódico (anual). Se calcula a partir
          de la <b>fecha de ingreso</b> (Head Count) + 1 año. Cuando se cumple el año, se marca como
          <b> vencido</b>. El costo usa la tarifa del examen médico de ingreso/periódico/retiro por sede,
          para provisionar el gasto.
        </p>
      </div>

      {/* KPIs / alerta */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        <div className="rounded-lg border border-border bg-card p-3">
          <div className="flex items-center gap-2 text-xs text-muted-foreground"><Users className="h-4 w-4 text-primary" /> Activos</div>
          <div className="mt-1 text-2xl font-bold text-foreground">{resumen?.activos ?? 0}</div>
          {resumen?.sinFecha ? <div className="mt-0.5 text-[11px] text-muted-foreground">{resumen.sinFecha} sin fecha de ingreso</div> : null}
        </div>
        <div className="rounded-lg border border-border bg-card p-3">
          <div className="flex items-center gap-2 text-xs text-muted-foreground"><AlertTriangle className="h-4 w-4 text-red-600" /> Vencidos</div>
          <div className="mt-1 text-2xl font-bold text-red-600">{resumen?.vencidos ?? 0}</div>
        </div>
        <div className="rounded-lg border border-border bg-card p-3">
          <div className="flex items-center gap-2 text-xs text-muted-foreground"><CalendarClock className="h-4 w-4 text-amber-500" /> Vencen ≤30 días</div>
          <div className="mt-1 text-2xl font-bold text-amber-500">{resumen?.proximos30 ?? 0}</div>
        </div>
        <div className="rounded-lg border border-border bg-card p-3">
          <div className="flex items-center gap-2 text-xs text-muted-foreground"><Wallet className="h-4 w-4 text-red-600" /> A provisionar ya</div>
          <div className="mt-1 text-2xl font-bold text-red-600">{COP(resumen?.costoAlerta ?? 0)}</div>
          <div className="mt-0.5 text-[11px] text-muted-foreground">vencidos + ≤30 días</div>
        </div>
        <div className="rounded-lg border border-border bg-card p-3">
          <div className="flex items-center gap-2 text-xs text-muted-foreground"><Wallet className="h-4 w-4 text-foreground" /> Provisión anual</div>
          <div className="mt-1 text-2xl font-bold text-foreground">{COP(resumen?.costoAnual ?? 0)}</div>
          <div className="mt-0.5 text-[11px] text-muted-foreground">{COP(resumen?.costoUnit ?? 0)} c/u</div>
        </div>
      </div>

      {/* Filtros */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[240px] flex-1 max-w-sm">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Buscar por nombre, cédula o cargo..." value={q} onChange={(e) => setQ(e.target.value)} className="pl-8" />
        </div>
        <button
          type="button"
          onClick={() => setSoloAlerta((v) => !v)}
          className={"rounded-md border px-3 py-1.5 text-xs transition-colors " + (soloAlerta ? "bg-red-600 text-white border-red-600" : "border-border text-muted-foreground hover:bg-accent")}
        >
          {soloAlerta ? "Mostrando solo alertas" : "Ver solo alertas (vencidos + ≤30 d)"}
        </button>
      </div>

      {/* Tabla */}
      <div className="rounded-lg border border-border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Colaborador</TableHead>
              <TableHead>Cargo</TableHead>
              <TableHead>Fecha ingreso</TableHead>
              <TableHead>Próximo periódico</TableHead>
              <TableHead>Cuenta regresiva</TableHead>
              <TableHead>Estado</TableHead>
              <TableHead className="text-right">Costo</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow><TableCell colSpan={7} className="py-10 text-center text-muted-foreground"><Loader2 className="mx-auto h-5 w-5 animate-spin" /></TableCell></TableRow>
            ) : filtradas.length === 0 ? (
              <TableRow><TableCell colSpan={7} className="py-10 text-center text-muted-foreground">No hay personal para mostrar.</TableCell></TableRow>
            ) : (
              filtradas.map((f) => (
                <TableRow key={f.cedula} className={f.vencido ? "bg-red-50/50" : ""}>
                  <TableCell className="font-medium">{f.nombre}<div className="text-[11px] text-muted-foreground">{f.cedula}</div></TableCell>
                  <TableCell className="text-sm text-muted-foreground">{f.cargo || "—"}</TableCell>
                  <TableCell className="text-sm tabular-nums">{f.fecha_ingreso}</TableCell>
                  <TableCell className="text-sm tabular-nums font-medium">{f.proximo_periodico}</TableCell>
                  <TableCell className={"text-sm font-semibold tabular-nums " + (f.vencido ? "text-red-600" : f.dias_restantes <= 30 ? "text-amber-600" : "text-muted-foreground")}>{countdown(f)}</TableCell>
                  <TableCell><EstadoPeriodico dias={f.dias_restantes} vencido={f.vencido} /></TableCell>
                  <TableCell className="text-right text-sm tabular-nums">{f.costo ? COP(f.costo) : "—"}</TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}
