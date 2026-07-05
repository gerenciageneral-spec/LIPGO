import { Warehouse, Tag, Users, CreditCard, MapPin, Layers, Truck, Package, Store, UserCheck, Lock } from "lucide-react"
import { createClient } from "./supabase-client" // Assuming supabase-client is a separate file

export type FieldType = "text" | "number" | "email" | "boolean" | "date" | "select"

export interface FieldDefinition {
  name: string
  label: string
  type: FieldType
  required?: boolean
  hidden?: boolean // For IDs or auto-generated fields
  editable?: boolean // Added to control if field can be edited
  defaultValue?: any
  options?: { label: string; value: string | number }[] // For select inputs
  min?: number // Added for validation
  dataSource?: string // For dynamic select inputs
  displayKey?: string // For dynamic select inputs
  valueKey?: string // For dynamic select inputs
  optionsUrl?: string // For dynamic select inputs
  showInForm?: boolean // Added to control if field should be shown in form
  showInTable?: boolean // Added to control if field should be shown in table
}

export interface ModuleDefinition {
  id: string
  name: string
  tableName: string
  displayName?: string
  title?: string
  primaryKey: string
  icon?: any
  fields: FieldDefinition[]
  canDelete?: boolean // Default is true if not specified
  orderBy?: { column: string; ascending: boolean }
  searchField?: string
  customDataFetch?: (supabase: any) => Promise<{ success: boolean; data: any[] }>
}

export const configModules: Record<string, ModuleDefinition> = {
  almacenes: {
    id: "almacenes",
    name: "Bodegas",
    tableName: "almacenes",
    primaryKey: "id",
    icon: Warehouse,
    fields: [
      { name: "id", label: "ID", type: "number", hidden: true },
      {
        name: "idempresa",
        label: "Empresa",
        type: "select",
        required: false,
        dataSource: "/api/owners",
        displayKey: "nombre",
        valueKey: "id",
        showInForm: false,
        showInTable: false,
      },
      { name: "nombre", label: "Nombre", type: "text", required: true },
      { name: "descripcion", label: "Descripción", type: "text" },
    ],
  },
  bodegas: {
    id: "bodegas",
    name: "Bodegas",
    tableName: "bodegas",
    primaryKey: "idbodega",
    icon: Warehouse,
    fields: [
      { name: "idbodega", label: "ID", type: "number", hidden: true },
      {
        name: "idempresa",
        label: "Empresa",
        type: "select",
        required: false,
        dataSource: "/api/owners",
        displayKey: "nombre",
        valueKey: "id",
        showInForm: false,
        showInTable: false,
      },
      { name: "nombrebodega", label: "Nombre Bodega", type: "text", required: true },
      { name: "clienteid", label: "ID Cliente", type: "number" },
      { name: "cliente", label: "Cliente", type: "text", hidden: false },
      { name: "direccion", label: "Dirección", type: "text" },
      { name: "ciudad", label: "Ciudad", type: "text" },
      { name: "activo", label: "Activo", type: "boolean", defaultValue: true },
    ],
  },
  categorias: {
    id: "categorias",
    name: "Categorías de Productos",
    tableName: "categorias",
    primaryKey: "id",
    icon: Tag,
    canDelete: false,
    fields: [
      { name: "id", label: "ID", type: "number", hidden: true },
      { name: "nombre", label: "Nombre", type: "text", required: true },
      { name: "activo", label: "Activo", type: "boolean", defaultValue: true },
    ],
  },
  subcategorias: {
    id: "subcategorias",
    name: "Sub Categorías",
    tableName: "subcategorias",
    primaryKey: "id",
    icon: Layers,
    canDelete: false,
    fields: [
      { name: "id", label: "ID", type: "number", hidden: true },
      { name: "categoriaid", label: "Categoría", type: "select", required: true, options: [] },
      { name: "categoria", label: "Categoría", type: "text", hidden: false },
      { name: "nombre", label: "Sub Categoría", type: "text", required: true },
      { name: "activo", label: "Activo", type: "boolean", defaultValue: true },
    ],
  },
  clientes: {
    id: "clientes",
    name: "Clientes",
    tableName: "clientes",
    primaryKey: "id",
    icon: Users,
    fields: [
      { name: "id", label: "ID", type: "number", hidden: true },
      {
        name: "idempresa",
        label: "Empresa",
        type: "select",
        required: false,
        dataSource: "/api/owners",
        displayKey: "nombre",
        valueKey: "id",
        showInForm: false,
        showInTable: false,
      },
      { name: "documento", label: "Documento", type: "number", required: false },
      { name: "nombre", label: "Nombre", type: "text", required: true },
      { name: "correo", label: "Correo", type: "email", required: false },
      { name: "correofact", label: "Correo Facturación Electrónica", type: "email", required: false },
      { name: "personacontacto", label: "Persona Contacto", type: "text", required: false },
      { name: "celular", label: "Celular", type: "text", required: false },
      {
        name: "tipo_cliente",
        label: "Tipo Cliente",
        type: "select",
        required: false,
        options: [
          { label: "Persona", value: "Persona" },
          { label: "Empresa", value: "Empresa" },
        ],
      },
      {
        name: "tiporegimeniva",
        label: "Régimen de IVA",
        type: "select",
        required: false,
        options: [
          { label: "No responsable de IVA", value: "No responsable de IVA" },
          { label: "Responsable de IVA", value: "Responsable de IVA" },
        ],
      },
      { name: "responsabilidadfiscal", label: "Responsabilidad Fiscal", type: "text", required: false },
      { name: "activo", label: "Activo", type: "boolean", defaultValue: true },
    ],
  },
  condicionespago: {
    id: "condicionespago",
    name: "Condiciones de Pago",
    tableName: "condicionespago",
    primaryKey: "idcondicion",
    icon: CreditCard,
    canDelete: false,
    fields: [
      { name: "idcondicion", label: "ID", type: "number", hidden: true },
      { name: "nombrecondicion", label: "Nombre Condición", type: "text", required: true },
      { name: "activo", label: "Activo", type: "boolean", defaultValue: true },
    ],
  },
  destinos: {
    id: "destinos",
    name: "Destinos",
    tableName: "destinos",
    primaryKey: "id",
    icon: MapPin,
    fields: [
      { name: "id", label: "ID", type: "number", hidden: true },
      { name: "nombre", label: "Nombre", type: "text", required: true },
      { name: "activo", label: "Activo", type: "boolean", defaultValue: true },
    ],
  },
  grupos: {
    id: "grupos",
    name: "Grupos",
    tableName: "grupos",
    primaryKey: "id",
    icon: Layers,
    fields: [
      { name: "id", label: "ID", type: "number", hidden: true },
      { name: "nombre", label: "Nombre", type: "text", required: true },
      { name: "activo", label: "Activo", type: "boolean", defaultValue: true },
    ],
  },
  medios: {
    id: "medios",
    name: "Medios",
    tableName: "medio",
    primaryKey: "id",
    icon: Truck,
    fields: [
      { name: "id", label: "ID", type: "number", hidden: true },
      {
        name: "idempresa",
        label: "Empresa",
        type: "select",
        required: true,
        dataSource: "/api/owners",
        displayKey: "nombre",
        valueKey: "id",
      },
      { name: "nombre", label: "Nombre", type: "text", required: true },
      { name: "activo", label: "Activo", type: "boolean", defaultValue: true },
    ],
  },
  productos: {
    id: "productos",
    name: "Productos",
    tableName: "productos",
    primaryKey: "id",
    icon: Package,
    canDelete: true,
    fields: [
      { name: "id", label: "ID", type: "number", hidden: true },
      {
        name: "idempresa",
        label: "Empresa",
        type: "select",
        required: false,
        dataSource: "/api/owners",
        displayKey: "nombre",
        valueKey: "id",
        showInForm: false,
        showInTable: false,
      },
      { name: "nombre", label: "Nombre", type: "text", required: true },
      { name: "gramaje", label: "Gramaje", type: "number", required: true },
      { name: "und", label: "UND", type: "number" },
      { name: "peso_unitkg", label: "Peso Neto", type: "number", required: true },
      { name: "pesobruto", label: "Peso Bruto", type: "number", required: true },
      { name: "und_equivalente", label: "UND Equivalente", type: "number" },
      { name: "equivalencia_bultos", label: "Equivalencia Bultos", type: "number" },
      { name: "unidades_estiba", label: "Unidades Estiba", type: "number", required: true },
      { name: "categoria", label: "Categoría", type: "select", required: true, options: [] },
      { name: "subcategoria", label: "Sub Categoría", type: "select", required: true, options: [] },
      { name: "vidautildias", label: "Vida útil en días", type: "number", min: 0 },
      { name: "activo", label: "Activo", type: "boolean", defaultValue: true },
    ],
  },
  sucursales: {
    id: "sucursales",
    name: "Sucursales",
    tableName: "bodegas",
    primaryKey: "idbodega",
    icon: Store,
    fields: [
      { name: "idbodega", label: "ID", type: "number", hidden: true },
      {
        name: "idempresa",
        label: "Empresa",
        type: "select",
        required: false,
        dataSource: "/api/owners",
        displayKey: "nombre",
        valueKey: "id",
        showInForm: false,
        showInTable: false,
      },
      { name: "cliente", label: "Cliente", type: "text", hidden: false },
      { name: "clienteid", label: "Cliente ID", type: "select", required: true, options: [], hidden: false },
      { name: "nombrebodega", label: "Nombre Sucursal", type: "text", required: true },
      { name: "direccion", label: "Dirección", type: "text", required: false },
      { name: "departamento", label: "Departamento", type: "select", required: false, options: [] },
      { name: "ciudad", label: "Ciudad", type: "select", required: false, options: [] },
      { name: "activo", label: "Activo", type: "boolean", defaultValue: true },
    ],
  },
  tipodespacho: {
    id: "tipodespacho",
    name: "Tipos de Despacho",
    tableName: "tipodespacho",
    primaryKey: "idtipodespacho",
    icon: Truck,
    fields: [
      { name: "idtipodespacho", label: "ID", type: "number", hidden: true },
      { name: "nombretipodespacho", label: "Nombre Tipo Despacho", type: "text", required: true },
      { name: "activo", label: "Activo", type: "boolean", defaultValue: true },
    ],
  },
  vendedores: {
    id: "vendedores",
    name: "Vendedores",
    tableName: "vendedores",
    primaryKey: "idvendedor",
    icon: UserCheck,
    fields: [
      { name: "idvendedor", label: "ID", type: "number", hidden: true },
      {
        name: "idempresa",
        label: "Empresa",
        type: "select",
        required: false,
        dataSource: "/api/owners",
        displayKey: "nombre",
        valueKey: "id",
        showInForm: false,
        showInTable: false,
      },
      { name: "nombre", label: "Nombre", type: "text", required: true },
      { name: "cedula", label: "Cédula", type: "text" },
      { name: "celular", label: "Celular", type: "text" },
      { name: "correo", label: "Correo", type: "email" },
      { name: "activo", label: "Activo", type: "boolean", defaultValue: true },
    ],
  },
  transportes: {
    id: "transportes",
    name: "Transportadoras",
    tableName: "transportes",
    primaryKey: "id",
    icon: Truck,
    fields: [
      { name: "id", label: "ID", type: "number", hidden: true },
      { name: "nombretransporte", label: "Nombre Transporte", type: "text", required: true },
      { name: "activo", label: "Activo", type: "boolean", defaultValue: true },
    ],
  },
  tiposvehiculos: {
    id: "tiposvehiculos",
    name: "Tipos de Vehiculos",
    tableName: "tiposvehiculos",
    primaryKey: "id",
    icon: Truck,
    fields: [
      { name: "id", label: "ID", type: "number", hidden: true },
      { name: "nombretipo", label: "Nombre Tipo", type: "text", required: true },
      { name: "capacidad", label: "Capacidad", type: "number", required: true },
      { name: "activo", label: "Activo", type: "boolean", defaultValue: true },
    ],
  },
  localizaciones: {
    id: "localizaciones",
    name: "Localizaciones",
    tableName: "locations",
    primaryKey: "id",
    icon: MapPin,
    fields: [
      { name: "id", label: "ID", type: "number", hidden: true },
      {
        name: "idempresa",
        label: "Empresa",
        type: "select",
        required: false,
        dataSource: "/api/owners",
        displayKey: "nombre",
        valueKey: "id",
        showInForm: false,
        showInTable: false,
      },
      { name: "codigo", label: "Código", type: "text", required: true },
      { name: "nombre", label: "Nombre", type: "text", required: true },
      { name: "Descripción", label: "Descripción", type: "text" },
      { name: "bodega", label: "Bodega", type: "select", required: true, options: [] },
      { name: "capacidad", label: "Capacidad", type: "number", min: 0 },
      { name: "activo", label: "Activo", type: "boolean", defaultValue: true },
    ],
  },
  citas_vehiculos: {
    id: "citas_vehiculos",
    name: "Ver Vehículos",
    tableName: "citasvehiculos",
    primaryKey: "id",
    icon: Truck,
    fields: [
      { name: "id", label: "ID", type: "number", hidden: true },
      {
        name: "idempresa",
        label: "Empresa",
        type: "select",
        required: true,
        dataSource: "/api/owners",
        displayKey: "nombre",
        valueKey: "id",
      },
      { name: "placa", label: "Placa", type: "text", required: true },
      { name: "nombreconductor", label: "Nombre Conductor", type: "text", required: true },
      { name: "telefono", label: "Celular", type: "text" },
      { name: "transporte", label: "Transporte", type: "select", options: [] },
      { name: "tipovehiculo", label: "Tipo Vehículo", type: "select", options: [] },
      { name: "tipoproducto", label: "Tipo Producto", type: "select", options: [] },
      { name: "tipodespacho", label: "Tipo Despacho/Recepción", type: "select", options: [] },
      { name: "horallegada", label: "Hora Llegada", type: "text", editable: false },
      { name: "fechallegada", label: "Fecha Llegada", type: "text", editable: false },
      { name: "capacidad", label: "Capacidad", type: "number", editable: false },
      { name: "horapesoinicial", label: "Hora Peso Inicial", type: "text", editable: false },
      { name: "horaregistro", label: "Hora Registro Sanitario", type: "text", editable: false },
      { name: "estatus", label: "Estatus", type: "text", editable: false },
      { name: "ocargue", label: "Orden de Cargue", type: "text", editable: false },
    ],
  },
  proveedores: {
    id: "proveedores",
    name: "Gestión de proveedores",
    tableName: "proveedores",
    primaryKey: "id",
    icon: Truck,
    fields: [
      { name: "id", label: "ID", type: "number", hidden: true },
      {
        name: "idempresa",
        label: "Empresa",
        type: "select",
        required: true,
        dataSource: "/api/owners",
        displayKey: "nombre",
        valueKey: "id",
      },
      { name: "idproveedor", label: "ID Proveedor", type: "text", required: true },
      { name: "nombre", label: "Nombre", type: "text", required: true },
      { name: "correo", label: "Correo", type: "email", required: false },
      { name: "pais", label: "País", type: "text", required: true },
      { name: "direccion", label: "Dirección", type: "text", required: true },
      {
        name: "tipo",
        label: "Tipo",
        type: "select",
        required: false,
        options: [
          { label: "Materia Prima", value: "mp" },
          { label: "Empaque", value: "empaque" },
        ],
      },
      { name: "activo", label: "Activo", type: "boolean", defaultValue: true },
    ],
  },
  materiales: {
    id: "materiales",
    name: "Creación de materiales",
    tableName: "materiales",
    primaryKey: "id",
    icon: Package,
    fields: [
      { name: "id", label: "ID", type: "number", hidden: true },
      {
        name: "idempresa",
        label: "Empresa",
        type: "select",
        required: true,
        dataSource: "/api/owners",
        displayKey: "nombre",
        valueKey: "id",
      },
      { name: "codigo", label: "Código", type: "text", required: true },
      { name: "nombre", label: "Nombre", type: "text", required: true },
      {
        name: "proveedor",
        label: "Proveedor",
        type: "select",
        required: true,
        options: [], // Will be populated dynamically from proveedores table
      },
      {
        name: "tipo",
        label: "Tipo",
        type: "select",
        required: true,
        options: [
          { label: "Materia Prima", value: "Materia Prima" },
          { label: "Empaque", value: "Empaque" },
        ],
      },
      {
        name: "undmedida",
        label: "Unidad de Medida",
        type: "select",
        required: true,
        options: [
          { label: "Und", value: "und" },
          { label: "Metro", value: "metro" },
          { label: "Kg", value: "kg" },
          { label: "Ton", value: "ton" },
          { label: "Caja", value: "caja" },
        ],
      },
      { name: "activo", label: "Activo", type: "boolean", defaultValue: true },
    ],
  },
  tarifas: {
    id: "tarifas",
    name: "Tarifas",
    title: "Gestión de Tarifas",
    icon: CreditCard,
    fields: [
      { name: "id", label: "ID", type: "number", hidden: true, editable: false },
      { name: "nombre", label: "Nombre", type: "text", required: true },
      { name: "inicio", label: "Fecha Inicio", type: "date" },
      { name: "fin", label: "Fecha Fin", type: "date" },
      { name: "descripcion", label: "Descripción", type: "text" },
      { name: "unidad", label: "Unidad", type: "text" },
      { name: "valor", label: "Valor", type: "number" },
      {
        name: "idempresa",
        label: "Empresa",
        type: "select",
        optionsUrl: "/api/owners",
        showInForm: false,
        showInTable: false,
      },
    ],
    tableName: "tarifas",
    primaryKey: "id",
    orderBy: { column: "id", ascending: true },
    searchField: "nombre",
    customDataFetch: async (supabase) => {
      const [tarifasResult, ownersResult] = await Promise.all([
        supabase
          .from("tarifas")
          .select("id, nombre, inicio, fin, descripcion, unidad, valor, idempresa")
          .order("id", { ascending: true }),
        supabase.from("owners").select("id, nombre"),
      ])

      if (tarifasResult.error) throw tarifasResult.error
      if (ownersResult.error) throw ownersResult.error

      const ownersMap = new Map(ownersResult.data?.map((owner: any) => [owner.id, owner.nombre]) || [])

      const transformedData = tarifasResult.data?.map((row: any) => ({
        id: row.id,
        nombre: row.nombre,
        inicio: row.inicio,
        fin: row.fin,
        descripcion: row.descripcion,
        unidad: row.unidad,
        valor: row.valor,
        idempresa: row.idempresa,
        empresa: ownersMap.get(row.idempresa) || "Sin empresa",
      }))

      return { success: true, data: transformedData }
    },
  },
  accesos_usuario: {
    id: "accesos_usuario",
    name: "Accesos de Usuario",
    tableName: "perfil_acceso_empresas",
    primaryKey: "id",
    icon: Lock,
    canDelete: false,
    fields: [],
  },
}

export async function fetchConfigData(tableName: string) {
  const supabase = await createClient()

  try {
    const moduleDef = configModules[tableName]
    if (moduleDef.customDataFetch) {
      return await moduleDef.customDataFetch(supabase)
    }

    if (tableName === "subcategorias") {
      const [subcategoriasResult, categoriasResult] = await Promise.all([
        supabase
          .from("subcategorias")
          .select("id, categoriaid, nombre, activo")
          .order("categoriaid", { ascending: true }),
        supabase.from("categorias").select("id, nombre"),
      ])

      if (subcategoriasResult.error) throw subcategoriasResult.error
      if (categoriasResult.error) throw categoriasResult.error

      // Create a map of categorias for quick lookup
      const categoriasMap = new Map(categoriasResult.data?.map((cat: any) => [cat.id, cat.nombre]) || [])

      // Transform data to include categoria name
      const transformedData = subcategoriasResult.data?.map((row: any) => ({
        id: row.id,
        categoriaid: row.categoriaid,
        categoria: categoriasMap.get(row.categoriaid) || "Sin categoría",
        nombre: row.nombre,
        activo: row.activo,
      }))

      return { success: true, data: transformedData }
    }

    if (tableName === "bodegas" || tableName === "sucursales") {
      const [bodegasResult, clientesResult] = await Promise.all([
        supabase
          .from("bodegas")
          .select("idbodega, nombrebodega, direccion, ciudad, activo, clienteid")
          .order("idbodega", { ascending: true }),
        supabase.from("clientes").select("id, nombre"),
      ])

      if (bodegasResult.error) throw bodegasResult.error
      if (clientesResult.error) throw clientesResult.error

      // Create a map of clientes for quick lookup
      const clientesMap = new Map(clientesResult.data?.map((cliente: any) => [cliente.id, cliente.nombre]) || [])

      // Transform data to include cliente name
      const transformedData = bodegasResult.data?.map((row: any) => ({
        idbodega: row.idbodega,
        cliente: clientesMap.get(row.clienteid) || "Sin cliente",
        nombrebodega: row.nombrebodega,
        direccion: row.direccion,
        ciudad: row.ciudad,
        activo: row.activo,
        clienteid: row.clienteid,
      }))

      return { success: true, data: transformedData }
    }

    if (tableName === "transportes") {
      const result = await supabase
        .from("transportes")
        .select("id, nombretransporte, activo")
        .order("id", { ascending: true })

      if (result.error) throw result.error

      return { success: true, data: result.data }
    }

    if (tableName === "tiposvehiculos") {
      const result = await supabase
        .from("tiposvehiculos")
        .select("id, nombretipo, capacidad, activo")
        .order("id", { ascending: true })

      if (result.error) throw result.error

      return { success: true, data: result.data }
    }

    if (tableName === "locations") {
      const [locationsResult, almacenesResult] = await Promise.all([
        supabase
          .from("locations")
          .select("id, idempresa, codigo, nombre, Descripción, bodega, capacidad, activo")
          .order("id", { ascending: true }),
        supabase.from("almacenes").select("id, nombre"),
      ])

      if (locationsResult.error) throw locationsResult.error
      if (almacenesResult.error) throw almacenesResult.error

      // Create a map of almacenes for quick lookup
      const almacenesMap = new Map(almacenesResult.data?.map((almacen: any) => [almacen.id, almacen.nombre]) || [])

      // Transform data to include almacen name
      const transformedData = locationsResult.data?.map((row: any) => ({
        id: row.id,
        idempresa: row.idempresa,
        codigo: row.codigo,
        nombre: row.nombre,
        Descripción: row.Descripción,
        bodega: row.bodega,
        capacidad: row.capacidad,
        activo: row.activo,
      }))

      return { success: true, data: transformedData }
    }

    if (tableName === "productos") {
      const [productosResult, categoriasResult, subcategoriasResult] = await Promise.all([
        supabase
          .from("productos")
          .select(
            "id, id_empresa, nombre, codigo, gramaje, und, peso_unitkg, pesobruto, und_equivalente, equivalencia_bultos, unidades_estiba, categoria, subcategoria, vidautildias, activo",
          )
          .order("id", { ascending: true }),
        supabase.from("categorias").select("id, nombre"),
        supabase.from("subcategorias").select("id, nombre"),
      ])

      if (productosResult.error) throw productosResult.error
      if (categoriasResult.error) throw categoriasResult.error
      if (subcategoriasResult.error) throw subcategoriasResult.error

      // Create maps for quick lookup
      const categoriasMap = new Map(categoriasResult.data?.map((cat: any) => [cat.id, cat.nombre]) || [])
      const subcategoriasMap = new Map(subcategoriasResult.data?.map((subcat: any) => [subcat.id, subcat.nombre]) || [])

      // Transform data to include categoria and subcategoria names
      const transformedData = productosResult.data?.map((row: any) => ({
        id: row.id,
        id_empresa: row.id_empresa,
        nombre: row.nombre,
        codigo: row.codigo,
        gramaje: row.gramaje,
        und: row.und,
        peso_unitkg: row.peso_unitkg,
        pesobruto: row.pesobruto,
        und_equivalente: row.und_equivalente,
        equivalencia_bultos: row.equivalencia_bultos,
        unidades_estiba: row.unidades_estiba,
        categoria: row.categoria, // Store ID for editing
        categorianombre: categoriasMap.get(row.categoria) || "Sin categoría", // Display name
        subcategoria: row.subcategoria, // Store ID for editing
        subcategorianombre: subcategoriasMap.get(row.subcategoria) || "Sin subcategoría", // Display name
        vidautildias: row.vidautildias,
        activo: row.activo,
      }))

      return { success: true, data: transformedData }
    }

    if (tableName === "almacenes") {
      const result = await supabase
        .from("almacenes")
        .select("id, idempresa, nombre, Descripción")
        .order("id", { ascending: true })

      if (result.error) throw result.error

      return { success: true, data: result.data }
    }

    if (tableName === "citasvehiculos") {
      const result = await supabase
        .from("citasvehiculos")
        .select(
          "id, idempresa, placa, nombreconductor, telefono, transporte, tipovehiculo, tipoproducto, tipodespacho, horallegada, fechallegada, capacidad, horapesoinicial, horaregistro",
        )
        .order("id", { ascending: true })

      if (result.error) throw result.error

      return { success: true, data: result.data }
    }

    if (tableName === "proveedores") {
      const result = await supabase
        .from("proveedores")
        .select("id, idempresa, idproveedor, nombre, correo, pais, direccion, tipo, activo")
        .order("id", { ascending: true })

      if (result.error) throw result.error

      return { success: true, data: result.data }
    }

    if (tableName === "materiales") {
      const [materialesResult, proveedoresResult] = await Promise.all([
        supabase
          .from("materiales")
          .select("id, idempresa, codigo, nombre, proveedor, tipo, undmedida, activo")
          .order("id", { ascending: true }),
        supabase.from("proveedores").select("id, nombre"),
      ])

      if (materialesResult.error) throw materialesResult.error
      if (proveedoresResult.error) throw proveedoresResult.error

      // Create a map of proveedores for quick lookup
      const proveedoresMap = new Map(
        proveedoresResult.data?.map((proveedor: any) => [proveedor.id, proveedor.nombre]) || [],
      )

      // Transform data to include proveedor name
      const transformedData = materialesResult.data?.map((row: any) => ({
        id: row.id,
        idempresa: row.idempresa,
        codigo: row.codigo,
        nombre: row.nombre,
        proveedor: row.proveedor, // Store ID for editing
        proveedorname: proveedoresMap.get(row.proveedor) || "Sin proveedor", // Display name
        tipo: row.tipo,
        undmedida: row.undmedida,
        activo: row.activo,
      }))

      return { success: true, data: transformedData }
    }
  } catch (error) {
    console.error(`Error fetching data from ${tableName}:`, error)
    return { success: false, error: "Failed to fetch data" }
  }
}
