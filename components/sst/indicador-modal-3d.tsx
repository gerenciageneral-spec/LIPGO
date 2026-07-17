"use client"

// Ventana emergente FUTURISTA (3D / neón / glassmorphism) de UN indicador del
// SG-SST, con DATOS REALES de sst_indicadores. Se abre desde la Matriz 0312 al
// tocar el indicador de un numeral 3.3.x. Autocontenida (trae sus datos).

import { useEffect, useState } from "react"
import { X, Loader2, Activity, TrendingDown, TrendingUp, Minus } from "lucide-react"
import { listIndicadores } from "@/lib/sst-plan-actions"
import type { IndicadorRow } from "@/lib/sst-evidencia-types"
import { fichaDe, enMeta, MESES } from "@/components/sst/indicador-detalle"
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ReferenceLine,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts"

export function IndicadorModal3D({
  tipo,
  anio,
  onClose,
}: {
  tipo: string
  anio: string | number
  onClose: () => void
}) {
  const [rows, setRows] = useState<IndicadorRow[] | null>(null)
  useEffect(() => {
    let cancel = false
    listIndicadores(null).then((r) => !cancel && setRows(r)).catch(() => !cancel && setRows([]))
    const onEsc = (e: KeyboardEvent) => e.key === "Escape" && onClose()
    window.addEventListener("keydown", onEsc)
    return () => {
      cancel = true
      window.removeEventListener("keydown", onEsc)
    }
  }, [onClose])

  const f = fichaDe(tipo)
  const A = String(anio)
  const P = String(Number(anio) - 1)

  let valor: number | null = null,
    meta: number | null = null,
    unidad = "",
    obs: string | null = null,
    prevV: number | null = null
  const mens: (number | null)[] = Array(12).fill(null)
  if (rows) {
    const anual = rows.find((r) => r.tipo === tipo && r.periodo === A)
    const prev = rows.find((r) => r.tipo === tipo && r.periodo === P)
    valor = anual?.valor ?? null
    meta = anual?.meta ?? null
    unidad = anual?.unidad || ""
    obs = anual?.observacion ?? null
    prevV = prev?.valor ?? null
    for (const r of rows) {
      if (r.tipo !== tipo) continue
      const m = String(r.periodo).match(new RegExp(`^${A}-(\\d{2})$`))
      if (m) mens[Number(m[1]) - 1] = r.valor
    }
  }
  const sentido = f?.sentido ?? "menor"
  const ok = enMeta(valor, meta, sentido)
  const accent = ok == null ? "#38bdf8" : ok ? "#34d399" : "#fb7185" // cyan / verde / rojo neón
  const delta = valor != null && prevV != null ? Math.round((valor - prevV) * 10) / 10 : null
  const mejora = delta == null ? null : sentido === "menor" ? delta < 0 : delta > 0

  // Cumplimiento de meta (para el gauge circular). 0..1.
  let cumpl = 0
  if (valor != null && meta != null) {
    if (sentido === "menor") cumpl = meta === 0 ? (valor === 0 ? 1 : 0) : Math.max(0, Math.min(1, meta / (valor || 1)))
    else cumpl = meta === 0 ? 1 : Math.max(0, Math.min(1, valor / meta))
  }
  const R = 52,
    C = 2 * Math.PI * R
  const chart = mens.map((v, i) => ({ mes: MESES[i], valor: v }))

  return (
    <div className="ind3d-overlay" onClick={onClose} role="dialog" aria-modal="true">
      <style>{`
        .ind3d-overlay{position:fixed;inset:0;z-index:60;display:flex;align-items:center;justify-content:center;
          background:radial-gradient(120% 120% at 50% 0%, rgba(10,22,40,.72), rgba(3,7,18,.86));
          backdrop-filter:blur(6px);animation:ind3d-fade .25s ease;padding:16px;overflow-y:auto;}
        @keyframes ind3d-fade{from{opacity:0}to{opacity:1}}
        .ind3d-panel{position:relative;width:min(760px,96vw);max-height:92vh;overflow-y:auto;border-radius:20px;
          color:#e6f3ff;background:linear-gradient(160deg,#0b1c33 0%,#0e2748 55%,#0a1930 100%);
          border:1px solid rgba(96,180,240,.35);
          box-shadow:0 0 0 1px rgba(120,200,255,.08), 0 30px 80px -20px rgba(0,0,0,.8), 0 0 60px -10px ${accent}55;
          transform:perspective(1400px) rotateX(6deg) translateY(8px) scale(.96);opacity:0;
          animation:ind3d-in .5s cubic-bezier(.16,1,.3,1) forwards;}
        @keyframes ind3d-in{to{transform:perspective(1400px) rotateX(0) translateY(0) scale(1);opacity:1}}
        .ind3d-grid{position:absolute;inset:0;border-radius:20px;pointer-events:none;opacity:.5;
          background-image:linear-gradient(rgba(120,200,255,.06) 1px,transparent 1px),linear-gradient(90deg,rgba(120,200,255,.06) 1px,transparent 1px);
          background-size:26px 26px;mask-image:radial-gradient(80% 60% at 50% 0%,#000,transparent 75%);}
        .ind3d-glass{background:rgba(255,255,255,.05);border:1px solid rgba(150,210,255,.14);border-radius:14px;backdrop-filter:blur(4px);}
        .ind3d-chip{font-size:10px;font-weight:800;letter-spacing:.5px;padding:2px 8px;border-radius:999px;color:#04121f;}
        .ind3d-ring{filter:drop-shadow(0 0 8px ${accent}aa);}
        .ind3d-x{position:absolute;top:14px;right:14px;color:#bfe0f5;opacity:.8;transition:.15s;}
        .ind3d-x:hover{opacity:1;transform:rotate(90deg);}
      `}</style>

      <div className="ind3d-panel" onClick={(e) => e.stopPropagation()}>
        <div className="ind3d-grid" />
        <button type="button" className="ind3d-x" onClick={onClose} aria-label="Cerrar">
          <X className="h-5 w-5" />
        </button>

        {!f || rows === null ? (
          <div className="flex items-center justify-center gap-2 py-24 text-sky-200">
            <Loader2 className="h-6 w-6 animate-spin" /> Cargando indicador…
          </div>
        ) : (
          <div className="relative p-6">
            {/* Encabezado */}
            <div className="flex items-center gap-2">
              <span className="ind3d-chip" style={{ background: accent }}>
                {f.numeral ? `0312 · ${f.numeral}` : "SG-SST"}
              </span>
              <Activity className="h-4 w-4" style={{ color: accent }} />
              <span className="text-[11px] uppercase tracking-[.2em] text-sky-300/80">Indicador SG-SST · {A}</span>
            </div>
            <h2 className="mt-1 text-2xl font-extrabold tracking-tight">{f.nombre}</h2>

            {/* Gauge + valor */}
            <div className="mt-4 grid items-center gap-4 sm:grid-cols-[auto,1fr]">
              <div className="relative mx-auto h-32 w-32">
                <svg viewBox="0 0 120 120" className="ind3d-ring h-32 w-32 -rotate-90">
                  <circle cx="60" cy="60" r={R} fill="none" stroke="rgba(150,210,255,.15)" strokeWidth="9" />
                  <circle
                    cx="60"
                    cy="60"
                    r={R}
                    fill="none"
                    stroke={accent}
                    strokeWidth="9"
                    strokeLinecap="round"
                    strokeDasharray={C}
                    strokeDashoffset={C * (1 - cumpl)}
                    style={{ transition: "stroke-dashoffset 1s cubic-bezier(.16,1,.3,1)" }}
                  />
                </svg>
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                  <span className="text-3xl font-extrabold tabular-nums" style={{ color: accent }}>
                    {valor ?? "—"}
                  </span>
                  <span className="text-[10px] text-sky-300/70">{unidad}</span>
                </div>
              </div>
              <div className="space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded-md px-2 py-1 text-xs font-bold" style={{ background: `${accent}22`, color: accent }}>
                    {ok == null ? "SIN META" : ok ? "EN META" : "FUERA DE META"}
                  </span>
                  <span className="text-xs text-sky-200/80">Meta: {meta ?? "—"} · {sentido === "menor" ? "menor es mejor" : "mayor es mejor"}</span>
                </div>
                {delta != null && (
                  <div className="flex items-center gap-1 text-sm font-semibold" style={{ color: mejora ? "#34d399" : delta === 0 ? "#94a3b8" : "#fb7185" }}>
                    {mejora ? <TrendingDown className="h-4 w-4" /> : delta === 0 ? <Minus className="h-4 w-4" /> : <TrendingUp className="h-4 w-4" />}
                    {delta > 0 ? "+" : ""}
                    {delta} vs {P} {prevV != null ? `(${prevV} → ${valor})` : ""} {mejora ? "· mejora" : delta === 0 ? "" : "· empeora"}
                  </div>
                )}
                <p className="text-xs text-sky-200/70">{f.interpretacion}</p>
              </div>
            </div>

            {/* Tendencia mensual (neón) */}
            <div className="ind3d-glass mt-5 h-52 p-3">
              <div className="mb-1 text-[11px] uppercase tracking-widest text-sky-300/70">Tendencia mensual {A}</div>
              <ResponsiveContainer width="100%" height="85%">
                <AreaChart data={chart} margin={{ top: 6, right: 12, bottom: 0, left: -12 }}>
                  <defs>
                    <linearGradient id="ind3dfill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={accent} stopOpacity={0.5} />
                      <stop offset="100%" stopColor={accent} stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(150,210,255,.12)" />
                  <XAxis dataKey="mes" tick={{ fontSize: 10, fill: "#9fc7e8" }} axisLine={{ stroke: "rgba(150,210,255,.2)" }} />
                  <YAxis tick={{ fontSize: 10, fill: "#9fc7e8" }} width={34} axisLine={{ stroke: "rgba(150,210,255,.2)" }} />
                  <Tooltip
                    contentStyle={{ background: "#0b1c33", border: `1px solid ${accent}55`, borderRadius: 10, color: "#e6f3ff", fontSize: 12 }}
                    formatter={(v: any) => [v, f.nombre]}
                  />
                  {meta != null && <ReferenceLine y={meta} stroke="#fb7185" strokeDasharray="5 4" label={{ value: `Meta ${meta}`, fontSize: 10, fill: "#fb7185", position: "right" }} />}
                  <Area type="monotone" dataKey="valor" stroke={accent} strokeWidth={2.5} fill="url(#ind3dfill)" dot={{ r: 3, fill: accent, stroke: "#04121f" }} isAnimationActive connectNulls />
                </AreaChart>
              </ResponsiveContainer>
            </div>

            {/* Ficha técnica (glass) */}
            <div className="ind3d-glass mt-4 p-4">
              <div className="mb-2 text-[11px] uppercase tracking-widest text-sky-300/70">Ficha técnica</div>
              <div className="grid gap-x-6 gap-y-1.5 text-xs sm:grid-cols-2">
                <F3 l="Definición" v={f.definicion} full />
                <F3 l="Fórmula" v={f.formula} />
                <F3 l="Interpretación" v={f.interpretacion} />
                <F3 l="Fuente" v={f.fuente} />
                <F3 l="Periodicidad" v={f.periodicidad} />
                <F3 l="Responsable" v={f.responsable} />
              </div>
            </div>

            {obs && (
              <div className="ind3d-glass mt-3 p-3 text-xs">
                <span className="font-semibold text-sky-100">Análisis: </span>
                <span className="text-sky-200/80">{obs}</span>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

function F3({ l, v, full }: { l: string; v: string; full?: boolean }) {
  return (
    <div className={full ? "sm:col-span-2" : ""}>
      <span className="font-semibold text-sky-100">{l}: </span>
      <span className="text-sky-200/75">{v}</span>
    </div>
  )
}
