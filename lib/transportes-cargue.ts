// TRANSPORTES HABILITADOS PARA GENERAR ÓRDENES DE CARGUE.
//
// La tabla `transportes` acumuló transportadoras que ya no operan (TTC, FULL
// SERVICE, TRANSOLICAR, REDMAXX…) y un cliente colado como si fuera
// transportadora (SUSANITA). Cada opción que sobra es una forma de escribir
// mal un dato del que depende la facturación. Aquí se declara la lista corta
// que el negocio usa hoy; el desplegable se limita a ella.
//
// El maestro NO se toca: las órdenes históricas conservan su transporte
// original y se siguen leyendo igual que siempre.
//
// SUSANITA NO VA AQUÍ, a propósito. Es un CLIENTE ("Tostaditos Susanita SAS",
// que ya existe en el maestro de clientes para id 2 e id 4), no un
// transportador. Su tarifa especial ($31.544 — Descargue/owner SUSANITA en
// `tarifasoperacion`, solo para empresaid = 4) se dispara por el campo
// CLIENTE, que es como ya vienen las órdenes correctas: cliente "Tostaditos
// Susanita SAS" y transporte ZAMUDIO, el transportador real.
//
// La facturación clasifica por cualquiera de los dos campos:
//   if (cliente.includes("SUSANITA") || transporte === "SUSANITA") -> Susanita
// La segunda mitad de esa condición se mantiene por las 19 órdenes históricas
// en las que Susanita se escribió en el transporte y el cliente quedó vacío:
// sin ella se reclasificarían y cambiaría lo ya facturado.
//
// El otro valor con peso propio es "TERCEROS": marca que el cliente recoge en
// bodega y, en Medellín (id 4), cambia la tarifa a la de DESCARGUE.
// Ver `servicioDe` y `tarifaDeServicio` en lib/facturacion-control-actions.ts.

/** Las transportadoras que se ofrecen, en este orden. */
export const TRANSPORTES_CARGUE = ["AVIMOL", "INDUPAN", "MOLINOS", "ZAMUDIO", "TERCEROS"] as const

const PERMITIDOS = new Set<string>(TRANSPORTES_CARGUE.map((t) => t.toUpperCase()))

/** Transportadoras ofrecidas, en orden de presentación. */
export function transportesCargue(): string[] {
  return [...TRANSPORTES_CARGUE]
}

/** ¿Este transporte se puede usar para una orden de cargue nueva? */
export function transporteHabilitado(nombre: unknown): boolean {
  const n = String(nombre ?? "").trim().toUpperCase()
  return n !== "" && PERMITIDOS.has(n)
}
