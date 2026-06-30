"use client"

import {
  Home,
  Package,
  FileText,
  Search,
  LayoutDashboard,
  Settings,
  Menu,
  X,
  Truck,
  ChevronDown,
  Users,
  Wallet,
  BadgeCheck,
} from "lucide-react"
import Image from "next/image"
import type { GroupKey, Module, Subgroup } from "@/lib/dashboard-data"
import { groups } from "@/lib/dashboard-data"
import { useState, useEffect, useMemo } from "react"

interface SidebarProps {
  selectedGroup: GroupKey | null
  selectedModule: string | null
  onSelectGroup: (group: GroupKey | null) => void
  onSelectModule: (module: string | null) => void
  collapsed: boolean
  onToggleCollapse: () => void
}

interface UserModulesResponse {
  protectedModules: string[]
  allowedModules: string[]
}

export function Sidebar({
  selectedGroup,
  selectedModule,
  onSelectGroup,
  onSelectModule,
  collapsed,
  onToggleCollapse,
}: SidebarProps) {
  const [expandedGroups, setExpandedGroups] = useState<Set<GroupKey>>(new Set())
  const [expandedSubgroups, setExpandedSubgroups] = useState<Set<string>>(new Set())
  // Texto del buscador de modulos del menu lateral.
  const [moduleSearch, setModuleSearch] = useState("")

  // Permisos del usuario para filtrar el menu. Se cargan una sola vez al
  // montar el sidebar y se mantienen en memoria. Hasta que se reciba la
  // respuesta `permissionsLoaded` queda en false: durante esa ventana no
  // se aplica filtro (se muestran todos los grupos), evitando que el menu
  // aparezca vacio en el primer render. Como adicional barrera, el
  // `PermissionGuard` que envuelve cada modulo bloquea cualquier acceso
  // que se cuele por un click rapido durante esos milisegundos.
  const [protectedModules, setProtectedModules] = useState<Set<string>>(new Set())
  const [allowedModules, setAllowedModules] = useState<Set<string>>(new Set())
  const [permissionsLoaded, setPermissionsLoaded] = useState(false)

  useEffect(() => {
    let cancelled = false
    const loadPermissions = async () => {
      try {
        const res = await fetch("/api/user-modules", { method: "GET" })
        if (!res.ok) {
          console.error("[v0] Sidebar: failed to fetch user-modules:", res.status)
          if (!cancelled) setPermissionsLoaded(true)
          return
        }
        const data = (await res.json()) as UserModulesResponse
        if (cancelled) return
        setProtectedModules(new Set(data.protectedModules))
        setAllowedModules(new Set(data.allowedModules))
        setPermissionsLoaded(true)
      } catch (error) {
        console.error("[v0] Sidebar: error loading permissions:", error)
        if (!cancelled) setPermissionsLoaded(true)
      }
    }
    loadPermissions()
    return () => {
      cancelled = true
    }
  }, [])

  /**
   * Decide si un modulo concreto debe verse en el menu.
   *  - Antes de cargar los permisos: se muestra (estado neutro).
   *  - Si el modulo NO esta protegido (no aparece en protectedModules):
   *    se muestra siempre.
   *  - Si esta protegido: se muestra solo si esta en allowedModules.
   */
  const isModuleVisible = (moduleName: string): boolean => {
    if (!permissionsLoaded) return true
    if (!protectedModules.has(moduleName)) return true
    return allowedModules.has(moduleName)
  }

  useEffect(() => {
    if (selectedGroup && selectedModule) {
      // When a module is selected, ensure only its group is expanded
      setExpandedGroups(new Set([selectedGroup]))
    }
  }, [selectedGroup, selectedModule])

  const toggleGroup = (key: GroupKey) => {
    const newExpanded = new Set<GroupKey>()
    if (!expandedGroups.has(key)) {
      newExpanded.add(key)
    }
    setExpandedGroups(newExpanded)
  }

  const toggleSubgroup = (groupKey: GroupKey, subgroupTitle: string) => {
    const key = `${groupKey}-${subgroupTitle}`
    const newExpanded = new Set(expandedSubgroups)
    if (newExpanded.has(key)) {
      newExpanded.delete(key)
    } else {
      newExpanded.add(key)
    }
    setExpandedSubgroups(newExpanded)
  }

  /**
   * Construye la lista efectiva de grupos a renderizar tras aplicar el
   * filtro de permisos. La logica:
   *   - En cada subgrupo se filtran sus modulos. Si queda vacio, el
   *     subgrupo se descarta.
   *   - En los modulos directos del grupo se aplica el mismo filtro.
   *   - Si el grupo se queda sin subgrupos visibles ni modulos directos,
   *     se descarta entero (no aparece en el sidebar).
   *
   * Memoizado por `permissionsLoaded` y los sets para no recomputar en
   * cada render mientras el usuario hace clicks.
   */
  const visibleGroups = useMemo(() => {
    return groups
      .map((group) => {
        const filteredSubgroups: Subgroup[] | undefined = group.subgroups
          ?.map((sg) => ({
            ...sg,
            modules: sg.modules.filter((m: Module) => isModuleVisible(m.name)),
          }))
          .filter((sg) => sg.modules.length > 0)

        const filteredModules: Module[] | undefined = group.modules?.filter(
          (m) => isModuleVisible(m.name),
        )

        const hasVisibleSubgroups = (filteredSubgroups?.length ?? 0) > 0
        const hasVisibleModules = (filteredModules?.length ?? 0) > 0
        if (!hasVisibleSubgroups && !hasVisibleModules) return null

        // Regla adicional: ocultar el GRUPO completo cuando el usuario
        // no tiene permiso sobre NINGUN modulo protegido del grupo.
        // Antes el grupo se mostraba si quedaba siquiera un modulo
        // visible (incluyendo modulos no protegidos como "Ingresos MP",
        // "Saldos de empaque", "Gestion de Colaboradores", etc.) lo
        // que dejaba ver categorias enteras a usuarios sin acceso real
        // a su contenido. Esta verificacion exige que al menos UN
        // modulo protegido permitido viva en el grupo. Mientras los
        // permisos aun no terminan de cargar, no aplicamos este filtro
        // (`permissionsLoaded` false) para evitar parpadeos.
        // Grupos exentos del filtro de modulo protegido: contienen solo
        // modulos no protegidos que deben verse para todos (Fase 1).
        const GRUPOS_SIN_FILTRO_PROTEGIDO: GroupKey[] = ["certificaciones_lip"]
        if (permissionsLoaded && !GRUPOS_SIN_FILTRO_PROTEGIDO.includes(group.key)) {
          const allModulesInGroup = [
            ...(filteredModules ?? []),
            ...((filteredSubgroups ?? []).flatMap((sg) => sg.modules)),
          ]
          const hasAtLeastOneAllowedProtected = allModulesInGroup.some((m) =>
            allowedModules.has(m.name),
          )
          if (!hasAtLeastOneAllowedProtected) return null
        }

        return {
          ...group,
          subgroups: filteredSubgroups,
          modules: filteredModules,
        }
      })
      .filter((g): g is NonNullable<typeof g> => g !== null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [permissionsLoaded, allowedModules, protectedModules])

  const allMenuItems = [
    { key: null, label: "Inicio", icon: Home },
    { key: "pedidos" as GroupKey, label: "Gestión de Pedidos", icon: FileText },
    { key: "despachos" as GroupKey, label: "Despachos/Recepción", icon: Truck },
    { key: "vehiculos" as GroupKey, label: "Vehículos", icon: Truck },
    { key: "bascula" as GroupKey, label: "Báscula", icon: Package },
    { key: "inventarios" as GroupKey, label: "Almacenamiento", icon: Package },
    { key: "mrp" as GroupKey, label: "MRP", icon: LayoutDashboard },
    { key: "produccion" as GroupKey, label: "Producción", icon: Package },
    { key: "auditoria" as GroupKey, label: "Auditoría", icon: Search },
    { key: "integral" as GroupKey, label: "Gestión Integral", icon: LayoutDashboard },
    { key: "lip" as GroupKey, label: "Gestión LIP", icon: Users },
    { key: "financiera" as GroupKey, label: "Gestión Financiera", icon: Wallet },
    { key: "rrhh" as GroupKey, label: "Gestión Humana", icon: Users },
    { key: "certificaciones_lip" as GroupKey, label: "Certificaciones LIP", icon: BadgeCheck },
    { key: "compensacion" as GroupKey, label: "Compensación", icon: Wallet },
    { key: "configuracion" as GroupKey, label: "Configuración", icon: Settings },
  ]

  // Filtra los items del menu superior para ocultar los grupos cuyos
  // modulos quedaron todos sin permiso. "Inicio" (key === null) siempre
  // se muestra: no es un grupo de modulos.
  const menuItems = allMenuItems.filter((item) => {
    if (item.key === null) return true
    return visibleGroups.some((g) => g.key === item.key)
  })

  // Lista plana de todos los modulos visibles, con su grupo, etiqueta del
  // grupo, subgrupo (si aplica) e icono. Sirve para el buscador.
  const allModulesFlat = useMemo(() => {
    const groupLabelByKey = new Map(allMenuItems.map((i) => [i.key, i.label]))
    const result: {
      groupKey: GroupKey
      groupLabel: string
      subgroupTitle?: string
      name: string
      label: string
      icon: Module["icon"]
    }[] = []
    for (const g of visibleGroups) {
      const groupLabel = (groupLabelByKey.get(g.key) as string) ?? g.title
      const pushModule = (m: Module, subgroupTitle?: string) => {
        result.push({
          groupKey: g.key,
          groupLabel,
          subgroupTitle,
          name: m.name,
          label: m.label ?? m.name,
          icon: m.icon,
        })
      }
      g.subgroups?.forEach((sg) => sg.modules.forEach((m) => pushModule(m, sg.title)))
      g.modules?.forEach((m) => pushModule(m))
    }
    return result
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visibleGroups])

  const normalizedSearch = moduleSearch.trim().toLowerCase()
  const searchResults =
    normalizedSearch.length > 0
      ? allModulesFlat.filter(
          (m) =>
            m.label.toLowerCase().includes(normalizedSearch) ||
            m.name.toLowerCase().includes(normalizedSearch) ||
            m.groupLabel.toLowerCase().includes(normalizedSearch) ||
            (m.subgroupTitle?.toLowerCase().includes(normalizedSearch) ?? false),
        )
      : []

  // Al elegir un modulo desde el buscador: navega, expande su grupo y limpia.
  const handleSelectFromSearch = (groupKey: GroupKey, moduleName: string) => {
    onSelectGroup(groupKey)
    onSelectModule(moduleName)
    setExpandedGroups(new Set([groupKey]))
    setModuleSearch("")
  }

  return (
    <>
      {/* Desktop Sidebar */}
      <aside
        className={`hidden md:flex flex-col h-screen border-r border-border bg-card z-20 transition-all duration-300 ${collapsed ? "w-16 lg:w-20" : "w-56 lg:w-64"}`}
      >
        {/* Logo and Toggle Button */}
        <div
          className={`flex h-16 lg:h-20 items-center border-b border-border flex-shrink-0 ${collapsed ? "justify-center px-2 lg:px-4" : "justify-between px-4 lg:px-6"}`}
        >
          {!collapsed && (
            <Image
              src="/lipgo-logo.png"
              alt="LIPGo"
              width={150}
              height={50}
              className="h-8 lg:h-10 w-auto cursor-pointer"
              priority
              onClick={() => {
                onSelectGroup(null)
                onSelectModule(null)
              }}
            />
          )}
          <button
            onClick={onToggleCollapse}
            className="p-1.5 lg:p-2 rounded-lg hover:bg-accent transition-colors flex-shrink-0"
            aria-label={collapsed ? "Expandir menú" : "Contraer menú"}
          >
            {collapsed ? (
              <Menu className="h-4 w-4 lg:h-5 lg:w-5 text-muted-foreground" />
            ) : (
              <X className="h-4 w-4 lg:h-5 lg:w-5 text-muted-foreground" />
            )}
          </button>
        </div>

        {/* Buscador de modulos (solo visible cuando el sidebar esta expandido) */}
        {!collapsed && (
          <div className="px-2 lg:px-4 pt-2 lg:pt-4 flex-shrink-0">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
              <input
                type="text"
                value={moduleSearch}
                onChange={(e) => setModuleSearch(e.target.value)}
                placeholder="Buscar módulo..."
                aria-label="Buscar módulo"
                className="w-full rounded-lg border border-border bg-background py-2 pl-8 pr-8 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              />
              {moduleSearch && (
                <button
                  onClick={() => setModuleSearch("")}
                  className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-0.5 text-muted-foreground hover:bg-accent hover:text-foreground"
                  aria-label="Limpiar búsqueda"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          </div>
        )}

        {/* Module/Subgroup list - shown when expanded */}
        <nav className="flex-1 space-y-0.5 lg:space-y-1 p-2 lg:p-4 overflow-y-auto overflow-x-hidden">
          {/* Resultados del buscador: lista plana de modulos coincidentes */}
          {!collapsed && normalizedSearch.length > 0 ? (
            searchResults.length > 0 ? (
              searchResults.map((m) => {
                const ModuleIcon = m.icon
                const isModuleActive = selectedModule === m.name && selectedGroup === m.groupKey
                return (
                  <button
                    key={`${m.groupKey}-${m.name}`}
                    onClick={() => handleSelectFromSearch(m.groupKey, m.name)}
                    className={`
                      flex w-full flex-col items-start gap-0.5 rounded-lg px-3 py-2 text-xs
                      transition-all duration-200
                      ${
                        isModuleActive
                          ? "text-foreground bg-accent/70 font-medium"
                          : "text-muted-foreground hover:bg-accent/50 hover:text-foreground"
                      }
                    `}
                  >
                    <span className="flex items-center gap-2">
                      <ModuleIcon className="h-3.5 w-3.5 flex-shrink-0" />
                      <span className="text-left">{m.label}</span>
                    </span>
                    <span className="pl-5 text-[10px] text-muted-foreground/70">
                      {m.groupLabel}
                      {m.subgroupTitle ? ` · ${m.subgroupTitle}` : ""}
                    </span>
                  </button>
                )
              })
            ) : (
              <p className="px-3 py-4 text-center text-xs text-muted-foreground">
                No se encontraron módulos
              </p>
            )
          ) : (
            menuItems.map((item) => {
            const Icon = item.icon
            const isGroupActive = selectedGroup === item.key
            const isExpanded = item.key ? expandedGroups.has(item.key) : false
            const group = item.key ? visibleGroups.find((g) => g.key === item.key) : null

            // Inicio button (no accordion)
            if (!item.key) {
              return (
                <button
                  key={item.label}
                  onClick={() => {
                    onSelectGroup(null)
                    onSelectModule(null)
                  }}
                  className={`
                    flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium
                    transition-all duration-200 relative
                    ${
                      isGroupActive
                        ? "text-foreground bg-accent"
                        : "text-muted-foreground hover:bg-accent/50 hover:text-foreground"
                    }
                    ${collapsed ? "justify-center" : ""}
                  `}
                  title={collapsed ? item.label : undefined}
                >
                  {isGroupActive && (
                    <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-6 bg-primary rounded-r-full" />
                  )}
                  <Icon className="h-4 w-4 flex-shrink-0" />
                  {!collapsed && <span className="whitespace-nowrap">{item.label}</span>}
                </button>
              )
            }

            // Group accordion buttons
            return (
              <div key={item.label} className="space-y-1">
                <button
                  onClick={() => {
                    if (!collapsed) {
                      onSelectGroup(item.key!)
                      onSelectModule(null)
                      toggleGroup(item.key!)
                    }
                  }}
                  className={`
                    flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium
                    transition-all duration-200 relative
                    ${
                      isGroupActive
                        ? "text-foreground bg-accent"
                        : "text-muted-foreground hover:bg-accent/50 hover:text-foreground"
                    }
                    ${collapsed ? "justify-center" : "justify-between"}
                  `}
                  title={collapsed ? item.label : undefined}
                >
                  <div className="flex items-center gap-3">
                    {isGroupActive && (
                      <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-6 bg-primary rounded-r-full" />
                    )}
                    <Icon className="h-4 w-4 flex-shrink-0" />
                    {!collapsed && <span className="whitespace-nowrap">{item.label}</span>}
                  </div>
                  {!collapsed && (
                    <ChevronDown
                      className={`h-4 w-4 transition-transform duration-200 ${isExpanded ? "rotate-180" : ""}`}
                    />
                  )}
                </button>

                {/* Module/Subgroup list - shown when expanded */}
                <div
                  className={`
                    ml-4 space-y-1 border-l border-border pl-2
                    overflow-hidden transition-all duration-300 ease-in-out
                    ${!collapsed && isExpanded ? "max-h-[600px] opacity-100" : "max-h-0 opacity-0"}
                  `}
                >
                  {!collapsed && group && (
                    <>
                      {group.subgroups
                        ? // Render subgroups
                          group.subgroups.map((subgroup) => {
                            const subgroupKey = `${item.key}-${subgroup.title}`
                            const isSubgroupExpanded = expandedSubgroups.has(subgroupKey)

                            return (
                              <div key={subgroup.title} className="space-y-1">
                                <button
                                  onClick={() => toggleSubgroup(item.key!, subgroup.title)}
                                  className={`
                                  flex w-full items-center gap-2 rounded-lg px-3 py-1.5 text-xs font-medium
                                  transition-all duration-200 justify-between
                                  text-muted-foreground hover:bg-accent/50 hover:text-foreground
                                `}
                                >
                                  <span className="text-left whitespace-nowrap">{subgroup.title}</span>
                                  <ChevronDown
                                    className={`h-3 w-3 transition-transform duration-200 flex-shrink-0 ${isSubgroupExpanded ? "rotate-180" : ""}`}
                                  />
                                </button>

                                {/* Subgroup modules */}
                                <div
                                  className={`
                                  ml-3 space-y-1 border-l border-border pl-2
                                  overflow-hidden transition-all duration-300 ease-in-out
                                  ${isSubgroupExpanded ? "max-h-96 opacity-100" : "max-h-0 opacity-0"}
                                `}
                                >
                                  {subgroup.modules.map((module) => {
                                    const ModuleIcon = module.icon
                                    const isModuleActive = selectedModule === module.name && selectedGroup === item.key

                                    return (
                                      <button
                                        key={module.name}
                                        onClick={() => {
                                          onSelectGroup(item.key!)
                                          onSelectModule(module.name)
                                        }}
                                        className={`
                                        flex w-full items-center gap-2 rounded-lg px-3 py-1.5 text-xs
                                        transition-all duration-200
                                        ${
                                          isModuleActive
                                            ? "text-foreground bg-accent/70 font-medium"
                                            : "text-muted-foreground hover:bg-accent/50 hover:text-foreground"
                                        }
                                      `}
                                      >
                                        <ModuleIcon className="h-3.5 w-3.5 flex-shrink-0" />
                                        <span className="text-left whitespace-nowrap overflow-hidden text-ellipsis">
                                          {module.label ?? module.name}
                                        </span>
                                      </button>
                                    )
                                  })}
                                </div>
                              </div>
                            )
                          })
                        : // Render direct modules (for groups without subgroups)
                          group.modules?.map((module) => {
                            const ModuleIcon = module.icon
                            const isModuleActive = selectedModule === module.name && selectedGroup === item.key

                            return (
                              <button
                                key={module.name}
                                onClick={() => {
                                  onSelectGroup(item.key!)
                                  onSelectModule(module.name)
                                }}
                                className={`
                                flex w-full items-center gap-2 rounded-lg px-3 py-1.5 text-xs
                                transition-all duration-200
                                ${
                                  isModuleActive
                                    ? "text-foreground bg-accent/70 font-medium"
                                    : "text-muted-foreground hover:bg-accent/50 hover:text-foreground"
                                }
                              `}
                              >
                                <ModuleIcon className="h-3.5 w-3.5 flex-shrink-0" />
                                <span className="text-left whitespace-nowrap overflow-hidden text-ellipsis">
                                  {module.label ?? module.name}
                                </span>
                              </button>
                            )
                          })}
                    </>
                  )}
                </div>
              </div>
            )
            })
          )}
        </nav>
      </aside>

      {/* Mobile Bottom Navigation */}
      <div className="md:hidden fixed bottom-0 left-0 right-0 bg-card border-t border-border z-50 safe-area-pb">
        <nav className="flex items-center justify-around px-1 py-1.5">
          {menuItems.slice(0, 5).map((item) => {
            const Icon = item.icon
            const isActive = selectedGroup === item.key

            return (
              <button
                key={item.label}
                onClick={() => {
                  onSelectGroup(item.key)
                  onSelectModule(null)
                }}
                className={`
                  flex flex-col items-center gap-0.5 px-2 py-1.5 rounded-lg min-w-0
                  transition-colors
                  ${isActive ? "text-primary" : "text-muted-foreground"}
                `}
              >
                <Icon className="h-4 w-4 sm:h-5 sm:w-5 flex-shrink-0" />
                <span className="text-[9px] sm:text-[10px] font-medium truncate max-w-[60px]">{item.label}</span>
              </button>
            )
          })}
        </nav>
      </div>
    </>
  )
}
