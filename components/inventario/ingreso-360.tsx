"use client"

// VISTA 360 DE UN INGRESO (gerencia, 2026-10-08): el ciclo completo de un descargue —manual o
// autodescargue— o de un movimiento de entrada: qué dice la orden, de qué cargue de planta
// viene y con qué lotes salió, qué entró de verdad al inventario (lote, ubicación, quién
// aprobó y cuándo), qué sigue por aprobar o se rechazó, y los ingresos a mano sin orden que
// probablemente son de esta orden. Mismo patrón que la vista 360 de la orden de cargue.

import { useEffect, useState } from "react"
import { AlertTriangle, CheckCircle2, ExternalLink, FileText, Loader2, Search } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Chip, Cifra, Esqueleto, Eyebrow, Punto, Seccion, type Tono } from "@/components/ui/lipgo"
import { useAuth } from "@/components/auth-provider"
import { getIngreso360, type Ingreso360, type LineaIngreso360, type MovIngreso360 } from "@/lib/ingreso-360-actions"

const NUM = new Intl.NumberFormat("es-CO")
const T1 = new Intl.NumberFormat("es-CO", { maximumFractionDigits: 1 })

const TONO_LINEA: Record<LineaIngreso360["estado"], Tono> = {
  cuadra: "ok",
  menos: "atencion",
  mas: "critico",
  sin_recibir: "critico",
  por_aprobar: "info",
  fuera: "critico",
}
const TEXTO_LINEA: Record<LineaIngreso360["estado"], string> = {
  cuadra: "Cuadra",
  menos: "Entró menos",
  mas: "Entró de más",
  sin_recibir: "Sin ingreso",
  por_aprobar: "Por aprobar",
  fuera: "No estaba en la orden",
}
const TONO_MOV: Record<MovIngreso360["estado"], Tono> = { aprobado: "ok", pendiente: "info", rechazado: "critico", otro: "neutro" }

const fmtFechaHora = (iso: string | null) => {
  if (!iso) return ""
  try {
    return new Intl.DateTimeFormat("es-CO", { timeZone: "America/Bogota", dateStyle: "short", timeStyle: "short" }).format(new Date(iso))
  } catch {
    return iso.slice(0, 16)
  }
}

export function Ingreso360Dialog({
  referencia,
  open,
  onOpenChange,
}: {
  referencia: string | null
  open: boolean
  onOpenChange: (v: boolean) => void
}) {
  const { selectedEmpresaId } = useAuth()
  const [buscado, setBuscado] = useState(referencia ?? "")
  const [data, setData] = useState<Ingreso360 | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [cargando, setCargando] = useState(false)

  const buscar = async (ref: string) => {
    if (!ref.trim()) return
    setCargando(true)
    setError(null)
    const r = await getIngreso360(ref.trim(), selectedEmpresaId)
    setCargando(false)
    if (r.success) setData(r.data)
    else {
      setData(null)
      setError(r.message)
    }
  }

  useEffect(() => {
    if (!open) return
    setBuscado(referencia ?? "")
    setData(null)
    setError(null)
    if (referencia) void buscar(referencia)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, referencia])

  const titulo = data?.clase === "autodescargue" ? "Autodescargue" : data?.clase === "descargue" ? "Descargue" : "Ingreso"

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] w-full overflow-y-auto sm:max-w-4xl">
        <DialogHeader>
          <DialogTitle>Ingreso al inventario · ciclo completo</DialogTitle>
          <DialogDescription>Qué dice la orden, con qué lotes salió de planta y qué entró de verdad al inventario.</DialogDescription>
        </DialogHeader>

        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault()
            void buscar(buscado)
          }}
        >
          <Input value={buscado} onChange={(e) => setBuscado(e.target.value)} placeholder="Orden de descargue (MOL202609299667, 107215) o # del movimiento" className="h-9" />
          <Button type="submit" size="sm" className="h-9 gap-1.5" disabled={cargando || !buscado.trim()}>
            {cargando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />} Buscar
          </Button>
        </form>

        {error && <div className="rounded-xl border border-atencion-bd bg-atencion-bg p-3 text-sm text-atencion-fg">{error}</div>}
        {cargando && !data && <Esqueleto lineas={6} />}

        {data && (
          <div className="flex flex-col gap-4">
            <section className="lg-card px-4 py-4 sm:px-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <Eyebrow>{titulo} · {data.fecha ?? "sin fecha"}{data.estado ? ` · ${data.estado}` : ""}</Eyebrow>
                  <h2 className="lg-num text-lg font-bold leading-tight">{data.referencia}</h2>
                  {data.ordenOrigen && data.clase === "autodescargue" && (
                    <p className="text-xs text-muted-foreground">Nace del cargue <span className="lg-num font-medium">{data.ordenOrigen}</span>{data.origenDetalle ? ` (${data.origenDetalle})` : ""}</p>
                  )}
                  {data.remision && <p className="text-xs text-muted-foreground">Remisión del cliente: <span className="lg-num font-medium">{data.remision}</span></p>}
                  {data.clase === "movimiento" && data.origenDetalle && <p className="text-xs text-muted-foreground">Origen: {data.origenDetalle}{data.ordenOrigen ? ` · orden ${data.ordenOrigen}` : ""}</p>}
                </div>
                {data.clase !== "movimiento" && (
                  data.resumen.cuadra ? (
                    <Chip tono="ok"><CheckCircle2 className="h-3.5 w-3.5" /> Lo que entró coincide con la orden</Chip>
                  ) : data.resumen.porAprobar > 0 && data.resumen.recibido === 0 ? (
                    <Chip tono="info"><AlertTriangle className="h-3.5 w-3.5" /> El ingreso automático espera aprobación</Chip>
                  ) : (
                    <Chip tono={data.resumen.diferencia < 0 ? "atencion" : "critico"}>
                      <AlertTriangle className="h-3.5 w-3.5" />
                      {data.resumen.diferencia < 0 ? `Entraron ${NUM.format(Math.abs(data.resumen.diferencia))} unidades menos` : `Entraron ${NUM.format(data.resumen.diferencia)} de más`}
                    </Chip>
                  )
                )}
              </div>
              <div className="mt-4 grid gap-4 sm:grid-cols-4">
                <Cifra label="Dice la orden" valor={NUM.format(data.resumen.orden)} unidad="unidades" tamano="compacta" />
                <Cifra label="Entró al inventario" valor={NUM.format(data.resumen.recibido)} unidad="aprobadas" tono={data.resumen.cuadra ? "ok" : data.resumen.diferencia < 0 ? "atencion" : "critico"} tamano="compacta" />
                <Cifra label="Por aprobar" valor={NUM.format(data.resumen.porAprobar)} unidad={data.resumen.rechazado ? `· ${NUM.format(data.resumen.rechazado)} rechazadas` : "unidades"} tono={data.resumen.porAprobar ? "info" : undefined} tamano="compacta" />
                <Cifra label="A mano sin orden" valor={NUM.format(data.resumen.candidatos)} unidad={data.resumen.candidatos ? "probablemente de esta orden" : "ninguno"} tono={data.resumen.candidatos ? "atencion" : undefined} tamano="compacta" />
              </div>
            </section>

            {data.clase !== "movimiento" && (
              <Seccion eyebrow="Vehículo" titulo={`${data.placa ?? "Sin placa"}${data.conductor ? ` · ${data.conductor}` : ""}`}>
                <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
                  {data.transporte && <div className="flex justify-between gap-3"><dt className="text-muted-foreground">Transporte</dt><dd className="font-medium">{data.transporte}</dd></div>}
                  {data.tiquete && <div className="flex justify-between gap-3"><dt className="text-muted-foreground">Tiquete de báscula</dt><dd className="lg-num font-medium">{data.tiquete}</dd></div>}
                  {data.pesoBascula != null && <div className="flex justify-between gap-3"><dt className="text-muted-foreground">Peso báscula</dt><dd className="lg-num font-medium">{T1.format(data.pesoBascula)} t</dd></div>}
                  {data.pesoOrden != null && <div className="flex justify-between gap-3"><dt className="text-muted-foreground">Peso de la orden</dt><dd className="lg-num font-medium">{T1.format(data.pesoOrden)} t</dd></div>}
                  {data.observaciones && <div className="sm:col-span-2"><dt className="text-muted-foreground">Observaciones</dt><dd className="text-xs">{data.observaciones}</dd></div>}
                </dl>
              </Seccion>
            )}

            <Seccion eyebrow="El ciclo, producto por producto" titulo="Orden · planta · ingreso" sinPadding>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[640px] text-sm">
                  <thead className="bg-muted/50 text-[11px] uppercase tracking-wide text-muted-foreground">
                    <tr>
                      <th className="px-5 py-2 text-left font-semibold">Producto</th>
                      <th className="px-3 py-2 text-right font-semibold">Orden</th>
                      <th className="px-3 py-2 text-right font-semibold">Entró</th>
                      <th className="px-3 py-2 text-right font-semibold">Por aprobar</th>
                      <th className="px-3 py-2 text-right font-semibold">Diferencia</th>
                      <th className="px-5 py-2 text-left font-semibold">Estado</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.lineas.map((l) => (
                      <tr key={l.producto} className="border-t border-border/60 align-top">
                        <td className="px-5 py-2.5">
                          <p className="font-medium">{l.producto}</p>
                          {l.lotesOrigen.length > 0 && (
                            <p className="lg-num mt-1 text-[11px] text-muted-foreground">
                              Salió de planta: {l.lotesOrigen.map((x) => `lote ${x.lote}: ${NUM.format(x.cantidad)}`).join(" · ")}
                            </p>
                          )}
                          {l.movimientos.length > 0 && (
                            <ul className="mt-1 space-y-0.5">
                              {l.movimientos.map((m) => (
                                <li key={m.id} className="lg-num flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground">
                                  <Punto tono={TONO_MOV[m.estado]} />
                                  #{m.id} lote {m.lote ?? "—"} ({m.location ?? "sin ubicación"}): {NUM.format(m.cantidad)} · {m.estado}
                                  {m.aprobadoPor ? ` · aprobó ${m.aprobadoPor}${m.aprobadoEn ? ` el ${fmtFechaHora(m.aprobadoEn)}` : ""}` : m.creadopor ? ` · ${m.creadopor}` : ""}
                                  {m.observaciones && m.observaciones.includes("Al aprobar") ? ` · ${m.observaciones}` : ""}
                                </li>
                              ))}
                            </ul>
                          )}
                          {l.candidatos.length > 0 && (
                            <div className="mt-1.5 rounded-md border border-atencion-bd bg-atencion-bg px-2 py-1 text-[11px] text-atencion-fg">
                              <b>Ingresos a mano sin orden en esos días</b> (probablemente son de esta orden; ciérrelos citándola):{" "}
                              {l.candidatos.map((c) => `#${c.id} ${NUM.format(c.cantidad)} lote ${c.lote ?? "—"} el ${fmtFechaHora(c.creado)}${c.creadopor ? ` por ${c.creadopor}` : ""}`).join(" · ")}
                            </div>
                          )}
                        </td>
                        <td className="lg-num px-3 py-2.5 text-right">{NUM.format(l.orden)}</td>
                        <td className="lg-num px-3 py-2.5 text-right font-semibold">{NUM.format(l.recibido)}</td>
                        <td className="lg-num px-3 py-2.5 text-right">{l.porAprobar ? NUM.format(l.porAprobar) : "—"}</td>
                        <td className={`lg-num px-3 py-2.5 text-right font-semibold ${l.diferencia === 0 ? "text-muted-foreground" : l.diferencia < 0 ? "text-atencion-fg" : "text-critico-fg"}`}>
                          {l.diferencia === 0 ? "0" : l.diferencia > 0 ? `+${NUM.format(l.diferencia)}` : NUM.format(l.diferencia)}
                        </td>
                        <td className="px-5 py-2.5">
                          <span className="flex items-center gap-1.5">
                            <Punto tono={TONO_LINEA[l.estado]} />
                            <span className="text-xs">{TEXTO_LINEA[l.estado]}</span>
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {data.clase !== "movimiento" && !data.resumen.cuadra && (
                <p className="border-t border-border px-5 py-3 text-xs text-muted-foreground">
                  {data.resumen.recibido === 0 && data.resumen.porAprobar === 0
                    ? "Esta orden no tiene ningún ingreso aprobado que la cite. Si el producto sí llegó, se digitó a mano sin el número de orden: por eso el inventario no cruza."
                    : data.resumen.porAprobar > 0
                      ? "Hay ingreso automático por aprobar. Al aprobarlo se puede corregir la cantidad y el lote a lo que de verdad llegó: no hace falta rechazar y volver a digitar."
                      : data.resumen.diferencia < 0
                        ? "Entró menos de lo que decía la orden. Si la diferencia quedó escrita al aprobar, esa es la explicación; si no, revisar con la bodega."
                        : "Entró más de lo que decía la orden: revísalo con la bodega."}
                </p>
              )}
            </Seccion>

            {data.linea.length > 0 && (
              <Seccion eyebrow="Cómo transcurrió el día" titulo="Tiempos del descargue" sinPadding>
                <ul className="divide-y divide-border">
                  {data.linea.map((h) => (
                    <li key={h.paso} className="flex items-center justify-between gap-3 px-5 py-2">
                      <span className="flex items-center gap-2.5 text-sm"><Punto tono="info" />{h.paso}</span>
                      <span className="lg-num text-sm font-semibold">{h.hora}</span>
                    </li>
                  ))}
                </ul>
              </Seccion>
            )}

            {data.documentos.length > 0 && (
              <Seccion eyebrow="Soportes" titulo="Documentos y fotos">
                <div className="flex flex-wrap gap-2">
                  {data.documentos.map((d) => (
                    <a key={d.url} href={d.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 rounded-lg border border-input bg-background px-3 py-1.5 text-xs font-medium transition-colors hover:bg-accent">
                      <FileText className="h-3.5 w-3.5" />
                      {d.nombre}
                      <ExternalLink className="h-3 w-3 opacity-60" />
                    </a>
                  ))}
                </div>
              </Seccion>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
