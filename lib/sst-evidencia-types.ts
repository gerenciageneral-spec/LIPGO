// ---------------------------------------------------------------------------
// Tipos de los modulos de EVIDENCIA del SG-SST (alimentan las tablas sst_*).
// Archivo separado (sin "use server") para poder exportar tipos puros.
// No modifica sst-types.ts existente.
// ---------------------------------------------------------------------------

export interface PlanMejoraRow {
  id: number
  idempresa: number
  autoevaluacion_id?: number | null
  item_id?: number | null
  hallazgo: string
  accion: string
  tipo_accion: string | null
  responsable: string | null
  fecha_inicio: string | null
  fecha_fin: string | null
  estado: string
  avance: number | null
  evidencia_url: string | null
}

export interface IndicadorRow {
  id?: number
  idempresa: number
  periodo: string
  tipo: string
  valor: number | null
  meta: number | null
  unidad: string | null
  numerador: number | null
  denominador: number | null
  observacion: string | null
}

export interface MedevacRow {
  id?: number
  idempresa: number
  centro_trabajo: string | null
  nombres: string | null
  documento_tipo: string | null
  documento: string | null
  cargo: string | null
  celular: string | null
  alergias: string | null
  rh: string | null
  arl: string | null
  eps: string | null
  contacto_nombre: string | null
  contacto_telefono: string | null
  contacto_parentesco: string | null
  email: string | null
  mes_cumple: string | null
  marca_temporal: string | null
  created_at?: string | null
  // Llave de enlace con el Perfil Sociodemografico, el headcount y el portal
  // del trabajador: el documento sin puntos ni espacios, en mayuscula. Es una
  // columna GENERADA en Postgres, asi que NUNCA se escribe desde la app.
  documento_norm?: string | null
  origen?: string | null            // carga_csv | portal | sst
  actualizado_en?: string | null
  actualizado_por?: string | null
  // Control de calidad de la carga masiva: la fila entro pero hay algo que
  // corregir a mano (telefono incompleto, correo invalido, campo perdido).
  requiere_revision?: boolean | null
  revision_nota?: string | null
}

export interface PerfilSociodemograficoRow {
  id?: number
  idempresa: number
  estado: string | null // activo | retirado
  documento_tipo: string | null
  documento: string | null
  nombres: string | null
  apellidos: string | null
  fecha_nacimiento: string | null
  edad: number | null
  sexo: string | null
  eps: string | null
  afp: string | null
  arl: string | null
  centro_trabajo: string | null
  turno: string | null
  cargo: string | null
  fecha_ingreso: string | null
  fecha_retiro: string | null
  pais_nacimiento: string | null
  depto_nacimiento: string | null
  municipio_residencia: string | null
  grupo_etnico: string | null
  nivel_escolaridad: string | null
  estado_civil: string | null
  cabeza_familia: string | null
  num_hijos: number | null
  personas_hogar: number | null
  ingresos_familiares: string | null
  tipo_vivienda: string | null
  caracteristicas_vivienda: string | null
  zona: string | null
  direccion: string | null
  transporte: string | null
  estrato: string | null
  consume_alcohol: string | null
  actividad_fisica: string | null
  fumador: string | null
  marca_temporal: string | null
  created_at?: string | null
  // Misma llave de enlace que MEDEVAC. Columna GENERADA: no se escribe.
  documento_norm?: string | null
  origen?: string | null            // portal | sst
  actualizado_en?: string | null
  actualizado_por?: string | null
}

export interface IpevrRow {
  id?: number
  idempresa: number
  sede: string | null
  proceso: string | null
  zona: string | null
  actividad: string | null
  rutinaria: boolean
  clasificacion_peligro: string | null
  descripcion_peligro: string | null
  efectos_posibles: string | null
  control_fuente: string | null
  control_medio: string | null
  control_individuo: string | null
  nd: number
  ne: number
  np?: number
  nc: number
  nr?: number
  interpretacion_np?: string | null
  interpretacion_nr?: string | null
  aceptabilidad?: string | null
  n_expuestos: number
  peor_consecuencia: string | null
  medidas_intervencion: string | null
  fecha?: string | null
  // --- Columnas ricas del formato LIP (SST-MA-002) ---
  tarea?: string | null
  especificacion?: string | null
  medida_eliminacion?: string | null
  medida_sustitucion?: string | null
  control_ingenieria?: string | null
  control_administrativo?: string | null
  medida_epp?: string | null
  gc_plan_accion?: string | null
  gc_fecha_implementacion?: string | null
  gc_tipo_plan?: string | null
  gc_controles_propuestos?: string | null
  gc_controles_implementados?: string | null
  gc_pct_cumplimiento?: number | null
}

export interface IncidenteRow {
  id?: number
  idempresa: number
  sede: string | null
  tipo: "incidente" | "accidente" | "enfermedad_laboral"
  gravedad: "leve" | "grave" | "mortal" | null
  trabajador: string | null
  cargo: string | null
  tipo_vinculacion: string | null
  ocupacion_habitual: string | null
  antiguedad_dias: number | null
  funciones_asignadas: string | null
  epp_portado: string | null
  fecha_evento: string
  hora_evento: string | null
  dia_semana: string | null
  departamento_evento: string | null
  municipio_evento: string | null
  zona_evento: string | null
  area_ocurrencia: string | null
  lugar_ocurrencia: string | null
  jornada_evento: string | null
  labor_habitual: boolean | null
  tipo_accidente: string | null
  causo_muerte: boolean | null
  tipo_lesion: string | null
  parte_cuerpo: string | null
  agente_accidente: string | null
  mecanismo: string | null
  descripcion: string | null
  testigos_presenciaron: boolean | null
  reportado_arl: boolean | null
  fecha_reporte_arl: string | null
  furat_radicado: string | null
  reportado_mintrabajo: boolean | null
  equipo_investigador: string | null
  metodologia: string | null
  causas_inmediatas: string | null
  causas_basicas: string | null
  observaciones_investigadores: string | null
  fecha_investigacion: string | null
  primeros_auxilios: boolean | null
  remitido_centro_salud: boolean | null
  centro_salud: string | null
  hospitalizado: boolean | null
  dias_incapacidad: number | null
  dias_incapacidad_inicial: number | null
  dias_prorroga: number | null
  cie10_codigo: string | null
  cie10_diagnostico: string | null
  estado: string
  fecha_cierre: string | null
  ausentismo_id?: string | null
  ishikawa?: any
  causa_actos_inseguros?: string | null
  causa_condiciones_inseguras?: string | null
  causa_factores_personales?: string | null
  causa_factores_trabajo?: string | null
  // --- SST-FOR-21 (formato original LIP) ---
  documento_tipo?: string | null
  documento_numero?: string | null
  fecha_nacimiento?: string | null
  sexo?: string | null
  eps?: string | null
  arl?: string | null
  afp?: string | null
  salario?: number | null
  codigo_ocupacion?: string | null
  fecha_ingreso?: string | null
  jornada_habitual?: string | null
  centro_trabajo?: string | null
  centro_direccion?: string | null
  centro_municipio?: string | null
  codigo_actividad?: string | null
  fecha_reporte?: string | null
  tiempo_laborado_previo?: string | null
  dentro_fuera_empresa?: string | null
  requirio_transporte?: boolean | null
  ausentismo_tipo?: string | null
  ausentismo_fecha_inicial?: string | null
  ausentismo_fecha_final?: string | null
  divulgacion_leccion?: string | null
  charla_seguridad?: string | null
  retroalimentacion?: string | null
  firmas?: any
  documento_url?: string | null
  documento_editable_url?: string | null
}

export interface IncidenteTestigoRow {
  id?: number
  incidente_id: number
  idempresa?: number | null
  nombre: string | null
  documento: string | null
  version: string | null
  cargo?: string | null
}

export interface IncidenteAccionRow {
  id?: number
  incidente_id: number
  idempresa: number
  plan: string
  tipo_control: "fuente" | "medio" | "individuo" | null
  fecha_implementacion: string | null
  responsable_ejecucion: string | null
  fecha_verificacion: string | null
  responsable_verificacion: string | null
  observacion: string | null
  estado: string
}

export interface EppRow {
  id?: number
  idempresa: number
  sede: string | null
  trabajador: string
  cedula: string | null
  cargo: string | null
  tipo_persona: string
  elemento: string
  cantidad: number
  motivo: string
  motivo_reposicion: string | null
  fecha: string | null
  firma: string | null
  observacion: string | null
}

export interface EquipoRow {
  id?: number
  idempresa: number
  sede: string | null
  tipo: string
  identificacion: string
  marca: string | null
  modelo: string | null
  serie: string | null
  fecha_ingreso: string | null
  horometro: number | null
  estado: string
  observaciones: string | null
}

export interface MantenimientoRow {
  id?: number
  idempresa: number
  equipo_id: number | null
  tipo: "preventivo" | "correctivo"
  fecha_programada: string | null
  fecha_ejecucion: string | null
  descripcion: string | null
  proveedor: string | null
  costo: number | null
  estado?: string
  evidencia_url: string | null
}

export interface AutorreporteRow {
  id?: number
  idempresa: number
  sede: string | null
  trabajador: string | null
  tipo: string | null
  descripcion: string
  fecha: string | null
  estado: string
  accion: string | null
  responsable: string | null
  fecha_cierre: string | null
}

export interface PqrsfRow {
  id?: number
  idempresa: number
  sede: string | null
  tipo: string | null
  remitente: string | null
  descripcion: string
  fecha: string | null
  estado: string
  respuesta: string | null
  fecha_respuesta: string | null
}

export interface ComunicacionRow {
  id?: number
  idempresa: number
  sede: string | null
  tema: string
  dirigido_a: string | null
  medio: string | null
  frecuencia: string | null
  fecha: string | null
  evidencia_url: string | null
}

export interface GestionCambioRow {
  id?: number
  idempresa: number
  sede: string | null
  tipo_cambio: string | null
  descripcion: string
  fecha_reporte: string | null
  impacto_sst: string | null
  controles: string | null
  ipevr_actualizado: boolean
  capacitacion_realizada: boolean
  estado: string
  fecha_implementacion: string | null
  responsable: string | null
}

export interface ActividadRow {
  id?: number
  idempresa: number
  sede: string | null
  tipo: string | null
  tema: string
  fecha: string | null
  facilitador: string | null
  n_asistentes: number
  duracion_horas: number | null
  evidencia_url: string | null
  observacion: string | null
}

export interface ComiteMiembroRow {
  id?: number
  idempresa: number
  comite: "copasst" | "convivencia"
  nombre: string
  documento: string | null
  rol: string | null
  periodo_inicio: string | null
  periodo_fin: string | null
}
