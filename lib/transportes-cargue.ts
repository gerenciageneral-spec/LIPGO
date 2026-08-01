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
//   · "SUSANITA" → tarifa especial de Susanita. Es el ÚNICO identificador de
//     ese cobro: en las 19 órdenes históricas el campo `cliente` viene vacío.
// Quitar un valor de aquí no rompe lo ya facturado, pero sí impide marcar
// órdenes nuevas con ese servicio.

export const TRANSPORTES_CARGUE = ["AVIMOL", "INDUPAN", "MOLINOS", "ZAMUDIO", "TERCEROS"] as const

const PERMITIDOS = new Set<string>(TRANSPORTES_CARGUE.map((t) => t.trim().toUpperCase()))

/** ¿Este transporte se puede usar para una orden de cargue nueva? */
export function transporteHabilitado(nombre: unknown): boolean {
  const n = String(nombre ?? "").trim().toUpperCase()
  return n !== "" && PERMITIDOS.has(n)
}
