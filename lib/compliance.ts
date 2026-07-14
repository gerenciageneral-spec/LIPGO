// Cliente server-only de la API de Compliance (app.compliance.com.co) para la
// función "Consultar Antecedentes". Se importa desde route handlers (no lleva
// "use server"). Las credenciales viven en process.env y NUNCA se exponen al
// cliente. El token (Basic auth) se cachea en memoria del proceso ~55 min.
//
// Flujo: getComplianceToken() -> consultarConsolidada() -> getScoreRiesgo()
//        -> fetchReportePdf() (para descargar el PDF).

const BASE_URL = (process.env.COMPLIANCE_BASE_URL || "https://app.compliance.com.co/validador").replace(/\/$/, "")

export type TipoReportePdf = "completo" | "resumido" | "analista"

export interface ResultadoFuente {
  lista: string
  tipo?: string
  duracion?: number
  presentaRiesgo?: boolean
  tieneResultados?: boolean
  presentaAdvertencia?: boolean
  descripcion?: string[]
  deshabilitada?: boolean
  mensajeFuenteDeshatilitada?: string
  error?: string
}

export interface ConsultaConsolidada {
  idDatoConsultado: number
  tipoDocumento: string
  datoConsultado: string
  nombre: string
  presentaRiesgo: boolean
  pep?: boolean
  isMenorEdad?: boolean
  totalFuentesConsultadas?: number
  totalFuentesConError?: number
  idConsulta?: number
  tieneResultados?: boolean
  resultados: ResultadoFuente[]
}

export interface ScoreRiesgo {
  scoreRiesgo: number
  "%RO"?: number
  "%LAFT"?: number
  "%RR"?: number
  mostrarScore: boolean
  error?: string
}

export interface ConsultaPayload {
  tipoDocumento?: string // default "cc"
  datoConsultar: string
  codigoPais?: string // default "COL"
  nombre?: string
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

// --- Token (Basic auth), cacheado en memoria del proceso. Vigencia 1 h. ---
let _token: { value: string; expiresAt: number } | null = null

function credenciales(): { user: string; pass: string } {
  const user = process.env.COMPLIANCE_USER
  const pass = process.env.COMPLIANCE_PASS
  if (!user || !pass) {
    throw new Error("Faltan credenciales de Compliance (configura COMPLIANCE_USER y COMPLIANCE_PASS)")
  }
  return { user, pass }
}

export async function getComplianceToken(force = false): Promise<string> {
  if (!force && _token && Date.now() < _token.expiresAt) return _token.value
  const { user, pass } = credenciales()
  const basic = Buffer.from(`${user}:${pass}`).toString("base64")
  const res = await fetch(`${BASE_URL}/apiPublica/TokenService/token`, {
    method: "GET",
    headers: { Authorization: `Basic ${basic}` },
  })
  if (!res.ok) {
    // El servicio devuelve { error } con el motivo (p. ej. 401 credenciales
    // inválidas, o 403 "El usuario no tiene rol api"). Lo propagamos tal cual.
    const err = await res.json().catch(() => ({}))
    const motivo = (err as any)?.error || `HTTP ${res.status}`
    throw new Error(`No se pudo generar el token de Compliance: ${motivo}`)
  }
  const data = await res.json().catch(() => ({}))
  const token = (data as any)?.token
  if (!token) throw new Error("La respuesta del token de Compliance no contiene 'token'")
  // Vigencia real 3600 s; renovamos a los ~55 min para tener margen.
  _token = { value: token, expiresAt: Date.now() + 55 * 60 * 1000 }
  return token
}

// Ejecuta una petición con el token vigente; refresca el token una vez ante 401
// y reintenta con backoff ante 429 (rate limit de 4 req/s del servicio).
async function conToken(hacer: (token: string) => Promise<Response>): Promise<Response> {
  let token = await getComplianceToken()
  let res = await hacer(token)
  if (res.status === 401) {
    token = await getComplianceToken(true)
    res = await hacer(token)
  }
  let intentos = 0
  while (res.status === 429 && intentos < 3) {
    intentos++
    await sleep(350 * intentos)
    res = await hacer(token)
  }
  return res
}

export async function consultarConsolidada(payload: ConsultaPayload): Promise<ConsultaConsolidada> {
  const body = {
    tipoDocumento: payload.tipoDocumento || "cc",
    datoConsultar: payload.datoConsultar,
    codigoPais: payload.codigoPais || "COL",
    ...(payload.nombre ? { nombre: payload.nombre } : {}),
  }
  const res = await conToken((token) =>
    fetch(`${BASE_URL}/ws/ConsultaConsolidadaService/consultaConsolidada/soloRiesgo/false`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
  )
  if (res.status === 429) throw new Error("Compliance: límite de peticiones excedido (429), intenta de nuevo")
  if (res.status === 504) throw new Error("Compliance: la consulta superó el tiempo máximo (504)")
  if (!res.ok) throw new Error(`Compliance: error en la consulta (HTTP ${res.status})`)
  return (await res.json()) as ConsultaConsolidada
}

// El score es informativo: ante error devuelve null (no rompe la consulta).
export async function getScoreRiesgo(idDatoConsultado: number | string): Promise<ScoreRiesgo | null> {
  try {
    const res = await conToken((token) =>
      fetch(`${BASE_URL}/ws/ScoreRiesgoService/${idDatoConsultado}`, {
        method: "GET",
        headers: { Authorization: `Bearer ${token}` },
      }),
    )
    if (!res.ok) return null
    return (await res.json()) as ScoreRiesgo
  } catch {
    return null
  }
}

function urlReportePdf(idDatoConsultado: number | string, tipo: TipoReportePdf): string {
  if (tipo === "resumido") return `${BASE_URL}/api/ReportePdfService/resumido/${idDatoConsultado}`
  if (tipo === "analista") return `${BASE_URL}/api/ReportePdfService/resumido/analistaBasico/${idDatoConsultado}`
  return `${BASE_URL}/api/ReportePdfService/${idDatoConsultado}`
}

// Devuelve el Response crudo para poder streamear el PDF al cliente.
export async function fetchReportePdf(
  idDatoConsultado: number | string,
  tipo: TipoReportePdf = "completo",
): Promise<Response> {
  return conToken((token) =>
    fetch(urlReportePdf(idDatoConsultado, tipo), {
      method: "GET",
      headers: { Authorization: `Bearer ${token}` },
    }),
  )
}
