"use client"

import { useState } from "react"
import { GenericCrudTable } from "@/components/configuration/generic-crud-table"
import { configModules } from "@/lib/config-definitions"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Tag } from "lucide-react"

export function ProductosWithCategories() {
  const [isCategoriesOpen, setIsCategoriesOpen] = useState(false)
  const [categoriesKey, setCategoriesKey] = useState(0)

  const handleCategoriesClose = (open: boolean) => {
    if (!open) {
      // Increment key to remount and refresh categories table
      setCategoriesKey((prev) => prev + 1)
    }
    setIsCategoriesOpen(open)
  }

  return (
    <div className="space-y-4">
      {/* Button to open categories popup */}
      <div className="flex justify-end p-4">
        <Button onClick={() => setIsCategoriesOpen(true)} variant="outline" size="sm">
          <Tag className="mr-2 h-4 w-4" />
          Gestionar Categorías
        </Button>
      </div>

      {/* Products CRUD Table */}
      <GenericCrudTable moduleDef={configModules.productos} />

      {/* Categories Popup */}
      <Dialog open={isCategoriesOpen} onOpenChange={handleCategoriesClose}>
        <DialogContent className="max-w-5xl max-h-[90vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle>Gestión de Categorías</DialogTitle>
          </DialogHeader>
          <div className="flex-1 overflow-y-auto">
            <GenericCrudTable key={categoriesKey} moduleDef={configModules.categorias} />
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
