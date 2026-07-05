"use client"

// Modulo SIG: Matriz Integrada de Gestion (ISO 9001 / 14001 / 45001).
// - Pestana "Matriz Integrada": numeral x 3 normas, con evidencia comun.
// - Una pestana por norma: solo lo que aplica + como evidenciar.
// - Tablero de avance (% por norma) para el auditor.
// - Cobertura documental: el mismo soporte (a nivel de numeral) sirve a varias
//   normas (documento compartido); el estado por norma alimenta el tablero.

import { Fragment, useEffect, useMemo, useState } from "react"
import { useAuth } from "@/components/auth-provider"
import { Card } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Progress } from "@/components/ui/progress"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import { Input } from "@/components/ui/input"
import { useToast } from "@/hooks/use-toast"
import { SoportesDocumentales } from "@/components/sst/soportes-documentales"
import { SST_TOKENS, colorPct, CICLO_COLOR, CICLO_LABEL } from "@/components/sst/sst-utils"
import { SigHeader } from "@/components/sst/sig-ui"
import type { CicloPHVA } from "@/lib/sst-types"
import {
  getMatrizIntegrada,
  upsertCobertura,
  getDocumentos,
  vincularDocumentoAObjetivos,
  eliminarCobertura,
  getAvance0312,
} from "@/lib/sig-actions"
import type {
  SigNorma,
  SigMatrizRow,
  SigCeldaNorma,
  SigEstadoCobertura,
  SigEsComun,
  SigDocumento,
} from "@/lib/sig-types"
import {
  Loader2,
  ChevronDown,
  ChevronRight,
  CheckCircle2,
  Clock,
  MinusCircle,
  UploadCloud,
  ShieldCheck,
  Link as LinkIcon,
  Link2,
  FileText,
  X,
  Search,
} from "lucide-react"

interface Props {
  selectedEmpresaId?: number | null
}

const MODULO = "Matriz Integrada SIG"

// Cada pestana de norma se gatea por su permiso (acceso por responsabilidad).
// Estos nombres coinciden con MODULE_PERMISSION_MAP en lib/permissions-map.ts.
const NORMA_MODULO: Record<string, string> = {
  ISO9001: "SIG · ISO 9001",
  ISO14001: "SIG · ISO 14001",
  ISO45001: "SIG · ISO 45001",
}

const COMUN_LABEL: Record<SigEsComun, string> = { si: "Común", parcial: "Parcial", no: "Específico" }
const COMUN_COLOR: Record<SigEsComun, string> = {
  si: SST_TOKENS.ok,
  parcial: SST_TOKENS.warn,
  no: "#8896a5",
}

const ESTADO_META: Record<SigEstadoCobertura, { label: string; color: string; Icon: any }> = {
  aprobado: { label: "Aprobado", color: SST_TOKENS.ok, Icon: CheckCircle2 },
  cargado: { label: "Cargado", color: SST_TOKENS.teal, Icon: UploadCloud },
  pendiente: { label: "Pendiente", color: SST_TOKENS.warn, Icon: Clock },
  no_aplica: { label: "No aplica", color: "#8896a5", Icon: MinusCircle },
}

// Ciclo PHVA segun el capitulo del numeral (Anexo SL): Planear 4-6, Hacer 7-8,
// Verificar 9, Actuar 10. Estructura la matriz como la mejora continua.
function cicloDeNumeral(numeral: string): CicloPHVA {
  const cap = parseInt(numeral, 10)
  if (cap <= 6) return "PLANEAR"
  if (cap <= 8) return "HACER"
  if (cap === 9) return "VERIFICAR"
  return "ACTUAR"
}

// Fila-encabezado de ciclo PHVA para agrupar la tabla.
function CicloHeader({ ciclo, colSpan }: { ciclo: CicloPHVA; colSpan: number }) {
  return (
    <tr>
      <td
        colSpan={colSpan}
        className="px-3 py-1.5 text-xs font-bold uppercase tracking-wide text-white"
        style={{ background: CICLO_COLOR[ciclo] }}
      >
        {CICLO_LABEL[ciclo]}
      </td>
    </tr>
  )
}

// Valoracion del SG-SST 0312 segun Res. 0312/2019 Art. 28 (Min. Trabajo):
// > 85% Aceptable · 60-85% Moderadamente Aceptable · < 60% Critico.
function valoracion0312(pct: number): { label: string; color: string } {
  if (pct > 85) return { label: "Aceptable", color: SST_TOKENS.ok }
  if (pct >= 60) return { label: "Moderadamente aceptable", color: SST_TOKENS.warn }
  return { label: "Crítico", color: SST_TOKENS.bad }
}

function EstadoBadge({ estado }: { estado: SigEstadoCobertura }) {
  const m = ESTADO_META[estado]
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium"
      style={{ background: `${m.color}1a`, color: m.color }}
    >
      <m.Icon className="h-3 w-3" />
      {m.label}
    </span>
  )
}

export function MatrizIntegradaSIG({ selectedEmpresaId: propEmpresaId }: Props) {
  const { selectedEmpresaId: ctxEmpresaId, selectedEmpresaNombre } = useAuth()
  const empresaId = propEmpresaId ?? ctxEmpresaId
  const { toast } = useToast()

  const [loading, setLoading] = useState(true)
  const [normas, setNormas] = useState<SigNorma[]>([])
  const [rows, setRows] = useState<SigMatrizRow[]>([])
  const [expanded, setExpanded] = useState<number | null>(null)
  const [saving, setSaving] = useState<string | null>(null)
  // Codigos de norma que el usuario puede ver (null = aun cargando permisos).
  const [normasPermitidas, setNormasPermitidas] = useState<string[] | null>(null)
  // Avance global del SG-SST 0312 (referencia para ISO 45001).
  const [avance0312, setAvance0312] = useState<number | null>(null)

  async function cargar() {
    setLoading(true)
    const res = await getMatrizIntegrada(empresaId)
    if (res.success) {
      setNormas(res.normas)
      setRows(res.rows)
    } else {
      toast({ title: "No se pudo cargar la matriz", description: res.error })
    }
    // Referencia 0312 (no bloquea la carga de la matriz si falla).
    getAvance0312(empresaId)
      .then((r) => setAvance0312(r.success ? r.pct : null))
      .catch(() => setAvance0312(null))
    setLoading(false)
  }

  useEffect(() => {
    cargar()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [empresaId])

  // Resuelve que pestanas de norma puede ver el usuario (permiso por norma).
  useEffect(() => {
    if (!normas.length) return
    let active = true
    Promise.all(
      normas.map(async (n) => {
        const moduleName = NORMA_MODULO[n.codigo]
        if (!moduleName) return n.codigo
        try {
          const r = await fetch("/api/check-permission", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ moduleName }),
          })
          const d = await r.json()
          return d?.hasPermission ? n.codigo : null
        } catch {
          return null
        }
      }),
    ).then((res) => {
      if (active) setNormasPermitidas(res.filter(Boolean) as string[])
    })
    return () => {
      active = false
    }
  }, [normas])

  // Normas cuyas pestanas individuales se muestran (segun permiso).
  const normasVisibles = useMemo(
    () => normas.filter((n) => normasPermitidas?.includes(n.codigo)),
    [normas, normasPermitidas],
  )

  // Requisitos comunes (la 2a hoja del Excel): los que comparten las normas.
  const rowsComunes = useMemo(() => rows.filter((r) => r.requisito.es_comun !== "no"), [rows])

  // Avance por norma (calculado en vivo desde las filas cargadas).
  const avance = useMemo(() => {
    return normas.map((n) => {
      let total = 0
      let cargados = 0
      let aprobados = 0
      for (const row of rows) {
        const celda = row.celdas.find((c) => c.norma_id === n.id)
        if (!celda || !celda.aplica) continue
        total += 1
        if (celda.estado === "aprobado") {
          aprobados += 1
          cargados += 1
        } else if (celda.estado === "cargado") {
          cargados += 1
        }
      }
      // AVANCE REAL de la norma: sin evidencia = 0 · documentado (cargado, sin
      // verificar) = medio avance · verificado/aprobado = avance completo. Subir un
      // documento no cierra el numeral; documental y verificado se muestran aparte.
      const soloCargados = Math.max(0, cargados - aprobados)
      const pct = total > 0 ? Math.round(((aprobados + soloCargados * 0.5) / total) * 100) : 0
      const pctDocumental = total > 0 ? Math.round((cargados / total) * 100) : 0
      const pctAprobado = total > 0 ? Math.round((aprobados / total) * 100) : 0
      return { norma: n, total, cargados, aprobados, soloCargados, pct, pctDocumental, pctAprobado }
    })
  }, [normas, rows])

  async function marcarEstado(requisitoId: number, normaId: number, estado: SigEstadoCobertura) {
    const key = `${requisitoId}:${normaId}:${estado}`
    setSaving(key)
    const res = await upsertCobertura({ requisitoId, normaId, estado }, empresaId)
    setSaving(null)
    if (res.success) {
      await cargar()
    } else {
      toast({ title: "No se pudo actualizar", description: res.error })
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="h-6 w-6 animate-spin" style={{ color: SST_TOKENS.navy }} />
      </div>
    )
  }

  return (
    <div className="space-y-5">
      {/* Encabezado */}
      <SigHeader
        Icon={ShieldCheck}
        title="Sistema Integrado de Gestión (SIG)"
        subtitle={<>ISO 9001:2015 · ISO 14001:2015 · ISO 45001:2018{selectedEmpresaNombre ? ` — ${selectedEmpresaNombre}` : ""}</>}
      />

      {/* Tablero de avance */}
      <div className="grid gap-3 sm:grid-cols-3">
        {avance.map((a) => (
          <Card key={a.norma.id} className="p-4">
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold" style={{ color: a.norma.color ?? SST_TOKENS.navy }}>
                {a.norma.nombre}
              </span>
              <span className="text-lg font-bold" style={{ color: colorPct(a.pct) }}>
                {a.pct}%
              </span>
            </div>
            <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Avance real de la norma</p>
            <Progress value={a.pct} className="mt-1 h-2" />
            <p className="mt-1.5 text-xs text-muted-foreground">
              {a.aprobados} verificados · {a.soloCargados} documentados (sin verificar) · {a.total} aplican
            </p>
            <p className="text-[11px] text-muted-foreground">Documentado {a.pctDocumental}% · Verificado {a.pctAprobado}%</p>
            {a.norma.codigo === "ISO45001" && avance0312 != null && (
              <p className="mt-1 text-[11px] font-medium" style={{ color: valoracion0312(avance0312).color }}>
                Ref. SG-SST 0312 (Art. 27): {avance0312}% · {valoracion0312(avance0312).label}
              </p>
            )}
          </Card>
        ))}
      </div>

      {/* Pestanas: matriz general + una por norma */}
      <Tabs defaultValue="integrada">
        <TabsList className="flex-wrap">
          <TabsTrigger value="integrada">Matriz Integrada</TabsTrigger>
          <TabsTrigger value="comunes">Requisitos Comunes</TabsTrigger>
          {normasVisibles.map((n) => (
            <TabsTrigger key={n.id} value={n.codigo}>
              {n.nombre}
            </TabsTrigger>
          ))}
        </TabsList>

        {/* Matriz integrada (numeral x 3 normas) */}
        <TabsContent value="integrada" className="mt-3">
          <MatrizIntegradaTabla
            rows={rows}
            normas={normas}
            expanded={expanded}
            setExpanded={setExpanded}
            empresaId={empresaId}
            saving={saving}
            marcarEstado={marcarEstado}
            onUploaded={cargar}
          />
        </TabsContent>

        {/* Requisitos comunes (segunda hoja del Excel) */}
        <TabsContent value="comunes" className="mt-3">
          <div className="mb-3 rounded-md border p-3 text-sm text-muted-foreground" style={{ borderColor: `${SST_TOKENS.teal}55` }}>
            <span className="font-semibold" style={{ color: SST_TOKENS.navy }}>Requisitos comunes a las 3 normas.</span>{" "}
            Aquí un mismo documento sirve como evidencia compartida (común = Sí) o parcial. Súbelo una vez y aplica a ISO 9001, 14001 y 45001.
          </div>
          <MatrizIntegradaTabla
            rows={rowsComunes}
            normas={normas}
            expanded={expanded}
            setExpanded={setExpanded}
            empresaId={empresaId}
            saving={saving}
            marcarEstado={marcarEstado}
            onUploaded={cargar}
          />
        </TabsContent>

        {/* Vista por norma (solo las permitidas) */}
        {normasVisibles.map((n) => (
          <TabsContent key={n.id} value={n.codigo} className="mt-3">
            <NormaTabla
              norma={n}
              rows={rows}
              expanded={expanded}
              setExpanded={setExpanded}
              empresaId={empresaId}
              saving={saving}
              marcarEstado={marcarEstado}
              onUploaded={cargar}
            />
          </TabsContent>
        ))}
      </Tabs>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Tabla de la matriz integrada
// ---------------------------------------------------------------------------

interface TablaProps {
  rows: SigMatrizRow[]
  normas: SigNorma[]
  expanded: number | null
  setExpanded: (id: number | null) => void
  empresaId?: number | null
  saving: string | null
  marcarEstado: (requisitoId: number, normaId: number, estado: SigEstadoCobertura) => void
  onUploaded: () => void
}

function MatrizIntegradaTabla({ rows, normas, expanded, setExpanded, empresaId, saving, marcarEstado, onUploaded }: TablaProps) {
  return (
    <Card className="overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-left" style={{ background: SST_TOKENS.light }}>
              <th className="px-3 py-2 font-semibold" style={{ color: SST_TOKENS.ink }}>Numeral</th>
              <th className="px-3 py-2 font-semibold" style={{ color: SST_TOKENS.ink }}>Requisito / tema</th>
              {normas.map((n) => (
                <th key={n.id} className="px-3 py-2 text-center font-semibold" style={{ color: n.color ?? SST_TOKENS.ink }}>
                  {n.codigo.replace("ISO", "ISO ")}
                </th>
              ))}
              <th className="px-3 py-2 text-center font-semibold" style={{ color: SST_TOKENS.ink }}>Común</th>
              <th className="px-2 py-2" />
            </tr>
          </thead>
          <tbody>
            {rows.map((row, idx) => {
              const isOpen = expanded === row.requisito.id
              const ciclo = cicloDeNumeral(row.requisito.numeral)
              const showCiclo = idx === 0 || cicloDeNumeral(rows[idx - 1].requisito.numeral) !== ciclo
              return (
                <Fragment key={row.requisito.id}>
                  {showCiclo && <CicloHeader ciclo={ciclo} colSpan={normas.length + 4} />}
                  <tr
                    className="cursor-pointer border-b hover:bg-muted/40"
                    onClick={() => setExpanded(isOpen ? null : row.requisito.id)}
                  >
                    <td className="px-3 py-2 font-mono text-xs">{row.requisito.numeral}</td>
                    <td className="px-3 py-2">{row.requisito.tema}</td>
                    {normas.map((n) => {
                      const celda = row.celdas.find((c) => c.norma_id === n.id)
                      return (
                        <td key={n.id} className="px-3 py-2 text-center">
                          {celda ? <EstadoBadge estado={celda.estado} /> : null}
                        </td>
                      )
                    })}
                    <td className="px-3 py-2 text-center">
                      <Badge
                        variant="outline"
                        style={{ borderColor: COMUN_COLOR[row.requisito.es_comun], color: COMUN_COLOR[row.requisito.es_comun] }}
                      >
                        {COMUN_LABEL[row.requisito.es_comun]}
                      </Badge>
                    </td>
                    <td className="px-2 py-2 text-muted-foreground">
                      {isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                    </td>
                  </tr>
                  {isOpen && (
                    <tr>
                      <td colSpan={normas.length + 4} className="bg-muted/20 px-4 py-4">
                        <RequisitoDetalle
                          row={row}
                          normas={normas}
                          empresaId={empresaId}
                          saving={saving}
                          marcarEstado={marcarEstado}
                          onUploaded={onUploaded}
                        />
                      </td>
                    </tr>
                  )}
                </Fragment>
              )
            })}
          </tbody>
        </table>
      </div>
    </Card>
  )
}

// ---------------------------------------------------------------------------
// Tabla de una sola norma
// ---------------------------------------------------------------------------

function NormaTabla({
  norma,
  rows,
  expanded,
  setExpanded,
  empresaId,
  saving,
  marcarEstado,
  onUploaded,
}: { norma: SigNorma } & Omit<TablaProps, "normas">) {
  const visibles = rows
    .map((r) => ({ row: r, celda: r.celdas.find((c) => c.norma_id === norma.id) }))
    .filter((x) => x.celda && x.celda.aplica)

  return (
    <Card className="overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-left" style={{ background: `${(norma.color ?? SST_TOKENS.navy)}12` }}>
              <th className="px-3 py-2 font-semibold" style={{ color: SST_TOKENS.ink }}>Numeral</th>
              <th className="px-3 py-2 font-semibold" style={{ color: SST_TOKENS.ink }}>Requisito / tema</th>
              <th className="px-3 py-2 font-semibold" style={{ color: SST_TOKENS.ink }}>Cómo evidenciar</th>
              <th className="px-3 py-2 text-center font-semibold" style={{ color: SST_TOKENS.ink }}>Estado</th>
              <th className="px-2 py-2" />
            </tr>
          </thead>
          <tbody>
            {visibles.map(({ row, celda }, idx) => {
              const isOpen = expanded === row.requisito.id
              const ciclo = cicloDeNumeral(row.requisito.numeral)
              const showCiclo = idx === 0 || cicloDeNumeral(visibles[idx - 1].row.requisito.numeral) !== ciclo
              return (
                <Fragment key={row.requisito.id}>
                  {showCiclo && <CicloHeader ciclo={ciclo} colSpan={5} />}
                  <tr
                    className="cursor-pointer border-b hover:bg-muted/40"
                    onClick={() => setExpanded(isOpen ? null : row.requisito.id)}
                  >
                    <td className="px-3 py-2 font-mono text-xs">{row.requisito.numeral}</td>
                    <td className="px-3 py-2">{row.requisito.tema}</td>
                    <td className="px-3 py-2 text-muted-foreground">{celda?.texto}</td>
                    <td className="px-3 py-2 text-center">{celda ? <EstadoBadge estado={celda.estado} /> : null}</td>
                    <td className="px-2 py-2 text-muted-foreground">
                      {isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                    </td>
                  </tr>
                  {isOpen && (
                    <tr>
                      <td colSpan={5} className="bg-muted/20 px-4 py-4">
                        <RequisitoDetalle
                          row={row}
                          normas={[norma]}
                          empresaId={empresaId}
                          saving={saving}
                          marcarEstado={marcarEstado}
                          onUploaded={onUploaded}
                        />
                      </td>
                    </tr>
                  )}
                </Fragment>
              )
            })}
          </tbody>
        </table>
      </div>
    </Card>
  )
}

// ---------------------------------------------------------------------------
// Detalle expandido de un requisito (evidencia comun + soporte + estados)
// ---------------------------------------------------------------------------

function RequisitoDetalle({
  row,
  normas,
  empresaId,
  saving,
  marcarEstado,
  onUploaded,
}: {
  row: SigMatrizRow
  normas: SigNorma[]
  empresaId?: number | null
  saving: string | null
  marcarEstado: (requisitoId: number, normaId: number, estado: SigEstadoCobertura) => void
  onUploaded: () => void
}) {
  const { requisito } = row
  const estados: SigEstadoCobertura[] = ["cargado", "aprobado", "pendiente"]

  async function quitarDoc(id: number) {
    await eliminarCobertura(id)
    onUploaded()
  }

  return (
    <div className="grid gap-4 md:grid-cols-2">
      {/* Izquierda: evidencia comun + soporte compartido */}
      <div className="space-y-3">
        {requisito.evidencia_comun_sugerida && (
          <div className="rounded-md border p-3" style={{ borderColor: `${SST_TOKENS.teal}55` }}>
            <p className="text-xs font-semibold" style={{ color: SST_TOKENS.navy }}>
              Evidencia común sugerida
            </p>
            <p className="mt-1 text-sm text-muted-foreground">{requisito.evidencia_comun_sugerida}</p>
          </div>
        )}
        <div className="rounded-md border p-3">
          <p className="text-xs font-semibold" style={{ color: SST_TOKENS.navy }}>
            Soporte documental (compartido por las normas de este numeral)
          </p>
          <div className="mt-2">
            <SoportesDocumentales
              norma="SIG"
              modulo={MODULO}
              referenciaTipo="sig_numeral"
              referenciaId={requisito.numeral}
              referenciaDesc={`${requisito.numeral} — ${requisito.tema}`}
              empresaId={empresaId}
              onUploaded={() => onUploaded()}
            />
          </div>
        </div>
        <DocumentoVincular row={row} normas={normas} empresaId={empresaId} onLinked={onUploaded} />
      </div>

      {/* Derecha: estado de cobertura por norma */}
      <div className="space-y-2">
        <p className="text-xs font-semibold" style={{ color: SST_TOKENS.navy }}>
          Estado por norma
        </p>
        {normas.map((n) => {
          const celda = row.celdas.find((c) => c.norma_id === n.id) as SigCeldaNorma | undefined
          if (!celda) return null
          if (!celda.aplica) {
            return (
              <div key={n.id} className="flex items-center justify-between rounded-md border px-3 py-2">
                <span className="text-sm font-medium" style={{ color: n.color ?? SST_TOKENS.navy }}>
                  {n.nombre}
                </span>
                <EstadoBadge estado="no_aplica" />
              </div>
            )
          }
          return (
            <div key={n.id} className="rounded-md border px-3 py-2">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium" style={{ color: n.color ?? SST_TOKENS.navy }}>
                  {n.nombre}
                </span>
                <EstadoBadge estado={celda.estado} />
              </div>
              {celda.texto && <p className="mt-1 text-xs text-muted-foreground">{celda.texto}</p>}
              {celda.fuente === "iso9001" ? (
                <p className="mt-2 flex items-center gap-1 text-xs" style={{ color: SST_TOKENS.teal }}>
                  <LinkIcon className="h-3 w-3" />
                  Estado tomado del Centro de Evidencia ISO 9001
                  {celda.valorFuente ? ` · ${celda.valorFuente}` : ""}
                </p>
              ) : (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {estados.map((e) => {
                    const key = `${requisito.id}:${n.id}:${e}`
                    const active = celda.estado === e
                    return (
                      <Button
                        key={e}
                        size="sm"
                        variant={active ? "default" : "outline"}
                        className="h-7 px-2 text-xs"
                        disabled={saving === key}
                        onClick={() => marcarEstado(requisito.id, n.id, e)}
                      >
                        {saving === key ? <Loader2 className="h-3 w-3 animate-spin" /> : ESTADO_META[e].label}
                      </Button>
                    )
                  })}
                </div>
              )}
              {celda.coberturas.filter((c) => c.documento).length > 0 && (
                <ul className="mt-2 space-y-1">
                  {celda.coberturas
                    .filter((c) => c.documento)
                    .map((c) => (
                      <li
                        key={c.id}
                        className="flex items-center justify-between gap-2 rounded bg-muted/50 px-2 py-1 text-xs"
                      >
                        <span className="flex min-w-0 items-center gap-1">
                          <FileText className="h-3 w-3 shrink-0" style={{ color: SST_TOKENS.navy }} />
                          <span className="truncate">
                            {c.documento?.codigo ? `${c.documento.codigo} — ` : ""}
                            {c.documento?.nombre ?? "Documento"}
                          </span>
                        </span>
                        <button
                          type="button"
                          onClick={() => quitarDoc(c.id)}
                          className="shrink-0 text-muted-foreground hover:text-red-600"
                          title="Quitar vínculo"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </li>
                    ))}
                </ul>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Selector para vincular un documento real del maestro (sig_documentos)
// a uno o varios numerales/normas (documento compartido).
// ---------------------------------------------------------------------------

function DocumentoVincular({
  row,
  normas,
  empresaId,
  onLinked,
}: {
  row: SigMatrizRow
  normas: SigNorma[]
  empresaId?: number | null
  onLinked: () => void
}) {
  const { toast } = useToast()
  const [open, setOpen] = useState(false)
  const [docs, setDocs] = useState<SigDocumento[]>([])
  const [loading, setLoading] = useState(false)
  const [search, setSearch] = useState("")
  const [selDoc, setSelDoc] = useState<string | null>(null)
  const [targets, setTargets] = useState<number[]>([])
  const [saving, setSaving] = useState(false)

  // Normas a las que aplica este requisito (las únicas vinculables).
  const aplicables = normas.filter((n) => row.celdas.some((c) => c.norma_id === n.id && c.aplica))

  async function load(q: string) {
    setLoading(true)
    const res = await getDocumentos(q)
    setDocs(res.success ? res.data : [])
    setLoading(false)
  }

  function abrir() {
    setOpen(true)
    setTargets(aplicables.map((n) => n.id))
    if (docs.length === 0) load("")
  }

  function toggleTarget(id: number) {
    setTargets((t) => (t.includes(id) ? t.filter((x) => x !== id) : [...t, id]))
  }

  async function vincular() {
    if (!selDoc || targets.length === 0) return
    setSaving(true)
    const res = await vincularDocumentoAObjetivos(
      selDoc,
      targets.map((normaId) => ({ requisitoId: row.requisito.id, normaId })),
      { estado: "cargado" },
      empresaId,
    )
    setSaving(false)
    if (res.success) {
      toast({ title: "Documento vinculado", description: `Aplicado a ${res.vinculados} norma(s).` })
      setSelDoc(null)
      setOpen(false)
      onLinked()
    } else {
      toast({ title: "No se pudo vincular", description: res.error })
    }
  }

  if (!open) {
    return (
      <Button variant="outline" size="sm" className="w-full" onClick={abrir}>
        <Link2 className="mr-2 h-4 w-4" />
        Vincular documento del SIG
      </Button>
    )
  }

  return (
    <div className="rounded-md border p-3">
      <div className="mb-2 flex items-center justify-between">
        <p className="text-xs font-semibold" style={{ color: SST_TOKENS.navy }}>
          Vincular documento del SIG
        </p>
        <button type="button" onClick={() => setOpen(false)} className="text-muted-foreground hover:text-foreground">
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="relative mb-2">
        <Search className="absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") load(search)
          }}
          placeholder="Buscar por código, nombre o proceso…"
          className="h-8 pl-7 text-xs"
        />
      </div>

      <div className="max-h-40 overflow-y-auto rounded border">
        {loading ? (
          <div className="flex justify-center py-4">
            <Loader2 className="h-4 w-4 animate-spin" />
          </div>
        ) : docs.length === 0 ? (
          <p className="p-2 text-xs text-muted-foreground">Sin documentos. Escribe y presiona Enter para buscar.</p>
        ) : (
          docs.map((d) => (
            <button
              key={d.id}
              type="button"
              onClick={() => setSelDoc(d.id)}
              className={`flex w-full items-center gap-2 border-b px-2 py-1.5 text-left text-xs hover:bg-muted ${
                selDoc === d.id ? "bg-muted" : ""
              }`}
            >
              <FileText className="h-3 w-3 shrink-0" style={{ color: SST_TOKENS.navy }} />
              <span className="truncate">
                {d.codigo ? `${d.codigo} — ` : ""}
                {d.nombre}
                {d.proceso ? ` · ${d.proceso}` : ""}
              </span>
            </button>
          ))
        )}
      </div>

      <div className="mt-2 flex flex-wrap gap-3">
        {aplicables.map((n) => (
          <label key={n.id} className="flex items-center gap-1 text-xs">
            <input type="checkbox" checked={targets.includes(n.id)} onChange={() => toggleTarget(n.id)} />
            <span style={{ color: n.color ?? SST_TOKENS.navy }}>{n.codigo.replace("ISO", "ISO ")}</span>
          </label>
        ))}
      </div>

      <Button
        size="sm"
        className="mt-2 w-full"
        disabled={!selDoc || targets.length === 0 || saving}
        onClick={vincular}
      >
        {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Link2 className="mr-2 h-4 w-4" />}
        Vincular a {targets.length} norma(s)
      </Button>
    </div>
  )
}
