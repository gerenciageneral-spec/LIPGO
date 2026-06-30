# Guía de Implementación del Filtro Global por Empresa

## Descripción General

Esta aplicación implementa un filtro global basado en el `empresa_id` del usuario autenticado. Cada usuario pertenece a una empresa, y solo puede ver y manipular datos de su propia empresa.

## Cómo Funciona

1. Cuando un usuario inicia sesión, su `empresa_id` se obtiene de la tabla `profiles`
2. Este `empresa_id` se usa para filtrar automáticamente todas las consultas a las tablas de la base de datos
3. El filtro se aplica en el backend (server actions) antes de retornar los datos

## Tablas Excluidas del Filtro

Las siguientes tablas son **tablas maestras o de catálogo** que se comparten entre todas las empresas y **NO deben ser filtradas** por `empresa_id`:

- `condicionespago`
- `tipodespacho`
- `transportes`
- `tiposvehiculos`
- `categorias`

Estas tablas no requieren filtrado porque contienen datos de configuración global que todas las empresas pueden usar.

## Tablas Afectadas y sus Campos de Filtro

| Tabla | Campo de Filtro |
|-------|----------------|
| almacenes | idempresa |
| asignacionpersonal | empresaid |
| bodegas | idempresa |
| cabeceraoc | idempresa |
| citasvehiculos | idempresa |
| clientes | id_empresa |
| historialaprobaciones | empresaid |
| historicolotes | idempresa |
| invglobal | idempresa |
| invtrans | idempresa |
| locations | idempresa |
| materiales | idempresa |
| mptrans | idempresa |
| mrpexplosion | idempresa |
| pedidoscabecera | id_empresa |
| productos | id_empresa |
| proveedores | idempresa |
| qrestibacabecera | idempresa |
| registrosanitario | idempresa |
| reprocesos | idempresa |
| saldoinvdetalle | idempresa |
| vendedores | id_empresa |

## Cómo Aplicar el Filtro

### Paso 1: Importar las Funciones Helper

```typescript
import { getCurrentEmpresaId, getEmpresaIdFieldName, shouldFilterByEmpresa } from "@/lib/company-filter"
```

### Paso 2: Verificar si la Tabla Requiere Filtrado

```typescript
const tableName = "productos"
const requiresFilter = shouldFilterByEmpresa(tableName) // true para productos, false para categorias
```

### Paso 3: Obtener el empresa_id del Usuario (Solo si es Necesario)

```typescript
const empresaId = requiresFilter ? await getCurrentEmpresaId() : null
```

### Paso 4: Aplicar el Filtro a la Consulta

#### Opción A: Usando el Nombre del Campo Explícito

```typescript
let query = supabase.from("productos").select("*")

if (empresaId) {
  query = query.eq("id_empresa", empresaId)
}

const { data, error } = await query
```

#### Opción B: Usando el Helper para Obtener el Nombre del Campo

```typescript
const empresaFieldName = getEmpresaIdFieldName("productos") // Retorna "id_empresa"

let query = supabase.from("productos").select("*")

if (empresaId && empresaFieldName) {
  query = query.eq(empresaFieldName, empresaId)
}

const { data, error } = await query
```

#### Opción C: Manejo Automático de Tablas Excluidas

```typescript
export async function getData(tableName: string) {
  const supabase = await createClient()
  
  // Verificar si la tabla requiere filtrado
  const requiresFilter = shouldFilterByEmpresa(tableName)
  
  let query = supabase.from(tableName).select("*")
  
  if (requiresFilter) {
    const empresaId = await getCurrentEmpresaId()
    if (empresaId) {
      const fieldName = getEmpresaIdFieldName(tableName)
      query = query.eq(fieldName, empresaId)
    }
  }
  
  const { data, error } = await query
  return { data, error }
}
```

## Ejemplos Completos

### Ejemplo 1: Consulta Simple

```typescript
export async function getProductos() {
  const supabase = await createClient()
  const empresaId = await getCurrentEmpresaId()

  try {
    let query = supabase
      .from("productos")
      .select("*")
      .order("nombre", { ascending: true })

    if (empresaId) {
      query = query.eq("id_empresa", empresaId)
    }

    const { data, error } = await query

    if (error) throw error
    return { success: true, data }
  } catch (error) {
    console.error("Error fetching productos:", error)
    return { success: false, error: "Failed to fetch productos" }
  }
}
```

### Ejemplo 2: Múltiples Consultas en Paralelo

```typescript
export async function fetchLocationsWithAlmacenes() {
  const supabase = await createClient()
  const empresaId = await getCurrentEmpresaId()

  try {
    let locationsQuery = supabase.from("locations").select("*")
    let almacenesQuery = supabase.from("almacenes").select("id, nombre")

    if (empresaId) {
      locationsQuery = locationsQuery.eq("idempresa", empresaId)
      almacenesQuery = almacenesQuery.eq("idempresa", empresaId)
    }

    const [locationsResult, almacenesResult] = await Promise.all([
      locationsQuery,
      almacenesQuery
    ])

    // Process results...
  } catch (error) {
    console.error("Error:", error)
    return { success: false, error }
  }
}
```

### Ejemplo 3: Insert con empresa_id

```typescript
export async function createProduct(productData: any) {
  const supabase = await createClient()
  const empresaId = await getCurrentEmpresaId()

  if (!empresaId) {
    return { success: false, error: "No se pudo determinar la empresa del usuario" }
  }

  try {
    const { error } = await supabase.from("productos").insert({
      ...productData,
      id_empresa: empresaId  // Agregar empresa_id automáticamente
    })

    if (error) throw error
    return { success: true }
  } catch (error) {
    console.error("Error creating product:", error)
    return { success: false, error }
  }
}
```

### Ejemplo 4: Consulta de Tabla Maestra (Sin Filtro)

```typescript
export async function getTiposVehiculos() {
  const supabase = await createClient()
  
  // Esta tabla NO requiere filtro por empresa
  try {
    const { data, error } = await supabase
      .from("tiposvehiculos")
      .select("*")
      .order("nombre", { ascending: true })

    if (error) throw error
    return { success: true, data }
  } catch (error) {
    console.error("Error fetching tiposvehiculos:", error)
    return { success: false, error: "Failed to fetch tiposvehiculos" }
  }
}
```

### Ejemplo 5: Consulta Dinámica con Verificación de Filtrado

```typescript
export async function getDynamicData(tableName: string) {
  const supabase = await createClient()
  
  try {
    let query = supabase.from(tableName).select("*")
    
    // Solo aplicar filtro si la tabla lo requiere
    if (shouldFilterByEmpresa(tableName)) {
      const empresaId = await getCurrentEmpresaId()
      if (empresaId) {
        const fieldName = getEmpresaIdFieldName(tableName)
        query = query.eq(fieldName, empresaId)
      }
    }
    
    const { data, error } = await query
    
    if (error) throw error
    return { success: true, data }
  } catch (error) {
    console.error(`Error fetching ${tableName}:`, error)
    return { success: false, error }
  }
}
```

## Reglas Importantes

1. **SIEMPRE** obtener el `empresaId` en server actions que consulten tablas con datos por empresa
2. **NUNCA** confiar en el `empresaId` enviado desde el cliente - siempre obtenerlo del perfil del usuario autenticado
3. **VERIFICAR** si la tabla está en la lista de excluidas antes de aplicar el filtro
4. Al **insertar** nuevos registros, incluir automáticamente el `empresaId` del usuario (excepto en tablas maestras)
5. Al **actualizar** registros, verificar que el registro pertenezca a la empresa del usuario
6. En **deletes**, verificar que el registro pertenezca a la empresa del usuario antes de eliminarlo

## Verificación de Implementación

Para verificar que el filtro está aplicado correctamente:

1. Crear usuarios de diferentes empresas
2. Iniciar sesión con cada usuario
3. Verificar que solo se muestren datos de su propia empresa
4. Intentar acceder a datos de otra empresa directamente (no debería ser posible)

## Mantenimiento

### Al Agregar Nuevas Tablas de Empresa

Cuando se agreguen nuevas tablas que requieran filtrado por empresa:

1. Agregar el campo correspondiente (`idempresa`, `id_empresa`, `empresaid`) a la tabla
2. Actualizar el objeto `EMPRESA_ID_FIELDS` en `lib/company-filter.ts`
3. Aplicar el filtro en todas las funciones que consulten esa tabla
4. Actualizar esta documentación

### Al Agregar Nuevas Tablas Maestras

Cuando se agreguen nuevas tablas maestras/catálogo que NO requieran filtrado:

1. Agregar el nombre de la tabla al array `EXCLUDED_TABLES` en `lib/company-filter.ts`
2. NO agregar campos de empresa a estas tablas
3. Actualizar la sección de "Tablas Excluidas del Filtro" en esta documentación
