"use client"

import { useCallback, useEffect, useState } from "react"
import { GenericCrudTable } from "@/components/configuration/generic-crud-table"
import { configModules } from "@/lib/config-definitions"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Tag, Ruler, Search } from "lucide-react"
import { useAuth } from "@/components/auth-provider"
import { TallajeProducto } from "@/components/configuration/tallaje-producto"
import { empresaUsaTallaje } from "@/lib/tallaje-actions"
import { fetchConfigData } from "@/lib/config-actions"

interface ProductoLite {
  id: number
  nombre: string
  codigo?: string | null
  es_tallado?: boolean | null
  producto_padre_id?: number | null
  talla?: string | null
}

export function ProductosWithCategories() {
  const { selectedEmpresaId } = useAuth()
  const [isCategoriesOpen, setIsCategoriesOpen] = useState(false)
  const [categoriesKey, setCategoriesKey] = useState(0)
  const [tablaKey, setTablaKey] = useState(0)

  // El tallaje solo aparece para los clientes que lo manejan. Sin fila activa
  // en tallaje_empresa, los demas no ven una funcion que no usan.
  const [usaTallaje, setUsaTallaje] = useState(false)
  const [tallajeOpen, setTallajeOpen] = useState(false)
  const [productos, setProductos] = useState<ProductoLite[]>([])
  const [buscar, setBuscar] = useState("")
  const [elegido, setElegido] = useState<ProductoLite | null>(null)

  // Dos condiciones para ver el boton, y las dos son necesarias:
  //  1. el cliente maneja tallas (tallaje_empresa)
  //  2. el usuario puede mover stock
  //
  // Repartir hace exactamente el mismo movimiento que el codigo 309 del modulo
  // de Transacciones de Inventario, asi que se exige ese mismo permiso: quien
  // no puede mover stock alli, tampoco deberia poder hacerlo desde aqui.
  useEffect(() => {
    let vivo = true
    if (!selectedEmpresaId) {
      setUsaTallaje(false)
      return
    }
    Promise.all([
      empresaUsaTallaje(selectedEmpresaId),
      fetch("/api/check-permission", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ moduleName: "Transacciones de Inventario" }),
      })
        .then((r) => r.json())
        .then((d) => !!d?.hasPermission)
        .catch(() => false),
    ]).then(([usa, puede]) => {
      if (vivo) setUsaTallaje(usa && puede)
    })
    return () => {
      vivo = false
    }
  }, [selectedEmpresaId])

  const abrirSelector = useCallback(async () => {
    setTallajeOpen(true)
    setElegido(null)
    setBuscar("")
    const res = await fetchConfigData("productos", selectedEmpresaId ?? undefined)
    if (res.success) {
      // Solo productos "padre": una talla no se reparte a su vez en tallas.
      setProductos(
        (res.data ?? []).filter((p: any) => !p.producto_padre_id).map((p: any) => ({
          id: Number(p.id),
          nombre: p.nombre,
          codigo: p.codigo,
          es_tallado: p.es_tallado,
          producto_padre_id: p.producto_padre_id,
        })),
      )
    }
  }, [selectedEmpresaId])

  const filtrados = productos
    .filter((p) => {
      const t = buscar.trim().toLowerCase()
      return !t || p.nombre.toLowerCase().includes(t) || String(p.codigo ?? "").toLowerCase().includes(t)
    })
    .slice(0, 100)

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
      <div className="flex justify-end gap-2 p-4">
        {usaTallaje && (
          <Button onClick={abrirSelector} variant="outline" size="sm">
            <Ruler className="mr-2 h-4 w-4" />
            Repartir en tallas
          </Button>
        )}
        <Button onClick={() => setIsCategoriesOpen(true)} variant="outline" size="sm">
          <Tag className="mr-2 h-4 w-4" />
          Gestionar Categorías
        </Button>
      </div>

      {/* Products CRUD Table */}
      <GenericCrudTable key={tablaKey} moduleDef={configModules.productos} />

      {/* Elegir que producto repartir */}
      <Dialog open={tallajeOpen && !elegido} onOpenChange={(o) => !o && setTallajeOpen(false)}>
        <DialogContent className="flex max-h-[85vh] max-w-lg flex-col overflow-hidden">
          <DialogHeader>
            <DialogTitle>¿Qué producto vas a repartir?</DialogTitle>
          </DialogHeader>
          <div className="relative">
            <Search className="absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Buscar por nombre o código…"
              value={buscar}
              onChange={(e) => setBuscar(e.target.value)}
              className="h-9 pl-7 text-sm"
            />
          </div>
          <div className="min-h-0 flex-1 divide-y overflow-y-auto rounded border">
            {filtrados.length === 0 ? (
              <p className="p-4 text-center text-xs text-muted-foreground">
                No hay productos que coincidan.
              </p>
            ) : (
              filtrados.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => setElegido(p)}
                  className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-muted/50"
                >
                  <span className="min-w-0 flex-1 truncate">{p.nombre}</span>
                  {p.es_tallado && (
                    <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 text-[10px]">
                      tallado
                    </span>
                  )}
                  <span className="shrink-0 font-mono text-[10px] opacity-60">{p.codigo}</span>
                </button>
              ))
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* El reparto */}
      {elegido && (
        <TallajeProducto
          producto={elegido}
          abierto
          onCerrar={() => {
            setElegido(null)
            setTallajeOpen(false)
          }}
          onHecho={() => setTablaKey((k) => k + 1)}
        />
      )}

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
