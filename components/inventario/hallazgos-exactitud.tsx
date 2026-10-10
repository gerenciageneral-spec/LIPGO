"use client"

// HALLAZGOS Y EXACTITUD — pestaña de Almacenamiento › Exactitud y cierre.
//
// Responde dos preguntas que hasta hoy no estaban en ninguna pantalla (gerencia, 2026-10-10):
//   1. ¿Qué encontró el conteo y sigue sin explicarse? Con su antigüedad, porque una diferencia
//      de hace una semana ya no se puede reconstruir: la diferencia es el síntoma de un
//      movimiento que no se registró el día que ocurrió (una avería que no pasó por el 551, una
//      devolución que no se entró).
//   2. ¿Está mejorando la bodega? Con el ERI en valor ABSOLUTO, que es el que no se puede
//      esconder: si un producto sobra 10 y otro falta 10, el neto es cero y parece perfecto.
//
// El cálculo está en lib/conteo-hallazgos.ts (puro, con pruebas); aquí solo se muestra.

import { useCallback, useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { Cifra, Chip, Esqueleto, EstadoVacio, Eyebrow, Punto, Seccion } from "@/components/ui/lipgo"
import { useAuth } from "@/components/auth-provider"
import { getHallazgosYExactitud } from "@/lib/sig-actions"
import type { ExactitudConteo, Hallazgo, ResumenHallazgos } from "@/lib/conteo-hallazgos"
import { ClipboardCheck, RefreshCw, TrendingDown, TrendingUp } from "lucide-react"
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip } from "recharts"

const NUM = new Intl.NumberFormat("es-CO")
const pct = (v: number) => `${NUM.format(Math.round(v * 10) / 10)} %`

export function HallazgosExactitud({ onAbrirConteo }: { onAbrirConteo?: (cuadreId: number) => void }) {
  const { selectedEmpresaId } = useAuth()
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [hallazgos, setHallazgos] = useState<Hallazgo[]>([])
  const [resumen, setResumen] = useState<ResumenHallazgos | null>(null)
  const [exactitud, setExactitud] = useState<ExactitudConteo[]>([])
  const [tendencia, setTendencia] = useState({ antes: 0, ahora: 0, delta: 0 })
  const [plazo, setPlazo] = useState(2)

  const cargar = useCallback(async () => {
    if (!selectedEmpresaId) return
    setCargando(true)
    const r = await getHallazgosYExactitud(selectedEmpresaId)
    setCargando(false)
    if (!r.success) { setError(r.error ?? "No se pudo leer"); return }
    setError(null)
    setHallazgos(r.hallazgos)
    setResumen(r.resumen)
    setExactitud(r.exactitud)
    setTendencia(r.tendencia)
    setPlazo(r.plazoDias)
  }, [selectedEmpresaId])

  useEffect(() => { void cargar() }, [cargar])

  if (!selectedEmpresaId) {
    return <EstadoVacio titulo="Selecciona un proyecto" texto="Los hallazgos y la exactitud se miden por cliente o sitio." />
  }
  if (cargando) return <Esqueleto lineas={6} />
  if (error) {
    return <EstadoVacio icono={<ClipboardCheck className="h-5 w-5" />} titulo="No se pudo leer" texto={error} accion={<Button size="sm" variant="outline" onClick={() => void cargar()}>Reintentar</Button>} />
  }

  const ultimo = exactitud.filter((e) => e.lineas > 0).slice(-1)[0]
  const serie = exactitud
    .filter((e) => e.lineas > 0)
    .map((e) => ({ fecha: String(e.fecha ?? "").slice(5), eri: e.eriUnidades, lineas: e.eriLineas }))
  const mejora = tendencia.delta
  const tonoEri = (v: number): "ok" | "atencion" | "critico" => (v >= 98 ? "ok" : v >= 95 ? "atencion" : "critico")

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <Eyebrow>Últimos 90 días · plazo de explicación: {plazo} días</Eyebrow>
          <h2 className="text-lg font-bold leading-tight">Hallazgos y exactitud</h2>
        </div>
        <Button size="sm" variant="outline" onClick={() => void cargar()} className="gap-1.5">
          <RefreshCw className="h-3.5 w-3.5" /> Actualizar
        </Button>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-lg border bg-card p-3 shadow-sm">
          <Cifra
            label="Sin explicar"
            valor={NUM.format(resumen?.total ?? 0)}
            unidad="hallazgos"
            tono={(resumen?.total ?? 0) === 0 ? "ok" : (resumen?.vencidos ?? 0) > 0 ? "critico" : "atencion"}
            tamano="compacta"
            sub={`${NUM.format(resumen?.unidadesPendientes ?? 0)} unidades en juego`}
          />
        </div>
        <div className="rounded-lg border bg-card p-3 shadow-sm">
          <Cifra
            label={`Vencidos (más de ${plazo} días)`}
            valor={NUM.format(resumen?.vencidos ?? 0)}
            tono={(resumen?.vencidos ?? 0) === 0 ? "ok" : "critico"}
            tamano="compacta"
            sub="ya no se pueden reconstruir"
          />
        </div>
        <div className="rounded-lg border bg-card p-3 shadow-sm">
          <Cifra
            label="Sin novedad escrita"
            valor={NUM.format(resumen?.sinNovedad ?? 0)}
            tono={(resumen?.sinNovedad ?? 0) === 0 ? "ok" : "atencion"}
            tamano="compacta"
            sub="nadie dijo qué pasó"
          />
        </div>
        <div className="rounded-lg border bg-card p-3 shadow-sm">
          <Cifra
            label="Exactitud del último conteo"
            valor={ultimo ? pct(ultimo.eriUnidades) : "—"}
            tono={ultimo ? tonoEri(ultimo.eriUnidades) : "neutro"}
            tamano="compacta"
            progreso={ultimo?.eriUnidades}
            sub={
              ultimo
                ? `${NUM.format(ultimo.unidadesErradas)} de ${NUM.format(ultimo.unidadesSistema)} unidades mal registradas · ${ultimo.lineasExactas}/${ultimo.lineas} líneas exactas`
                : "todavía no hay conteos contados"
            }
            chips={
              mejora !== 0 ? (
                <Chip tono={mejora > 0 ? "ok" : "critico"}>
                  {mejora > 0 ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                  {mejora > 0 ? "+" : ""}{NUM.format(mejora)} puntos vs. los anteriores
                </Chip>
              ) : undefined
            }
          />
        </div>
      </div>

      <Seccion
        eyebrow="Exactitud por conteo"
        titulo="Unidades mal registradas, en valor absoluto"
        accion={<span className="text-xs text-muted-foreground">un sobrante y un faltante iguales NO se compensan</span>}
      >
        {serie.length === 0 ? (
          <p className="text-sm text-muted-foreground">Todavía no hay conteos contados en el período.</p>
        ) : (
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={serie}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="fecha" tick={{ fontSize: 11 }} />
              <YAxis domain={[0, 100]} tick={{ fontSize: 11 }} unit="%" />
              <Tooltip formatter={(v: any, n: any) => [`${v} %`, n === "eri" ? "Exactitud en unidades" : "Líneas exactas"]} />
              <Line type="monotone" dataKey="eri" name="eri" stroke="var(--color-info-fg, #0D3B6E)" strokeWidth={2} dot={{ r: 3 }} />
              <Line type="monotone" dataKey="lineas" name="lineas" stroke="#94a3b8" strokeWidth={1} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        )}
      </Seccion>

      <Seccion
        eyebrow={`${hallazgos.length} pendiente${hallazgos.length === 1 ? "" : "s"}`}
        titulo="Diferencias que siguen sin explicarse"
        accion={
          resumen && resumen.porProducto.length > 0 ? (
            <span className="text-xs text-muted-foreground">
              El peor: {resumen.porProducto[0].producto} ({NUM.format(resumen.porProducto[0].unidades)} und)
            </span>
          ) : undefined
        }
        sinPadding
      >
        {hallazgos.length === 0 ? (
          <div className="p-6">
            <EstadoVacio
              icono={<ClipboardCheck className="h-5 w-5" />}
              titulo="Nada sin explicar"
              texto="Todas las diferencias de los conteos del período se corrigieron con su código o quedaron justificadas."
            />
          </div>
        ) : (
          <div className="max-h-[420px] overflow-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-background">
                <tr className="border-b text-left text-[11px] uppercase text-muted-foreground">
                  <th className="px-3 py-2">Conteo</th>
                  <th className="px-3 py-2">Producto · lote · ubicación</th>
                  <th className="px-3 py-2 text-right">Pendiente</th>
                  <th className="px-3 py-2">Novedad escrita</th>
                  <th className="px-3 py-2 text-right">Días</th>
                </tr>
              </thead>
              <tbody>
                {hallazgos.map((h) => (
                  <tr key={`${h.cuadreId}-${h.linea}`} className="border-b last:border-0 align-top">
                    <td className="px-3 py-2">
                      <button
                        type="button"
                        className="lg-num text-left font-medium underline-offset-2 hover:underline"
                        onClick={() => onAbrirConteo?.(h.cuadreId)}
                        title="Abrir el conteo"
                      >
                        #{h.cuadreId}
                      </button>
                      <div className="lg-num text-[11px] text-muted-foreground">
                        {h.fecha ?? "—"} · {h.tipo === "ciclico" ? "cíclico" : "total"}
                      </div>
                    </td>
                    <td className="px-3 py-2">
                      {h.producto}
                      <div className="lg-num text-[11px] text-muted-foreground">
                        {h.lote || "sin lote"} · {h.location || "sin ubicación"}
                        {h.codigosAplicados.length > 0 && ` · ya corregido en parte con ${h.codigosAplicados.join("/")}`}
                      </div>
                    </td>
                    <td className="px-3 py-2 text-right">
                      <span className={`lg-num font-semibold ${h.pendiente < 0 ? "text-[var(--color-critico-fg)]" : "text-[var(--color-ok-fg)]"}`}>
                        {h.pendiente > 0 ? "+" : ""}{NUM.format(h.pendiente)}
                      </span>
                      <div className="text-[11px] text-muted-foreground">{h.pendiente < 0 ? "falta en el estante" : "sobra en el estante"}</div>
                    </td>
                    <td className="px-3 py-2 text-xs">
                      {h.novedad ? (
                        h.novedad
                      ) : (
                        <span className="text-[var(--color-atencion-fg)]">sin novedad: nadie dijo qué pasó</span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-right">
                      <span className="inline-flex items-center gap-1.5">
                        <Punto tono={h.vencido ? "critico" : h.diasAbierto >= 1 ? "atencion" : "ok"} />
                        <span className="lg-num">{h.diasAbierto}</span>
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Seccion>

      <p className="text-[11px] text-muted-foreground">
        <b>Cómo se cierra un hallazgo:</b> con el código de su causa en el propio conteo, en "Diferencias" — 551 avería, 653
        devolución, 309 cruce de lote, 311 mal ubicado. Un conteo cíclico no admite 701 ni 702: el ajuste genérico iguala el
        número y borra la evidencia. Lo que llegue sin explicar al cierre del mes entra al Conteo total con su 701 o 702 y la
        aprobación de gerencia.
      </p>
    </div>
  )
}
