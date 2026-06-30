"use client"

// Espina de pescado (Ishikawa) + cuadros de análisis de causas para SST-FOR-21.
// Renderiza el diagrama Causa -> Efecto como SVG y permite editar las causas por
// categoría (las 6 M). Se guarda como JSON en sst_incidentes.ishikawa.

import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { SST_TOKENS } from "@/components/sst/sst-utils"

export interface IshikawaData {
  efecto: string
  categorias: { nombre: string; causas: string[] }[]
}

export const CATEGORIAS_DEFECTO = [
  "Mano de obra (Persona)",
  "Maquinaria / Equipos",
  "Método / Procedimiento",
  "Material",
  "Medio ambiente",
  "Medición / Gestión",
]

export function ishikawaVacia(): IshikawaData {
  return { efecto: "", categorias: CATEGORIAS_DEFECTO.map((nombre) => ({ nombre, causas: [] })) }
}

// Normaliza datos que pudieran venir incompletos (p. ej. de un registro viejo).
function normalizar(value?: IshikawaData | null): IshikawaData {
  if (!value || !Array.isArray(value.categorias) || value.categorias.length === 0) return ishikawaVacia()
  return {
    efecto: value.efecto ?? "",
    categorias: value.categorias.map((c) => ({ nombre: c.nombre, causas: c.causas ?? [] })),
  }
}

function wrap(text: string, max: number, maxLines: number): string[] {
  const words = (text || "").split(/\s+/)
  const lines: string[] = []
  let cur = ""
  for (const w of words) {
    if ((cur + " " + w).trim().length > max) {
      if (cur) lines.push(cur.trim())
      cur = w
    } else cur = (cur + " " + w).trim()
    if (lines.length >= maxLines) break
  }
  if (cur && lines.length < maxLines) lines.push(cur.trim())
  if (lines.length === maxLines && words.join(" ").length > lines.join(" ").length) {
    lines[maxLines - 1] = lines[maxLines - 1].slice(0, max - 1) + "…"
  }
  return lines
}

// ---------- Diagrama SVG ----------
function Diagrama({ data }: { data: IshikawaData }) {
  const cats = data.categorias.slice(0, 6)
  const W = 960
  const H = 470
  const spineY = H / 2
  const spineX0 = 60
  const spineX1 = 720
  const navy = SST_TOKENS.navy
  const teal = SST_TOKENS.teal

  // 3 arriba, 3 abajo
  const topAnchors = [200, 380, 560]
  const botAnchors = [290, 470, 650]
  const bones: {
    ax: number
    ex: number
    ey: number
    ly: number
    cat?: { nombre: string; causas: string[] }
    up: boolean
  }[] = []
  for (let i = 0; i < 3; i++) {
    bones.push({ ax: topAnchors[i], ex: topAnchors[i] - 95, ey: 70, ly: 58, cat: cats[i], up: true })
  }
  for (let i = 0; i < 3; i++) {
    bones.push({ ax: botAnchors[i], ex: botAnchors[i] - 95, ey: H - 70, ly: H - 44, cat: cats[i + 3], up: false })
  }

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className="w-full"
      style={{ maxHeight: 460 }}
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-label="Diagrama de Ishikawa (espina de pescado)"
    >
      <defs>
        <marker id="flecha" markerWidth="12" markerHeight="12" refX="9" refY="5" orient="auto">
          <path d="M0,0 L10,5 L0,10 z" fill={navy} />
        </marker>
      </defs>
      {/* Espina central */}
      <line
        x1={spineX0}
        y1={spineY}
        x2={spineX1}
        y2={spineY}
        stroke={navy}
        strokeWidth={3}
        markerEnd="url(#flecha)"
      />
      <text x={spineX0} y={spineY - 8} fontSize={12} fontWeight="bold" fill={navy}>
        Causa
      </text>

      {/* Cabeza = Efecto */}
      <rect x={spineX1 + 8} y={spineY - 42} width={184} height={84} rx={8} fill={navy} />
      <text x={spineX1 + 100} y={spineY - 24} fontSize={11} fontWeight="bold" fill="#fff" textAnchor="middle">
        EFECTO
      </text>
      {wrap(data.efecto || "Describe el efecto / lesión", 26, 3).map((ln, k) => (
        <text key={k} x={spineX1 + 100} y={spineY - 6 + k * 14} fontSize={10} fill="#fff" textAnchor="middle">
          {ln}
        </text>
      ))}

      {/* Espinas por categoría */}
      {bones.map((b, i) => {
        if (!b.cat) return null
        return (
          <g key={i}>
            <line x1={b.ax} y1={spineY} x2={b.ex} y2={b.ey} stroke={teal} strokeWidth={2.5} />
            <rect x={b.ex - 78} y={b.ly - 14} width={156} height={20} rx={4} fill={teal} />
            <text x={b.ex} y={b.ly} fontSize={10.5} fontWeight="bold" fill="#fff" textAnchor="middle">
              {b.cat.nombre}
            </text>
            {b.cat.causas.slice(0, 4).map((c, k) => {
              const yy = b.up ? b.ly + 22 + k * 14 : b.ly - 24 - k * 14
              return (
                <text key={k} x={b.ax - 20 - k * 16} y={yy} fontSize={9.5} fill={SST_TOKENS.ink}>
                  {"• " + (c.length > 30 ? c.slice(0, 30) + "…" : c)}
                </text>
              )
            })}
            {b.cat.causas.length > 4 ? (
              <text
                x={b.ex}
                y={b.up ? b.ly + 22 + 4 * 14 : b.ly - 24 - 4 * 14}
                fontSize={9}
                fill={SST_TOKENS.grey}
                textAnchor="middle"
              >
                {"+" + (b.cat.causas.length - 4) + " más"}
              </text>
            ) : null}
          </g>
        )
      })}
    </svg>
  )
}

// ---------- Componente principal (diagrama + editor) ----------
export function EspinaPescado({
  value,
  onChange,
  readOnly,
}: {
  value?: IshikawaData | null
  onChange?: (v: IshikawaData) => void
  readOnly?: boolean
}) {
  const data = normalizar(value)

  const setEfecto = (efecto: string) => onChange?.({ ...data, efecto })
  const setCausas = (idx: number, texto: string) => {
    const causas = texto
      .split("\n")
      .map((s) => s.trim())
      .filter(Boolean)
    const categorias = data.categorias.map((c, i) => (i === idx ? { ...c, causas } : c))
    onChange?.({ ...data, categorias })
  }

  return (
    <div className="space-y-3">
      <div className="rounded-lg border bg-white p-2">
        <Diagrama data={data} />
      </div>

      {!readOnly && onChange ? (
        <div className="space-y-2">
          <div>
            <label className="text-xs font-medium text-foreground">Efecto (problema / lesión a analizar)</label>
            <Input
              value={data.efecto}
              onChange={(e) => setEfecto(e.target.value)}
              placeholder="Ej.: Golpe/contusión en cabeza durante descargue manual"
            />
          </div>
          <p className="text-[11px] text-muted-foreground">
            Escribe una causa por línea en cada categoría (las 6 M). El diagrama se actualiza solo.
          </p>
          <div className="grid gap-2 md:grid-cols-2 lg:grid-cols-3">
            {data.categorias.map((c, i) => (
              <div key={i} className="rounded-md border p-2">
                <p className="mb-1 text-xs font-semibold" style={{ color: SST_TOKENS.teal }}>
                  {c.nombre}
                </p>
                <Textarea
                  rows={3}
                  value={c.causas.join("\n")}
                  onChange={(e) => setCausas(i, e.target.value)}
                  placeholder="Una causa por línea…"
                  className="text-xs"
                />
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  )
}

// ---------- Cuadros de análisis de causas (modelo de causalidad) ----------
export interface CuadrosCausasData {
  actos_inseguros: string
  condiciones_inseguras: string
  factores_personales: string
  factores_trabajo: string
  observaciones: string
}

export function CuadrosCausas({
  value,
  onChange,
}: {
  value: CuadrosCausasData
  onChange: (patch: Partial<CuadrosCausasData>) => void
}) {
  const navy = SST_TOKENS.navy
  const Caja = ({ titulo, campo, color }: { titulo: string; campo: keyof CuadrosCausasData; color: string }) => (
    <div className="rounded-md border">
      <div className="px-2 py-1 text-xs font-bold text-white" style={{ backgroundColor: color }}>
        {titulo}
      </div>
      <Textarea
        rows={3}
        className="border-0 text-xs"
        value={value[campo]}
        onChange={(e) => onChange({ [campo]: e.target.value } as Partial<CuadrosCausasData>)}
      />
    </div>
  )
  return (
    <div className="space-y-2">
      <p className="text-xs font-semibold" style={{ color: navy }}>
        Análisis de las causas
      </p>
      <p className="text-[11px] font-medium text-muted-foreground">Causas inmediatas</p>
      <div className="grid gap-2 md:grid-cols-2">
        <Caja titulo="Actos inseguros" campo="actos_inseguros" color={SST_TOKENS.warn} />
        <Caja titulo="Condiciones inseguras" campo="condiciones_inseguras" color={SST_TOKENS.warn} />
      </div>
      <p className="text-[11px] font-medium text-muted-foreground">Causas básicas</p>
      <div className="grid gap-2 md:grid-cols-2">
        <Caja titulo="Factores personales" campo="factores_personales" color={navy} />
        <Caja titulo="Factores del trabajo" campo="factores_trabajo" color={navy} />
      </div>
      <div>
        <label className="text-xs font-medium text-foreground">Observaciones de los investigadores</label>
        <Textarea rows={2} value={value.observaciones} onChange={(e) => onChange({ observaciones: e.target.value })} />
      </div>
    </div>
  )
}

export default EspinaPescado
