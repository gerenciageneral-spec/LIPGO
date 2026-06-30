"use client"

// Repositorio documental del SIG, organizado POR NORMA. Una pestana por norma
// (ISO 9001 / 14001 / 45001) que lista los documentos reales (sig_documentos)
// vinculados a esa norma en la matriz, con los numerales que cubre cada uno.
// Asi, todo lo que se vincula a una norma queda trazable y filtrable aqui.

import { useEffect, useMemo, useState } from "react"
import { useAuth } from "@/components/auth-provider"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { useToast } from "@/hooks/use-toast"
import { SST_TOKENS } from "@/components/sst/sst-utils"
import { SigHeader } from "@/components/sst/sig-ui"
import { SoportesDocumentales } from "@/components/sst/soportes-documentales"
import {
  getNormas,
  getDocumentosPorNorma,
  getVersionesDocumento,
  registrarCambioDocumento,
} from "@/lib/sig-actions"
import type { SigNorma, SigDocumento, SigDocVersion, SigTipoCambio } from "@/lib/sig-types"
import { Loader2, Search, FileText, FolderArchive, History, Plus } from "lucide-react"

interface Props {
  selectedEmpresaId?: number | null
}

const NORMA_MODULO: Record<string, string> = {
  ISO9001: "SIG · ISO 9001",
  ISO14001: "SIG · ISO 14001",
  ISO45001: "SIG · ISO 45001",
}

type DocItem = { documento: SigDocumento; numerales: string[] }

export function RepositorioSIG({ selectedEmpresaId: propEmpresaId }: Props) {
  const { selectedEmpresaId: ctxEmpresaId, selectedEmpresaNombre } = useAuth()
  const empresaId = propEmpresaId ?? ctxEmpresaId
  const { toast } = useToast()

  const [normas, setNormas] = useState<SigNorma[]>([])
  const [permitidas, setPermitidas] = useState<string[] | null>(null)
  const [loading, setLoading] = useState(true)
  const [porNorma, setPorNorma] = useState<Record<string, DocItem[]>>({})
  const [q, setQ] = useState("")

  // Cargar catalogo de normas + permisos por norma.
  useEffect(() => {
    let active = true
    getNormas().then(async (res) => {
      if (!active) return
      const ns = res.success ? res.data : []
      setNormas(ns)
      // permisos por norma
      const perm = await Promise.all(
        ns.map(async (n) => {
          const m = NORMA_MODULO[n.codigo]
          if (!m) return n.codigo
          try {
            const r = await fetch("/api/check-permission", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ moduleName: m }),
            })
            const d = await r.json()
            return d?.hasPermission ? n.codigo : null
          } catch {
            return null
          }
        }),
      )
      if (active) setPermitidas(perm.filter(Boolean) as string[])
    })
    return () => {
      active = false
    }
  }, [])

  // Cargar documentos de cada norma visible.
  useEffect(() => {
    if (permitidas == null) return
    const visibles = normas.filter((n) => permitidas.includes(n.codigo))
    if (!visibles.length) {
      setLoading(false)
      return
    }
    let active = true
    setLoading(true)
    Promise.all(visibles.map((n) => getDocumentosPorNorma(n.codigo, empresaId).then((r) => [n.codigo, r] as const)))
      .then((pairs) => {
        if (!active) return
        const map: Record<string, DocItem[]> = {}
        for (const [codigo, r] of pairs) {
          if (r.success) map[codigo] = r.data
          else toast({ title: `No se pudo cargar ${codigo}`, description: r.error })
        }
        setPorNorma(map)
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [permitidas, normas, empresaId])

  const visibles = useMemo(
    () => normas.filter((n) => permitidas?.includes(n.codigo)),
    [normas, permitidas],
  )

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="h-6 w-6 animate-spin" style={{ color: SST_TOKENS.navy }} />
      </div>
    )
  }

  return (
    <div className="space-y-5">
      <SigHeader
        Icon={FolderArchive}
        title="Repositorio Documental por Norma"
        subtitle={<>Documentos del SIG trazados por norma{selectedEmpresaNombre ? ` — ${selectedEmpresaNombre}` : ""}</>}
      />

      <div className="relative max-w-sm">
        <Search className="absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Buscar por código, nombre, proceso o numeral…"
          className="pl-8"
        />
      </div>

      {visibles.length === 0 ? (
        <Card className="p-6 text-center text-sm text-muted-foreground">
          No tienes permiso para ver ninguna norma del SIG, o aún no hay normas configuradas.
        </Card>
      ) : (
        <Tabs defaultValue={visibles[0].codigo}>
          <TabsList className="flex-wrap">
            {visibles.map((n) => (
              <TabsTrigger key={n.id} value={n.codigo}>
                {n.nombre} ({(porNorma[n.codigo] ?? []).length})
              </TabsTrigger>
            ))}
          </TabsList>
          {visibles.map((n) => (
            <TabsContent key={n.id} value={n.codigo} className="mt-3">
              <ListaDocs
                items={porNorma[n.codigo] ?? []}
                filtro={q}
                color={n.color ?? SST_TOKENS.navy}
                empresaId={empresaId}
                normaCodigo={n.codigo}
                normaNombre={n.nombre}
              />
            </TabsContent>
          ))}
        </Tabs>
      )}
    </div>
  )
}

function ListaDocs({
  items,
  filtro,
  color,
  empresaId,
  normaCodigo,
  normaNombre,
}: {
  items: DocItem[]
  filtro: string
  color: string
  empresaId?: number | null
  normaCodigo: string
  normaNombre: string
}) {
  const [sel, setSel] = useState<DocItem | null>(null)
  const f = filtro.trim().toLowerCase()
  const filtrados = useMemo(() => {
    if (!f) return items
    return items.filter((it) => {
      const d = it.documento
      const hay = `${d.codigo ?? ""} ${d.nombre ?? ""} ${d.proceso ?? ""} ${it.numerales.join(" ")}`.toLowerCase()
      return hay.includes(f)
    })
  }, [items, f])

  if (items.length === 0) {
    return (
      <Card className="p-6 text-center text-sm text-muted-foreground">
        Aún no hay documentos vinculados a esta norma. Vincúlalos desde la Matriz Integrada.
      </Card>
    )
  }

  return (
    <>
    <Card className="overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-left" style={{ background: `${color}12` }}>
              <th className="px-3 py-2 font-semibold">Código</th>
              <th className="px-3 py-2 font-semibold">Documento</th>
              <th className="px-3 py-2 font-semibold">Proceso</th>
              <th className="px-3 py-2 font-semibold">Numerales que cubre</th>
            </tr>
          </thead>
          <tbody>
            {filtrados.map((it) => (
              <tr
                key={it.documento.id}
                className="cursor-pointer border-b hover:bg-muted/40"
                onClick={() => setSel(it)}
                title="Ver ficha del documento"
              >
                <td className="px-3 py-2 font-mono text-xs whitespace-nowrap">{it.documento.codigo}</td>
                <td className="px-3 py-2">
                  <span className="flex items-center gap-1.5">
                    <FileText className="h-3.5 w-3.5 shrink-0" style={{ color }} />
                    {it.documento.nombre}
                  </span>
                </td>
                <td className="px-3 py-2 text-muted-foreground">{it.documento.proceso ?? "-"}</td>
                <td className="px-3 py-2">
                  <span className="flex flex-wrap gap-1">
                    {it.numerales.map((num) => (
                      <Badge key={num} variant="outline" className="font-mono text-[10px]">
                        {num}
                      </Badge>
                    ))}
                  </span>
                </td>
              </tr>
            ))}
            {filtrados.length === 0 && (
              <tr>
                <td colSpan={4} className="px-3 py-6 text-center text-muted-foreground">
                  Sin resultados para “{filtro}”.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <div className="border-t px-3 py-2 text-xs text-muted-foreground">
        {filtrados.length} de {items.length} documentos
      </div>
    </Card>

    <Dialog open={!!sel} onOpenChange={(o) => !o && setSel(null)}>
      <DialogContent className="max-w-lg">
        {sel && (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-base">
                <FileText className="h-4 w-4" style={{ color }} />
                <span className="font-mono text-sm">{sel.documento.codigo}</span>
              </DialogTitle>
            </DialogHeader>
            <p className="text-sm font-medium">{sel.documento.nombre}</p>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div><span className="text-muted-foreground">Proceso:</span> {sel.documento.proceso ?? "-"}</div>
              <div><span className="text-muted-foreground">Versión:</span> {sel.documento.version ?? "-"}</div>
              <div><span className="text-muted-foreground">Estado:</span> {sel.documento.estado ?? "-"}</div>
              <div><span className="text-muted-foreground">Medio:</span> {sel.documento.soporte ?? "-"}</div>
            </div>
            <div>
              <p className="mb-1 text-xs font-semibold" style={{ color: SST_TOKENS.navy }}>
                Numerales que cubre en {normaNombre}
              </p>
              <span className="flex flex-wrap gap-1">
                {sel.numerales.map((num) => (
                  <Badge key={num} variant="outline" className="font-mono text-[10px]">{num}</Badge>
                ))}
              </span>
            </div>
            <div className="rounded-md border p-3">
              <p className="mb-2 text-xs font-semibold" style={{ color: SST_TOKENS.navy }}>
                Archivo del documento (para consulta)
              </p>
              <SoportesDocumentales
                norma={normaCodigo}
                modulo="Repositorio SIG"
                referenciaTipo="sig_documento"
                referenciaId={sel.documento.codigo ?? sel.documento.id}
                referenciaDesc={sel.documento.nombre}
                empresaId={empresaId}
              />
            </div>
            <ControlCambios documento={sel.documento} empresaId={empresaId} />
          </>
        )}
      </DialogContent>
    </Dialog>
    </>
  )
}

// ---------------------------------------------------------------------------
// Control de cambios documentales (bitácora de versiones, ISO 7.5.3)
// ---------------------------------------------------------------------------

const TIPO_CAMBIO: { value: SigTipoCambio; label: string }[] = [
  { value: "creacion", label: "Creación" },
  { value: "modificacion", label: "Modificación" },
  { value: "anulacion", label: "Anulación" },
]

function ControlCambios({ documento, empresaId }: { documento: SigDocumento; empresaId?: number | null }) {
  const { toast } = useToast()
  const [versiones, setVersiones] = useState<SigDocVersion[]>([])
  const [loading, setLoading] = useState(true)
  const [abrirForm, setAbrirForm] = useState(false)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({
    version: "",
    tipo: "modificacion" as SigTipoCambio,
    motivo: "",
    descripcion: "",
    responsable: "",
  })

  async function cargar() {
    setLoading(true)
    const res = await getVersionesDocumento(documento.id)
    setVersiones(res.success ? res.data : [])
    setLoading(false)
  }
  useEffect(() => {
    cargar()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [documento.id])

  async function guardar() {
    if (!form.version.trim()) {
      toast({ title: "Falta la versión", description: "Indica la versión resultante (ej. 02)." })
      return
    }
    setSaving(true)
    const versionAnterior = versiones[0]?.version ?? documento.version ?? null
    const res = await registrarCambioDocumento(
      {
        documentoId: documento.id,
        documentoCodigo: documento.codigo,
        version: form.version,
        versionAnterior,
        tipo: form.tipo,
        motivo: form.motivo || null,
        descripcionCambio: form.descripcion || null,
        responsable: form.responsable || null,
      },
      empresaId,
    )
    setSaving(false)
    if (res.success) {
      toast({ title: "Cambio registrado", description: `Versión ${form.version} en bitácora.` })
      setForm({ version: "", tipo: "modificacion", motivo: "", descripcion: "", responsable: "" })
      setAbrirForm(false)
      cargar()
    } else {
      toast({ title: "No se pudo registrar", description: res.error })
    }
  }

  return (
    <div className="rounded-md border p-3">
      <div className="mb-2 flex items-center justify-between">
        <p className="flex items-center gap-1 text-xs font-semibold" style={{ color: SST_TOKENS.navy }}>
          <History className="h-3.5 w-3.5" />
          Control de cambios (versiones)
        </p>
        <Button size="sm" variant="outline" className="h-7 px-2 text-xs" onClick={() => setAbrirForm((v) => !v)}>
          <Plus className="mr-1 h-3 w-3" />
          Registrar cambio
        </Button>
      </div>

      {abrirForm && (
        <div className="mb-3 space-y-2 rounded-md bg-muted/40 p-2">
          <div className="flex gap-2">
            <Input
              value={form.version}
              onChange={(e) => setForm({ ...form, version: e.target.value })}
              placeholder="Versión (ej. 02)"
              className="h-8 text-xs"
            />
            <select
              value={form.tipo}
              onChange={(e) => setForm({ ...form, tipo: e.target.value as SigTipoCambio })}
              className="h-8 rounded-md border bg-background px-2 text-xs"
            >
              {TIPO_CAMBIO.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
          </div>
          <Input
            value={form.motivo}
            onChange={(e) => setForm({ ...form, motivo: e.target.value })}
            placeholder="Motivo del cambio"
            className="h-8 text-xs"
          />
          <Textarea
            value={form.descripcion}
            onChange={(e) => setForm({ ...form, descripcion: e.target.value })}
            placeholder="Descripción de qué cambió"
            className="min-h-[48px] text-xs"
          />
          <Input
            value={form.responsable}
            onChange={(e) => setForm({ ...form, responsable: e.target.value })}
            placeholder="Responsable"
            className="h-8 text-xs"
          />
          <Button size="sm" className="h-7 w-full text-xs" disabled={saving} onClick={guardar}>
            {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : "Guardar en bitácora"}
          </Button>
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-3">
          <Loader2 className="h-4 w-4 animate-spin" />
        </div>
      ) : versiones.length === 0 ? (
        <p className="text-xs text-muted-foreground">Sin cambios registrados aún.</p>
      ) : (
        <ul className="space-y-1.5">
          {versiones.map((v) => (
            <li key={v.id} className="rounded border px-2 py-1.5 text-xs">
              <div className="flex items-center justify-between">
                <span className="font-semibold">
                  v{v.version}
                  {v.version_anterior ? ` (antes v${v.version_anterior})` : ""} ·{" "}
                  <span className="capitalize">{v.tipo}</span>
                </span>
                <span className="text-muted-foreground">{v.fecha ?? ""}</span>
              </div>
              {v.motivo && <p className="text-muted-foreground">Motivo: {v.motivo}</p>}
              {v.descripcion_cambio && <p className="text-muted-foreground">{v.descripcion_cambio}</p>}
              {v.responsable && <p className="text-[11px] text-muted-foreground">Responsable: {v.responsable}</p>}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
