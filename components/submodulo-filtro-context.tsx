"use client"

// Filtro del SUBMÓDULO activo (año/mes) compartido con la TIRA de KPIs del módulo
// (`AreaKpiStrip`), que vive en otro punto del árbol (ModuleKpiHeader en
// main-content) y por eso no ve el estado local del submódulo. El submódulo
// (p. ej. Ausentismos) publica su filtro aquí; la tira lo lee y recalcula, así
// las tarjetas superiores reaccionan al filtro de mes/año además del selector
// global de empresa (que ya manejan por `useAuth`).
//
// `anio`/`mes` = null significa "sin filtro" (la tira usa su comportamiento por
// defecto: resumen del año en curso). `mes` es el NOMBRE del mes ("Enero"…).
//
// `desde`/`hasta` (ISO "YYYY-MM-DD") son un filtro alternativo de RANGO exacto
// de fechas — para submódulos como "Historial Báscula" que filtran por período
// libre en vez de año/mes. Si vienen seteados, tienen prioridad sobre anio/mes
// en el submódulo que los consuma.

import { createContext, useCallback, useContext, useMemo, useState } from "react"

export interface SubmoduloFiltro {
  anio: string | null
  mes: string | null
  desde: string | null
  hasta: string | null
}

interface Ctx {
  filtro: SubmoduloFiltro
  setFiltro: (f: SubmoduloFiltro) => void
}

const FILTRO_VACIO: SubmoduloFiltro = { anio: null, mes: null, desde: null, hasta: null }

const SubmoduloFiltroContext = createContext<Ctx>({
  filtro: FILTRO_VACIO,
  setFiltro: () => {},
})

export function SubmoduloFiltroProvider({ children }: { children: React.ReactNode }) {
  const [filtro, setFiltroState] = useState<SubmoduloFiltro>(FILTRO_VACIO)
  // Evita renders en bucle: solo actualiza si cambió algo.
  const setFiltro = useCallback((f: SubmoduloFiltro) => {
    setFiltroState((prev) =>
      prev.anio === f.anio && prev.mes === f.mes && prev.desde === f.desde && prev.hasta === f.hasta ? prev : f,
    )
  }, [])
  const value = useMemo(() => ({ filtro, setFiltro }), [filtro, setFiltro])
  return <SubmoduloFiltroContext.Provider value={value}>{children}</SubmoduloFiltroContext.Provider>
}

export const useSubmoduloFiltro = () => useContext(SubmoduloFiltroContext)
