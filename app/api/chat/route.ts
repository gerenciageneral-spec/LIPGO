import {
  streamText,
  convertToModelMessages,
  tool,
  stepCountIs,
  type UIMessage,
} from "ai"
import { google } from "@ai-sdk/google"
import { supabase } from "@/lib/supabase-client"
import { z } from "zod"

/**
 * ============================================================================
 *  Asistente IA - Backend de chat (App Router / Next.js)
 *  Dominio: Logistica e Inventario
 * ============================================================================
 *
 *  Stack:
 *   - Vercel AI SDK 6 (`ai`)        -> streaming + tools + multi-step
 *   - @ai-sdk/google                -> Gemini 2.5 Flash Lite
 *   - @supabase/supabase-js         -> conexion directa a Supabase
 *   - zod                           -> validacion de inputs del tool
 *
 *  Variables de entorno asumidas:
 *   - GOOGLE_GENERATIVE_AI_API_KEY  (la usa @ai-sdk/google automaticamente)
 *
 *  El cliente de Supabase se importa desde `@/lib/supabase-client`, que ya
 *  es el singleton del proyecto con la URL + anon key configuradas, asi
 *  evitamos depender de env vars que no esten cargadas en server-side y
 *  duplicar instancias de GoTrueClient.
 *
 *  Diseno:
 *   - El asistente es de SOLO LECTURA. Solo puede tocar la BD a traves del
 *     tool `consultar_supabase`, que internamente solo hace `.select(...)`.
 *   - Multi-tenant: el `idEmpresa` viene del frontend en cada peticion y se
 *     INYECTA OBLIGATORIAMENTE como filtro en cada consulta para evitar
 *     mezcla de datos entre empresas (defense-in-depth con las RLS).
 *   - Multi-step: `stopWhen: stepCountIs(5)` permite el ciclo
 *     "pensar -> consultar -> leer -> responder" en una sola peticion HTTP.
 * ============================================================================
 */

export const maxDuration = 30

/**
 * Tablas permitidas. Es un `enum` cerrado a nivel de zod, asi que el modelo
 * no puede inventar nombres -- la validacion del SDK lo bloquea antes de
 * que `execute` corra.
 */
const TABLAS = [
  "pedidoscabecera",
  "pedidosdetalle",
  "cabeceraoc",
  "detalleoc",
  "saldoinvdetalle",
] as const
type Tabla = (typeof TABLAS)[number]

/**
 * Operadores de Supabase que el modelo puede usar para construir filtros.
 * Mantenemos un set pequeno y bien tipado para reducir ambiguedad.
 */
const OPERADORES = [
  "eq",
  "neq",
  "gt",
  "gte",
  "lt",
  "lte",
  "like",
  "ilike",
  "is",
  "in",
] as const
type Operador = (typeof OPERADORES)[number]

/**
 * Devuelve el nombre de la columna de empresa para una tabla dada, o null
 * si la tabla no tiene columna de empresa directa.
 *
 * Reglas:
 *   - pedidoscabecera, pedidosdetalle  -> "id_empresa"
 *   - cabeceraoc, saldoinvdetalle      -> "idempresa"
 *   - detalleoc                        -> null (ver nota en `execute`)
 */
function getColumnaEmpresa(tabla: Tabla): string | null {
  switch (tabla) {
    case "pedidoscabecera":
    case "pedidosdetalle":
      return "id_empresa"
    case "cabeceraoc":
    case "saldoinvdetalle":
      return "idempresa"
    case "detalleoc":
      // detalleoc no tiene columna de empresa propia. Para seguridad
      // estricta requeriria un INNER JOIN con cabeceraoc filtrando por
      // idempresa, lo cual no es expresable con el query builder simple
      // que estamos usando aqui. Asumimos que el `idorden` ya viene
      // pre-filtrado por una consulta previa a cabeceraoc.
      return null
  }
}

/**
 * Construye el system prompt en cada request para que la fecha actual quede
 * "congelada" al instante de la peticion (no al instante en que arranco
 * el server). Esto da al modelo conciencia temporal real para resolver
 * referencias relativas como "hoy", "este mes" o "el mes pasado".
 */
function buildSystemPrompt(idEmpresa: string | number): string {
  const fechaHoy = new Date().toLocaleDateString("es-CO", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  })

  // Nota: ${idEmpresa} se inyecta como contexto informativo en la regla
  // del filtro automatico, pero el filtrado real lo hace la tool en el
  // servidor. El modelo NO debe agregar id_empresa a los filtros.
  return `
Eres un asistente experto en análisis de datos logísticos y de inventario de la empresa. Tu función es traducir el lenguaje natural del usuario a consultas de base de datos precisas usando la herramienta 'consultar_supabase'.

CONTEXTO TEMPORAL:

    Hoy es: ${fechaHoy}.

    Usa esta fecha como referencia para términos como 'hoy', 'ayer', 'este mes', 'semana pasada'.

DICCIONARIO DE SINÓNIMOS Y MAPEO DE TABLAS (¡CRÍTICO!):
Antes de usar la herramienta, analiza la intención del usuario y usa estrictamente la tabla correspondiente:

    PEDIDOS (Tabla: pedidoscabecera):

    Sinónimos del usuario: 'pedidos', 'ventas', 'compras de clientes', 'órdenes de clientes', 'facturas a clientes', 'qué nos compraron'.

    Uso: Para buscar totales, estados de aprobación de clientes, vendedores o fechas de entrega a clientes.

    ÓRDENES DE CARGUE / LOGÍSTICA (Tabla: cabeceraoc):

    Sinónimos del usuario: 'órdenes de cargue', 'OC', 'despachos', 'transportes', 'viajes', 'vehículos', 'conductores', 'placas', 'fletes', 'pesajes'.

    Uso: Para buscar información del transporte, horas de entrada/salida de vehículos o estatus logístico. Si preguntan por 'órdenes' y mencionan placas o camiones, es esta tabla.

    DETALLE DE ÓRDENES DE CARGUE (Tabla: detalleoc):

    Sinónimos del usuario: 'productos cargados', 'qué lleva la orden X', 'toneladas por orden', 'qué va en el camión', 'detalle del viaje'.

    Uso: Para buscar las cantidades exactas y los nombres de los productos que van dentro de una orden de cargue específica.

    INVENTARIOS (Tabla: saldoinvdetalle):

    Sinónimos del usuario: 'inventario', 'stock', 'existencias', 'saldos', 'disponibilidad', 'cuántos hay en bodega', 'qué tenemos de'.

    Uso: Para consultar si hay mercancía disponible, revisar stock actual, lotes o ubicaciones (location) de los productos.

REGLAS DE COMPORTAMIENTO:

    El usuario a veces es ambiguo. Si pregunta '¿qué pasó con la orden 123?', analiza el historial. Si no hay contexto, busca primero en 'cabeceraoc', y si no está, busca en 'pedidoscabecera'.

    No asumas nombres de columnas que no conozcas. Usa tu mejor criterio lógico para mapear la pregunta del usuario a las tablas descritas.

    El ID de la empresa (${idEmpresa}) ya se filtra automáticamente, no te preocupes por él.

    Da respuestas naturales, resumidas y útiles basadas en los datos retornados por la herramienta.
`.trim()
}

export async function POST(req: Request) {
  try {
    // -----------------------------------------------------------------------
    // 1) Parseo y validacion de entrada
    // -----------------------------------------------------------------------
    const body = await req.json().catch(() => ({}))
    const { messages, idEmpresa } = body as {
      messages?: UIMessage[]
      idEmpresa?: string | number | null
    }

    // `idEmpresa` es OBLIGATORIO. Sin el no podemos garantizar el filtrado
    // multi-tenant, asi que cortamos en frio con 400.
    if (
      idEmpresa === undefined ||
      idEmpresa === null ||
      idEmpresa === "" ||
      (typeof idEmpresa === "number" && Number.isNaN(idEmpresa))
    ) {
      return new Response(
        JSON.stringify({
          error:
            "Falta el parametro 'idEmpresa' en el body. Es obligatorio para filtrar los datos por empresa.",
        }),
        {
          status: 400,
          headers: { "Content-Type": "application/json" },
        },
      )
    }

    if (!Array.isArray(messages) || messages.length === 0) {
      return new Response(
        JSON.stringify({
          error: "Falta el array 'messages' en el body o esta vacio.",
        }),
        {
          status: 400,
          headers: { "Content-Type": "application/json" },
        },
      )
    }

    // -----------------------------------------------------------------------
    // 2) Stream con la tool `consultar_supabase`
    // -----------------------------------------------------------------------
    const result = streamText({
      model: google("gemini-2.5-flash-lite"),
      // System prompt dinamico: incluye fecha actual + idEmpresa.
      system: buildSystemPrompt(idEmpresa as string | number),
      // Pasamos el historial COMPLETO (convertido al formato ModelMessage
      // que espera el SDK). Esto le da al modelo memoria de conversacion:
      // puede resolver referencias relativas tipo "y del mes pasado?" o
      // "muestrame los pendientes de ese cliente" sin que el usuario
      // tenga que repetir el contexto.
      messages: await convertToModelMessages(messages),
      // Multi-paso (agente). En AI SDK 6 el equivalente al `maxSteps: 5`
      // de versiones anteriores es `stopWhen: stepCountIs(5)`. Permite
      // el ciclo "pensar -> llamar tool -> leer resultado -> responder"
      // hasta 5 pasos en una sola peticion HTTP.
      stopWhen: stepCountIs(5),
      tools: {
        consultar_supabase: tool({
          description:
            "Consulta de SOLO LECTURA contra la base de datos de logistica e " +
            "inventario. Recibe la tabla, las columnas a traer y una lista " +
            "opcional de filtros (combinados con AND). El sistema inyecta " +
            "automaticamente el filtro por empresa cuando aplica.",
          inputSchema: z.object({
            tabla: z
              .enum(TABLAS)
              .describe(
                "Nombre exacto de la tabla. Debe ser una de: pedidoscabecera, pedidosdetalle, cabeceraoc, detalleoc, saldoinvdetalle.",
              ),
            columnas: z
              .string()
              .default("*")
              .describe(
                "Columnas a seleccionar separadas por coma (ej: 'id, fecha, total'). Usa '*' si no estas seguro.",
              ),
            filtros: z
              .array(
                z.object({
                  columna: z
                    .string()
                    .min(1)
                    .describe("Nombre de la columna sobre la que se filtra."),
                  operador: z
                    .enum(OPERADORES)
                    .describe(
                      "Operador de comparacion. 'eq' para igualdad, 'ilike' para busqueda de texto case-insensitive con % como comodin, 'in' para listas, 'is' para null/true/false.",
                    ),
                  valor: z
                    .union([
                      z.string(),
                      z.number(),
                      z.boolean(),
                      z.null(),
                      z.array(z.union([z.string(), z.number(), z.boolean()])),
                    ])
                    .describe(
                      "Valor a comparar. Para 'in' debe ser un array. Para 'is' usa true/false/null.",
                    ),
                }),
              )
              .default([])
              .describe("Lista de filtros aplicados con AND. Usa [] si no hay."),
          }),
          execute: async ({ tabla, columnas, filtros }) => {
            try {
              // ---------------------------------------------------------------
              // a) Construye la query base con la tabla y columnas pedidas.
              //    Limitamos a 50 filas para evitar respuestas gigantes.
              //
              //    Caso especial `detalleoc`: la tabla NO tiene columna de
              //    empresa, asi que usamos un INNER JOIN embebido contra
              //    `cabeceraoc` (relacion FK) y filtramos por
              //    `cabeceraoc.idempresa`. El `!inner` es lo que convierte
              //    el embedding en un INNER JOIN real (descarta filas sin
              //    cabecera coincidente). Conservamos las columnas pedidas
              //    por el modelo y solo le agregamos la relacion para que
              //    PostgREST aplique el filtro multi-tenant.
              // ---------------------------------------------------------------
              const cols = (columnas || "*").trim() || "*"
              let query
              if (tabla === "detalleoc") {
                query = supabase
                  .from("detalleoc")
                  .select(`${cols}, cabeceraoc!inner(idempresa)`)
                  .eq("cabeceraoc.idempresa", idEmpresa as any)
                  .limit(50)
              } else {
                query = supabase.from(tabla).select(cols).limit(50)
              }

              // ---------------------------------------------------------------
              // b) Aplica los filtros del modelo uno por uno con los metodos
              //    nativos de Supabase (mas seguro que SQL raw).
              // ---------------------------------------------------------------
              for (const f of filtros ?? []) {
                const op = f.operador as Operador
                const col = f.columna
                const val = f.valor as any

                switch (op) {
                  case "eq":
                    query = query.eq(col, val)
                    break
                  case "neq":
                    query = query.neq(col, val)
                    break
                  case "gt":
                    query = query.gt(col, val)
                    break
                  case "gte":
                    query = query.gte(col, val)
                    break
                  case "lt":
                    query = query.lt(col, val)
                    break
                  case "lte":
                    query = query.lte(col, val)
                    break
                  case "like":
                    query = query.like(col, String(val))
                    break
                  case "ilike":
                    query = query.ilike(col, String(val))
                    break
                  case "is":
                    // espera true | false | null
                    query = query.is(col, val as any)
                    break
                  case "in":
                    query = query.in(col, Array.isArray(val) ? val : [val])
                    break
                }
              }

              // ---------------------------------------------------------------
              // c) FILTRO DE SEGURIDAD OBLIGATORIO: inyectamos siempre el
              //    `idEmpresa` recibido del frontend en la columna que
              //    corresponda a cada tabla. Esto garantiza que la IA no
              //    pueda leer datos de otra empresa aunque construya mal
              //    los filtros.
              //
              //    Para `detalleoc` el filtro ya quedo aplicado en el paso
              //    (a) via el INNER JOIN contra cabeceraoc, asi que aqui
              //    solo cubrimos las otras 4 tablas que tienen columna de
              //    empresa directa.
              // ---------------------------------------------------------------
              const colEmpresa = getColumnaEmpresa(tabla as Tabla)
              let filtroEmpresaResumen:
                | { columna: string; valor: any; via?: string }
                | null = null

              if (colEmpresa) {
                query = query.eq(colEmpresa, idEmpresa as any)
                filtroEmpresaResumen = { columna: colEmpresa, valor: idEmpresa }
              } else if (tabla === "detalleoc") {
                filtroEmpresaResumen = {
                  columna: "cabeceraoc.idempresa",
                  valor: idEmpresa,
                  via: "INNER JOIN con cabeceraoc",
                }
              }

              // ---------------------------------------------------------------
              // d) Ejecuta y retorna al modelo.
              // ---------------------------------------------------------------
              const { data, error } = await query
              if (error) {
                return {
                  ok: false,
                  error: error.message,
                  hint: "La consulta fallo. Posibles causas: columna inexistente, tipo incompatible, o RLS bloqueando el acceso.",
                  tabla,
                  filtros_aplicados: filtros,
                  filtro_empresa: filtroEmpresaResumen,
                }
              }

              return {
                ok: true,
                tabla,
                columnas: cols,
                filtros_aplicados: filtros,
                filtro_empresa: filtroEmpresaResumen,
                total_filas: data?.length ?? 0,
                limite: 50,
                filas: data ?? [],
              }
            } catch (err: any) {
              return {
                ok: false,
                error:
                  err?.message ||
                  "Error desconocido al consultar la base de datos.",
              }
            }
          },
        }),
      },
    })

    // Stream SSE compatible con `useChat` + `DefaultChatTransport`
    return result.toUIMessageStreamResponse()
  } catch (error: any) {
    console.log("[v0] /api/chat error:", error?.message)
    return new Response(
      JSON.stringify({ error: error?.message || "Error en el chat" }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    )
  }
}
