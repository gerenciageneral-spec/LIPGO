import { Truck, Scale, ClipboardCheck, Package, FileText, CheckCircle, Box, PackagePlus, BarChart3, Package2, ArrowRightLeft, History, Search, LayoutDashboard, Activity, FileCheck, Receipt, Clock, Users, Eye, Settings, Type as type, LucideIcon, CreditCard, UserCheck, Store, Tag, Layers, MapPin, Warehouse, Gauge, QrCode, Sparkles, BadgeCheck, BookOpen, Lock, ClipboardList, CalendarDays, NotebookPen, GraduationCap, Wallet, Banknote, Calculator, CalendarClock, FolderOpen, FolderArchive, UserCog, HeartHandshake, ShieldCheck, Stethoscope, AlertTriangle, Star, Send, Landmark } from "lucide-react"

export interface Module {
  name: string
  icon: LucideIcon
  // Texto visible opcional en el sidebar. `name` sigue siendo la clave de
  // ruteo y permisos; si `label` existe, se pinta en lugar de `name`.
  label?: string
}

export interface Subgroup {
  title: string
  modules: Module[]
}

export interface Group {
  key: GroupKey
  title: string
  icon: LucideIcon
  modules?: Module[]
  subgroups?: Subgroup[]
}

export type GroupKey =
  | "pedidos"
  | "inventarios"
  | "produccion"
  | "integral"
  | "lip"
  | "rrhh"
  | "certificaciones_lip"
  | "sst"
  | "configuracion"
  | "despachos"
  | "mrp"
  | "financiera"

export const groups: Group[] = [
  {
    // REORG (2026-07-03): "Recepción y Despacho" fusiona los antiguos grupos
    // "Gestión de Vehículos", "Despachos/Recepción" y "Báscula" en un solo
    // grupo por flujo de puerta (inbound/outbound). Los módulos conservan su
    // `name` → sus permisos NO cambian; solo cambia dónde se muestran.
    key: "despachos",
    title: "Recepción y Despacho",
    icon: Truck,
    modules: [],
    subgroups: [
      {
        title: "Órdenes y Recepción",
        modules: [
          { name: "Generar Órdenes de Cargue", icon: Truck },
          { name: "Generar Órdenes de Descargue", icon: Truck },
          { name: "Generar Orden de Distribución", icon: Truck },
          { name: "Gestión de Ordenes", icon: Receipt },
          { name: "Recepción de Traslado", icon: Eye },
          // Dashboard de indicadores de despachos y recepción. Su visibilidad
          // queda gobernada por el permiso `dashboardrecepcion` (mapeado en
          // `lib/permissions-map.ts`).
          { name: "Dashboard Despachos/Recepción", icon: LayoutDashboard },
        ],
      },
      {
        title: "Vehículos y Portería",
        modules: [
          { name: "Registrar Vehículos", icon: Clock },
          { name: "Ver Vehículos", icon: Eye },
          { name: "Registro sanitario", icon: ClipboardCheck },
          { name: "Ver historial de Inspección", icon: History },
        ],
      },
      {
        title: "Báscula",
        modules: [
          { name: "Báscula", icon: Scale },
          { name: "Historial Báscula", icon: History },
        ],
      },
    ],
  },
  {
    key: "pedidos",
    title: "Gestión de Pedidos",
    icon: Package,
    modules: [
      { name: "Entrada de pedidos", icon: PackagePlus },
      { name: "Gestionar pedidos", icon: FileText },
      { name: "Gestión integral de pedidos", icon: FileText },
      // Modulo nuevo: vista de indicadores de pedidos. Su visibilidad
      // queda gobernada por el permiso `dashboardpedidos` (mapeado en
      // `lib/permissions-map.ts`).
      { name: "Dashboard Pedidos", icon: LayoutDashboard },
    ],
  },
  {
    key: "inventarios",
    title: "Almacenamiento",
    icon: Box,
    modules: [],
    subgroups: [
      {
        title: "Gestión inventario",
        modules: [
          { name: "Transacciones de Inventario", icon: ArrowRightLeft },
          { name: "Saldos de inventario", icon: BarChart3 },
          { name: "Saldos por producto", icon: Package2 },
          { name: "Traslados de producto", icon: ArrowRightLeft },
          { name: "Gestión de transacciones", icon: FileText },
          { name: "Capacidad Bodega", icon: Gauge },
          // Registro diario de disponibilidad de montacargas y conteo
          // del personal de operación. CRUD sobre `montacargasdia`,
          // protegido por el permiso `montacargasdia`.
          { name: "Montacargas y personal día", icon: Truck },
          { name: "Panel LIP Inventario", icon: BarChart3, label: "Panel de Inventario (Exactitud y movimientos)" },
          { name: "Cuadre de Inventario", icon: ClipboardCheck, label: "Cuadre y Correcciones (Cierre mensual)" },
          // REORG (2026-07-03): "Auditoría de Inventario" se movió aquí desde su
          // antiguo grupo propio "Auditoría". Conserva su `name`/permiso.
          { name: "Auditoría de Inventario", icon: Search },
        ],
      },
      {
        title: "Asignación de Lotes",
        modules: [
          { name: "Asignación de Lotes", icon: FileCheck },
          { name: "Historial de lotes", icon: History },
        ],
      },
    ],
  },
  {
    key: "produccion",
    title: "Producción",
    icon: Package2,
    modules: [
      { name: "Ingreso de Producción", icon: PackagePlus },
      { name: "Tolva", icon: Package },
      { name: "Ver Tolva", icon: Eye },
      { name: "Ver ingresos de producción", icon: Eye },
      { name: "Aprobación de ingreso de producción", icon: CheckCircle },
      { name: "Dashboard de Producción", icon: Activity },
      { name: "Reporte de Paros", icon: AlertTriangle },
      { name: "Historial Aprobaciones", icon: History },
      { name: "Reprocesos", icon: ArrowRightLeft },
      { name: "Servicios Adicionales", icon: Clock },
    ],
  },
  {
    key: "integral",
    title: "Torre de Control",
    icon: LayoutDashboard,
    modules: [
      { name: "Dashboard Operacion", icon: Activity },
      { name: "Asistente IA", icon: Sparkles },
    ],
  },
  {
    key: "lip",
    title: "Operación LIP",
    icon: Users,
    modules: [],
    subgroups: [
      {
        title: "Operación Lip",
        modules: [
          { name: "Picking", icon: PackagePlus },
          { name: "Packing", icon: Package },
          { name: "Ver Picking/Packing", icon: Eye },
          { name: "Registro de QR estibas", icon: QrCode },
          { name: "Lectura de QR estibas", icon: QrCode },
          { name: "Inventario por Estiba", icon: QrCode },
          // "Proyecciones" se movio al grupo RRHH Lip por solicitud del
          // negocio: el modulo proyecta cargas/ingresos asociados al
          // personal y conceptualmente vive mas cerca de RRHH que de
          // operacion logistica.
          { name: "Dashboard Operaciones LIP", icon: LayoutDashboard },
          { name: "Panel LIP Operación", icon: BarChart3, label: "Tablero del Coordinador" },
          // "Gestión de Facturas" reubicado aquí desde Gestión Financiera: es
          // función operativa propia del coordinador/líder de LIP. Conserva su
          // nombre y permiso (gestionfacturas).
          { name: "Gestión de Facturas", icon: Receipt },
          // El coordinador es responsable de las partes interesadas (conductores
          // y cliente): gestiona aquí satisfacción y PQRSF. Mismo módulo del SIG,
          // permiso propio (satisfaccion_pqrsf).
          { name: "Satisfacción y PQRSF", icon: ClipboardList, label: "Satisfacción y PQRSF (conductores y cliente)" },
          // Calificación del conductor EN CALIENTE al fin de cargue (kiosko 🟢🟡🔴).
          { name: "Calificación del Conductor", icon: Star, label: "Calificación del Conductor (en caliente)" },
          { name: "Aprobar Turnos", icon: CheckCircle },
          // Modulo "Bitácora": registro diario de novedades/observaciones
          // de la operacion. CRUD sobre la tabla `bitacora` filtrado por
          // empresa y protegido por el permiso `bitacora`.
          { name: "Bitácora", icon: NotebookPen },
          // Movido desde "Reclutamiento y Selección" por solicitud del
          // negocio: la solicitud de personal se gestiona dentro de la
          // operacion LIP. Conserva su permiso original.
          { name: "Solicitud de Personal", icon: UserCheck },
          // Movido desde "Compensación" por solicitud del negocio.
          // Conserva su permiso original.
          { name: "Programación de turnos", icon: CalendarClock, label: "Programación de Turnos" },
          // Movido desde "Compensación" por solicitud del negocio.
          // Conserva su permiso original.
          { name: "Registro de asistencia", icon: UserCheck, label: "Registro de Asistencia" },
          // Envio de alertas y programacion de turnos por WhatsApp al
          // celular del personal (desde colaboradores_th / registroasistencia).
          { name: "Notificaciones al Personal", icon: Send, label: "Notificaciones al Personal (WhatsApp)" },
        ],
      },
      // REORG (2026-07-03): el subgrupo "Administración LIP" (Registrar Gasto,
      // Dashboard Gastos) se movió a "Gestión Financiera". Conservan sus
      // permisos (gastos).
    ],
  },
  {
    // Módulo de Gestión Financiera. "Facturación" se elevó desde Gestión LIP a
    // su propio módulo. Los submódulos CONSERVAN sus permisos ya otorgados en
    // Gestión de Usuarios (facturacion_proyectos, tarifas, gestionfacturas).
    key: "financiera",
    title: "Gestión Financiera",
    icon: Wallet,
    modules: [],
    subgroups: [
      {
        title: "Facturación",
        modules: [
          { name: "Indicador de Facturación por Proyectos", icon: BarChart3 },
          { name: "Facturación Proyectos", icon: CreditCard },
          // Cruce órdenes procesadas vs facturado por owner + prefactura. Permiso propio.
          { name: "Cuadro de Control Facturación", icon: ClipboardCheck },
          { name: "Tarifas", icon: CreditCard },
          // "Gestión de Facturas" se MOVIÓ a Gestión LIP → Operación Lip (función
          // operativa del coordinador). Conserva su permiso (gestionfacturas).
        ],
      },
      {
        // Estado de Resultados (P&L) trasladado desde Gestión LIP. Conserva su
        // permiso `estadoresultados`.
        title: "Resultados",
        modules: [
          { name: "Estado de Resultados", icon: BarChart3 },
        ],
      },
      {
        // REORG (2026-07-03): "Gastos" trasladado desde "Gestión LIP ·
        // Administración LIP". Conservan su permiso `gastos`.
        title: "Gastos",
        modules: [
          { name: "Registrar Gasto", icon: Receipt },
          { name: "Dashboard Gastos", icon: BarChart3 },
        ],
      },
    ],
  },
  {
    key: "rrhh",
    title: "Gestión Humana",
    icon: Users,
    // REORG (2026-07-06): navegación ordenada por el CICLO DE VIDA del colaborador.
    // Se consolidó el subgrupo delgado "Gestión de Contratación" (1 módulo) dentro
    // de Selección, y "Gestión de Solicitudes" (solicitud de personal) volvió a
    // Selección desde Bienestar. Todos los módulos CONSERVAN su name/permiso.
    subgroups: [
      {
        title: "Reclutamiento, Selección y Contratación",
        modules: [
          { name: "Gestión de Solicitudes", icon: ClipboardList },
          { name: "Aprobación de Solicitudes de Personal", icon: BadgeCheck },
          { name: "Hojas de Vida", icon: BookOpen },
          { name: "Antecedentes", icon: ShieldCheck },
          { name: "Entrevistas", icon: FileCheck },
          { name: "Gestión de Contratos", icon: FileText },
        ],
      },
      {
        title: "Directorio y Expediente",
        modules: [
          { name: "Gestión de Colaboradores", icon: UserCog, label: "Directorio de Colaboradores" },
          { name: "Head Count", icon: Users },
          { name: "Carpetas de Trabajadores", icon: FolderOpen, label: "Expediente del Colaborador" },
          { name: "Panel LIP Gestión Humana", icon: BarChart3, label: "Panel LIP · Gestión Humana (SIG)" },
        ],
      },
      {
        title: "Inducción, Formación y Desempeño",
        modules: [
          { name: "Inducciones", icon: GraduationCap },
          { name: "Evidencia de Inducciones", icon: BookOpen },
          { name: "Gestión de Capacitaciones", icon: GraduationCap },
          { name: "Asistencia a Capacitaciones", icon: ClipboardList },
          { name: "Evaluaciones de Desempeño", icon: BadgeCheck },
        ],
      },
      {
        title: "Asistencia, Turnos y Tiempos",
        modules: [
          { name: "Tabla Asistencia", icon: ClipboardList, label: "Tabla de Asistencia" },
          { name: "Visor", icon: Eye, label: "Visor de Asistencia" },
          { name: "Turnos", icon: Clock, label: "Turnos por Puesto" },
          { name: "Asignación horas extra", icon: Clock, label: "Asignación de Horas Extra" },
        ],
      },
      {
        title: "Relaciones Laborales y Ausentismo",
        modules: [
          { name: "Novedades de personal", icon: NotebookPen, label: "Novedades de Personal" },
          // Matriz SST-MAT-06 de ausentismo laboral (EG / AT). Comparte el
          // permiso de "Novedades de personal".
          { name: "Ausentismos", icon: Activity },
          // Seguimiento del costo recuperable de incapacidades (EPS/ARL).
          // Comparte el permiso de "Ausentismos".
          { name: "Recobro de Incapacidades", icon: CreditCard },
        ],
      },
      {
        title: "Bienestar",
        modules: [
          { name: "Programa de Bienestar", icon: HeartHandshake },
          { name: "Participación y Evidencias", icon: ClipboardList },
        ],
      },
      {
        title: "Nómina",
        modules: [
          { name: "Nominapersonal", icon: Banknote, label: "Nómina de Personal" },
          { name: "Liquidaciones", icon: Receipt, label: "Liquidaciones" },
          // Aportes de seguridad social y parafiscales del mes (guía de la planilla PILA).
          { name: "Parafiscales", icon: Landmark, label: "Parafiscales y Seguridad Social" },
          { name: "Proyecciones", icon: Calculator, label: "Proyecciones de Nómina" },
        ],
      },
    ],
  },
  {
    // Modulo de certificaciones LIP. Agrupa el sistema SST 0312 y el centro
    // de evidencia ISO 9001 (movido desde Auditoria) como submodulos.
    key: "certificaciones_lip",
    title: "Certificaciones · SIG (Calidad · Ambiente · SST)",
    icon: BadgeCheck,
    // Submódulos agrupados POR NORMA para que se vea claro a cuál pertenece
    // cada uno: SIG transversal, luego una sección por norma certificable.
    subgroups: [
      {
        // Transversal: aplica a las 3 normas a la vez.
        title: "Sistema Integrado (SIG) · Transversal",
        modules: [
          { name: "Dashboard SIG", icon: BarChart3, label: "Dashboard SIG (Auditoría)" },
          { name: "Análisis de Contexto DOFA", icon: ClipboardCheck, label: "Análisis de Contexto (DOFA)" },
          { name: "Matriz Integrada SIG", icon: ClipboardCheck, label: "Matriz Integrada (ISO 9001·14001·45001)" },
          { name: "Repositorio por Norma SIG", icon: FolderArchive, label: "Repositorio Documental por Norma" },
          { name: "Repositorio Universal", icon: FolderArchive, label: "Repositorio Universal de Documentos" },
          { name: "Objetivos y Metas SIG", icon: ClipboardList, label: "Objetivos y Metas (6.2)" },
          { name: "No Conformidades SIG", icon: ClipboardList, label: "No Conformidades (10.2)" },
          { name: "Indicadores SIG", icon: Gauge, label: "BSC · Cuadro de Mando Integral" },
          { name: "Mapa de Interacción del Proceso", icon: ClipboardCheck, label: "Mapa de Interacción del Proceso (LIPgo)" },
          { name: "Satisfacción y PQRSF", icon: ClipboardList, label: "Satisfacción y PQRSF (9.1.2)" },
        ],
      },
      {
        title: "ISO 9001:2015 · Calidad",
        modules: [
          { name: "Centro de Evidencia ISO 9001", icon: BadgeCheck, label: "Centro de Evidencia" },
          { name: "Repositorio ISO 9001", icon: FolderArchive, label: "Repositorio Documental" },
        ],
      },
      {
        title: "ISO 14001:2015 · Ambiental",
        modules: [
          { name: "Aspectos e Impactos ISO 14001", icon: Gauge, label: "Aspectos e Impactos Ambientales" },
          { name: "Matriz Legal Ambiental", icon: ClipboardCheck, label: "Matriz Legal Ambiental" },
        ],
      },
    ],
  },
  {
    // REORG: SST deja de ser un subgrupo dentro de Certificaciones y pasa a ser
    // su PROPIO módulo (grupo), para que sea un área calificable por sí misma y
    // conectada al BSC por área. Los submódulos CONSERVAN su `name` y permiso
    // (sst_auditoria, sst_autoevaluacion, sst_epp, sst_incidentes, sst_medevac…),
    // así que los accesos ya otorgados no cambian. Certificaciones conserva el
    // SIG transversal + ISO 9001 + ISO 14001.
    key: "sst",
    title: "Seguridad y Salud en el Trabajo (SST)",
    icon: ShieldCheck,
    subgroups: [
      {
        title: "Autoevaluación y Mejora (Dec. 0312)",
        modules: [
          { name: "Auditoría 0312", icon: ShieldCheck, label: "Auditoría 0312" },
          { name: "Matriz de Estándares", icon: ClipboardCheck, label: "Matriz 60 Estándares" },
          { name: "Repositorio de Soportes", icon: FolderArchive, label: "Repositorio de Soportes (Matriz)" },
          { name: "Plan de Mejoramiento", icon: ClipboardList, label: "Plan de Mejoramiento" },
          { name: "Indicadores SST", icon: BarChart3, label: "Indicadores SG-SST" },
        ],
      },
      {
        title: "Peligros, Riesgos y Operación Segura",
        modules: [
          { name: "IPEVR", icon: Gauge, label: "IPEVR (GTC 45)" },
          { name: "Registro Preoperacional", icon: ClipboardCheck },
          { name: "Equipos y Mantenimiento", icon: Settings, label: "Equipos y Mantenimiento" },
          { name: "Entrega de EPP", icon: ShieldCheck, label: "Entrega de EPP" },
          { name: "Gestión de Dotación EPP", icon: Package, label: "Dotación de EPP" },
        ],
      },
      {
        title: "Accidentalidad y Salud en el Trabajo",
        modules: [
          { name: "Investigación AT", icon: Activity, label: "Investigación de AT (SST-FOR-21)" },
          { name: "Alertas de AT", icon: AlertTriangle, label: "Alertas de AT (Ausentismo)" },
          { name: "Investigaciones Realizadas", icon: FolderArchive, label: "Repositorio de Investigaciones" },
          { name: "Examenes Médicos", icon: Stethoscope },
          { name: "MEDEVAC", icon: Stethoscope, label: "MEDEVAC (Plan de Emergencias Médicas)" },
          { name: "Perfil Sociodemográfico", icon: Users, label: "Perfil Sociodemográfico (SST-FOR-32)" },
        ],
      },
      {
        title: "Comunicación, Cambio y Cultura",
        modules: [
          { name: "Comunicación SST", icon: NotebookPen, label: "Comunicación / Autorreporte / PQRSF" },
          { name: "Gestión del Cambio", icon: ArrowRightLeft, label: "Gestión del Cambio" },
          { name: "Actividades y Comités", icon: GraduationCap, label: "Actividades y Comités" },
        ],
      },
    ],
  },
  {
    key: "configuracion",
    title: "Configuración",
    icon: Settings,
    subgroups: [
      {
        title: "Gestión de Clientes",
        modules: [
          { name: "Clientes", icon: Users },
          { name: "Sucursales", icon: Store },
        ],
      },
      {
        title: "Productos",
        modules: [
          { name: "Productos", icon: Package },
          { name: "Categorías", icon: Tag },
          { name: "Sub Categorías", icon: Layers },
        ],
      },
      {
        title: "Bodegas",
        modules: [
          { name: "Bodegas", icon: Warehouse },
          { name: "Localizaciones", icon: MapPin },
        ],
      },
      {
        title: "Transportes",
        modules: [
          { name: "Tipos Despacho", icon: Truck },
          { name: "Transportadoras", icon: Truck },
          { name: "Tipos de Vehiculos", icon: Truck },
        ],
      },
      {
        title: "General",
        modules: [
          { name: "Condiciones Pago", icon: CreditCard },
          { name: "Vendedores", icon: UserCheck },
          { name: "Gestión de Usuarios", icon: Users },
          { name: "Accesos de Usuario", icon: Lock },
        ],
      },
    ],
  },
  {
    key: "mrp",
    title: "MRP",
    icon: Layers,
    modules: [
      { name: "Creación de materiales", icon: Package },
      { name: "Ingresos MP", icon: PackagePlus },
      { name: "Explosión de materiales", icon: Layers },
      { name: "Gestión de proveedores", icon: Users },
      { name: "Saldos de empaque", icon: Box },
      { name: "Saldos de materia prima", icon: Package2 },
    ],
  },
]
