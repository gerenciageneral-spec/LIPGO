"use client"

import Link from "next/link"
import Image from "next/image"
import { usePathname, useRouter } from "next/navigation"
import { useEffect, type ReactNode } from "react"
import { Home, FileText, Wallet, CalendarClock, BarChart3, AlertCircle, GraduationCap, LogOut, Target, type LucideIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { usePortal } from "@/components/portal/portal-provider"
import { verificarAccesoPortal } from "@/lib/portal-actions"
import { cn } from "@/lib/utils"

interface MenuItem {
  label: string
  href: string
  icon: LucideIcon
}

/**
 * Menu principal del Portal del Trabajador. Sin Nomina por solicitud del cliente.
 * Las rutas estan al mismo nivel bajo /portal/* (sin el prefijo /dashboard/).
 */
const MENU: MenuItem[] = [
  { label: "Inicio", href: "/portal/dashboard", icon: Home },
  { label: "Certificados", href: "/portal/certificados", icon: FileText },
  { label: "Inducciones", href: "/portal/inducciones", icon: GraduationCap },
  { label: "Anticipos", href: "/portal/anticipos", icon: Wallet },
  { label: "Permisos", href: "/portal/permisos", icon: CalendarClock },
  // "Novedades" muestra las filas de `registroasistencia` donde el
  // campo `asistencia` no es null para el colaborador autenticado
  // (ej: incapacidades, permisos, ausencias). Filtra por
  // `identificacion`.
  // "Mi aporte" = vista individual del trabajador: cómo contribuye a las metas
  // de LIP y cuándo incumple (en vivo desde LIPgo, ligado a su desempeño).
  { label: "Mi aporte", href: "/portal/mi-aporte", icon: Target },
  { label: "Novedades", href: "/portal/novedades", icon: AlertCircle },
  // "Balance" abrevia "Balance de toneladas y horas extra" para que
  // quepa comodo en el menu inferior movil. La pagina filtra por el
  // nombre del colaborador autenticado contra `pagonomina`.
  { label: "Balance", href: "/portal/balance", icon: BarChart3 },
]

export function PortalShell({ children }: { children: ReactNode }) {
  const router = useRouter()
  const pathname = usePathname()
  const { colaborador, isHydrated, logout } = usePortal()

  // Guardia de ruta: si ya hidrato y no hay sesion, redirige al login.
  useEffect(() => {
    if (isHydrated && !colaborador) {
      router.replace("/portal/login")
    }
  }, [isHydrated, colaborador, router])

  // Guardia de ESTADO: solo personal activo en headcount puede estar aqui.
  //
  // El login ya lo valida, pero la sesion vive en `localStorage` y no caduca:
  // sin esta revalidacion, quien inicio sesion antes de ser retirado seguiria
  // entrando para siempre y desactivarlo en headcount no tendria efecto real.
  //
  // Se revisa al montar y cada vez que la pestana vuelve a primer plano —en
  // movil una sesion puede quedar abierta dias sin recargar—. `verificarAccesoPortal`
  // falla-abierto: un error de red no saca a nadie.
  const identificacion = colaborador?.identificacion
  useEffect(() => {
    if (!identificacion) return
    let vigente = true

    const revisar = async () => {
      const { permitido } = await verificarAccesoPortal(identificacion)
      if (!vigente || permitido) return
      logout()
      router.replace("/portal/login?inactivo=1")
    }

    revisar()
    const alVolver = () => {
      if (document.visibilityState === "visible") revisar()
    }
    document.addEventListener("visibilitychange", alVolver)
    return () => {
      vigente = false
      document.removeEventListener("visibilitychange", alVolver)
    }
  }, [identificacion, logout, router])

  if (!isHydrated || !colaborador) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50">
        <div className="text-sm text-muted-foreground">Cargando tu portal...</div>
      </div>
    )
  }

  const handleLogout = () => {
    logout()
    router.replace("/portal/login")
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="flex min-h-screen">
        {/* Sidebar lateral - solo desktop */}
        <aside className="hidden lg:flex w-64 flex-col border-r bg-white">
          <div className="flex h-16 items-center gap-2 px-6 border-b">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10 text-primary font-bold">
              P
            </div>
            <div className="flex flex-col leading-tight">
              <span className="text-sm font-semibold">Portal</span>
              <span className="text-xs text-muted-foreground">Trabajadores</span>
            </div>
          </div>
          <nav className="flex-1 px-3 py-4 flex flex-col gap-1">
            {MENU.map((item) => (
              <SidebarLink key={item.href} item={item} pathname={pathname} />
            ))}
          </nav>
          <div className="p-3 border-t">
            <Button
              variant="ghost"
              className="w-full justify-start gap-2 text-muted-foreground hover:text-foreground"
              onClick={handleLogout}
            >
              <LogOut className="h-4 w-4" />
              Cerrar sesion
            </Button>
          </div>
        </aside>

        {/* Contenido principal */}
        <main className="flex-1 flex flex-col pb-20 lg:pb-0">
          {/* Header con bienvenida */}
          <header className="bg-gradient-to-br from-primary to-primary/80 text-primary-foreground">
            <div className="mx-auto w-full max-w-5xl px-4 py-6 sm:px-6 lg:py-8">
              {/* Barra superior solo en mobile/tablet con el logo de
                  la app. En desktop el sidebar ya muestra el branding
                  ("LiPGO" + nav lateral), asi que duplicarlo en el
                  header se siente redundante; usamos `lg:hidden` para
                  que aparezca solo cuando el sidebar esta oculto. El
                  fondo del header es gradient con el `primary`, asi
                  que el logo PNG (que tiene fondo claro) se contiene
                  en una pildora `bg-white` con padding minimo para
                  que la marca no se mezcle con el degradado. */}
              <div className="flex items-center justify-between gap-3 mb-4 lg:hidden">
                <div className="inline-flex items-center rounded-md bg-white/95 px-2.5 py-1 shadow-sm">
                  <Image
                    src="/lipgo-logo.png"
                    alt="LiPGO"
                    width={120}
                    height={32}
                    priority
                    className="h-6 w-auto"
                  />
                </div>
                {/* Nombre de la empresa al lado del logo en mobile.
                    Se muestra solo si esta resuelto (puede ser null
                    si el colaborador no tiene `idempresa` o si la
                    empresa no existe). `truncate` + `min-w-0` para
                    que apellidos/razones sociales largas no rompan
                    el layout y se corten con elipsis. Usamos
                    `text-right` para anclar el texto contra el borde
                    y dejar el logo al inicio, replicando el patron
                    de barra superior tipo SaaS. */}
                {colaborador.empresa_nombre && (
                  <p className="min-w-0 truncate text-right text-xs font-medium opacity-90">
                    {colaborador.empresa_nombre}
                  </p>
                )}
              </div>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-xs uppercase tracking-wide opacity-80">Bienvenido</p>
                  {/* Antes mostrabamos solo el primer nombre ("Hola,
                      Juan") para que el header fuera mas conversacional,
                      pero el cliente pidio el nombre completo + la
                      empresa para que el trabajador pueda confirmar de
                      un vistazo a que organizacion esta entrando.
                      Reducimos un peldano la jerarquia tipografica
                      (text-xl/text-2xl en lugar de text-2xl/text-3xl)
                      porque los nombres completos en mobile (~341px de
                      contenido) suelen romper en 2-3 lineas con la
                      tipografia anterior. `break-words` evita
                      desbordes con apellidos compuestos largos. */}
                  <h1 className="text-xl sm:text-2xl font-bold text-balance break-words">
                    {colaborador.nombre}
                  </h1>
                  {colaborador.empresa_nombre && (
                    <p className="text-sm opacity-90 mt-1 break-words">
                      {colaborador.empresa_nombre}
                    </p>
                  )}
                  {colaborador.cargo && (
                    <p className="text-xs opacity-80 mt-0.5">{colaborador.cargo}</p>
                  )}
                </div>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={handleLogout}
                  className="lg:hidden gap-1.5"
                >
                  <LogOut className="h-3.5 w-3.5" />
                  Salir
                </Button>
              </div>
            </div>
          </header>

          <div className="mx-auto w-full max-w-5xl px-4 py-6 sm:px-6 flex-1">{children}</div>
        </main>
      </div>

      {/* Menu inferior - solo movil/tablet */}
      <nav
        className="lg:hidden fixed inset-x-0 bottom-0 z-40 border-t bg-white/95 backdrop-blur"
        aria-label="Menu principal"
      >
        {/* Menu inferior fijo en mobile/tablet. Antes era grid-cols-5;
            al agregar "Novedades" pasamos a grid-cols-6 para que
            cada celda mantenga su ancho proporcional. */}
        <ul className="grid grid-cols-7">
          {MENU.map((item) => {
            const Icon = item.icon
            const active =
              pathname === item.href ||
              (item.href !== "/portal/dashboard" && pathname.startsWith(item.href))
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className={cn(
                    // Bajamos un peldano el tamaño del icono y del
                    // label porque al pasar a 6 celdas (Novedades)
                    // los iconos quedaban muy juntos y el texto se
                    // traslapaba con el de las celdas vecinas. Con
                    // py-2 + h-5 + text-[10px] cada celda respira y
                    // el nombre del modulo cabe en una sola linea
                    // incluso en pantallas estrechas (~341px).
                    "flex flex-col items-center justify-center gap-0.5 py-2 px-1 text-[10px] font-medium transition-colors",
                    active ? "text-primary" : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  <Icon className={cn("h-5 w-5", active && "stroke-[2.4]")} aria-hidden />
                  <span className="leading-tight truncate w-full text-center">{item.label}</span>
                </Link>
              </li>
            )
          })}
        </ul>
      </nav>
    </div>
  )
}

function SidebarLink({ item, pathname }: { item: MenuItem; pathname: string }) {
  const Icon = item.icon
  const active =
    pathname === item.href ||
    (item.href !== "/portal/dashboard" && pathname.startsWith(item.href))
  return (
    <Link
      href={item.href}
      className={cn(
        "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors",
        active
          ? "bg-primary text-primary-foreground"
          : "text-slate-600 hover:bg-slate-100 hover:text-slate-900",
      )}
    >
      <Icon className="h-4 w-4" aria-hidden />
      {item.label}
    </Link>
  )
}
