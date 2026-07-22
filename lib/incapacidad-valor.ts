// Valorización de incapacidades (lógica PURA, sin I/O). Una incapacidad se valoriza
// como DÍAS × VALOR DÍA, donde el valor día = salario_base_dia (que getAusentismos
// completa desde el head count + SMLV del AÑO de la incapacidad, salario / 30).
//
// Reglas de negocio (confirmadas):
//   * EG (EPS): los días 1-2 los ASUME la empresa; del día 3 en adelante los RECOBRA
//     la EPS. LIP paga la EG al 100% del valor día y la EPS la reconoce al 100%.
//   * AT (ARL): la ARL reconoce el 100% del valor día desde el día 1 → se recobran
//     TODOS los días; la empresa no asume nada.
// Si la fila no tiene valor día (sin salario), se usan los costos ya guardados.

import type { Ausentismo } from "@/lib/ausentismos-actions"

export const PCT_EG_INCAP = 1 // EG al 100% del valor día (LIP paga y EPS recobra al 100%).
export const DIAS_EMPRESA_EG = 2 // días 1-2 de EG a cargo del empleador (no recobrables).

const n = (v: number | null | undefined) => (typeof v === "number" && !Number.isNaN(v) ? v : 0)

export interface ValorIncapacidad {
  esAT: boolean
  entidad: "EPS" | "ARL"
  diaVal: number
  dias: number
  diasEmpresa: number // días que asume la empresa (EG 1-2; AT 0)
  diasRecobrables: number // días que recobra la entidad (EG 3+; AT todos)
  empresa: number // $ que asume la empresa (no recobrable)
  recobrable: number // $ que debe devolver la EPS/ARL
  total: number // costo total de la incapacidad (empresa + recobrable)
}

export function valorizarIncapacidad(a: Ausentismo): ValorIncapacidad {
  const dias = n(a.total_dias_incapacidad)
  const diaVal = n(a.salario_base_dia) || n(a.salario_base) / 30
  const esAT = a.tipo_evento === "AT"

  if (esAT) {
    const recobrable = diaVal > 0 ? Math.round(dias * diaVal) : n(a.costos_arl)
    return {
      esAT, entidad: "ARL", diaVal, dias, diasEmpresa: 0, diasRecobrables: dias,
      empresa: 0, recobrable, total: recobrable,
    }
  }

  const diasRecobrables = Math.max(dias - DIAS_EMPRESA_EG, 0)
  const diasEmpresa = Math.min(dias, DIAS_EMPRESA_EG)
  const recobrable = diaVal > 0 ? Math.round(diasRecobrables * diaVal * PCT_EG_INCAP) : n(a.costos_eps)
  const empresa = diaVal > 0 ? Math.round(diasEmpresa * diaVal * PCT_EG_INCAP) : n(a.costos_empresa)
  return {
    esAT, entidad: "EPS", diaVal, dias, diasEmpresa, diasRecobrables,
    empresa, recobrable, total: empresa + recobrable,
  }
}

// Costo total de una incapacidad: si hay valor día se usa la valorización; si no,
// se respeta el total pagado ya cargado (import histórico).
export function costoIncapacidad(a: Ausentismo): number {
  const v = valorizarIncapacidad(a)
  if (v.diaVal > 0) return v.total
  return n(a.total_salario_pagado) || v.total
}
