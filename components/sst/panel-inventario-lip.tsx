"use client"

// Panel LIP · Inventario — Exactitud y merma (ISO 9001 8.5.1). Cuadre de
// entradas/salidas + eventos de pérdida (lo que se cobra a LIP), por año y mes
// a mes, por cliente/sitio. Fuente real: invtrans + reprocesos.

import { useEffect, useState } from "react"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import { useToast } from "@/hooks/use-toast"
import { SST_TOKENS } from "@/components/sst/sst-utils"
import { SigHeader, SigFilterBar, SigField, SigKpi, sigControl } from "@/components/sst/sig-ui"
import { useAuth } from "@/components/auth-provider"
import { getPanelInventarioLIP, getKardexInventario, getMovimientosProducto, getTiposMovimiento, getCuadreDiario, getPreservacionInventario, getConciliacionMensualInventario } from "@/lib/sig-actions"
import { Loader2, Boxes, TrendingDown, ArrowDownToLine, AlertTriangle, RefreshCw, CalendarClock, Layers, FileText, BookOpen, ZoomIn, ClipboardList, ShieldAlert } from "lucide-react"
import { ResponsiveContainer, BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend } from "recharts"

const DONUT_COLORS = ["#1E8449", "#0D3B6E", "#00B4CC", "#E0A800", "#7e57c2", "#C0392B"]

function KPI({ label, valor, unidad, Icon, color, sub }: { label: string; valor: number | string; unidad?: string; Icon: any; color: string; sub?: string }) {
  return <SigKpi label={label} value={valor} unit={unidad} Icon={Icon} accent={color} valueColor={color} sub={sub} />
}

export function PanelInventarioLIP() {
  const { toast } = useToast()
  const { selectedEmpresaId, selectedEmpresaNombre } = useAuth()
  const [data, setData] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [anio, setAnio] = useState<string>("")
  const [mes, setMes] = useState<string>("")
  const [kardex, setKardex] = useState<any[]>([])
  const [loadingKardex, setLoadingKardex] = useState(false)
  const [filtroProd, setFiltroProd] = useState<string>("")
  const [drill, setDrill] = useState<{ producto: string; movs: any[] } | null>(null)
  const [loadingDrill, setLoadingDrill] = useState(false)
  const [tiposMov, setTiposMov] = useState<any[]>([])
  const [verNomenclatura, setVerNomenclatura] = useState(false)
  const [cuadreD, setCuadreD] = useState<any[]>([])
  const [loadingCD, setLoadingCD] = useState(false)
  const [pres, setPres] = useState<any>(null)
  const [loadingPres, setLoadingPres] = useState(false)
  const [conc, setConc] = useState<any[]>([])
  const [loadingConc, setLoadingConc] = useState(false)
  const [tab, setTab] = useState("dashboard")
  const [acta, setActa] = useState<any>(null)

  function abrirActaConciliacion(f: any) {
    setActa(f)
  }

  const MESES = [
    { v: "", l: "Todo el año" }, { v: "01", l: "Enero" }, { v: "02", l: "Febrero" }, { v: "03", l: "Marzo" },
    { v: "04", l: "Abril" }, { v: "05", l: "Mayo" }, { v: "06", l: "Junio" }, { v: "07", l: "Julio" },
    { v: "08", l: "Agosto" }, { v: "09", l: "Septiembre" }, { v: "10", l: "Octubre" }, { v: "11", l: "Noviembre" }, { v: "12", l: "Diciembre" },
  ]

  useEffect(() => {
    let cancel = false
    setLoading(true)
    // El cliente/sitio lo define el SELECTOR GLOBAL (conector).
    getPanelInventarioLIP(selectedEmpresaId ?? null, anio || null, mes || null).then((r) => {
      if (cancel) return
      if (r.success) {
        setData(r.data)
        if (!anio && r.data?.anio) setAnio(r.data.anio)
      } else toast({ title: "No se pudo cargar el panel", description: r.error })
      setLoading(false)
    })
    return () => { cancel = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedEmpresaId, anio, mes])

  // Las pestañas distintas a "Dashboard" recargan al cambiar el selector global,
  // el año o el mes (antes solo cargaban al hacer clic → mostraban datos viejos).
  useEffect(() => {
    if (tab === "kardex") cargarKardex()
    else if (tab === "diario") cargarCuadreDiario()
    else if (tab === "preservacion") cargarPreservacion()
    else if (tab === "conciliacion") cargarConciliacion()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, selectedEmpresaId, anio, mes])

  async function cargarKardex() {
    setLoadingKardex(true)
    const r = await getKardexInventario(selectedEmpresaId ?? null, anio || null, mes || null)
    if (r.success) setKardex(r.data.filas)
    else toast({ title: "No se pudo cargar el kardex", description: r.error })
    setLoadingKardex(false)
  }

  async function abrirDrill(p: any) {
    setDrill({ producto: `${p.producto} (${p.codproducto})`, movs: [] })
    setLoadingDrill(true)
    const r = await getMovimientosProducto(p.codproducto, selectedEmpresaId ?? null, anio || null, mes || null)
    setLoadingDrill(false)
    if (r.success) setDrill({ producto: `${p.producto} (${p.codproducto})`, movs: r.data })
    else toast({ title: "No se pudo cargar el detalle", description: r.error })
  }

  async function abrirNomenclatura() {
    setVerNomenclatura(true)
    if (tiposMov.length === 0) {
      const r = await getTiposMovimiento()
      if (r.success) setTiposMov(r.data)
    }
  }

  async function cargarCuadreDiario() {
    setLoadingCD(true)
    const r = await getCuadreDiario(selectedEmpresaId ?? null, anio || null, mes || null)
    if (r.success) setCuadreD(r.data)
    else toast({ title: "No se pudo cargar el cuadre diario", description: r.error })
    setLoadingCD(false)
  }
  async function cargarPreservacion() {
    setLoadingPres(true)
    const r = await getPreservacionInventario(selectedEmpresaId ?? null)
    if (r.success) setPres(r.data)
    else toast({ title: "No se pudo cargar preservación", description: r.error })
    setLoadingPres(false)
  }
  async function cargarConciliacion() {
    setLoadingConc(true)
    const r = await getConciliacionMensualInventario(selectedEmpresaId ?? null, anio || null)
    if (r.success) setConc(r.data.filas)
    else toast({ title: "No se pudo cargar la conciliación", description: r.error })
    setLoadingConc(false)
  }

  const k = data?.kpis
  const colorExact = (v: number) => (v >= 98 ? SST_TOKENS.ok : v >= 95 ? SST_TOKENS.warn : SST_TOKENS.bad)
  const fmt = (n: number) => (n ?? 0).toLocaleString("es-CO")
  const mesActual = new Date().toISOString().slice(0, 7) // "AAAA-MM" — solo este mes queda pendiente

  return (
    <div className="space-y-5">
      <SigHeader
        Icon={Boxes}
        title="Panel LIP · Inventario — Exactitud y merma"
        subtitle={<>Cuadre y exactitud de inventario · ISO 9001 8.5.1 — por año y mes a mes, por cliente/sitio. Las diferencias se concilian contra los movimientos; lo que reste se ajusta con documento soporte.</>}
      />

      <SigFilterBar cliente={selectedEmpresaNombre}>
        <SigField label="Año">
          <select value={anio} onChange={(e) => setAnio(e.target.value)} className={sigControl}>
            {(data?.anios ?? []).map((a: string) => (<option key={a} value={a}>{a}</option>))}
          </select>
        </SigField>
        <SigField label="Mes">
          <select value={mes} onChange={(e) => setMes(e.target.value)} className={sigControl}>
            {MESES.map((m) => (<option key={m.v} value={m.v}>{m.l}</option>))}
          </select>
        </SigField>
        {loading && <Loader2 className="h-4 w-4 animate-spin" style={{ color: SST_TOKENS.teal }} />}
      </SigFilterBar>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="dashboard">Dashboard</TabsTrigger>
          <TabsTrigger value="conciliacion">Conciliación mensual</TabsTrigger>
          <TabsTrigger value="kardex">Inventario detalle (Kardex)</TabsTrigger>
          <TabsTrigger value="diario">Cuadre diario</TabsTrigger>
          <TabsTrigger value="preservacion">Preservación / FIFO</TabsTrigger>
        </TabsList>

        <TabsContent value="dashboard" className="space-y-5 pt-3">
      {!data ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin" style={{ color: SST_TOKENS.navy }} />
        </div>
      ) : (
        <>
          <div className="flex justify-end">
            <Button variant="outline" size="sm" onClick={abrirNomenclatura}>
              <BookOpen className="mr-1 h-4 w-4" /> Nomenclatura de movimientos
            </Button>
          </div>

          {/* KPIs de gestión de almacén (alto nivel) */}
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
            <KPI label="ERI — Exactitud de registro" valor={k.eri} unidad="%" Icon={Boxes} color={colorExact(k.eri)} sub="físico vs libro (conteo)" />
            <KPI label="Rotación de inventario" valor={k.rotacion} unidad="x" Icon={RefreshCw} color={SST_TOKENS.navy} sub="despacho / stock" />
            <KPI label="Días de inventario" valor={fmt(k.diasInventario)} unidad="días" Icon={CalendarClock} color={k.diasInventario > 60 ? SST_TOKENS.warn : SST_TOKENS.ok} sub="cobertura de stock" />
            <KPI label="Stock (libro)" valor={fmt(k.saldoFisico)} unidad="und" Icon={Boxes} color={SST_TOKENS.navy} sub={`${fmt(k.skusConStock)} SKUs con stock`} />
            <KPI label="SKUs activos" valor={fmt(k.skusActivos)} Icon={Layers} color={SST_TOKENS.navy} sub="con movimiento en el periodo" />
            <KPI label="SKUs sin movimiento" valor={fmt(k.skusSinMovimiento)} Icon={AlertTriangle} color={k.skusSinMovimiento ? SST_TOKENS.warn : SST_TOKENS.ok} sub="stock sin rotar (slow movers)" />
          </div>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <KPI label="Faltante (conteo físico)" valor={fmt(k.faltante)} unidad="und" Icon={TrendingDown} color={k.faltante ? SST_TOKENS.bad : SST_TOKENS.ok} sub="dif. negativa del cuadre" />
            <KPI label="Sobrante" valor={fmt(k.sobrante)} unidad="und" Icon={ArrowDownToLine} color={SST_TOKENS.navy} sub="dif. positiva del conteo" />
            <KPI label="Movimientos del periodo" valor={fmt(k.movimientos)} unidad="und" Icon={Layers} color={SST_TOKENS.navy} />
            <KPI label="Merma de proceso (reproceso)" valor={fmt(k.mermaProceso)} unidad="und" Icon={AlertTriangle} color={SST_TOKENS.warn} sub="avería en proceso (551)" />
          </div>

          <div className="grid gap-4 lg:grid-cols-3">
            <Card className="p-3">
              <h3 className="mb-2 text-sm font-semibold" style={{ color: SST_TOKENS.ink }}>Distribución de movimientos</h3>
              <ResponsiveContainer width="100%" height={240}>
                <PieChart>
                  <Pie data={data.movimientos.filter((m: any) => m.cant > 0)} dataKey="cant" nameKey="tipo" cx="50%" cy="50%" outerRadius={80} label={(e: any) => e.tipo?.split(" ")[0]}>
                    {data.movimientos.filter((m: any) => m.cant > 0).map((_: any, i: number) => (<Cell key={i} fill={DONUT_COLORS[i % DONUT_COLORS.length]} />))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            </Card>

            <Card className="p-3 lg:col-span-2">
              <h3 className="mb-2 text-sm font-semibold" style={{ color: SST_TOKENS.ink }}>Top productos por salidas (fast movers)</h3>
              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={data.topMovers} layout="vertical" margin={{ left: 10 }}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis type="number" tick={{ fontSize: 11 }} />
                  <YAxis type="category" dataKey="producto" tick={{ fontSize: 9 }} width={160} />
                  <Tooltip />
                  <Bar dataKey="salidas" name="Salidas (und)" fill={SST_TOKENS.navy} radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </Card>
          </div>

          <div className="grid gap-4 lg:grid-cols-3">
            <Card className="p-3">
              <h3 className="mb-2 text-sm font-semibold" style={{ color: SST_TOKENS.ink }}>Clasificación ABC (Pareto)</h3>
              <div className="space-y-2">
                {[
                  { c: "A", l: "Alto movimiento (≤80%)", v: data.abc.A, color: SST_TOKENS.ok },
                  { c: "B", l: "Medio (80–95%)", v: data.abc.B, color: SST_TOKENS.warn },
                  { c: "C", l: "Bajo / cola (95–100%)", v: data.abc.C, color: "#94a3b8" },
                ].map((x) => (
                  <div key={x.c} className="flex items-center justify-between">
                    <span className="flex items-center gap-2 text-sm"><Badge style={{ background: x.color, color: "white" }}>{x.c}</Badge>{x.l}</span>
                    <span className="font-bold" style={{ color: x.color }}>{x.v} SKU</span>
                  </div>
                ))}
              </div>
            </Card>

            <Card className="p-3 lg:col-span-2">
              <h3 className="mb-2 text-sm font-semibold" style={{ color: SST_TOKENS.ink }}>Recepción vs Despacho por mes ({data.anio})</h3>
              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={data.porMes}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="mes" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip />
                  <Legend />
                  <Bar dataKey="recepcion" name="Recepción (101)" fill={SST_TOKENS.ok} radius={[3, 3, 0, 0]} />
                  <Bar dataKey="despacho" name="Despacho (601)" fill={SST_TOKENS.navy} radius={[3, 3, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </Card>
          </div>

          <Card className="p-3">
            <p className="text-[11px] text-muted-foreground">
              <b>Nomenclatura LIPgo:</b> stock perpetuo (recepción 101, despacho 601, traslado 311, ajuste 701/702, inicial 561, merma 551). <b>ERI</b> por conteo físico (Cuadre). <b>Rotación</b> = despacho/stock; <b>días de inventario</b> = cobertura. <b>ABC</b> = Pareto por salidas. <b>Ingresos</b> = aprobación de producción (PT) / órdenes de descargue (Cedis) / devoluciones. <b>Salidas</b> = órdenes de cargue / reproceso (avería). Los traslados internos no alteran el stock. Las diferencias del cuadre se concilian; el residual se ajusta con documento soporte.
            </p>
          </Card>
        </>
      )}
        </TabsContent>

        {/* CONCILIACIÓN MENSUAL — depuración mes a mes (mes del código de orden) */}
        <TabsContent value="conciliacion" className="space-y-3 pt-3">
          <p className="text-xs text-muted-foreground">
            <ClipboardList className="mr-1 inline h-3.5 w-3.5" />
            Mes a mes (mes tomado del <b>código de la orden</b>). <b>Ingresos</b> = recepción/aprobación PT + descargue + devolución · <b>Salidas</b> = orden de cargue + reproceso. Traslados internos, proyección y tolva NO se cuentan. <b>Mayo y anteriores quedan conciliados; solo el mes actual (junio) queda pendiente</b> — se ajusta con el inventario físico. El stock vivo del software ya está correcto.
          </p>
          {loadingConc ? (
            <div className="flex justify-center py-10"><Loader2 className="h-5 w-5 animate-spin" style={{ color: SST_TOKENS.navy }} /></div>
          ) : conc.length === 0 ? (
            <Card className="p-8 text-center text-sm text-muted-foreground">Sin movimientos para el año seleccionado.</Card>
          ) : (
            <Card className="overflow-hidden">
              <div className="max-h-[60vh] overflow-auto">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-background">
                    <tr className="border-b text-left text-[11px] uppercase text-muted-foreground">
                      <th className="px-3 py-2">Mes</th>
                      <th className="px-3 py-2">Estado</th>
                      <th className="px-3 py-2 text-right">Saldo inicial</th>
                      <th className="px-3 py-2 text-right">Ingresos</th>
                      <th className="px-3 py-2 text-right">Salidas</th>
                      <th className="px-3 py-2 text-right">Saldo final</th>
                      <th className="px-3 py-2 text-right">Faltante (a ingresar)</th>
                      <th className="px-3 py-2 text-right">Ajuste 701/702</th>
                      <th className="px-3 py-2 text-center">Doc.</th>
                    </tr>
                  </thead>
                  <tbody>
                    {conc.map((f) => (
                      <tr key={f.mes} className="border-b last:border-0">
                        <td className="px-3 py-1.5 font-medium">{f.mes}</td>
                        <td className="px-3 py-1.5">
                          {f.mes >= mesActual ? (
                            <Badge style={{ background: SST_TOKENS.warn, color: "white" }}>Pendiente</Badge>
                          ) : (
                            <Badge style={{ background: SST_TOKENS.ok, color: "white" }}>Conciliado</Badge>
                          )}
                        </td>
                        <td className="px-3 py-1.5 text-right text-muted-foreground">{fmt(f.saldoInicial)}</td>
                        <td className="px-3 py-1.5 text-right" style={{ color: SST_TOKENS.ok }} title={`Recepción ${fmt(f.recepcion)} · Devolución ${fmt(f.devolucion)}`}>{fmt(f.ingresos)}</td>
                        <td className="px-3 py-1.5 text-right" style={{ color: SST_TOKENS.navy }} title={`Cargue ${fmt(f.cargue)} · Reproceso ${fmt(f.reproceso)}`}>{fmt(f.salidas)}</td>
                        <td className="px-3 py-1.5 text-right font-semibold">{fmt(f.saldoFinal)}</td>
                        <td className="px-3 py-1.5 text-right font-bold" style={{ color: f.faltante ? SST_TOKENS.bad : SST_TOKENS.ok }}>{fmt(f.faltante)}</td>
                        <td className="px-3 py-1.5 text-right" style={{ color: f.ajuste ? SST_TOKENS.warn : "inherit" }}>{fmt(f.ajuste)}</td>
                        <td className="px-3 py-1.5 text-center">
                          {f.faltante > 0 ? (
                            <Button size="sm" variant="outline" className="h-7 gap-1 text-[11px]" onClick={() => abrirActaConciliacion(f)}>
                              <FileText className="h-3.5 w-3.5" /> Generar
                            </Button>
                          ) : (
                            <span className="text-[11px]" style={{ color: SST_TOKENS.ok }}>✓ OK</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          )}
          <p className="text-[11px] text-muted-foreground">El <b>Ajuste a depurar</b> &gt; 0 indica movimientos manuales/ajustes (701/702) o salidas sin orden de cargue que deben investigarse y documentarse mes a mes — antes de cerrar el periodo. No se asume como merma.</p>
        </TabsContent>

        {/* INVENTARIO DETALLE — Kardex por producto (movimiento total ingreso→salida) */}
        <TabsContent value="kardex" className="space-y-3 pt-3">
          <div className="flex items-center justify-between gap-3">
            <p className="text-xs text-muted-foreground">
              Movimiento total de cada producto (ingreso → salida). {anio}{mes ? ` · mes ${mes}` : ""}
            </p>
            <Input value={filtroProd} onChange={(e) => setFiltroProd(e.target.value)} placeholder="Buscar producto/código" className="h-9 w-64" />
          </div>
          {loadingKardex ? (
            <div className="flex justify-center py-10"><Loader2 className="h-5 w-5 animate-spin" style={{ color: SST_TOKENS.navy }} /></div>
          ) : kardex.length === 0 ? (
            <Card className="p-8 text-center text-sm text-muted-foreground">Sin movimientos para el periodo seleccionado.</Card>
          ) : (
            <Card className="overflow-hidden">
              <div className="max-h-[60vh] overflow-auto">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-background">
                    <tr className="border-b text-left text-[11px] uppercase text-muted-foreground">
                      <th className="px-3 py-2">Código</th>
                      <th className="px-3 py-2">Producto</th>
                      <th className="px-3 py-2 text-right">Entradas</th>
                      <th className="px-3 py-2 text-right">Salidas</th>
                      <th className="px-3 py-2 text-right">Traslados</th>
                      <th className="px-3 py-2 text-right">Ajustes</th>
                      <th className="px-3 py-2 text-right">Merma</th>
                      <th className="px-3 py-2 text-right">Saldo actual</th>
                      <th className="px-3 py-2"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {kardex
                      .filter((p) => !filtroProd || `${p.codproducto} ${p.producto}`.toLowerCase().includes(filtroProd.toLowerCase()))
                      .map((p) => (
                        <tr key={p.codproducto} className="cursor-pointer border-b last:border-0 hover:bg-muted/40" onClick={() => abrirDrill(p)}>
                          <td className="px-3 py-1.5 text-xs text-muted-foreground">{p.codproducto}</td>
                          <td className="px-3 py-1.5">{p.producto}</td>
                          <td className="px-3 py-1.5 text-right" style={{ color: SST_TOKENS.ok }}>{fmt(p.entradas)}</td>
                          <td className="px-3 py-1.5 text-right" style={{ color: SST_TOKENS.navy }}>{fmt(p.salidas)}</td>
                          <td className="px-3 py-1.5 text-right text-muted-foreground">{fmt(p.traslados)}</td>
                          <td className="px-3 py-1.5 text-right text-muted-foreground">{fmt(p.ajustes)}</td>
                          <td className="px-3 py-1.5 text-right" style={{ color: SST_TOKENS.warn }}>{fmt(p.merma)}</td>
                          <td className="px-3 py-1.5 text-right font-semibold">{fmt(p.saldo)}</td>
                          <td className="px-3 py-1.5 text-right"><ZoomIn className="h-3.5 w-3.5 text-muted-foreground" /></td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            </Card>
          )}
          <p className="text-[11px] text-muted-foreground">Clic en un producto para ver sus movimientos y soportes (PDF de ingreso/aprobación y orden de cargue de cada salida).</p>
        </TabsContent>

        {/* CUADRE DIARIO — saldo inicial + ingresos − salidas = saldo final */}
        <TabsContent value="diario" className="space-y-3 pt-3">
          <p className="text-xs text-muted-foreground">
            <ClipboardList className="mr-1 inline h-3.5 w-3.5" />
            Control diario: <b>saldo inicial</b> (con que inicia el día) + <b>ingresos</b> (recepción/descargue/aprobación) − <b>salidas</b> (órdenes de cargue) = <b>saldo final</b>. {anio}{mes ? ` · mes ${mes}` : ""}
          </p>
          {loadingCD ? (
            <div className="flex justify-center py-10"><Loader2 className="h-5 w-5 animate-spin" style={{ color: SST_TOKENS.navy }} /></div>
          ) : cuadreD.length === 0 ? (
            <Card className="p-8 text-center text-sm text-muted-foreground">Sin movimientos para el periodo. Tip: selecciona un mes para ver el detalle diario.</Card>
          ) : (
            <Card className="overflow-hidden">
              <div className="max-h-[60vh] overflow-auto">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-background">
                    <tr className="border-b text-left text-[11px] uppercase text-muted-foreground">
                      <th className="px-3 py-2">Fecha</th>
                      <th className="px-3 py-2 text-right">Saldo inicial</th>
                      <th className="px-3 py-2 text-right">Ingresos</th>
                      <th className="px-3 py-2 text-right">Salidas</th>
                      <th className="px-3 py-2 text-right">Otros</th>
                      <th className="px-3 py-2 text-right">Saldo final</th>
                    </tr>
                  </thead>
                  <tbody>
                    {cuadreD.map((d) => (
                      <tr key={d.fecha} className="border-b last:border-0">
                        <td className="px-3 py-1.5 font-medium">{d.fecha}</td>
                        <td className="px-3 py-1.5 text-right text-muted-foreground">{fmt(d.saldoInicial)}</td>
                        <td className="px-3 py-1.5 text-right" style={{ color: SST_TOKENS.ok }}>{fmt(d.ingresos)}</td>
                        <td className="px-3 py-1.5 text-right" style={{ color: SST_TOKENS.navy }}>{fmt(d.salidas)}</td>
                        <td className="px-3 py-1.5 text-right text-muted-foreground">{fmt(d.otros)}</td>
                        <td className="px-3 py-1.5 text-right font-semibold">{fmt(d.saldoFinal)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          )}
          <p className="text-[11px] text-muted-foreground">"Otros" = ajustes, inventario inicial y merma (afectan el saldo). Los traslados de ubicación no se incluyen (no cambian el stock del sitio).</p>
        </TabsContent>

        {/* PRESERVACIÓN / FIFO — antigüedad y próximos a vencer (ISO 8.5.4) */}
        <TabsContent value="preservacion" className="space-y-3 pt-3">
          {loadingPres ? (
            <div className="flex justify-center py-10"><Loader2 className="h-5 w-5 animate-spin" style={{ color: SST_TOKENS.navy }} /></div>
          ) : !pres ? (
            <Card className="p-8 text-center text-sm text-muted-foreground">Cargando…</Card>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                <KPI label="Vencidos / a carpar" valor={fmt(pres.resumen.vencidos)} Icon={ShieldAlert} color={pres.resumen.vencidos ? SST_TOKENS.bad : SST_TOKENS.ok} sub="superan vida útil" />
                <KPI label="Próximos a vencer" valor={fmt(pres.resumen.proximos)} Icon={CalendarClock} color={pres.resumen.proximos ? SST_TOKENS.warn : SST_TOKENS.ok} sub="≥70% de vida útil" />
                <KPI label="Antigüedad promedio" valor={fmt(pres.resumen.antiguedadProm)} unidad="días" Icon={CalendarClock} color={SST_TOKENS.navy} sub="en bodega" />
                <KPI label="Lotes con stock" valor={fmt(pres.resumen.total)} Icon={Layers} color={SST_TOKENS.navy} />
              </div>
              <Card className="overflow-hidden">
                <div className="max-h-[55vh] overflow-auto">
                  <table className="w-full text-sm">
                    <thead className="sticky top-0 bg-background">
                      <tr className="border-b text-left text-[11px] uppercase text-muted-foreground">
                        <th className="px-3 py-2">Producto</th>
                        <th className="px-3 py-2">Lote</th>
                        <th className="px-3 py-2 text-right">Stock</th>
                        <th className="px-3 py-2 text-right">Días en bodega</th>
                        <th className="px-3 py-2 text-right">Vida útil</th>
                        <th className="px-3 py-2">Estado</th>
                      </tr>
                    </thead>
                    <tbody>
                      {pres.filas.slice(0, 200).map((p: any, i: number) => {
                        const c = p.estado === "vencido" ? SST_TOKENS.bad : p.estado === "proximo" ? SST_TOKENS.warn : p.estado === "ok" ? SST_TOKENS.ok : "#94a3b8"
                        const lbl = p.estado === "vencido" ? "Vencido / carpar" : p.estado === "proximo" ? "Próximo" : p.estado === "ok" ? "OK" : "Sin vida útil"
                        return (
                          <tr key={i} className="border-b last:border-0">
                            <td className="px-3 py-1.5">{p.producto}</td>
                            <td className="px-3 py-1.5 text-xs text-muted-foreground">{p.lote}</td>
                            <td className="px-3 py-1.5 text-right">{fmt(p.stock)}</td>
                            <td className="px-3 py-1.5 text-right">{p.dias ?? "—"}</td>
                            <td className="px-3 py-1.5 text-right text-muted-foreground">{p.vidautil ?? "—"}</td>
                            <td className="px-3 py-1.5"><Badge style={{ background: c, color: "white" }}>{lbl}</Badge></td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </Card>
              <p className="text-[11px] text-muted-foreground">FIFO: el sistema sugiere despachar el lote más antiguo primero (orden por lote). Vida útil = <code>productos.vidautildias</code> (p. ej. harina ~15 días → carpar). Antigüedad estimada desde la fecha del lote (AAAAMMDD). ISO 9001 8.5.4 (preservación).</p>
            </>
          )}
        </TabsContent>
      </Tabs>

      {/* DRILL-DOWN: movimientos de un producto con soportes PDF */}
      <Dialog open={!!drill} onOpenChange={(o) => !o && setDrill(null)}>
        <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
          {drill && (
            <>
              <DialogHeader><DialogTitle className="text-base">Movimientos · {drill.producto}</DialogTitle></DialogHeader>
              {loadingDrill ? (
                <div className="flex justify-center py-10"><Loader2 className="h-5 w-5 animate-spin" style={{ color: SST_TOKENS.navy }} /></div>
              ) : drill.movs.length === 0 ? (
                <p className="py-6 text-center text-sm text-muted-foreground">Sin movimientos en el periodo.</p>
              ) : (
                <div className="max-h-[65vh] overflow-auto">
                  <table className="w-full text-sm">
                    <thead className="sticky top-0 bg-background">
                      <tr className="border-b text-left text-[11px] uppercase text-muted-foreground">
                        <th className="px-2 py-2">Fecha</th>
                        <th className="px-2 py-2">Tipo</th>
                        <th className="px-2 py-2">Lote</th>
                        <th className="px-2 py-2 text-right">Cantidad</th>
                        <th className="px-2 py-2">Usuario</th>
                        <th className="px-2 py-2">Orden</th>
                        <th className="px-2 py-2">Soportes</th>
                      </tr>
                    </thead>
                    <tbody>
                      {drill.movs.map((mv, i) => (
                        <tr key={i} className="border-b last:border-0 align-top">
                          <td className="px-2 py-1.5 text-xs">{String(mv.fecha || "").slice(0, 10)}</td>
                          <td className="px-2 py-1.5"><Badge variant="outline" className="text-[10px]">{mv.tipo}</Badge></td>
                          <td className="px-2 py-1.5 text-xs text-muted-foreground">{mv.lote}</td>
                          <td className="px-2 py-1.5 text-right font-medium" style={{ color: mv.tipomov === "Salida" ? SST_TOKENS.navy : SST_TOKENS.ok }}>{fmt(mv.cantidad)}</td>
                          <td className="px-2 py-1.5 text-xs">{mv.usuario || "—"}</td>
                          <td className="px-2 py-1.5 text-xs text-muted-foreground">{mv.ocargue}</td>
                          <td className="px-2 py-1.5">
                            <span className="flex flex-wrap gap-2">
                              {mv.pdf && <a href={mv.pdf} target="_blank" rel="noreferrer" className="flex items-center gap-1 text-xs hover:underline" style={{ color: SST_TOKENS.navy }}><FileText className="h-3 w-3" /> Ingreso</a>}
                              {mv.pdfoc && <a href={mv.pdfoc} target="_blank" rel="noreferrer" className="flex items-center gap-1 text-xs hover:underline" style={{ color: SST_TOKENS.navy }}><FileText className="h-3 w-3" /> Orden</a>}
                              {mv.doccargue && <a href={mv.doccargue} target="_blank" rel="noreferrer" className="flex items-center gap-1 text-xs hover:underline" style={{ color: SST_TOKENS.navy }}><FileText className="h-3 w-3" /> Picking</a>}
                              {!mv.pdf && !mv.pdfoc && !mv.doccargue && <span className="text-xs text-muted-foreground">—</span>}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* NOMENCLATURA de tipos de movimiento */}
      <Dialog open={verNomenclatura} onOpenChange={setVerNomenclatura}>
        <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
          <DialogHeader><DialogTitle className="text-base">Nomenclatura de tipos de movimiento (LIPgo)</DialogTitle></DialogHeader>
          {tiposMov.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">Corre el SQL 17 para cargar el catálogo, o cárgalo desde la app.</p>
          ) : (
            <div className="space-y-2">
              {tiposMov.map((t) => (
                <div key={t.id} className="rounded-md border p-2">
                  <div className="flex items-center gap-2">
                    <Badge style={{ background: SST_TOKENS.navy, color: "white" }}>{t.codigo}</Badge>
                    <span className="font-medium">{t.nombre}</span>
                    <span className="text-[11px] uppercase text-muted-foreground">{t.clase}</span>
                  </div>
                  <div className="mt-1 text-xs text-muted-foreground">{t.descripcion}</div>
                  <div className="mt-0.5 text-[11px] text-muted-foreground"><b>En LIPgo:</b> {t.origen_lipgo}</div>
                </div>
              ))}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* DOCUMENTO: Acta de ajuste / conciliación mensual de inventario */}
      <Dialog open={!!acta} onOpenChange={(o) => !o && setActa(null)}>
        <DialogContent className="max-w-lg">
          {acta && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2 text-base">
                  <FileText className="h-5 w-5" style={{ color: SST_TOKENS.navy }} /> Acta de ajuste de inventario
                </DialogTitle>
              </DialogHeader>
              <div className="space-y-3 text-sm">
                <div className="rounded-lg border bg-muted/40 p-3">
                  <div className="font-semibold" style={{ color: SST_TOKENS.ink }}>{selectedEmpresaNombre || "Todos los clientes"} · {acta.mes}</div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Conciliación de movimientos del mes (inventario no puede quedar negativo). El faltante corresponde a <b>producción no ingresada</b> que debe regularizarse con un ingreso de ajuste.
                  </p>
                </div>
                <table className="w-full">
                  <tbody>
                    <tr className="border-b"><td className="py-1.5 text-muted-foreground">Saldo inicial</td><td className="py-1.5 text-right font-medium">{fmt(acta.saldoInicial)}</td></tr>
                    <tr className="border-b"><td className="py-1.5 text-muted-foreground">(+) Ingresos (producción / descargue / devolución)</td><td className="py-1.5 text-right" style={{ color: SST_TOKENS.ok }}>{fmt(acta.ingresos)}</td></tr>
                    <tr className="border-b"><td className="py-1.5 text-muted-foreground">(−) Salidas (cargue + reproceso)</td><td className="py-1.5 text-right" style={{ color: SST_TOKENS.navy }}>{fmt(acta.salidas)}</td></tr>
                    <tr className="border-b"><td className="py-1.5 font-semibold">Saldo final teórico</td><td className="py-1.5 text-right font-semibold">{fmt(acta.saldoFinal)}</td></tr>
                    <tr className="border-b" style={{ background: `${SST_TOKENS.bad}10` }}><td className="py-1.5 font-bold" style={{ color: SST_TOKENS.bad }}>Faltante = producción a ingresar (ajuste)</td><td className="py-1.5 text-right font-bold" style={{ color: SST_TOKENS.bad }}>{fmt(acta.faltante)}</td></tr>
                    <tr><td className="py-1.5 text-muted-foreground">Ajustes manuales del mes (701/702)</td><td className="py-1.5 text-right">{fmt(acta.ajuste)}</td></tr>
                  </tbody>
                </table>
                <p className="text-[11px] text-muted-foreground">
                  Acción: registrar un <b>ingreso de ajuste de {fmt(acta.faltante)} und</b> (cod 701) por producción no ingresada, en Transacciones de Inventario, para cerrar el mes sin negativo. Este documento es el soporte del cruce.
                </p>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setActa(null)}>Cerrar</Button>
                <Button onClick={() => { if (typeof window !== "undefined") window.print() }}>Imprimir / PDF</Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
