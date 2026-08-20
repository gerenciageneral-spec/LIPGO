"use server"

// Metas de toneladas por proyecto (Financiera › Tarifas › Metas) — SOLO LECTURA.
//
// Hasta ago-2026 esta pantalla era un CRUD manual (Ton mes + HC + Días
// operación, editados a mano). Se reemplazó por una meta DINÁMICA: el Ton/mes
// sale del acuerdo real por proceso (TON_MES_CARGUE_DESCARGUE, lib/
// meta-productividad-utils.ts) y el HC se recalcula cada día con la
// asistencia real (lib/meta-productividad-actions.ts) — el mismo cálculo que
// ya usan Centro de Coordinación (avance en vivo del turno) y Revisión de
// Nómina, para que los tres NUNCA diverjan entre sí.
//
// La tabla `meta_toneladas_proyecto` (histórica) NO se borra ni se migra —
// simplemente la app dejó de leerla y escribirla.

import { TON_MES_CARGUE_DESCARGUE, DIAS_OPERACION_MES } from "@/lib/meta-productividad-utils"

export interface MetaToneladasResumen {
  idempresa: number
  proyecto: string
  toneladasMes: number
  diasOperacion: number
  metaTonDia: number
}

const NOMBRE_PROYECTO: Record<number, string> = {
  1: "Harinera Indupan",
  2: "Avimol",
  3: "Cedi Funza",
  4: "Cedi Medellín",
}

/** Resumen de solo lectura — mismos números que EMPRESA_META_DIA_TON (lib/empresa-meta-dia.ts) y Avance en Vivo. */
export async function getMetasToneladasResumen(): Promise<{ success: boolean; data: MetaToneladasResumen[] }> {
  const data = [1, 2, 3, 4].map((idempresa) => {
    const toneladasMes = TON_MES_CARGUE_DESCARGUE[idempresa] || 0
    return {
      idempresa,
      proyecto: NOMBRE_PROYECTO[idempresa] || `Proyecto ${idempresa}`,
      toneladasMes,
      diasOperacion: DIAS_OPERACION_MES,
      metaTonDia: Math.round((toneladasMes / DIAS_OPERACION_MES) * 10) / 10,
    }
  })
  return { success: true, data }
}
