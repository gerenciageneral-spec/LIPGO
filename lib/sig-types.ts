// Tipos del Sistema Integrado de Gestion (SIG): matriz integrada de
// ISO 9001:2015 / ISO 14001:2015 / ISO 45001:2018.
// Archivo SIN "use server": solo define tipos (Next prohibe exportar
// valores no-async desde modulos con esa directiva).

// El SIG es ÚNICO de LIP (operador), no de un cliente. Las filas de `empresas`
// (1..6) son los CLIENTES/PROYECTOS de LIP. Como no hay fila "LIP", el SIG vive
// bajo este alcance dedicado, independiente del selector de cliente de la app.
// Las NC e indicadores se etiquetan por cliente/sitio con proyecto_id (1..6).
export const SIG_EMPRESA_LIP = 100

// Clientes/sitios ACTIVOS de LIP para el SIG (resultados por sitio).
// Excluye 5 (Demogistics SAS = ambiente de prueba) y 6 (Precocidos = inactivo).
// 1 Harinera Indupan · 2 Avimol · 3 Cedi Funza · 4 Cedi Medellín.
export const SIG_CLIENTES_LIP = [1, 2, 3, 4]

export type SigEsComun = "si" | "no" | "parcial"

// Estado de la evidencia de un requisito en una norma concreta.
export type SigEstadoCobertura = "pendiente" | "cargado" | "aprobado" | "no_aplica"

export interface SigNorma {
  id: number
  codigo: string // 'ISO9001' | 'ISO14001' | 'ISO45001'
  nombre: string // 'ISO 9001:2015'
  descripcion: string | null
  color: string | null
  orden: number
  activo: boolean
}

export interface SigRequisito {
  id: number
  numeral: string // '4.1', '6.1.2', ...
  tema: string
  es_comun: SigEsComun
  evidencia_comun_sugerida: string | null
  orden: number
  activo: boolean
}

export interface SigRequisitoNorma {
  id: number
  requisito_id: number
  norma_id: number
  texto: string | null // "requisito / como evidenciar" de esa norma
  aplica: boolean
}

// Documento del maestro documental del SIG (tabla sig_documentos, 94 reales).
export interface SigDocumento {
  id: string // UUID en sig_documentos
  codigo: string | null
  nombre: string | null
  tipo: string | null
  proceso: string | null
  version: string | null
  estado: string | null
  soporte: string | null // medio del documento (Word, LIPgo, etc.)
}

export interface SigCobertura {
  id: number
  idempresa: number
  soporte_id: number | null
  documento_id: string | null
  requisito_id: number
  norma_id: number
  estado: SigEstadoCobertura
  observacion: string | null
  actualizado_por: string | null
  created_at: string | null
  updated_at: string | null
  // Enriquecido en memoria desde sig_documentos (cuando documento_id != null).
  documento?: SigDocumento | null
}

// ---------------------------------------------------------------------------
// Tipos compuestos (armados en memoria para la UI).
// ---------------------------------------------------------------------------

// De donde proviene el estado de una celda (para que el auditor lo sepa).
//  - matriz:    cobertura propia del SIG (manual / documentos vinculados)
//  - iso9001:   tomado del Centro de Evidencia ISO 9001 (iso_clausulas, auto+manual)
//  - sst0312:   derivado del SG-SST 0312
export type SigFuente = "matriz" | "iso9001" | "sst0312"

// Celda de la matriz: que pide una norma para un requisito + su evidencia.
export interface SigCeldaNorma {
  norma_id: number
  codigo: string
  texto: string | null
  aplica: boolean
  // Coberturas (documentos vinculados) de ese requisito en esa norma.
  coberturas: SigCobertura[]
  estado: SigEstadoCobertura // estado agregado: aprobado > cargado > pendiente / no_aplica
  fuente: SigFuente
  // Detalle legible de la fuente (ej. "85% (17/20)" de la metrica ISO 9001).
  valorFuente?: string | null
}

// Fila de la matriz integrada general: un numeral con sus 3 normas.
export interface SigMatrizRow {
  requisito: SigRequisito
  celdas: SigCeldaNorma[] // una por norma (orden por SigNorma.orden)
}

// Resumen de avance por norma (para el tablero del auditor).
export interface SigAvanceNorma {
  norma_id: number
  codigo: string
  nombre: string
  color: string | null
  total_aplica: number // requisitos que aplican a la norma
  cargados: number // con al menos un documento
  aprobados: number // con cobertura aprobada
  pct: number // % aprobado sobre total_aplica (0-100)
}

// Par requisito+norma usado para vincular un documento compartido a varios.
export interface SigObjetivoCobertura {
  requisitoId: number
  normaId: number
}

// ISO 14001 — Aspecto e impacto ambiental (matriz, numeral 6.1.2).
export interface SigAspectoAmbiental {
  id: number
  idempresa: number | null
  actividad: string
  aspecto: string
  impacto: string | null
  tipo_recurso: string | null
  condicion: string | null // normal | anormal | emergencia
  cumplimiento_legal: boolean | null
  frecuencia: number | null
  severidad: number | null
  alcance: number | null
  significancia: string | null // significativo | no_significativo
  control: string | null
  responsable: string | null
  activo: boolean
}

// Ítem del análisis de contexto / DOFA (numeral 4.1).
export interface SigDofa {
  id: number
  idempresa: number | null
  cuadrante: string // fortaleza | debilidad | oportunidad | amenaza
  origen: string | null // interno | externo
  descripcion: string
  orden: number | null
  activo: boolean
}

// Requisito legal (matriz legal, numeral 6.1.3). Hoy ambiental (ISO 14001).
export interface SigRequisitoLegal {
  id: number
  idempresa: number | null
  norma_codigo: string | null
  tipo_norma: string | null // Ley | Decreto | Resolución
  identificacion: string | null
  titulo: string | null
  requisito: string | null
  como_cumple: string | null
  cumple: string | null // cumple | parcial | no_cumple | no_aplica
  responsable: string | null
  activo: boolean
}

// Objetivo y meta del SIG (numeral 6.2).
export interface SigObjetivo {
  id: number
  idempresa: number | null
  norma_codigo: string | null // ISO9001 | ISO14001 | ISO45001 | SIG
  objetivo: string
  meta: string | null
  indicador: string | null
  unidad: string | null
  linea_base: string | null
  valor_actual: string | null
  fecha_meta: string | null
  responsable: string | null
  estado: string | null // en_curso | cumplido | atrasado
  activo: boolean
}

// Proceso del SIG (mapa de procesos, backbone de NC e indicadores).
export interface SigProceso {
  id: number
  idempresa: number | null
  codigo: string // DE | CD | AI | GH | TI | CO | EM
  nombre: string
  tipo: string // estrategico | misional | apoyo | evaluacion
  responsable: string | null
  objetivo: string | null
  orden: number | null
  activo: boolean
}

// Catálogo de no conformes POTENCIALES por proceso (análisis preventivo, 6.1).
export interface SigNcCatalogo {
  id: number
  idempresa: number | null
  proceso_codigo: string
  etapa: string | null
  descripcion: string // posible no conforme
  tipo: string | null // interno | externo
  afecta_cliente: boolean | null
  requisito_iso: string | null
  deteccion: string | null
  accion: string | null
  orden: number | null
  activo: boolean
}

// Registro REAL de no conformidad (ISO 9001 10.2 / 8.7).
export interface SigNoConformidad {
  id: number
  idempresa: number | null
  codigo: string | null
  proceso_codigo: string | null
  proyecto_id: number | null // cliente/sitio donde ocurrió (empresas.id 1..6)
  catalogo_id: number | null
  fecha: string | null
  origen: string | null // auditoria | queja | inspeccion | proceso | autorreporte | revision_direccion
  descripcion: string
  tipo: string | null // interno | externo
  afecta_cliente: boolean | null
  requisito_incumplido: string | null
  correccion: string | null
  causa_raiz: string | null
  accion_correctiva: string | null
  responsable: string | null
  fecha_compromiso: string | null
  fecha_cierre: string | null
  estado: string | null // abierta | en_proceso | cerrada | anulada
  eficacia: string | null // pendiente | eficaz | no_eficaz
  activo: boolean
}

// Encuesta de satisfacción (cliente/conductor), ISO 9001 9.1.2.
export interface SigSatisfaccion {
  id: number
  proyecto_id: number | null
  tipo: string | null // cliente | conductor
  fecha: string | null
  periodo: string | null
  encuestado: string | null
  calificacion: number | null // 1-5
  oportunidad: number | null
  calidad: number | null
  comunicacion: number | null
  recomendaria: boolean | null
  comentario: string | null
  canal: string | null
  responsable: string | null
  activo: boolean
}

// PQRSF (Peticiones, Quejas, Reclamos, Sugerencias, Felicitaciones).
export interface SigPQRSF {
  id: number
  proyecto_id: number | null
  fecha: string | null
  tipo: string | null // peticion | queja | reclamo | sugerencia | felicitacion
  parte_interesada: string | null
  canal: string | null
  descripcion: string
  responsable: string | null
  estado: string | null // abierta | en_proceso | cerrada
  respuesta: string | null
  fecha_compromiso: string | null
  fecha_cierre: string | null
  dias_respuesta: number | null
  genera_nc: boolean | null
  activo: boolean
}

// Catálogo de tipos de movimiento de inventario (nomenclatura SAP ↔ LIPgo).
export interface SigTipoMovimiento {
  id: number
  codigo_sap: string | null // código con el que se asocia el movimiento en Supabase (invtrans.cod_movimiento)
  nombre: string
  clase: string // entrada | salida | traslado | ajuste | merma | inicial
  origen_lipgo: string | null
  descripcion: string | null
  afecta_stock: boolean | null
  orden: number | null
  activo: boolean
}

// Cuadre / conteo físico de inventario (estilo SAP B1). Por cliente/sitio.
export interface SigInventarioCuadre {
  id: number
  proyecto_id: number | null
  fecha: string | null
  tipo: string | null // total | ciclico
  almacen: string | null
  responsable: string | null
  estado: string | null // borrador | contado | cerrado | aprobado
  total_sistema: number | null
  total_conteo: number | null
  total_diferencia: number | null
  items: number | null
  items_con_diferencia: number | null
  observaciones: string | null
  creado_por: string | null
  // Acta de revisión — firma del cliente (auditoría).
  cliente_firmante: string | null
  cliente_cargo: string | null
  fecha_firma: string | null
  firmado: boolean | null
  acta_observaciones: string | null
  activo: boolean
}

export interface SigInventarioCuadreDetalle {
  id: number
  cuadre_id: number
  codproducto: string | null
  producto: string | null
  lote: string | null
  location: string | null
  sistema: number | null
  conteo: number | null
  diferencia: number | null
  observacion: string | null
}

// Cierre mensual de conciliación de inventario (acta + PDF por mes/proyecto).
export interface SigInventarioCierreMes {
  id: number
  proyecto_id: number
  mes: string // YYYY-MM
  estado: string | null // pendiente | conciliado
  saldo_inicial: number | null
  ingresos: number | null
  cargue: number | null
  merma: number | null
  salidas: number | null
  saldo_final: number | null
  faltante: number | null
  ajuste: number | null
  produccion: number | null
  devolucion: number | null
  documento_url: string | null
  firmante: string | null
  fecha_firma: string | null
  observaciones: string | null
  cerrado_por: string | null
  created_at: string | null
  updated_at: string | null
  fisico_congelado: number | null // stock físico total (PT+SubProd) congelado al cierre
  fisico_snapshot: Record<string, number> | null // físico por lote (`idproducto|lote`) al cierre
  firma_url: string | null // PNG de la firma digital (archivos/firmas/)
  firmante_cargo: string | null // cargo de quien firma el acta
}

// Acta de Cruce de Inventario (apertura de mes, congelado real) — cabecera.
// Tabla separada del Cuadre mensual (decisión del cliente 2026-08-08); las
// correcciones NO se editan aquí directo: pasan por sig_inventario_ajuste
// (único formulario sancionado para mover inventario), y quedan enlazadas
// aquí (invtrans_id) como evidencia.
export interface SigInventarioActaCruce {
  id: number
  proyecto_id: number
  mes: string // YYYY-MM (mes que ABRE con este cruce, ej. '2026-08')
  fecha_corte: string // YYYY-MM-DD
  origen: string | null // archivo_fisico | calculado
  estado: string | null // borrador | firmado
  firmante: string | null
  firmante_cargo: string | null
  firma_url: string | null
  fecha_firma: string | null
  observaciones: string | null
  creado_por: string | null
  created_at: string | null
  updated_at: string | null
}

export interface SigInventarioActaCruceDetalle {
  id: number
  acta_id: number
  codproducto: string
  producto: string | null
  lote: string
  location: string
  sistema_original: number
  fisico_actual: number
  diferencia: number
  corregido: boolean
  motivo_correccion: string | null
  invtrans_id: number | null
  corregido_por: string | null
  corregido_fecha: string | null
}

// Plantas (producción PT) vs Cedis (descargue). Salidas = cargue + merma en ambos.
export const SIG_PLANTAS_LIP = [1, 2] // Indupan, Avimol
export const SIG_CEDIS_LIP = [3, 4] // Funza, Medellín

export interface SigInventarioAjuste {
  id: number
  proyecto_id: number | null
  cuadre_id: number | null
  fecha: string | null
  codproducto: string | null
  producto: string | null
  lote: string | null
  cantidad: number | null
  tipo: string | null // faltante | sobrante | averia | devolucion | correccion
  direccion: string | null // ingreso | salida
  location: string | null // ubicación (config LIPgo)
  cod_movimiento: string | null // código de transacción (nomenclatura)
  motivo: string | null
  responsable: string | null
  soporte: string | null
  estado: string | null // registrado | aprobado
  aprobado_por: string | null
  aprobado_fecha: string | null
  invtrans_id: number | null // movimiento real generado al aprobar (mueve stock)
  activo: boolean
}

// Paso del Mapa de Interacción del Proceso (LIPgo) — guía para el auditor.
// Documenta la intervención armónica LIP↔cliente. Los pasos del cliente son
// valor agregado de LIP (herramienta de control/trazabilidad), no alcance.
export interface SigProcesoInteraccion {
  id: number
  idempresa: number | null
  orden: number
  fase: string
  paso: string
  responsable: string | null // cliente | lip | ambos
  es_valor_agregado: boolean | null
  accion_lipgo: string | null
  modulo_lipgo: string | null
  evidencia: string | null
  campo_dato: string | null
  norma_iso: string | null
  activo: boolean
}

// Indicador de gestión (ISO 9001 9.1). Catálogo a nivel LIP; los valores en
// vivo se calculan filtrando por cliente/sitio (proyecto).
export interface SigIndicador {
  id: number
  idempresa: number | null
  codigo: string
  proceso_codigo: string | null
  nombre: string
  tipo: string | null // gerencial | resultado
  parte_interesada: string | null // cliente | conductor | proveedor | colaborador | direccion | legal
  formula: string | null
  fuente: string | null
  calculo_auto: string | null // clave de cálculo en vivo (null = manual)
  unidad: string | null
  meta: number | null
  sentido: string | null // mayor_mejor | menor_mejor
  frecuencia: string | null
  responsable: string | null
  valor_manual: number | null
  orden: number | null
  // Metadata Balanced Scorecard (cerebro del SIG).
  perspectiva: string | null // financiera | cliente | procesos | aprendizaje
  area: string | null // nombre del área (Dirección, Operación, Bodega, GH, TI...)
  finalidad: string | null // para qué sirve el indicador
  cliente_interno: string | null // quién usa/recibe el resultado dentro de LIP
  cliente_externo: string | null // parte interesada externa beneficiada
  contribucion: string | null // cómo contribuye al objetivo gerencial
  objetivo_id: number | null // amarre al objetivo estratégico (sig_objetivos.id)
  activo: boolean
}

// Valor calculado en vivo de un indicador automático.
export interface SigIndicadorValor {
  valor: number
  base?: string // detalle, ej. "713/1000"
}

// Control de cambios documentales (bitacora de versiones, ISO 7.5.3).
export type SigTipoCambio = "creacion" | "modificacion" | "anulacion"

export interface SigDocVersion {
  id: number
  idempresa: number | null
  documento_id: string | null
  documento_codigo: string | null
  version: string | null
  version_anterior: string | null
  tipo: SigTipoCambio
  motivo: string | null
  descripcion_cambio: string | null
  responsable: string | null
  fecha: string | null
  created_at: string | null
}
