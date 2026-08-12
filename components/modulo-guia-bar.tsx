"use client"

import { useState } from "react"
import { Card } from "@/components/ui/card"
import { BookOpen, ChevronDown, ChevronUp } from "lucide-react"
import { APRENDIZAJE_POR_MODULO } from "@/lib/aprendizaje-content"
import { GuiaModulo } from "@/components/guia-modulo-panel"

/**
 * Guia del modulo, EMBEBIDA en la pantalla del propio modulo (igual que la
 * pestana "Guia" de Transacciones de Inventario, pero generica para los 158
 * modulos: lee la MISMA guia que usa el modulo "Aprendizaje" y LIPbot, asi
 * las tres fuentes nunca divergen). Colapsada por defecto para no estorbar
 * la operacion; un clic la despliega encima del contenido del modulo.
 */
export function ModuloGuiaBar({ selectedModule }: { selectedModule: string | null }) {
  const [abierta, setAbierta] = useState(false)
  if (!selectedModule || selectedModule === "Aprendizaje") return null
  const contenido = APRENDIZAJE_POR_MODULO[selectedModule]
  if (!contenido) return null

  return (
    <Card className="mb-3 border-dashed">
      <button
        type="button"
        onClick={() => setAbierta((v) => !v)}
        className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left md:px-4"
        aria-expanded={abierta}
      >
        <span className="flex items-center gap-2 min-w-0 text-xs font-medium md:text-sm">
          <BookOpen className="h-4 w-4 shrink-0 text-primary" />
          <span className="truncate">Guia de este modulo</span>
          <span className="hidden text-muted-foreground sm:inline">— {contenido.resumen}</span>
        </span>
        <span className="inline-flex h-7 shrink-0 items-center rounded-md px-2 text-xs font-medium text-muted-foreground hover:bg-accent hover:text-accent-foreground">
          {abierta ? (
            <>
              Ocultar <ChevronUp className="ml-1 h-3.5 w-3.5" />
            </>
          ) : (
            <>
              Ver guia <ChevronDown className="ml-1 h-3.5 w-3.5" />
            </>
          )}
        </span>
      </button>
      {abierta && (
        <div className="border-t px-3 pb-4 pt-3 md:px-4">
          <GuiaModulo
            contenido={contenido}
            moduloName={selectedModule}
            etiqueta={selectedModule}
            mostrarAbrir={false}
          />
        </div>
      )}
    </Card>
  )
}
