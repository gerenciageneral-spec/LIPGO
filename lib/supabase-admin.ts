"use server"

import { createClient, type SupabaseClient } from "@supabase/supabase-js"
import { cookies } from "next/headers"

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

// Tipo de esquema PERMISIVO: este proyecto no versiona tipos generados de la BD,
// así que sin un `Database` el cliente resolvía cada tabla a `never` y rompía
// `.from()/.insert()/.select()` en todo el repo. Tipar el cliente como
// SupabaseClient<any,any,any> en el helper (una sola vez) restablece el uso sin
// afectar runtime.
type DBClient = SupabaseClient<any, any, any>

// AUDITORÍA: cada cliente admin lleva ligado el header `x-audit-user` con el UUID
// del usuario logueado. El trigger de BD `fn_auditoria` lee ese header y así sabe
// QUIÉN hizo cada cambio (con service-role, `auth.uid()` sería NULL). Se cachea un
// cliente por actor para no recrearlo en cada llamada. Clave `__system__` = sin
// header (cron/background/contextos sin cookies) → auditoría queda como 'sistema'.
const SYSTEM = "__system__"
const clientsByActor = new Map<string, DBClient>()

function buildClient(auditUser?: string): DBClient {
  return createClient(supabaseUrl, supabaseServiceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
    ...(auditUser ? { global: { headers: { "x-audit-user": auditUser } } } : {}),
  })
}

// Resuelve el UUID del usuario logueado DECODIFICANDO localmente el JWT de la
// cookie de sesión de Supabase (`sb-*-auth-token`, claim `sub`). Sin red y sin
// riesgo de misattribution entre usuarios (cada request lee su propia cookie).
// Devuelve null en cualquier fallo o fuera de contexto de request (→ 'sistema').
async function resolverActorId(): Promise<string | null> {
  try {
    const store = await cookies()
    const auth = store.getAll().filter((c) => /sb-.*-auth-token(\.\d+)?$/.test(c.name))
    if (auth.length === 0) return null
    // Reensamblar chunks en ORDEN NUMÉRICO del sufijo (.0 .1 … .10 .11): el base
    // (sin sufijo) va primero. localeCompare lexicográfico pondría .10 antes de .2 y
    // con 11+ chunks corrompería el JWT → el actor caería a 'sistema' (pérdida de traza).
    const chunkIdx = (name: string) => {
      const m = name.match(/\.(\d+)$/)
      return m ? Number(m[1]) : -1
    }
    auth.sort((a, b) => chunkIdx(a.name) - chunkIdx(b.name))
    let raw = auth.map((c) => c.value).join("")
    if (raw.startsWith("base64-")) {
      raw = Buffer.from(raw.slice("base64-".length), "base64").toString("utf8")
    } else {
      try {
        raw = decodeURIComponent(raw)
      } catch {
        /* valor ya sin url-encode */
      }
    }
    const session: any = JSON.parse(raw)
    const accessToken: unknown = Array.isArray(session) ? session[0] : session?.access_token
    if (typeof accessToken !== "string") return null
    const payloadB64 = accessToken.split(".")[1]
    if (!payloadB64) return null
    const norm = payloadB64.replace(/-/g, "+").replace(/_/g, "/")
    const payload: any = JSON.parse(Buffer.from(norm, "base64").toString("utf8"))
    return typeof payload?.sub === "string" ? payload.sub : null
  } catch {
    return null
  }
}

// Cliente admin service-role del usuario actual (para ESCRITURAS → auditoría con
// el actor correcto). Misma firma de siempre; el interior ahora inyecta el actor.
export async function getSupabaseAdmin(): Promise<DBClient> {
  const actor = await resolverActorId()
  const key = actor ?? SYSTEM
  let client = clientsByActor.get(key)
  if (!client) {
    client = buildClient(actor ?? undefined)
    clientsByActor.set(key, client)
  }
  return client
}

// Cliente admin SIN actor (auditoría = 'sistema'). Úsalo para LECTURAS puras y
// para jobs/cron, para no crear un cliente por-actor innecesario.
export async function getSupabaseAdminAsSystem(): Promise<DBClient> {
  let client = clientsByActor.get(SYSTEM)
  if (!client) {
    client = buildClient()
    clientsByActor.set(SYSTEM, client)
  }
  return client
}
