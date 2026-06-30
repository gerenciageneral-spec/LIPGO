"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Label } from "@/components/ui/label"
import { getAllUsersWithPermissions, updateUserPermissions } from "@/lib/permissions-actions"
// El tipo `UserPermissions` se importa desde el modulo compartido (sin
// "use server") para evitar problemas con re-exports en archivos de
// server actions: Next.js no permite exportar valores no async desde
// archivos con la directiva "use server".
import type { UserPermissions } from "@/lib/permissions-map"
import { MODULE_PERMISSION_MAP } from "@/lib/permissions-map"
import { groups } from "@/lib/dashboard-data"
import { Loader2, Save, User } from "lucide-react"
import { useToast } from "@/hooks/use-toast"
import { useAuth } from "@/components/auth-provider"

interface UserWithPermissions {
  id: string
  usuario: string
  empresa_id: number
  permisos_usuarios: UserPermissions | UserPermissions[] | null
}

// ---------------------------------------------------------------------------
// El arbol de permisos se DERIVA de la estructura de navegacion real
// (`groups` en lib/dashboard-data.ts) usando `MODULE_PERMISSION_MAP`. Asi la
// pantalla de Accesos de Usuario refleja SIEMPRE los mismos grupos, subgrupos
// y modulos que ve el usuario en el sidebar, sin listas paralelas que se
// desincronicen. Cada modulo nuevo que se agregue al menu y al mapa aparece
// aqui automaticamente.
// ---------------------------------------------------------------------------
type PermItem = { key: keyof UserPermissions; label: string }
type PermSection = { title: string | null; permissions: PermItem[] }
type PermGroup = { title: string; sections: PermSection[] }

function collectPerms(modules: { name: string; label?: string }[]): PermItem[] {
  const seen = new Set<string>()
  const out: PermItem[] = []
  for (const m of modules) {
    const key = MODULE_PERMISSION_MAP[m.name] as keyof UserPermissions | undefined
    if (!key) continue
    // Dedupe dentro de la seccion: varios modulos pueden compartir el mismo
    // permiso (ej. "Examenes Médicos" y "Gestión de Contratos").
    if (seen.has(key as string)) continue
    seen.add(key as string)
    out.push({ key, label: m.label ?? m.name })
  }
  return out
}

// Permisos que NO son modulos del menu pero deben poder otorgarse aqui.
// Caso SIG: las pestanas por norma viven dentro de un unico modulo
// ("Matriz Integrada SIG"), pero cada una tiene su permiso. Se inyectan en su
// subgrupo para que Gestion de Usuarios los exponga sin crear items de menu.
const EXTRA_PERMS_POR_SUBGRUPO: Record<string, PermItem[]> = {
  "Sistema Integrado (SIG)": [
    { key: "sig_iso9001", label: "— Pestaña ISO 9001:2015" },
    { key: "sig_iso14001", label: "— Pestaña ISO 14001:2015" },
    { key: "sig_iso45001", label: "— Pestaña ISO 45001:2018" },
  ],
}

const PERMISSION_TREE: PermGroup[] = groups
  .map((g) => {
    const sections: PermSection[] = []
    if (g.modules?.length) {
      const perms = collectPerms(g.modules)
      if (perms.length) sections.push({ title: null, permissions: perms })
    }
    for (const sg of g.subgroups ?? []) {
      const perms = [...collectPerms(sg.modules), ...(EXTRA_PERMS_POR_SUBGRUPO[sg.title] ?? [])]
      if (perms.length) sections.push({ title: sg.title, permissions: perms })
    }
    return { title: g.title, sections }
  })
  .filter((g) => g.sections.length > 0)

export function UserPermissionsManagement() {
  const { selectedEmpresaId } = useAuth()
  const [users, setUsers] = useState<UserWithPermissions[]>([])
  const [selectedUser, setSelectedUser] = useState<UserWithPermissions | null>(null)
  const [permissions, setPermissions] = useState<Partial<UserPermissions>>({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const { toast } = useToast()

  useEffect(() => {
    if (selectedEmpresaId) {
      loadUsers()
      // Reset selected user when empresa changes
      setSelectedUser(null)
      setPermissions({})
    }
  }, [selectedEmpresaId])

  const loadUsers = async () => {
    setLoading(true)
    const result = await getAllUsersWithPermissions(selectedEmpresaId)
    if (result.success && result.data) {
      setUsers(result.data as UserWithPermissions[])
    }
    setLoading(false)
  }

  const handleSelectUser = (user: UserWithPermissions) => {
    setSelectedUser(user)

    let userPermissions: UserPermissions | undefined

    if (Array.isArray(user.permisos_usuarios)) {
      userPermissions = user.permisos_usuarios[0]
    } else if (user.permisos_usuarios) {
      userPermissions = user.permisos_usuarios
    }

    // Initialize all permissions with their current values or false as default
    const initializedPermissions: Partial<UserPermissions> = {}
    PERMISSION_TREE.forEach((group) => {
      group.sections.forEach((section) => {
        section.permissions.forEach((perm) => {
          const permValue = userPermissions?.[perm.key]
          initializedPermissions[perm.key] = permValue === true
        })
      })
    })

    setPermissions(initializedPermissions)
  }

  const handlePermissionChange = (key: string, checked: boolean) => {
    setPermissions((prev) => ({
      ...prev,
      [key]: checked,
    }))
  }

  const handleSelectAll = (groupPermissions: PermItem[], checked: boolean) => {
    const updates: Partial<UserPermissions> = {}
    groupPermissions.forEach((perm) => {
      updates[perm.key] = checked
    })
    setPermissions((prev) => ({
      ...prev,
      ...updates,
    }))
  }

  const handleSave = async () => {
    if (!selectedUser) return

    setSaving(true)
    const result = await updateUserPermissions(selectedUser.id, permissions)

    if (result.success) {
      toast({
        title: "Permisos actualizados",
        description: "Los permisos del usuario se han actualizado correctamente.",
      })
      await loadUsers()
    } else {
      toast({
        title: "Error",
        description: result.error || "No se pudieron actualizar los permisos.",
        variant: "destructive",
      })
    }
    setSaving(false)
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-foreground">Gestión de Usuarios y Permisos</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Administra los permisos de acceso a módulos para cada usuario del sistema
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Lista de usuarios */}
        <Card className="lg:col-span-1">
          <CardHeader>
            <CardTitle className="text-lg">Usuarios</CardTitle>
            <CardDescription>Selecciona un usuario para editar sus permisos</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2 max-h-[600px] overflow-y-auto">
              {users.map((user) => (
                <button
                  key={user.id}
                  onClick={() => handleSelectUser(user)}
                  className={`w-full flex items-center gap-3 p-3 rounded-lg border transition-colors text-left ${
                    selectedUser?.id === user.id
                      ? "bg-primary/10 border-primary"
                      : "bg-card hover:bg-accent border-border"
                  }`}
                >
                  <div className="h-10 w-10 rounded-full bg-primary/20 flex items-center justify-center flex-shrink-0">
                    <User className="h-5 w-5 text-primary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm truncate">{user.usuario}</p>
                    <p className="text-xs text-muted-foreground">Empresa ID: {user.empresa_id}</p>
                  </div>
                </button>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Panel de permisos */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-lg">
              {selectedUser ? `Permisos de ${selectedUser.usuario}` : "Selecciona un usuario"}
            </CardTitle>
            <CardDescription>
              {selectedUser
                ? "Marca los módulos a los que este usuario tendrá acceso"
                : "Selecciona un usuario de la lista para ver y editar sus permisos"}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {selectedUser ? (
              <div className="space-y-6">
                <div className="max-h-[500px] overflow-y-auto space-y-8 pr-4">
                  {PERMISSION_TREE.map((group) => (
                    <div key={group.title} className="space-y-4">
                      <h3 className="text-sm font-bold text-foreground border-b border-border pb-1.5">
                        {group.title}
                      </h3>
                      {group.sections.map((section) => (
                        <div key={section.title ?? `${group.title}-general`} className="space-y-3">
                          <div className="flex items-center justify-between">
                            <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                              {section.title ?? "General"}
                            </h4>
                            <div className="flex gap-2">
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => handleSelectAll(section.permissions, true)}
                                className="h-7 text-xs"
                              >
                                Todos
                              </Button>
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => handleSelectAll(section.permissions, false)}
                                className="h-7 text-xs"
                              >
                                Ninguno
                              </Button>
                            </div>
                          </div>
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pl-4 border-l-2 border-border">
                            {section.permissions.map((perm) => {
                              const isEnabled = permissions[perm.key] || false
                              return (
                                <div
                                  key={`${group.title}-${section.title ?? "general"}-${perm.key}`}
                                  className={`flex items-center space-x-2 p-2 rounded-md transition-colors ${
                                    isEnabled ? "bg-primary/5 border border-primary/20" : "hover:bg-accent/50"
                                  }`}
                                >
                                  <Checkbox
                                    id={`${selectedUser.id}-${group.title}-${section.title ?? "general"}-${perm.key}`}
                                    checked={isEnabled}
                                    onCheckedChange={(checked) =>
                                      handlePermissionChange(perm.key as string, checked as boolean)
                                    }
                                  />
                                  <Label
                                    htmlFor={`${selectedUser.id}-${group.title}-${section.title ?? "general"}-${perm.key}`}
                                    className={`text-sm cursor-pointer leading-tight flex-1 ${
                                      isEnabled ? "font-medium text-primary" : ""
                                    }`}
                                  >
                                    {perm.label}
                                  </Label>
                                </div>
                              )
                            })}
                          </div>
                        </div>
                      ))}
                    </div>
                  ))}
                </div>

                <div className="flex justify-end pt-4 border-t">
                  <Button onClick={handleSave} disabled={saving} className="gap-2">
                    {saving ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Guardando...
                      </>
                    ) : (
                      <>
                        <Save className="h-4 w-4" />
                        Guardar Permisos
                      </>
                    )}
                  </Button>
                </div>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center h-64 text-center">
                <User className="h-12 w-12 text-muted-foreground mb-4" />
                <p className="text-muted-foreground">Selecciona un usuario para comenzar</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
