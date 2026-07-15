export const EMPRESA_ID_FIELDS: Record<string, string> = {
  almacenes: "idempresa",
  locations: "idempresa",
  productos: "id_empresa",
  bodegas: "idempresa",
  clientes: "id_empresa",
  citasvehiculos: "idempresa",
  vehiculos: "id_empresa",
  tiposvehiculos: "id_empresa",
  transportes: "id_empresa",
  tipodespacho: "id_empresa",
  destinos: "id_empresa",
  categorias: "id_empresa",
  subcategorias: "id_empresa",
  pedidos: "id_empresa",
  ordenescargue: "id_empresa",
  entregas: "id_empresa",
  picking: "id_empresa",
  lotes: "id_empresa",
  traslados: "id_empresa",
  inventario: "id_empresa",
  ajusteinventario: "id_empresa",
  devoluciones: "id_empresa",
  salidasproduccion: "id_empresa",
  entradasproduccion: "id_empresa",
  balanceinventario: "id_empresa",
  vendedores: "id_empresa",
  // Tarifas: la columna de empresa varía por tabla.
  tarifasoperacion: "empresaid",
  tarifaspersonal: "empresaid",
  tarifasturnos: "idempresa",
}

export const EXCLUDED_TABLES = [
  "categorias",
  "subcategorias",
  "tipodespacho",
  "transportes",
  "tiposvehiculos",
  "condicionespago",
  // Tarifas de facturación por turnos: catálogo global (su idempresa está en su
  // mayoría sin asignar); no se filtra por el selector para no ocultar filas.
  "tarifasfacturacionturnos",
]
