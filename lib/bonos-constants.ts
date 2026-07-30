// Constantes y tipos del módulo "Bonos" (Compensación).
//
// Viven FUERA de `lib/bonos-actions.ts` a propósito: ese archivo es
// `"use server"`, y un módulo de server actions solo puede exportar funciones
// async. Exportar un array/objeto desde ahí rompe el arranque de la app con
// "A 'use server' file can only export async functions, found object".
// Aquí no hay directiva, así que se puede importar tanto desde el servidor
// como desde el cliente.

/**
 * Novedades de Siigo habilitadas para el bono. El `nombre` es el string EXACTO
 * que se emite en `archivoplano.nombrenovedad`; se guarda en la fila al
 * registrar, para que un cambio futuro de nomenclatura no reescriba el
 * histórico ya enviado a Siigo.
 */
export const NOVEDADES_BONO = [
  { codigo: "43", nombre: "43-Bonificaciones ocasionales" },
  { codigo: "50", nombre: "50-Bonificación No Prestacional" },
  { codigo: "66", nombre: "66-Aux. Por Movilidad" },
] as const

export const TIPOS_BONO = ["Operativo", "Administrativo"] as const

export type TipoBono = (typeof TIPOS_BONO)[number]
export type EstadoBono = "pendiente" | "aprobado" | "rechazado"
