"use client"

// Banner "¿Quieres instalar LIPgo?" para escritorio y movil.
// - Escritorio/Android (Chromium): captura `beforeinstallprompt` y al pulsar
//   "Sí, instalar" dispara el instalador nativo (crea el acceso directo con el
//   icono de LIPgo definido en el manifest).
// - iOS/Safari: no expone ese evento, asi que mostramos las instrucciones de
//   "Compartir → Añadir a pantalla de inicio".
// Registra ademas el service worker (requisito de instalabilidad) y recuerda
// el descarte del usuario por un tiempo para no ser insistente.

import { useEffect, useState } from "react"
import Image from "next/image"
import { Download, Share, X } from "lucide-react"
import { Button } from "@/components/ui/button"

const DISMISS_KEY = "lipgo-pwa-dismissed-at"
const DISMISS_DAYS = 14

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>
}

function estaInstalada() {
  if (typeof window === "undefined") return false
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    (window.navigator as any).standalone === true
  )
}

function esIOS() {
  if (typeof navigator === "undefined") return false
  const ua = navigator.userAgent
  const iPhone = /iPad|iPhone|iPod/.test(ua)
  // iPadOS 13+ se identifica como Mac con pantalla tactil.
  const iPad = navigator.platform === "MacIntel" && (navigator as any).maxTouchPoints > 1
  const safari = /Safari/.test(ua) && !/CriOS|FxiOS|EdgiOS|OPiOS/.test(ua)
  return (iPhone || iPad) && safari
}

function descartadoReciente() {
  try {
    const v = localStorage.getItem(DISMISS_KEY)
    if (!v) return false
    return Date.now() - Number(v) < DISMISS_DAYS * 86_400_000
  } catch {
    return false
  }
}

function recordarDescarte() {
  try {
    localStorage.setItem(DISMISS_KEY, String(Date.now()))
  } catch {
    /* ignore */
  }
}

export function PwaInstallPrompt() {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null)
  const [visible, setVisible] = useState(false)
  const [modoIOS, setModoIOS] = useState(false)

  useEffect(() => {
    // Registrar el service worker (habilita la instalacion de la PWA).
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => {})
    }

    if (estaInstalada() || descartadoReciente()) return

    // Algunos navegadores disparan beforeinstallprompt antes de montar React;
    // un pequeño capturador global (ver layout) lo deja en window.__lipgoBIP.
    const preCaptured = (window as any).__lipgoBIP as BeforeInstallPromptEvent | null
    if (preCaptured) {
      setDeferred(preCaptured)
      setVisible(true)
    }

    const onBIP = (e: Event) => {
      e.preventDefault()
      setDeferred(e as BeforeInstallPromptEvent)
      setVisible(true)
    }
    // Evento nativo + el reenviado por el capturador global.
    window.addEventListener("beforeinstallprompt", onBIP)
    window.addEventListener("lipgo-bip", onBIP as EventListener)

    // iOS/Safari: no hay evento; mostramos instrucciones tras un momento.
    let iosTimer: ReturnType<typeof setTimeout> | undefined
    if (esIOS()) {
      iosTimer = setTimeout(() => {
        setModoIOS(true)
        setVisible(true)
      }, 2500)
    }

    const onInstalled = () => {
      setVisible(false)
      recordarDescarte()
    }
    window.addEventListener("appinstalled", onInstalled)

    return () => {
      window.removeEventListener("beforeinstallprompt", onBIP)
      window.removeEventListener("lipgo-bip", onBIP as EventListener)
      window.removeEventListener("appinstalled", onInstalled)
      if (iosTimer) clearTimeout(iosTimer)
    }
  }, [])

  const cerrar = () => {
    setVisible(false)
    recordarDescarte()
  }

  const instalar = async () => {
    if (!deferred) return
    await deferred.prompt()
    const { outcome } = await deferred.userChoice
    setDeferred(null)
    setVisible(false)
    if (outcome !== "accepted") recordarDescarte()
  }

  if (!visible) return null

  return (
    <div className="fixed inset-x-0 bottom-0 z-[100] flex justify-center p-3 sm:p-4">
      <div className="w-full max-w-md rounded-2xl border border-border bg-card p-4 shadow-lg">
        <div className="flex items-start gap-3">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-muted">
            <Image src="/lipgo-icon.png" alt="LIPgo" width={48} height={48} className="h-12 w-12 object-contain" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-card-foreground">¿Quieres instalar LIPgo?</p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {modoIOS
                ? "Añade el acceso directo a tu pantalla de inicio para abrir LIPgo con un toque, como una app."
                : "Instala el acceso directo en tu dispositivo para abrir LIPgo con un toque, como una app."}
            </p>
            {modoIOS ? (
              <div className="mt-2 flex items-center gap-1.5 rounded-lg bg-muted px-2.5 py-1.5 text-xs text-card-foreground">
                <span>Toca</span>
                <Share className="h-4 w-4 text-primary" />
                <span>y luego <strong>“Añadir a pantalla de inicio”</strong></span>
              </div>
            ) : (
              <div className="mt-3 flex items-center gap-2">
                <Button size="sm" onClick={instalar} className="gap-1.5">
                  <Download className="h-4 w-4" /> Sí, instalar
                </Button>
                <Button size="sm" variant="ghost" onClick={cerrar}>
                  Ahora no
                </Button>
              </div>
            )}
          </div>
          <button
            type="button"
            onClick={cerrar}
            aria-label="Cerrar"
            className="shrink-0 rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  )
}
