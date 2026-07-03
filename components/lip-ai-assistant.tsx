"use client"

import { useEffect, useRef, useState } from "react"
import { Sparkles, Mic, Lightbulb } from "lucide-react"

export interface AtencionItem {
  label: string
  sev: "crit" | "warn" | "info"
}

interface LipAiAssistantProps {
  /** Contexto (ej. el área/grupo) para personalizar las preguntas. */
  contextLabel?: string
  /** Etiqueta de empresa para el subtítulo "lee tu operación en vivo · X". */
  empresaLabel?: string | null
  /** Se llama al pedir algo (abre el Asistente IA existente). */
  onOpen: () => void
  /** Alertas REALES (por empresa) que la IA prioriza. Si viene vacío se oculta. */
  alertas?: AtencionItem[]
  /** Acción al tocar una alerta (ej. abrir el módulo relacionado). */
  onAlerta?: (a: AtencionItem) => void
}

/**
 * Asistente LIP — superficie de IA premium (el "sello" de la app).
 * Borde de gradiente animado, orbe que respira, placeholder autoescrito y
 * sugerencias contextuales. Reutilizable en Inicio y en cada submenú.
 * No inventa datos: al pedir algo abre el Asistente (Gemini) ya integrado.
 */
export function LipAiAssistant({ contextLabel, empresaLabel, onOpen, alertas, onAlerta }: LipAiAssistantProps) {
  const area = contextLabel?.trim()
  const phrases = area
    ? [
        `Pregúntale a LIP sobre ${area}…`,
        `¿Cómo va ${area} hoy en este proyecto?`,
        `Resúmeme los indicadores de ${area}`,
        `¿Dónde tengo riesgo en ${area}?`,
      ]
    : [
        "Pregúntale a LIP: ¿cómo va la operación hoy?",
        "¿Qué proyecto está por debajo de su meta?",
        "Resúmeme el SLA de tiempos de la semana",
        "¿Qué facturas debo solicitar antes del viernes?",
      ]

  const sugs = area
    ? [`📊 Indicadores de ${area}`, "⏱️ ¿Dónde pierdo SLA?", "🧾 Pendientes por gestionar"]
    : ["📦 Órdenes por despachar", "⏱️ SLA de tiempos", "🧾 Facturas por vencer"]

  const [typed, setTyped] = useState("")
  const stateRef = useRef({ pi: 0, ci: 0, deleting: false })

  useEffect(() => {
    stateRef.current = { pi: 0, ci: 0, deleting: false }
    let timer: ReturnType<typeof setTimeout>
    const tick = () => {
      const s = stateRef.current
      const full = phrases[s.pi % phrases.length]
      if (!s.deleting) {
        s.ci++
        if (s.ci >= full.length) {
          s.deleting = true
          setTyped(full)
          timer = setTimeout(tick, 2000)
          return
        }
      } else {
        s.ci--
        if (s.ci <= 0) {
          s.deleting = false
          s.pi = (s.pi + 1) % phrases.length
        }
      }
      setTyped(full.slice(0, s.ci))
      timer = setTimeout(tick, s.deleting ? 24 : 45)
    }
    timer = setTimeout(tick, 400)
    return () => clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contextLabel])

  return (
    <div className="lipai">
      <style>{`
        @property --lipai-a{ syntax:'<angle>'; initial-value:0deg; inherits:false; }
        .lipai{ position:relative; border-radius:20px; padding:1.6px;
          background:conic-gradient(from var(--lipai-a), #00c2dc, #3fe0ee, #4f8ff0, #12233f, #00c2dc);
          animation:lipai-spin 6s linear infinite;
          box-shadow:0 0 34px rgba(0,194,220,.16), 0 16px 40px rgba(0,0,0,.28); }
        @keyframes lipai-spin{ to{ --lipai-a:360deg; } }
        @media (prefers-reduced-motion:reduce){ .lipai{ animation:none; background:linear-gradient(120deg,#00c2dc,#4f8ff0); } }
        .lipai-in{ position:relative; overflow:hidden; border-radius:18.4px; padding:15px 16px 14px;
          background:linear-gradient(180deg,#0c2140,#0a1a30); }
        .lipai-in::after{ content:""; position:absolute; inset:0; pointer-events:none;
          background:radial-gradient(70% 130% at 100% -10%, rgba(0,194,220,.20), transparent 55%); }
        .lipai-orb{ position:relative; width:38px; height:38px; flex:none; }
        .lipai-orb .core{ position:absolute; inset:6px; border-radius:50%;
          background:radial-gradient(circle at 35% 30%, #b9f6ff, #00c2dc 55%, #0a6b7d); box-shadow:0 0 16px rgba(0,194,220,.8); }
        .lipai-orb .halo{ position:absolute; inset:0; border-radius:50%; border:1.5px solid rgba(0,220,240,.5); animation:lipai-halo 2.6s ease-out infinite; }
        @keyframes lipai-halo{ 0%{transform:scale(.7);opacity:.9} 100%{transform:scale(1.35);opacity:0} }
        @media (prefers-reduced-motion:reduce){ .lipai-orb .halo{ animation:none } }
        .lipai-live{ width:6px; height:6px; border-radius:50%; background:#37f5a0; box-shadow:0 0 8px #37f5a0; animation:lipai-blink 1.8s ease-in-out infinite; }
        @keyframes lipai-blink{ 0%,100%{opacity:1} 50%{opacity:.35} }
        .lipai-cur{ display:inline-block; width:2px; height:15px; background:#3fe0ee; margin-left:1px; transform:translateY(2px); animation:lipai-c .9s step-end infinite; }
        @keyframes lipai-c{ 50%{opacity:0} }
        .lipai-sug:hover{ background:rgba(0,194,220,.16) !important; border-color:rgba(0,194,220,.5) !important; }
      `}</style>

      <div className="lipai-in">
        <div className="relative z-[2] flex items-center gap-3">
          <div className="lipai-orb">
            <div className="halo" />
            <div className="core" />
          </div>
          <div className="min-w-0">
            <div className="text-[15px] font-extrabold tracking-tight" style={{ color: "#eaf7fb" }}>
              LIP · Asistente inteligente
            </div>
            <div className="flex items-center gap-1.5 text-[11.5px]" style={{ color: "#7fbdcf" }}>
              <span className="lipai-live" />
              Lee tu operación en vivo{empresaLabel ? ` · ${empresaLabel}` : ""}
            </div>
          </div>
          <Sparkles className="ml-auto h-4 w-4 flex-none" style={{ color: "#3fe0ee" }} />
        </div>

        <button
          onClick={onOpen}
          className="relative z-[2] mt-3.5 flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-left"
          style={{ background: "rgba(255,255,255,.06)", border: "1px solid rgba(150,210,240,.2)" }}
          aria-label="Abrir asistente"
        >
          <span className="min-w-0 flex-1 truncate text-[14px]" style={{ color: "#cfe6f0" }}>
            {typed}
            <span className="lipai-cur" />
          </span>
          <span
            className="flex h-[30px] w-[30px] flex-none items-center justify-center rounded-lg"
            style={{ color: "#7fbdcf", background: "rgba(255,255,255,.05)" }}
          >
            <Mic className="h-[15px] w-[15px]" />
          </span>
          <span
            className="flex-none rounded-lg px-3.5 py-2 text-[12.5px] font-bold"
            style={{ background: "linear-gradient(135deg,#3fe0ee,#00c2dc)", color: "#04222a", boxShadow: "0 4px 14px rgba(0,194,220,.4)" }}
          >
            Preguntar
          </span>
        </button>

        <div className="relative z-[2] mt-3 flex flex-wrap gap-2">
          {sugs.map((s) => (
            <button
              key={s}
              onClick={onOpen}
              className="lipai-sug rounded-full px-3 py-1.5 text-[12px] font-medium transition-colors"
              style={{ color: "#cbe7f1", background: "rgba(255,255,255,.06)", border: "1px solid rgba(150,210,240,.16)" }}
            >
              {s}
            </button>
          ))}
        </div>

        {/* Atención del día — la IA prioriza lo que requiere foco (datos reales). */}
        {alertas && alertas.length > 0 && (
          <div
            className="relative z-[2] mt-3.5 flex gap-3 rounded-xl px-3 py-3"
            style={{ background: "rgba(0,194,220,.08)", border: "1px solid rgba(0,194,220,.22)" }}
          >
            <span
              className="flex h-[26px] w-[26px] flex-none items-center justify-center rounded-lg"
              style={{ background: "rgba(0,194,220,.18)", color: "#3fe0ee" }}
            >
              <Lightbulb className="h-[15px] w-[15px]" />
            </span>
            <div className="min-w-0 text-[12.5px]" style={{ color: "#dcecf3" }}>
              <b style={{ color: "#fff" }}>
                Hoy detecté {alertas.length} cosa{alertas.length !== 1 ? "s" : ""} que requieren tu atención
              </b>{" "}
              — priorizadas por impacto.
              <div className="mt-2 flex flex-wrap gap-1.5">
                {alertas.map((a, i) => (
                  <button
                    key={i}
                    onClick={() => onAlerta?.(a)}
                    className="rounded-md px-2 py-1 text-[10.5px] font-semibold transition-transform hover:scale-[1.03]"
                    style={SEV[a.sev]}
                  >
                    {a.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

const SEV: Record<AtencionItem["sev"], { background: string; color: string }> = {
  crit: { background: "rgba(255,122,114,.16)", color: "#ff7a72" },
  warn: { background: "rgba(255,207,94,.16)", color: "#ffcf5e" },
  info: { background: "rgba(0,194,220,.16)", color: "#3fe0ee" },
}
