"use client"

// ENCUESTA DEL CONDUCTOR — página PÚBLICA.
//
// El conductor la abre desde el WhatsApp de fin de cargue. No hay sesión ni
// permiso: vive fuera de /portal a propósito.
//
// Está pensada para un celular, con una mano, parado en la puerta de la bodega:
// una sola pregunta obligatoria, botones grandes, y todo lo demás opcional. Si
// pide mucho, nadie la responde y el indicador queda vacío.

import { useCallback, useEffect, useState } from "react"
import { useParams } from "next/navigation"
import {
  getEncuestaPorToken,
  guardarEncuestaConductor,
  type DatosEncuesta,
} from "@/lib/encuesta-conductor-actions"

const CARAS = [
  { valor: 1, cara: "😞", texto: "Muy malo" },
  { valor: 2, cara: "🙁", texto: "Malo" },
  { valor: 3, cara: "😐", texto: "Regular" },
  { valor: 4, cara: "🙂", texto: "Bueno" },
  { valor: 5, cara: "😄", texto: "Excelente" },
]

export default function EncuestaConductor() {
  const params = useParams()
  const token = String(params?.token ?? "")

  const [datos, setDatos] = useState<DatosEncuesta | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [cargando, setCargando] = useState(true)
  const [enviando, setEnviando] = useState(false)
  const [listo, setListo] = useState(false)

  const [calificacion, setCalificacion] = useState<number | null>(null)
  const [oportunidad, setOportunidad] = useState<number | null>(null)
  const [comunicacion, setComunicacion] = useState<number | null>(null)
  const [recomendaria, setRecomendaria] = useState<boolean | null>(null)
  const [comentario, setComentario] = useState("")

  const cargar = useCallback(async () => {
    const r = await getEncuestaPorToken(token)
    if (r.success && r.data) {
      setDatos(r.data)
      if (r.data.yaRespondida) setListo(true)
    } else {
      setError(r.message ?? "El enlace no es válido.")
    }
    setCargando(false)
  }, [token])

  useEffect(() => {
    cargar()
  }, [cargar])

  async function enviar() {
    if (!calificacion) return
    setEnviando(true)
    const r = await guardarEncuestaConductor({
      token,
      calificacion,
      oportunidad,
      comunicacion,
      recomendaria,
      comentario: comentario || null,
    })
    setEnviando(false)
    if (!r.success) {
      // Si ya estaba respondida, se muestra el agradecimiento igual: para el
      // conductor el resultado es el mismo y no tiene nada que corregir.
      if (String(r.message).includes("ya fue respondida")) setListo(true)
      else setError(r.message ?? "No se pudo guardar.")
      return
    }
    setListo(true)
  }

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-8">
      <div className="mx-auto w-full max-w-md">
        <div className="mb-4 text-center">
          <p className="text-[11px] uppercase tracking-[0.18em] text-slate-500">
            LIP Progressive Integral Logistics
          </p>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          {cargando ? (
            <p className="py-12 text-center text-slate-500">Cargando…</p>
          ) : error ? (
            <div className="py-8 text-center">
              <p className="text-4xl">🚚</p>
              <p className="mt-3 text-slate-700">{error}</p>
            </div>
          ) : listo ? (
            <div className="py-8 text-center">
              <p className="text-5xl">🙏</p>
              <h1 className="mt-3 text-xl font-semibold text-slate-900">¡Gracias!</h1>
              <p className="mt-2 text-sm text-slate-600">
                Su respuesta nos ayuda a mejorar el servicio. Buen viaje.
              </p>
            </div>
          ) : (
            <>
              <h1 className="text-xl font-semibold text-slate-900">
                {datos?.conductor ? `Hola ${datos.conductor}` : "Hola"}
              </h1>
              <p className="mt-1 text-sm text-slate-600">
                {datos?.placa
                  ? `Su vehículo de placa ${datos.placa} terminó el cargue.`
                  : "Su cargue ha terminado."}{" "}
                ¿Cómo le fue con nosotros?
              </p>

              {/* La única obligatoria. Caras grandes: se responde de un toque. */}
              <div className="mt-6">
                <div className="flex justify-between gap-1">
                  {CARAS.map((c) => (
                    <button
                      key={c.valor}
                      type="button"
                      onClick={() => setCalificacion(c.valor)}
                      className={`flex flex-1 flex-col items-center gap-1 rounded-xl border-2 py-3 transition-colors ${
                        calificacion === c.valor
                          ? "border-teal-500 bg-teal-50"
                          : "border-transparent bg-slate-50 hover:bg-slate-100"
                      }`}
                    >
                      <span className="text-3xl">{c.cara}</span>
                      <span className="text-[10px] leading-tight text-slate-600">{c.texto}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Lo demás aparece solo después de calificar: la pantalla inicial
                  se ve corta y eso es lo que hace que la respondan. */}
              {calificacion && (
                <div className="mt-6 space-y-5 border-t border-slate-200 pt-5">
                  <p className="text-xs text-slate-500">
                    Si quiere contarnos más (opcional):
                  </p>

                  <div>
                    <p className="text-sm font-medium text-slate-800">El tiempo de atención</p>
                    <div className="mt-2 flex gap-1.5">
                      {[1, 2, 3, 4, 5].map((n) => (
                        <button
                          key={n}
                          type="button"
                          onClick={() => setOportunidad(n)}
                          className={`h-10 flex-1 rounded-lg border text-sm font-medium ${
                            oportunidad === n
                              ? "border-teal-500 bg-teal-50 text-teal-800"
                              : "border-slate-200 text-slate-600"
                          }`}
                        >
                          {n}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <p className="text-sm font-medium text-slate-800">Cómo le informamos</p>
                    <div className="mt-2 flex gap-1.5">
                      {[1, 2, 3, 4, 5].map((n) => (
                        <button
                          key={n}
                          type="button"
                          onClick={() => setComunicacion(n)}
                          className={`h-10 flex-1 rounded-lg border text-sm font-medium ${
                            comunicacion === n
                              ? "border-teal-500 bg-teal-50 text-teal-800"
                              : "border-slate-200 text-slate-600"
                          }`}
                        >
                          {n}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <p className="text-sm font-medium text-slate-800">
                      ¿Recomendaría venir a cargar aquí?
                    </p>
                    <div className="mt-2 flex gap-2">
                      <button
                        type="button"
                        onClick={() => setRecomendaria(true)}
                        className={`h-11 flex-1 rounded-lg border text-sm font-medium ${
                          recomendaria === true
                            ? "border-teal-500 bg-teal-50 text-teal-800"
                            : "border-slate-200 text-slate-600"
                        }`}
                      >
                        Sí
                      </button>
                      <button
                        type="button"
                        onClick={() => setRecomendaria(false)}
                        className={`h-11 flex-1 rounded-lg border text-sm font-medium ${
                          recomendaria === false
                            ? "border-red-400 bg-red-50 text-red-800"
                            : "border-slate-200 text-slate-600"
                        }`}
                      >
                        No
                      </button>
                    </div>
                  </div>

                  <div>
                    <p className="text-sm font-medium text-slate-800">Un comentario</p>
                    <textarea
                      value={comentario}
                      onChange={(e) => setComentario(e.target.value)}
                      rows={3}
                      maxLength={500}
                      placeholder="Lo que quiera contarnos…"
                      className="mt-2 w-full rounded-lg border border-slate-200 p-3 text-sm outline-none focus:border-teal-500"
                    />
                  </div>
                </div>
              )}

              <button
                type="button"
                disabled={!calificacion || enviando}
                onClick={enviar}
                className="mt-6 h-12 w-full rounded-xl bg-teal-600 text-base font-semibold text-white disabled:bg-slate-200 disabled:text-slate-400"
              >
                {enviando ? "Enviando…" : "Enviar respuesta"}
              </button>

              {!calificacion && (
                <p className="mt-2 text-center text-xs text-slate-500">
                  Toque una carita para calificar.
                </p>
              )}
            </>
          )}
        </div>

        <p className="mt-4 text-center text-[11px] text-slate-400">
          Sus respuestas se usan para mejorar el servicio.{" "}
          <a href="/privacidad" className="underline">
            Política de privacidad
          </a>
        </p>
      </div>
    </main>
  )
}
