"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { useAuth } from "@/components/auth-provider"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { useToast } from "@/hooks/use-toast"
import { getMatrizEstandares, guardarRespuesta } from "@/lib/sst-auditoria-actions"
import { cerrarAutoevaluacion } from "@/lib/sst-autoeval-actions"
import { SoportesDocumentales } from "@/components/sst/soportes-documentales"
import type {
  CicloPHVA,
  EstadoCumple,
  EstandarItem,
  MatrizData,
  Respuesta,
} from "@/lib/sst-types"
import {
  CICLO_COLOR,
  CICLO_LABEL,
  colorPct,
  estadoColor,
  fmtPct,
  SST_TOKENS,
  VALORACION_LABEL,
  valoracionColor,
} from "@/components/sst/sst-utils"
import { Loader2, FileWarning, Search, ChevronDown, ChevronRight, CheckCircle2, PenLine, Lock, Stethoscope, KeyRound } from "lucide-react"
import type { PointerEvent as ReactPointerEvent } from "react"

interface Props {
  selectedEmpresaId?: number | null
  /** Navegación robusta (fija grupo + módulo). Se usa en el numeral 3.1.4 para
   *  llevar al auditor al submódulo «Examenes Médicos» (protegido por clave). */
  onNavigate?: (moduleName: string) => void
}

const CICLOS: CicloPHVA[] = ["PLANEAR", "HACER", "VERIFICAR", "ACTUAR"]
type Chip = "todos" | "no_cumple" | CicloPHVA

const EMPTY: MatrizData = {
  autoevaluacion: null,
  items: [],
  respuestas: [],
  porCiclo: [],
  aniosDisponibles: [],
}

export function Matriz60Estandares({ selectedEmpresaId: propEmpresaId, onNavigate }: Props) {
  const { selectedEmpresaId: ctxEmpresaId, selectedEmpresaNombre } = useAuth()
  const empresaId = propEmpresaId ?? ctxEmpresaId
  const { toast } = useToast()

  const [data, setData] = useState<MatrizData>(EMPTY)
  const [loading, setLoading] = useState(true)
  const [savingItem, setSavingItem] = useState<number | null>(null)
  const [search, setSearch] = useState("")
  const [chip, setChip] = useState<Chip>("todos")
  const [expanded, setExpanded] = useState<number | null>(null)

  // Mapa item_id -> respuesta para acceso y recalculo en vivo.
  const [respuestas, setRespuestas] = useState<Record<number, Respuesta>>({})

  useEffect(() => {
    let active = true
    setLoading(true)
    getMatrizEstandares(empresaId)
      .then((d) => {
        if (!active) return
        setData(d)
        const map: Record<number, Respuesta> = {}
        for (const r of d.respuestas) map[r.item_id] = r
        setRespuestas(map)
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
    }
  }, [empresaId])

  const { autoevaluacion, items } = data

  // Estado actual del item (respondido o sin responder).
  const estadoOf = (itemId: number): EstadoCumple | null => respuestas[itemId]?.cumple ?? null
  const puntajeOf = (item: EstandarItem): number => {
    const r = respuestas[item.id]
    if (!r) return 0
    return r.cumple === "no_cumple" ? 0 : item.peso
  }

  // Recalculo en vivo: total y por ciclo (Art. 27).
  const calc = useMemo(() => {
    const pesoTotal = items.reduce((s, i) => s + (i.peso || 0), 0)
    const obtenidoTotal = items.reduce((s, i) => s + puntajeOf(i), 0)
    const pctTotal = pesoTotal > 0 ? (obtenidoTotal / pesoTotal) * 100 : 0

    const porCiclo = CICLOS.map((c) => {
      const its = items.filter((i) => i.ciclo === c)
      const peso = its.reduce((s, i) => s + (i.peso || 0), 0)
      const obtenido = its.reduce((s, i) => s + puntajeOf(i), 0)
      return { ciclo: c, peso, obtenido, pct: peso > 0 ? (obtenido / peso) * 100 : 0 }
    })

    // Por estandar (tarjetas).
    const estandaresMap = new Map<string, { ciclo: CicloPHVA; peso: number; obtenido: number }>()
    for (const i of items) {
      const cur = estandaresMap.get(i.estandar) ?? { ciclo: i.ciclo, peso: 0, obtenido: 0 }
      cur.peso += i.peso || 0
      cur.obtenido += puntajeOf(i)
      estandaresMap.set(i.estandar, cur)
    }
    const porEstandar = Array.from(estandaresMap.entries()).map(([estandar, v]) => ({
      estandar,
      ...v,
      pct: v.peso > 0 ? (v.obtenido / v.peso) * 100 : 0,
    }))

    return { pctTotal, obtenidoTotal, pesoTotal, porCiclo, porEstandar }
  }, [items, respuestas])

  const valoracion =
    calc.pctTotal > 85 ? "aceptable" : calc.pctTotal >= 60 ? "moderadamente_aceptable" : "critico"

  // Agrupacion por ciclo -> estandar para el cuerpo de la matriz.
  const grupos = useMemo(() => {
    const q = search.trim().toLowerCase()
    const filtrados = items.filter((i) => {
      if (chip === "no_cumple" && estadoOf(i.id) !== "no_cumple") return false
      if (chip !== "todos" && chip !== "no_cumple" && i.ciclo !== chip) return false
      if (!q) return true
      return (
        i.numeral.toLowerCase().includes(q) ||
        i.estandar.toLowerCase().includes(q) ||
        i.item.toLowerCase().includes(q)
      )
    })
    // ciclo -> estandar -> items
    const out: { ciclo: CicloPHVA; estandar: string; items: EstandarItem[] }[] = []
    for (const c of CICLOS) {
      const delCiclo = filtrados.filter((i) => i.ciclo === c)
      const estandares = Array.from(new Set(delCiclo.map((i) => i.estandar)))
      for (const est of estandares) {
        out.push({ ciclo: c, estandar: est, items: delCiclo.filter((i) => i.estandar === est) })
      }
    }
    return out
  }, [items, search, chip, respuestas])

  const handleEstadoChange = async (item: EstandarItem, nuevo: EstadoCumple) => {
    if (!autoevaluacion) return
    // Optimista: actualiza el mapa y recalcula al instante.
    setRespuestas((prev) => ({
      ...prev,
      [item.id]: {
        ...(prev[item.id] ?? {
          autoevaluacion_id: autoevaluacion.id,
          item_id: item.id,
          observacion: null,
          soporte_url: null,
        }),
        autoevaluacion_id: autoevaluacion.id,
        item_id: item.id,
        cumple: nuevo,
        puntaje_obtenido: nuevo === "no_cumple" ? 0 : item.peso,
      },
    }))
    setSavingItem(item.id)
    const res = await guardarRespuesta({
      autoevaluacion_id: autoevaluacion.id,
      item_id: item.id,
      cumple: nuevo,
      peso: item.peso,
      observacion: respuestas[item.id]?.observacion ?? null,
      soporte_url: respuestas[item.id]?.soporte_url ?? null,
    })
    setSavingItem(null)
    if (!res.success) {
      toast({ title: "Error al guardar", description: res.message ?? "Intenta de nuevo." })
    }
  }

  const handleDetailSave = async (item: EstandarItem) => {
    if (!autoevaluacion) return
    const r = respuestas[item.id]
    const estado = r?.cumple ?? "no_cumple"
    setSavingItem(item.id)
    const res = await guardarRespuesta({
      autoevaluacion_id: autoevaluacion.id,
      item_id: item.id,
      cumple: estado,
      peso: item.peso,
      observacion: r?.observacion ?? null,
      soporte_url: r?.soporte_url ?? null,
    })
    setSavingItem(null)
    toast({
      title: res.success ? "Guardado" : "Error",
      description: res.success ? "Observación y evidencia actualizadas." : res.message,
    })
  }

  // El archivo ya se subió al repositorio central (SoportesDocumentales).
  // Aquí solo reflejamos el último soporte en soporte_url para que la Auditoría 0312
  // siga viendo evidencia adjunta al estándar.
  const persistSoporteUrl = async (item: EstandarItem, url: string) => {
    if (!autoevaluacion) return
    updateDetail(item.id, "soporte_url", url)
    const r = respuestas[item.id]
    await guardarRespuesta({
      autoevaluacion_id: autoevaluacion.id,
      item_id: item.id,
      cumple: r?.cumple ?? "no_cumple",
      peso: item.peso,
      observacion: r?.observacion ?? null,
      soporte_url: url,
    })
  }

  const updateDetail = (itemId: number, field: "observacion" | "soporte_url", value: string) => {
    setRespuestas((prev) => ({
      ...prev,
      [itemId]: {
        ...(prev[itemId] ?? {
          autoevaluacion_id: autoevaluacion?.id ?? 0,
          item_id: itemId,
          cumple: "no_cumple",
          puntaje_obtenido: 0,
          observacion: null,
          soporte_url: null,
        }),
        [field]: value,
      } as Respuesta,
    }))
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20 text-muted-foreground">
        <Loader2 className="mr-2 h-5 w-5 animate-spin" />
        Cargando matriz de estándares...
      </div>
    )
  }

  if (!autoevaluacion || items.length === 0) {
    return (
      <div className="space-y-4">
        <Header nombre={selectedEmpresaNombre} />
        <Card className="flex flex-col items-center gap-3 p-10 text-center">
          <FileWarning className="h-10 w-10 text-muted-foreground" />
          <p className="text-lg font-semibold text-foreground">Sin datos de autoevaluación</p>
          <p className="max-w-md text-sm text-muted-foreground">
            No se encontraron los 60 estándares o no hay autoevaluación para esta empresa. Verifica
            que el esquema SST (<code className="rounded bg-muted px-1">sst_estandar_items</code> y{" "}
            <code className="rounded bg-muted px-1">sst_autoevaluaciones</code>) esté creado.
          </p>
        </Card>
      </div>
    )
  }

  return (
    <div className="space-y-5">
      <Header nombre={selectedEmpresaNombre} sede={autoevaluacion.sede} anio={autoevaluacion.anio} />

      {/* Tablero superior */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="flex items-center gap-5 p-5">
          <Gauge pct={calc.pctTotal} />
          <div className="space-y-1.5">
            <span
              className="inline-block rounded-full px-3 py-1 text-xs font-bold text-white"
              style={{ backgroundColor: valoracionColor(valoracion) }}
            >
              {VALORACION_LABEL[valoracion]}
            </span>
            <p className="text-sm text-muted-foreground">
              {calc.obtenidoTotal.toFixed(1)} / {calc.pesoTotal.toFixed(0)} pts
            </p>
          </div>
        </Card>

        <Card className="p-5 lg:col-span-2">
          <p className="mb-3 text-sm font-semibold" style={{ color: SST_TOKENS.ink }}>
            Ciclo PHVA
          </p>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {calc.porCiclo.map((c) => (
              <div
                key={c.ciclo}
                className="rounded-lg p-3 text-white"
                style={{ backgroundColor: CICLO_COLOR[c.ciclo] }}
              >
                <p className="text-xs font-medium opacity-90">{CICLO_LABEL[c.ciclo]}</p>
                <p className="text-2xl font-bold">{fmtPct(c.pct)}</p>
                <p className="text-[11px] opacity-90">
                  {c.obtenido.toFixed(0)} / {c.peso.toFixed(0)} pts
                </p>
              </div>
            ))}
          </div>
        </Card>
      </div>

      {/* Tarjetas por estandar */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {calc.porEstandar.map((e) => (
          <Card key={e.estandar} className="p-4">
            <p className="text-sm font-medium text-foreground">{e.estandar}</p>
            <p className="text-xs text-muted-foreground">
              {e.obtenido.toFixed(1)} / {e.peso.toFixed(0)} pts ({fmtPct(e.pct)})
            </p>
            <div className="mt-2 h-2 w-full overflow-hidden rounded-full" style={{ backgroundColor: SST_TOKENS.grey }}>
              <div
                className="h-full rounded-full"
                style={{ width: `${Math.min(e.pct, 100)}%`, backgroundColor: colorPct(e.pct) }}
              />
            </div>
          </Card>
        ))}
      </div>

      {/* Controles */}
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="relative lg:max-w-xs">
          <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            className="pl-9"
            placeholder="Buscar numeral, estándar o ítem"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="flex flex-wrap gap-2">
          <ChipBtn label="Todos" active={chip === "todos"} onClick={() => setChip("todos")} />
          <ChipBtn
            label="Solo no cumple"
            active={chip === "no_cumple"}
            onClick={() => setChip("no_cumple")}
          />
          {CICLOS.map((c) => (
            <ChipBtn key={c} label={CICLO_LABEL[c]} active={chip === c} onClick={() => setChip(c)} />
          ))}
        </div>
      </div>

      {/* Matriz agrupada por ciclo - estandar */}
      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr style={{ backgroundColor: SST_TOKENS.navy }} className="text-left text-white">
                <th className="px-3 py-2 font-semibold">Numeral</th>
                <th className="px-3 py-2 font-semibold">Estándar mínimo</th>
                <th className="px-3 py-2 text-center font-semibold">Peso</th>
                <th className="px-3 py-2 font-semibold">Modo</th>
                <th className="px-3 py-2 font-semibold">Estado</th>
                <th className="px-3 py-2 font-semibold">Evidencia / soportes</th>
                <th className="px-3 py-2 text-center font-semibold">Pts</th>
              </tr>
            </thead>
            <tbody>
              {grupos.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-10 text-center text-muted-foreground">
                    No hay ítems para los filtros seleccionados.
                  </td>
                </tr>
              ) : (
                grupos.map((g) => (
                  <GrupoFilas
                    key={`${g.ciclo}-${g.estandar}`}
                    grupo={g}
                    estadoOf={estadoOf}
                    puntajeOf={puntajeOf}
                    respuestas={respuestas}
                    expanded={expanded}
                    setExpanded={setExpanded}
                    onEstadoChange={handleEstadoChange}
                    onDetailUpdate={updateDetail}
                    onDetailSave={handleDetailSave}
                    onSoporteUrl={persistSoporteUrl}
                    savingItem={savingItem}
                    empresaId={empresaId}
                    onNavigate={onNavigate}
                  />
                ))
              )}
            </tbody>
          </table>
        </div>
        <div className="border-t px-3 py-2 text-xs text-muted-foreground">
          <strong>Cálculo (Art. 27):</strong> «cumple» y «no aplica» suman el peso del ítem; «no
          cumple» suma 0. Valoración (Art. 28): ACEPTABLE &gt; 85% · MODERADAMENTE ACEPTABLE 60–85% ·
          CRÍTICO &lt; 60%.
        </div>
      </Card>

      {/* Cierre / formalización (acta de autoevaluación) */}
      <CierreAutoevaluacion
        autoevaluacion={autoevaluacion}
        onCerrada={(patch) =>
          setData((prev) =>
            prev.autoevaluacion
              ? { ...prev, autoevaluacion: { ...prev.autoevaluacion, ...patch } }
              : prev,
          )
        }
      />
    </div>
  )
}

function GrupoFilas({
  grupo,
  estadoOf,
  puntajeOf,
  respuestas,
  expanded,
  setExpanded,
  onEstadoChange,
  onDetailUpdate,
  onDetailSave,
  onSoporteUrl,
  savingItem,
  empresaId,
  onNavigate,
}: {
  grupo: { ciclo: CicloPHVA; estandar: string; items: EstandarItem[] }
  estadoOf: (id: number) => EstadoCumple | null
  puntajeOf: (item: EstandarItem) => number
  respuestas: Record<number, Respuesta>
  expanded: number | null
  setExpanded: (id: number | null) => void
  onEstadoChange: (item: EstandarItem, nuevo: EstadoCumple) => void
  onDetailUpdate: (itemId: number, field: "observacion" | "soporte_url", value: string) => void
  onDetailSave: (item: EstandarItem) => void
  onSoporteUrl: (item: EstandarItem, url: string) => void
  savingItem: number | null
  empresaId?: number | null
  onNavigate?: (moduleName: string) => void
}) {
  return (
    <>
      <tr style={{ backgroundColor: SST_TOKENS.light }}>
        <td colSpan={7} className="px-3 py-1.5 text-xs font-semibold" style={{ color: SST_TOKENS.ink }}>
          <span
            className="mr-2 inline-block rounded px-1.5 py-0.5 text-[10px] text-white"
            style={{ backgroundColor: CICLO_COLOR[grupo.ciclo] }}
          >
            {CICLO_LABEL[grupo.ciclo]}
          </span>
          {grupo.estandar}
        </td>
      </tr>
      {grupo.items.map((item) => {
        const estado = estadoOf(item.id)
        const isOpen = expanded === item.id
        const r = respuestas[item.id]
        return (
          <FilaItem
            key={item.id}
            item={item}
            estado={estado}
            isOpen={isOpen}
            r={r}
            setExpanded={setExpanded}
            onEstadoChange={onEstadoChange}
            onDetailUpdate={onDetailUpdate}
            onDetailSave={onDetailSave}
            onSoporteUrl={onSoporteUrl}
            puntajeOf={puntajeOf}
            savingItem={savingItem}
            empresaId={empresaId}
            onNavigate={onNavigate}
          />
        )
      })}
    </>
  )
}

function FilaItem({
  item,
  estado,
  isOpen,
  r,
  setExpanded,
  onEstadoChange,
  onDetailUpdate,
  onDetailSave,
  onSoporteUrl,
  puntajeOf,
  savingItem,
  empresaId,
  onNavigate,
}: {
  item: EstandarItem
  estado: EstadoCumple | null
  isOpen: boolean
  r: Respuesta | undefined
  setExpanded: (id: number | null) => void
  onEstadoChange: (item: EstandarItem, nuevo: EstadoCumple) => void
  onDetailUpdate: (itemId: number, field: "observacion" | "soporte_url", value: string) => void
  onDetailSave: (item: EstandarItem) => void
  onSoporteUrl: (item: EstandarItem, url: string) => void
  puntajeOf: (item: EstandarItem) => number
  savingItem: number | null
  empresaId?: number | null
  onNavigate?: (moduleName: string) => void
}) {
  return (
    <>
      <tr className="border-b hover:bg-muted/40">
        <td className="px-3 py-2 align-top font-mono text-xs font-semibold">{item.numeral}</td>
        <td className="px-3 py-2 align-top">
          <button
            type="button"
            className="flex items-start gap-1 text-left"
            onClick={() => setExpanded(isOpen ? null : item.id)}
          >
            {isOpen ? (
              <ChevronDown className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            ) : (
              <ChevronRight className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            )}
            <span className="text-foreground">{item.item}</span>
          </button>
        </td>
        <td className="px-3 py-2 text-center align-top">{item.peso}</td>
        <td className="px-3 py-2 align-top text-xs capitalize text-muted-foreground">
          {item.modo_aplica ?? "—"}
        </td>
        <td className="px-3 py-2 align-top">
          <div className="flex items-center gap-2">
            <span
              className="h-2.5 w-2.5 shrink-0 rounded-full"
              style={{ backgroundColor: estadoColor(estado) }}
            />
            <select
              className="rounded-md border border-input bg-background px-2 py-1 text-xs"
              value={estado ?? ""}
              onChange={(e) => onEstadoChange(item, e.target.value as EstadoCumple)}
            >
              <option value="" disabled>
                Seleccione
              </option>
              <option value="cumple">Cumple</option>
              <option value="no_cumple">No cumple</option>
              <option value="no_aplica">No aplica</option>
            </select>
            {savingItem === item.id && (
              <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
            )}
          </div>
        </td>
        <td className="px-3 py-2 align-top">
          {estado === "no_aplica" ? (
            <span className="text-[11px] text-muted-foreground">No requiere evidencia.</span>
          ) : (
            <SoportesDocumentales
              norma="SST 0312"
              modulo="Matriz de Estándares"
              referenciaTipo="estandar"
              referenciaId={item.numeral}
              referenciaDesc={item.item}
              empresaId={empresaId}
              onUploaded={(url) => onSoporteUrl(item, url)}
            />
          )}
          {/* Numeral 3.1.4 (evaluaciones médicas ocupacionales): enlace protegido
              por clave que lleva al auditor al submódulo «Examenes Médicos». */}
          {item.numeral === "3.1.4" && <EnlaceExamenesMedicos onNavigate={onNavigate} />}
        </td>
        <td className="px-3 py-2 text-center align-top font-medium">{puntajeOf(item)}</td>
      </tr>
      {isOpen && (
        <tr className="border-b bg-muted/30">
          <td colSpan={7} className="px-4 py-3">
            <div className="grid gap-3 md:grid-cols-2">
              <div className="md:col-span-2">
                <p className="text-xs font-semibold text-foreground">Qué verificar</p>
                <p className="text-xs text-muted-foreground">
                  Modo {item.modo_aplica ?? "documental"}:{" "}
                  {item.modo_aplica === "campo"
                    ? "verificación en sitio / inspección física."
                    : item.modo_aplica === "mixto"
                      ? "documento de soporte + verificación en sitio."
                      : "documento, registro o procedimiento que evidencie el cumplimiento."}
                </p>
              </div>
              <div className="md:col-span-2">
                <label className="text-xs font-medium text-foreground">Observación del auditor</label>
                <Textarea
                  rows={2}
                  value={r?.observacion ?? ""}
                  onChange={(e) => onDetailUpdate(item.id, "observacion", e.target.value)}
                  placeholder="Hallazgos, comentarios..."
                />
                <p className="mt-1 text-[11px] text-muted-foreground">
                  Los archivos de evidencia se cargan en la columna «Evidencia / soportes» de la tabla y
                  se guardan en el repositorio central (se conserva el historial: el anterior queda como
                  «histórico» y el nuevo como «vigente»).
                </p>
              </div>
              <div className="md:col-span-2">
                <Button size="sm" onClick={() => onDetailSave(item)} disabled={savingItem === item.id}>
                  {savingItem === item.id ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                  Guardar detalle
                </Button>
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  )
}

// Enlace protegido por clave que lleva al auditor al submódulo «Examenes
// Médicos» para revisar el soporte del numeral 3.1.4 (evaluaciones médicas
// ocupacionales). La clave (por seguridad) es 1104.
function EnlaceExamenesMedicos({ onNavigate }: { onNavigate?: (moduleName: string) => void }) {
  const { toast } = useToast()
  const [abierto, setAbierto] = useState(false)
  const [clave, setClave] = useState("")

  const ir = () => {
    if (clave.trim() !== "1104") {
      toast({
        title: "Clave incorrecta",
        description: "Ingresa la clave de acceso para revisar los exámenes médicos.",
      })
      return
    }
    setClave("")
    setAbierto(false)
    if (onNavigate) onNavigate("Examenes Médicos")
  }

  return (
    <div className="mt-2 rounded-md border border-dashed p-2" style={{ borderColor: SST_TOKENS.navy }}>
      {!abierto ? (
        <button
          type="button"
          onClick={() => setAbierto(true)}
          className="inline-flex items-center gap-1.5 text-xs font-semibold hover:underline"
          style={{ color: SST_TOKENS.navy }}
        >
          <Stethoscope className="h-3.5 w-3.5" /> Ver soporte en «Exámenes Médicos»
        </button>
      ) : (
        <div className="flex items-center gap-2">
          <KeyRound className="h-3.5 w-3.5 shrink-0" style={{ color: SST_TOKENS.navy }} />
          <Input
            type="password"
            inputMode="numeric"
            autoFocus
            value={clave}
            onChange={(e) => setClave(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") ir()
              if (e.key === "Escape") {
                setAbierto(false)
                setClave("")
              }
            }}
            placeholder="Clave"
            className="h-8 w-24"
          />
          <Button size="sm" className="h-8" onClick={ir}>
            Entrar
          </Button>
          <button
            type="button"
            onClick={() => {
              setAbierto(false)
              setClave("")
            }}
            className="text-[11px] text-muted-foreground underline"
          >
            Cancelar
          </button>
        </div>
      )}
      <p className="mt-1 flex items-center gap-1 text-[10px] text-muted-foreground">
        <Lock className="h-2.5 w-2.5" /> Acceso protegido: se solicita clave por seguridad.
      </p>
    </div>
  )
}

function ChipBtn({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-full px-3 py-1 text-xs font-medium transition-colors"
      style={
        active
          ? { backgroundColor: SST_TOKENS.navy, color: "#fff" }
          : { backgroundColor: SST_TOKENS.grey, color: SST_TOKENS.ink }
      }
    >
      {label}
    </button>
  )
}

function Header({
  nombre,
  sede,
  anio,
}: {
  nombre: string | null
  sede?: string | null
  anio?: number
}) {
  return (
    <div className="sticky top-0 z-10 rounded-lg p-4 text-white" style={{ backgroundColor: SST_TOKENS.navy }}>
      <h1 className="text-lg font-bold">SST · Matriz de Estándares Mínimos — Resolución 0312/2019</h1>
      <p className="text-sm opacity-90">
        {nombre ?? "Empresa"} · Autoevaluación SG-SST · Vista de auditoría
        {anio ? ` · ${anio}` : ""}
        {sede ? ` · ${sede}` : ""}
      </p>
    </div>
  )
}

function Gauge({ pct }: { pct: number }) {
  const color = colorPct(pct)
  return (
    <div
      className="flex h-28 w-28 flex-col items-center justify-center rounded-full"
      style={{ background: `conic-gradient(${color} ${pct}%, ${SST_TOKENS.grey} 0)` }}
    >
      <div className="flex h-20 w-20 flex-col items-center justify-center rounded-full bg-card">
        <span className="text-2xl font-bold" style={{ color }}>
          {fmtPct(pct)}
        </span>
        <span className="text-[10px] text-muted-foreground">cumplimiento</span>
      </div>
    </div>
  )
}

function CierreAutoevaluacion({
  autoevaluacion,
  onCerrada,
}: {
  autoevaluacion: {
    id: number
    responsable: string | null
    fecha: string | null
    estado: string | null
    firma?: string | null
  }
  onCerrada: (patch: { responsable: string | null; fecha: string | null; estado: string; firma?: string | null }) => void
}) {
  const { toast } = useToast()
  const cerrada = autoevaluacion.estado === "cerrada"
  const [responsable, setResponsable] = useState(autoevaluacion.responsable ?? "")
  const [fecha, setFecha] = useState(autoevaluacion.fecha ?? new Date().toISOString().slice(0, 10))
  const [cerrando, setCerrando] = useState(false)
  const [hasSignature, setHasSignature] = useState(false)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const drawing = useRef(false)

  const initCanvas = () => {
    const c = canvasRef.current
    if (!c) return
    const ctx = c.getContext("2d")
    if (!ctx) return
    ctx.fillStyle = "#ffffff"
    ctx.fillRect(0, 0, c.width, c.height)
    ctx.strokeStyle = "#0A2540"
    ctx.lineWidth = 2
    ctx.lineCap = "round"
  }
  useEffect(() => {
    if (!cerrada) initCanvas()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cerrada])

  const posOf = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    const c = canvasRef.current!
    const r = c.getBoundingClientRect()
    return { x: (e.clientX - r.left) * (c.width / r.width), y: (e.clientY - r.top) * (c.height / r.height) }
  }
  const down = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    const ctx = canvasRef.current?.getContext("2d")
    if (!ctx) return
    drawing.current = true
    const p = posOf(e)
    ctx.beginPath()
    ctx.moveTo(p.x, p.y)
  }
  const move = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    if (!drawing.current) return
    const ctx = canvasRef.current?.getContext("2d")
    if (!ctx) return
    const p = posOf(e)
    ctx.lineTo(p.x, p.y)
    ctx.stroke()
    setHasSignature(true)
  }
  const up = () => {
    drawing.current = false
  }
  const limpiar = () => {
    initCanvas()
    setHasSignature(false)
  }

  const cerrar = async (nuevoEstado: "cerrada" | "en_proceso") => {
    setCerrando(true)
    let firmaUrl: string | undefined
    if (nuevoEstado === "cerrada" && hasSignature && canvasRef.current) {
      const blob = await new Promise<Blob | null>((res) => canvasRef.current!.toBlob(res, "image/png"))
      if (blob) {
        try {
          const fd = new FormData()
          fd.append("file", blob, "firma_autoeval.png")
          const r = await fetch("/api/upload-signature", { method: "POST", body: fd })
          if (r.ok) {
            const d = await r.json()
            firmaUrl = d?.url || undefined
          }
        } catch {
          // la firma es opcional; si falla la subida, igual se cierra
        }
      }
    }
    const patch = {
      responsable: responsable || null,
      fecha: fecha || null,
      estado: nuevoEstado,
      ...(firmaUrl ? { firma: firmaUrl } : {}),
    }
    const res = await cerrarAutoevaluacion(autoevaluacion.id, patch)
    setCerrando(false)
    if (res.success) {
      onCerrada({ ...patch, firma: firmaUrl ?? autoevaluacion.firma ?? null })
      toast({
        title: nuevoEstado === "cerrada" ? "Autoevaluación cerrada" : "Autoevaluación reabierta",
        description: res.message,
      })
    } else {
      toast({ title: "Error", description: res.message })
    }
  }

  if (cerrada) {
    return (
      <Card className="p-4">
        <div className="flex flex-wrap items-center gap-3">
          <span
            className="inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-bold text-white"
            style={{ backgroundColor: SST_TOKENS.ok }}
          >
            <Lock className="h-3.5 w-3.5" /> AUTOEVALUACIÓN CERRADA
          </span>
          <span className="text-sm text-muted-foreground">
            Responsable: <strong>{autoevaluacion.responsable ?? "—"}</strong> · Fecha:{" "}
            <strong>{autoevaluacion.fecha ?? "—"}</strong>
          </span>
          {autoevaluacion.firma ? (
            <img
              src={autoevaluacion.firma || "/placeholder.svg"}
              alt="Firma del responsable"
              className="h-12 rounded border bg-white"
            />
          ) : null}
          <Button variant="outline" size="sm" onClick={() => cerrar("en_proceso")} disabled={cerrando}>
            {cerrando ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null} Reabrir
          </Button>
        </div>
      </Card>
    )
  }

  return (
    <Card className="p-4">
      <p className="mb-3 flex items-center gap-2 text-sm font-semibold" style={{ color: SST_TOKENS.navy }}>
        <PenLine className="h-4 w-4" /> Cierre y firma de la autoevaluación (acta)
      </p>
      <div className="grid gap-3 md:grid-cols-3">
        <div>
          <label className="text-xs font-medium text-foreground">Responsable del SG-SST</label>
          <Input value={responsable} onChange={(e) => setResponsable(e.target.value)} placeholder="Nombre y cargo" />
        </div>
        <div>
          <label className="text-xs font-medium text-foreground">Fecha</label>
          <Input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} />
        </div>
        <div>
          <label className="text-xs font-medium text-foreground">Firma</label>
          <div className="rounded-md border bg-white">
            <canvas
              ref={canvasRef}
              width={320}
              height={90}
              className="w-full touch-none rounded-md"
              style={{ cursor: "crosshair" }}
              onPointerDown={down}
              onPointerMove={move}
              onPointerUp={up}
              onPointerLeave={up}
            />
          </div>
          <button type="button" onClick={limpiar} className="mt-1 text-[11px] text-muted-foreground underline">
            Limpiar firma
          </button>
        </div>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <Button
          onClick={() => cerrar("cerrada")}
          disabled={cerrando || !responsable}
          style={{ backgroundColor: SST_TOKENS.ok, color: "white" }}
        >
          {cerrando ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CheckCircle2 className="mr-2 h-4 w-4" />}
          Cerrar autoevaluación
        </Button>
        <span className="text-[11px] text-muted-foreground">
          Queda fechada y firmada como acta. La firma es opcional pero recomendada.
        </span>
      </div>
    </Card>
  )
}
