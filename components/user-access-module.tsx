"use client"

import React, { useEffect, useState } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { Button } from "@/components/ui/button"
import { useToast } from "@/hooks/use-toast"
import { useAuth } from "@/hooks/use-auth"
import {
  getAllUsers,
  getAllEmpresas,
  getUserAccess,
  grantUserAccess,
  revokeUserAccess,
  getAllOwners,
  getUserOwnerAccess,
  grantUserOwnerAccess,
  revokeUserOwnerAccess,
  UserProfile,
  Empresa,
  Owner,
} from "@/lib/user-access-actions"

export function UserAccessModule() {
  const { toast } = useToast()
  const { selectedEmpresaId } = useAuth()
  const [selectedTab, setSelectedTab] = useState<"empresas" | "owners">("empresas")
  const [users, setUsers] = useState<UserProfile[]>([])
  const [empresas, setEmpresas] = useState<Empresa[]>([])
  const [owners, setOwners] = useState<Owner[]>([])
  const [userAccess, setUserAccess] = useState<Record<string, number[]>>({})
  const [userOwnerAccess, setUserOwnerAccess] = useState<Record<string, string[]>>({})
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadData()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedEmpresaId])

  const loadData = async () => {
    try {
      setLoading(true)
      const [usersData, empresasData, ownersData] = await Promise.all([
        getAllUsers(selectedEmpresaId),
        getAllEmpresas(),
        getAllOwners(),
      ])

      setUsers(usersData)
      setEmpresas(empresasData)
      setOwners(ownersData)

      // Load access for each user (empresas)
      const accessMap: Record<string, number[]> = {}
      for (const user of usersData) {
        const access = await getUserAccess(user.id)
        accessMap[user.id] = access
      }
      setUserAccess(accessMap)

      // Load owner access for each user
      const ownerAccessMap: Record<string, string[]> = {}
      for (const user of usersData) {
        const ownerAccess = await getUserOwnerAccess(user.id)
        ownerAccessMap[user.id] = ownerAccess
      }
      setUserOwnerAccess(ownerAccessMap)
    } catch (error) {
      console.error("[v0] Error loading data:", error)
      toast({
        title: "Error",
        description: "Error al cargar los datos",
        variant: "destructive",
      })
    } finally {
      setLoading(false)
    }
  }

  const handleAccessChange = async (profileId: string, empresaId: number, hasAccess: boolean) => {
    try {
      let result
      if (hasAccess) {
        result = await grantUserAccess(profileId, empresaId)
      } else {
        result = await revokeUserAccess(profileId, empresaId)
      }

      if (result.success) {
        // Update local state
        setUserAccess((prev) => {
          const updated = { ...prev }
          if (hasAccess) {
            updated[profileId] = [...(updated[profileId] || []), empresaId]
          } else {
            updated[profileId] = (updated[profileId] || []).filter((id) => id !== empresaId)
          }
          return updated
        })

        toast({
          title: "Éxito",
          description: hasAccess ? "Acceso otorgado" : "Acceso revocado",
        })
      } else {
        toast({
          title: "Error",
          description: result.error || "Error al actualizar acceso",
          variant: "destructive",
        })
      }
    } catch (error) {
      console.error("[v0] Error updating access:", error)
      toast({
        title: "Error",
        description: "Error al actualizar acceso",
        variant: "destructive",
      })
    }
  }

  const handleOwnerAccessChange = async (profileId: string, ownerName: string, hasAccess: boolean) => {
    try {
      let result
      if (hasAccess) {
        result = await grantUserOwnerAccess(profileId, ownerName)
      } else {
        result = await revokeUserOwnerAccess(profileId, ownerName)
      }

      if (result.success) {
        // Update local state
        setUserOwnerAccess((prev) => {
          const updated = { ...prev }
          if (hasAccess) {
            updated[profileId] = [...(updated[profileId] || []), ownerName]
          } else {
            updated[profileId] = (updated[profileId] || []).filter((name) => name !== ownerName)
          }
          return updated
        })

        toast({
          title: "Éxito",
          description: hasAccess ? "Acceso otorgado" : "Acceso revocado",
        })
      } else {
        toast({
          title: "Error",
          description: result.error || "Error al actualizar acceso",
          variant: "destructive",
        })
      }
    } catch (error) {
      console.error("[v0] Error updating owner access:", error)
      toast({
        title: "Error",
        description: "Error al actualizar acceso",
        variant: "destructive",
      })
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <p className="text-gray-600">Cargando datos...</p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Accesos de Usuario</h1>
        <p className="text-gray-600 mt-2">Administra el acceso de usuarios a empresas y owners</p>
      </div>

      {/* Tab Buttons */}
      <div className="flex gap-2">
        <Button
          variant={selectedTab === "empresas" ? "default" : "outline"}
          onClick={() => setSelectedTab("empresas")}
          className="min-w-32"
        >
          Usuarios y Empresas
        </Button>
        <Button
          variant={selectedTab === "owners" ? "default" : "outline"}
          onClick={() => setSelectedTab("owners")}
          className="min-w-32"
        >
          Usuarios y Owners
        </Button>
      </div>

      {/* Empresas Tab */}
      {selectedTab === "empresas" && (
        <Card>
          <CardHeader>
            <CardTitle>Usuarios y Empresas</CardTitle>
            <CardDescription>Marca las empresas a las que cada usuario tiene acceso</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b">
                    <th className="text-left py-3 px-4 font-semibold">Usuario</th>
                    {empresas.map((empresa) => (
                      <th key={empresa.id} className="text-center py-3 px-4 font-semibold text-sm">
                        {empresa.nombre}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {users.length === 0 ? (
                    <tr>
                      <td colSpan={empresas.length + 1} className="text-center py-8 text-gray-500">
                        No hay usuarios registrados
                      </td>
                    </tr>
                  ) : (
                    users.map((user) => (
                      <tr key={user.id} className="border-b hover:bg-gray-50">
                        <td className="py-3 px-4 font-medium">{user.usuario}</td>
                        {empresas.map((empresa) => {
                          const hasAccess = (userAccess[user.id] || []).includes(empresa.id)
                          return (
                            <td key={`${user.id}-${empresa.id}`} className="text-center py-3 px-4">
                              <Checkbox
                                checked={hasAccess}
                                onCheckedChange={(checked) =>
                                  handleAccessChange(user.id, empresa.id, checked as boolean)
                                }
                                className="mx-auto"
                              />
                            </td>
                          )
                        })}
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Owners Tab */}
      {selectedTab === "owners" && (
        <Card>
          <CardHeader>
            <CardTitle>Usuarios y Owners</CardTitle>
            <CardDescription>Marca los owners a los que cada usuario tiene acceso</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b">
                    <th className="text-left py-3 px-4 font-semibold">Usuario</th>
                    {owners.map((owner) => (
                      <th key={owner.id} className="text-center py-3 px-4 font-semibold text-sm">
                        {owner.nombre}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {users.length === 0 ? (
                    <tr>
                      <td colSpan={owners.length + 1} className="text-center py-8 text-gray-500">
                        No hay usuarios registrados
                      </td>
                    </tr>
                  ) : (
                    users.map((user) => (
                      <tr key={user.id} className="border-b hover:bg-gray-50">
                        <td className="py-3 px-4 font-medium">{user.usuario}</td>
                        {owners.map((owner) => {
                          const hasAccess = (userOwnerAccess[user.id] || []).includes(owner.nombre)
                          return (
                            <td key={`${user.id}-${owner.id}`} className="text-center py-3 px-4">
                              <Checkbox
                                checked={hasAccess}
                                onCheckedChange={(checked) =>
                                  handleOwnerAccessChange(user.id, owner.nombre, checked as boolean)
                                }
                                className="mx-auto"
                              />
                            </td>
                          )
                        })}
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
