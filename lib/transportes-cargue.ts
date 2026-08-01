// TRANSPORTES HABILITADOS PARA GENERAR ÓRDENES DE CARGUE.
//
// La tabla `transportes` acumuló transportadoras que ya no operan (TTC, FULL
// SERVICE, TRANSOLICAR, REDMAXX…), y cada una que sobra es una forma de
// escribir mal el mismo dato. Aquí se declara la lista corta que el negocio
// usa hoy; el desplegable de "Generación de órdenes de cargue" se limita a
// ella. El maestro NO se toca: las órdenes históricas conservan su transporte
// original y se siguen leyendo bien.
//
// OJO — este campo NO es cosmético: la facturación lo lee para decidir el
// servicio y la tarifa (ver `servicioDe` y `tarifaDeServicio` en
// lib/facturacion-control-actions.ts):
//   · "TERCEROS" → el cliente recoge en bodega; en Medellín (id 4) además
//     cambia la tarifa a la de DESCARGUE.
//   · "SUSANITA" → tarifa especial de Susanita, con factura aparte. Es el
//     ÚNICO identificador de ese cobro: en las 19 órdenes históricas el campo
//     `cliente` viene vacío, así que si no se marca aquí, no hay forma de
//     saber después que era Susanita.
// Quitar un valor de aquí no rompe lo ya facturado, pero sí impide marcar
// órdenes nuevas con ese servicio.

/** Las que se ofrecen en todos los proyectos, en este orden. */
export const TRANSPORTES_CARGUE = ["AVIMOL", "INDUPAN", "MOLINOS", "ZAMUDIO", "TERCEROS"] as const

/**
 * Susanita se atiende únicamente en CEDI Medellín (id 4), que es donde vive
 * ese cliente y donde su cobro sale en factura aparte. Ofrecerla en los demás
 * proyectos solo abre la puerta a marcarla por error, y ese error no se ve:
 * la orden se factura con la tarifa de Susanita sin que nada lo advierta.
 */
export const TRANSPORTE_SUSANITA = "SUSANITA"
export const SUSANITA_IDEMPRESA = 4

/** Transportadoras ofrecidas para un proyecto, en orden de presentación. */
export function transportesCargue(idempresa?: number | null): string[] {
  const base = [...TRANSPORTES_CARGUE] as string[]
  if (Number(idempresa) === SUSANITA_IDEMPRESA) base.push(TRANSPORTE_SUSANITA)
  return base
}

/** ¿Este transporte se puede usar para una orden de cargue nueva del proyecto? */
export function transporteHabilitado(nombre: unknown, idempresa?: number | null): boolean {
  const n = String(nombre ?? "").trim().toUpperCase()
  if (!n) return false
  return transportesCargue(idempresa).some((t) => t.toUpperCase() === n)
}
