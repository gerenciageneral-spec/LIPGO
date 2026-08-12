"use client"

import { Button } from "@/components/ui/button"
import { Check, X, Lightbulb, ExternalLink, Bot } from "lucide-react"
import type { ContenidoAprendizaje } from "@/lib/aprendizaje-content"

/**
 * Render de la guia de un modulo (usado por el modulo "Aprendizaje" y por la
 * barra de guia embebida en cada modulo, `ModuloGuiaBar`). Una sola fuente
 * visual para que la guia se vea igual sin importar desde donde se abra.
 */
export function GuiaModulo({
  contenido,
  moduloName,
  etiqueta,
  mostrarAbrir = true,
}: {
  contenido: ContenidoAprendizaje
  moduloName: string
  etiqueta: string
  /** false cuando ya se esta DENTRO del modulo (el boton "Abrir" sobra). */
  mostrarAbrir?: boolean
}) {
  return (
    <div className="space-y-4 text-xs md:text-sm">
      {/* Acciones interactivas: llevar al usuario directo al modulo, o abrir
          LIPbot con la pregunta ya escrita para que lo guie paso a paso. */}
      {moduloName !== "Aprendizaje" && (
        <div className="flex flex-wrap gap-2">
          {mostrarAbrir && (
            <Button
              size="sm"
              variant="outline"
              className="h-8 text-xs"
              onClick={() => window.dispatchEvent(new CustomEvent("lipgo:navigate-module", { detail: moduloName }))}
            >
              <ExternalLink className="mr-1 h-3.5 w-3.5" /> Abrir el modulo
            </Button>
          )}
          <Button
            size="sm"
            variant="outline"
            className="h-8 text-xs"
            onClick={() =>
              window.dispatchEvent(
                new CustomEvent("lipgo:lipbot-ask", {
                  detail: `Guíame paso a paso para trabajar en «${etiqueta}»: ¿qué puedo hacer ahí y cómo lo hago?`,
                }),
              )
            }
          >
            <Bot className="mr-1 h-3.5 w-3.5" /> Pedir ayuda a LIPbot
          </Button>
        </div>
      )}

      <p className="text-muted-foreground leading-relaxed">{contenido.proposito}</p>

      <div className="grid gap-3 md:grid-cols-2">
        <div className="rounded-lg border border-green-200 bg-green-50 p-3 dark:border-green-900 dark:bg-green-950/30">
          <h4 className="mb-2 font-semibold text-green-800 dark:text-green-300">Que puedes hacer</h4>
          <ul className="space-y-1.5">
            {contenido.puedes.map((item) => (
              <li key={item} className="flex items-start gap-2">
                <Check className="h-3.5 w-3.5 shrink-0 mt-0.5 text-green-600 dark:text-green-400" />
                <span className="text-green-900 dark:text-green-200">{item}</span>
              </li>
            ))}
          </ul>
        </div>

        <div className="rounded-lg border border-red-200 bg-red-50 p-3 dark:border-red-900 dark:bg-red-950/30">
          <h4 className="mb-2 font-semibold text-red-800 dark:text-red-300">Que no puedes hacer</h4>
          <ul className="space-y-1.5">
            {contenido.noPuedes.map((item) => (
              <li key={item} className="flex items-start gap-2">
                <X className="h-3.5 w-3.5 shrink-0 mt-0.5 text-red-600 dark:text-red-400" />
                <span className="text-red-900 dark:text-red-200">{item}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>

      <div>
        <h4 className="mb-2 font-semibold">Funcionalidades</h4>
        <div className="space-y-2">
          {contenido.funcionalidades.map((f) => (
            <div key={f.nombre} className="rounded-lg border p-3">
              <p className="font-medium">{f.nombre}</p>
              <p className="mt-1 text-muted-foreground leading-relaxed">{f.descripcion}</p>
            </div>
          ))}
        </div>
      </div>

      {contenido.consejos && contenido.consejos.length > 0 && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 dark:border-amber-900 dark:bg-amber-950/30">
          <h4 className="mb-2 flex items-center gap-1.5 font-semibold text-amber-800 dark:text-amber-300">
            <Lightbulb className="h-4 w-4" />
            Ten en cuenta
          </h4>
          <ul className="space-y-1.5">
            {contenido.consejos.map((c) => (
              <li key={c} className="text-amber-900 dark:text-amber-200">
                {c}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
