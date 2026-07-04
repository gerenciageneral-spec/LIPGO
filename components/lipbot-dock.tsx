"use client"

import { useEffect, useState } from "react"
import { X } from "lucide-react"
import { LipAiAssistant } from "@/components/lip-ai-assistant"

/**
 * LIPbot flotante GLOBAL: un botón presente en TODAS las pantallas (abajo a la
 * derecha) que abre un panel con LIPbot. Es consciente del contexto (módulo/área
 * actual) y puede navegar/ejecutar como el asistente inline. Atajo: Ctrl/⌘ + K.
 * Reutiliza <LipAiAssistant/> (chat + voz + navegación + sugerencias por área).
 */
export function LipbotDock({
  contextLabel,
  groupKey,
  onNavigate,
  onOpenGroup,
}: {
  contextLabel?: string
  groupKey?: string
  onNavigate?: (modulo: string) => void
  onOpenGroup?: (key: string) => void
}) {
  const [open, setOpen] = useState(false)

  // Atajo de teclado: Ctrl/⌘+K abre/cierra; Esc cierra.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault()
        setOpen((o) => !o)
      } else if (e.key === "Escape") {
        setOpen(false)
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [])

  return (
    <>
      <style>{`
        .lipbot-fab{ position:fixed; right:20px; bottom:84px; z-index:60; display:flex; align-items:center; gap:9px;
          padding:10px 15px 10px 11px; border-radius:999px; color:#04222a; font-weight:800; font-size:13.5px;
          background:linear-gradient(135deg,#3fe0ee,#00c2dc); border:0; cursor:pointer;
          box-shadow:0 10px 30px rgba(0,194,220,.45), 0 4px 14px rgba(0,0,0,.3); transition:transform .15s, box-shadow .15s; }
        .lipbot-fab:hover{ transform:translateY(-2px); box-shadow:0 14px 36px rgba(0,194,220,.55), 0 6px 16px rgba(0,0,0,.35); }
        .lipbot-fab .o{ width:22px; height:22px; border-radius:50%; flex:none;
          background:radial-gradient(circle at 34% 30%, #eafcff, #06313b 72%); box-shadow:0 0 0 2px rgba(255,255,255,.55) inset; }
        .lipbot-fab .kbd{ font-size:10px; font-weight:700; letter-spacing:.02em; opacity:.75; background:rgba(4,34,42,.18); padding:2px 6px; border-radius:6px; }
        .lipbot-panel{ position:fixed; right:20px; bottom:84px; z-index:61; width:min(384px, calc(100vw - 32px));
          max-height:min(78vh, 640px); display:flex; flex-direction:column; animation:lipbot-pop .18s ease-out; }
        @keyframes lipbot-pop{ from{ opacity:0; transform:translateY(12px) scale(.98) } to{ opacity:1; transform:none } }
        @media (prefers-reduced-motion:reduce){ .lipbot-panel{ animation:none } }
        .lipbot-closebar{ display:flex; justify-content:flex-end; margin-bottom:6px; }
        .lipbot-cx{ width:30px; height:30px; border-radius:10px; display:flex; align-items:center; justify-content:center;
          background:rgba(10,26,48,.9); color:#cfe6f0; border:1px solid rgba(150,210,240,.28); cursor:pointer; box-shadow:0 6px 16px rgba(0,0,0,.3); }
        .lipbot-cx:hover{ background:rgba(16,44,74,.95); }
        .lipbot-scroll{ overflow-y:auto; }
        /* En escritorio, sube el botón/panel (ya no hay barra inferior móvil). */
        @media (min-width:768px){ .lipbot-fab, .lipbot-panel{ bottom:20px; } }
      `}</style>

      {!open ? (
        <button className="lipbot-fab" onClick={() => setOpen(true)} aria-label="Abrir LIPbot (Ctrl+K)" title="LIPbot · Ctrl+K">
          <span className="o" aria-hidden="true" />
          LIPbot
          <span className="kbd">⌘K</span>
        </button>
      ) : (
        <div className="lipbot-panel" role="dialog" aria-label="LIPbot">
          <div className="lipbot-closebar">
            <button className="lipbot-cx" onClick={() => setOpen(false)} aria-label="Cerrar LIPbot">
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="lipbot-scroll">
            <LipAiAssistant
              contextLabel={contextLabel}
              groupKey={groupKey}
              onNavigate={onNavigate}
              onOpenGroup={onOpenGroup}
            />
          </div>
        </div>
      )}
    </>
  )
}
