"use client"

import { useState, useEffect } from "react"
import { Sidebar } from "@/components/sidebar"
import { MainContent } from "@/components/main-content"
import { SplashScreen } from "@/components/splash-screen"
import { LipbotDock } from "@/components/lipbot-dock"
import { groups, type GroupKey } from "@/lib/dashboard-data"
import { useAuth } from "@/components/auth-provider"
import { useRouter } from "next/navigation"

export default function DashboardPage() {
  const { user, loading } = useAuth()
  const router = useRouter()
  const [selectedGroup, setSelectedGroup] = useState<GroupKey | null>(null)
  const [selectedModule, setSelectedModule] = useState<string | null>(null)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)

  // Navegación robusta a un módulo (usada por el asistente IA con abrir_modulo).
  // Fija el GRUPO que contiene el módulo además del módulo, porque main-content
  // solo renderiza un módulo si hay un grupo seleccionado. Si no lo encuentra en
  // ningún grupo, cae a un grupo válido para salir del home.
  const navigateToModule = (moduleName: string) => {
    let gk: GroupKey | null = null
    for (const g of groups) {
      const enDirecto = g.modules?.some((m) => m.name === moduleName)
      const enSub = g.subgroups?.some((sg) => sg.modules.some((m) => m.name === moduleName))
      if (enDirecto || enSub) {
        gk = g.key
        break
      }
    }
    setSelectedGroup((prev) => gk ?? prev ?? (groups[0]?.key ?? null))
    setSelectedModule(moduleName)
  }

  // Abrir un MÓDULO PRINCIPAL (grupo de la barra izquierda): muestra su submenú.
  const openGroup = (key: string) => {
    setSelectedGroup(key as GroupKey)
    setSelectedModule(null)
  }
  // Controla si la pantalla de bienvenida debe mostrarse antes del
  // dashboard. Solo se activa una vez por sesion: el login-form deja un
  // flag en `sessionStorage` que aqui leemos y limpiamos. Asi evitamos
  // que el splash aparezca en cada refresh.
  const [showSplash, setShowSplash] = useState(false)

  useEffect(() => {
    if (!loading && !user) {
      router.push("/login")
    }
  }, [user, loading, router])

  useEffect(() => {
    // Leemos el flag solo cuando el usuario ya esta autenticado para
    // garantizar que el splash siempre se muestra DESPUES del login,
    // nunca antes (durante la fase de carga inicial podria aun no
    // haberse hidratado el AuthProvider).
    if (!user) return
    try {
      const flag = sessionStorage.getItem("lipgo:just-logged-in")
      if (flag === "1") {
        sessionStorage.removeItem("lipgo:just-logged-in")
        setShowSplash(true)
      }
    } catch {
      // sessionStorage no disponible — saltamos el splash silenciosa-
      // mente.
    }
  }, [user])

  if (loading) {
    // Reemplazamos el antiguo spinner "Cargando..." por la misma
    // pantalla de bienvenida que se usa post-login. Asi cualquier
    // estado de hidratacion del AuthProvider muestra una experiencia
    // unificada y de marca, en lugar de un spinner generico.
    //
    // Pasamos `onComplete` como no-op porque la transicion la gobierna
    // el flag `loading`: en cuanto el AuthProvider termina de cargar,
    // este componente vuelve a renderizar y el splash se desmonta.
    return <SplashScreen onComplete={() => {}} />
  }

  if (!user) {
    return null
  }

  return (
    <div className="flex h-screen w-full bg-background overflow-hidden">
      {/* Pantalla de bienvenida tras login. Se monta encima del
          dashboard con z-index alto y se desmonta sola al terminar la
          animacion (~3s). */}
      {showSplash && <SplashScreen onComplete={() => setShowSplash(false)} />}

      {/* Sidebar */}
      <Sidebar
        selectedGroup={selectedGroup}
        selectedModule={selectedModule}
        onSelectGroup={(group) => {
          setSelectedGroup(group)
          setSelectedModule(null)
        }}
        onSelectModule={setSelectedModule}
        collapsed={sidebarCollapsed}
        onToggleCollapse={() => setSidebarCollapsed(!sidebarCollapsed)}
      />

      {/* Main Content */}
      <MainContent
        selectedGroup={selectedGroup}
        selectedModule={selectedModule}
        onSelectModule={setSelectedModule}
        onNavigateModule={navigateToModule}
        onOpenGroup={openGroup}
        onBack={() => {
          if (selectedModule) {
            setSelectedModule(null)
          } else {
            setSelectedGroup(null)
          }
        }}
        onSelectGroup={setSelectedGroup}
        sidebarCollapsed={sidebarCollapsed}
      />

      {/* LIPbot flotante — aparece DENTRO de los módulos/formularios (donde NO
          está la tarjeta inline de Inicio/submenús ni el Asistente a pantalla
          completa), evitando duplicar LIPbot en una misma pantalla. Consciente
          del módulo actual. */}
      {selectedModule && selectedModule !== "Asistente IA" && (
        <LipbotDock
          contextLabel={selectedModule}
          groupKey={selectedGroup ?? undefined}
          onNavigate={navigateToModule}
          onOpenGroup={openGroup}
        />
      )}

      {/* Background Watermark */}
      <div className="fixed inset-0 flex items-center justify-center pointer-events-none z-0">
        <img
          src="/images/design-mode/LipGoBG(1).png"
          alt=""
          className="w-[300px] h-[300px] sm:w-[500px] sm:h-[500px] lg:w-[800px] lg:h-[800px] object-contain opacity-[0.05]"
        />
      </div>
    </div>
  )
}
