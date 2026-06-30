"use client"

import { useState } from "react"
import { GenericCrudTable } from "@/components/configuration/generic-crud-table"
import { configModules } from "@/lib/config-definitions"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Store } from "lucide-react"

export function ClientesWithSucursales() {
  const [isSucursalesOpen, setIsSucursalesOpen] = useState(false)
  const [sucursalesKey, setSucursalesKey] = useState(0)

  const handleSucursalesClose = (open: boolean) => {
    if (!open) {
      // Increment key to remount and refresh sucursales table
      setSucursalesKey((prev) => prev + 1)
    }
    setIsSucursalesOpen(open)
  }

  return (
    <div className="space-y-4">
      {/* Button to open sucursales popup */}
      <div className="flex justify-end p-4">
        <Button onClick={() => setIsSucursalesOpen(true)} variant="outline" size="sm">
          <Store className="mr-2 h-4 w-4" />
          Gestionar Sucursales
        </Button>
      </div>

      {/* Clientes CRUD Table */}
      <GenericCrudTable moduleDef={configModules.clientes} />

      {/* Sucursales Popup */}
      <Dialog open={isSucursalesOpen} onOpenChange={handleSucursalesClose}>
        <DialogContent className="max-w-5xl max-h-[90vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle>Gestión de Sucursales</DialogTitle>
          </DialogHeader>
          <div className="flex-1 overflow-y-auto">
            <GenericCrudTable key={sucursalesKey} moduleDef={configModules.sucursales} />
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
