// ============================================================================
//  Registro de acciones de LIPbot (asistente IA)
// ============================================================================
//  Gobierna qué tablas puede LEER y ESCRIBIR el asistente, con su columna de
//  empresa, su PK y los permisos (de permisos_usuarios) que las habilitan.
//  Config PURA (sin "use server"): habilitar un módulo = agregar una fila aquí.
//
//  SEGURIDAD:
//   - NUNCA se escribe en las tablas NÚCLEO del proceso/inventario (abajo).
//   - Cada acción exige AL MENOS UNO de sus permisos y valida la empresa.
//   - No hay DELETE por ahora (solo insert/update controlados).
// ============================================================================

export interface AccionTabla {
  /** Columna de empresa (multi-tenant). null = sin columna directa (no update genérico). */
  colEmpresa: string | null
  /** Llave primaria de la tabla (para update por id). Default "id". */
  pk?: string
  /** Permisos que habilitan la acción; basta tener UNO (columnas de permisos_usuarios). */
  permisos: string[]
  /** ¿LIPbot puede INSERTAR? */
  insert: boolean
  /** ¿LIPbot puede ACTUALIZAR? */
  update: boolean
}

/** Tablas NÚCLEO del proceso/inventario: SOLO LECTURA. Nunca se escriben. */
export const NUCLEO_PROHIBIDO = new Set<string>([
  "cabeceraoc",
  "detalleoc",
  "saldoinvdetalle",
  "pedidoscabecera",
  "pedidosdetalle",
  "invtrans",
])

export const REGISTRO_ACCIONES: Record<string, AccionTabla> = {
  // ── RRHH / Asistencia / Turnos ──
  dotacion_epp: { colEmpresa: "idempresa", permisos: ["dotacion_epp"], insert: true, update: true },
  capacitaciones: { colEmpresa: "idempresa", permisos: ["capacitaciones", "inducciones"], insert: true, update: true },
  capacitaciones_asistencia: { colEmpresa: "idempresa", permisos: ["asistencia_capacitaciones"], insert: true, update: true },
  ausentismosst: { colEmpresa: "idempresa", permisos: ["ausentismos", "recobro_incapacidades"], insert: true, update: true },
  vacantes: { colEmpresa: "idempresa", permisos: ["solicitud_personal", "gestionsolicitudes"], insert: true, update: true },
  hojas_de_vida: { colEmpresa: "idempresa", permisos: ["gestionsolicitudes"], insert: false, update: true },
  solicitudesturnos: { colEmpresa: "idempresa", permisos: ["aprobacionturnos", "solicitudturnos"], insert: true, update: true },

  // ── Configuración / Maestros (por empresa) ──
  bodegas: { colEmpresa: "idempresa", pk: "idbodega", permisos: ["config_bodegas", "config_sucursales"], insert: true, update: true },
  locations: { colEmpresa: "idempresa", permisos: ["config_localizaciones"], insert: true, update: true },
  clientes: { colEmpresa: "id_empresa", permisos: ["config_clientes"], insert: true, update: true },
  destinos: { colEmpresa: "id_empresa", permisos: ["config_destinos"], insert: true, update: true },
  productos: { colEmpresa: "id_empresa", permisos: ["config_productos"], insert: true, update: true },
  vendedores: { colEmpresa: "id_empresa", pk: "idvendedor", permisos: ["config_vendedores"], insert: true, update: true },
  grupos: { colEmpresa: "idempresa", permisos: ["config_grupos"], insert: true, update: true },
  medio: { colEmpresa: "idempresa", permisos: ["config_medios"], insert: true, update: true },
  tarifas: { colEmpresa: "idempresa", permisos: ["tarifas"], insert: true, update: true },

  // ── SIG / BSC ──
  // BSC gerencial: CONSULTA abierta a todos (herramienta de solo lectura
  // consultar_indicadores). MODIFICAR indicadores/objetivos gerenciales es solo
  // de ADMINISTRADORES (permiso gestion_usuarios), no del permiso general del SIG.
  sig_indicadores: { colEmpresa: "idempresa", permisos: ["gestion_usuarios"], insert: true, update: true },
  sig_objetivos: { colEmpresa: "idempresa", permisos: ["gestion_usuarios"], insert: true, update: true },
  sig_documento_cobertura: { colEmpresa: "idempresa", permisos: ["sig_matriz"], insert: true, update: true },
  sig_nc_catalogo: { colEmpresa: "idempresa", permisos: ["sig_matriz"], insert: true, update: true },
  sig_no_conformidades: { colEmpresa: "idempresa", permisos: ["sig_matriz"], insert: true, update: true },
  sig_contexto_dofa: { colEmpresa: "idempresa", permisos: ["sig_matriz"], insert: true, update: true },
  sig_aspectos_ambientales: { colEmpresa: "idempresa", permisos: ["sig_iso14001"], insert: true, update: true },
  sig_requisitos_legales: { colEmpresa: "idempresa", permisos: ["sig_iso14001"], insert: true, update: true },

  // ── Facturación / Gastos ── (cabeceraoc queda FUERA: es núcleo)
  gastos: { colEmpresa: "id_empresa", permisos: ["gastos"], insert: true, update: false },
}

/** PK de una tabla del registro (default "id"). */
export function pkDe(tabla: string): string {
  return REGISTRO_ACCIONES[tabla]?.pk ?? "id"
}
