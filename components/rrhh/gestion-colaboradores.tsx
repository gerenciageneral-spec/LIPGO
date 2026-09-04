"use client"

import type React from "react"
import { useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { DatePickerField } from "@/components/ui/date-picker-field"
import { Label } from "@/components/ui/label"
import { Checkbox } from "@/components/ui/checkbox"
import { Separator } from "@/components/ui/separator"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { useToast } from "@/hooks/use-toast"
import {
  getColaboradoresTH,
  createColaboradorTH,
  updateColaboradorTH,
  deleteColaboradorTH,
} from "@/lib/rrhh-actions"
import { useAuth } from "@/components/auth-provider"
import { Trash2, Edit2, Plus, User, FileText } from "lucide-react"

// Estado del formulario: todo como string salvo los dos campos booleanos.
type FormState = {
  // Parte 1 - Hoja de vida
  primer_nombre: string
  segundo_nombre: string
  primer_apellido: string
  segundo_apellido: string
  tipo_documento: string
  numero_documento: string
  centro_costos: string
  correo_electronico: string
  numero_celular: string
  pais_residencia: string
  departamento_residencia: string
  ciudad_residencia: string
  direccion_residencia: string
  metodo_pago: string
  entidad_bancaria: string
  tipo_cuenta: string
  numero_cuenta: string
  numero_telefono_celular: string
  direccion_oficina: string
  pais_oficina: string
  departamento_oficina: string
  ciudad_oficina: string
  // Parte 2 - Informacion del contrato
  nombre_empleado: string
  numero_identificacion: string
  tipo_contrato: string
  fecha_inicio_contrato: string
  fecha_fin_contrato: string
  sueldo: string
  salario_integral: boolean
  numero_contrato: string
  grupo_nomina: string
  cargo: string
  centro_costo: string
  tipo_cotizante: string
  subtipo_cotizante: string
  fondo_salud: string
  porcentaje_salud: string
  fondo_pension: string
  porcentaje_pension: string
  fondo_arl: string
  clase_riesgo: string
  codigo_ciiu: string
  codigo: string
  caja_compensacion: string
  fondo_cesantias: string
  deduccion_vivienda: string
  deduccion_medicina_prepagada: string
  aportes_voluntarios_pension_obligatoria: string
  aporte_voluntario_pension_renta_exenta: string
  aporte_voluntario_afc: string
  aplica_deduccion_dependientes: boolean
}

const EMPTY_FORM: FormState = {
  primer_nombre: "",
  segundo_nombre: "",
  primer_apellido: "",
  segundo_apellido: "",
  tipo_documento: "",
  numero_documento: "",
  centro_costos: "",
  correo_electronico: "",
  numero_celular: "",
  pais_residencia: "",
  departamento_residencia: "",
  ciudad_residencia: "",
  direccion_residencia: "",
  metodo_pago: "",
  entidad_bancaria: "",
  tipo_cuenta: "",
  numero_cuenta: "",
  numero_telefono_celular: "",
  direccion_oficina: "",
  pais_oficina: "",
  departamento_oficina: "",
  ciudad_oficina: "",
  nombre_empleado: "",
  numero_identificacion: "",
  tipo_contrato: "",
  fecha_inicio_contrato: "",
  fecha_fin_contrato: "",
  sueldo: "",
  salario_integral: false,
  numero_contrato: "",
  grupo_nomina: "",
  cargo: "",
  centro_costo: "",
  tipo_cotizante: "",
  subtipo_cotizante: "",
  fondo_salud: "",
  porcentaje_salud: "",
  fondo_pension: "",
  porcentaje_pension: "",
  fondo_arl: "",
  clase_riesgo: "",
  codigo_ciiu: "",
  codigo: "",
  caja_compensacion: "",
  fondo_cesantias: "",
  deduccion_vivienda: "",
  deduccion_medicina_prepagada: "",
  aportes_voluntarios_pension_obligatoria: "",
  aporte_voluntario_pension_renta_exenta: "",
  aporte_voluntario_afc: "",
  aplica_deduccion_dependientes: false,
}

const TIPOS_DOCUMENTO = ["CC", "CE", "TI", "PA", "PEP", "NIT"]
const METODOS_PAGO = ["Transferencia", "Efectivo", "Cheque"]
const TIPOS_CUENTA = ["Ahorros", "Corriente"]
const TIPOS_CONTRATO = [
  "Término fijo",
  "Término indefinido",
  "Obra o labor",
  "Prestación de servicios",
  "Aprendizaje",
]

// Catalogos compartidos para los desplegables del formulario.
const GRUPOS_NOMINA = [
  "1 - Administración",
  "3 - Producción",
  "4 - H. La Insuperable",
  "5 - Postobon Cucuta",
  "6 - H. Indupan",
  "7 - Cedi Funza",
  "8 - Cedi Medellin",
]

const CARGOS = [
  "Analista",
  "Analista Contable",
  "Aprendiz Sena",
  "Asesor Comercial",
  "Asesor de Servicio al Cliente",
  "Asesor Operativo",
  "Asistente de Recursos Humanos",
  "Auditor Interno",
  "Auxiliar Administrativo",
  "Auxiliar Contable",
  "Auxiliar de Cartera",
  "Auxiliar de Servicios Generales",
  "Auxiliar Logistico",
  "Contador",
  "Coordinador",
  "Coordinador Comercial",
  "Coordinador de Recursos Humanos",
  "Coordinador de Servicio al Cliente",
  "Coordinador Junior",
  "COORDINADOR SST",
  "COORDINADORA SST",
  "Director Administrativo",
  "Diseñador Gráfico",
  "Gerente Administrativo y Financiero",
  "Gerente Comercial",
  "Gerente de Operaciones y Logistica",
  "Gerente de Recursos Humanos",
  "Gerente de Servicio al Cliente",
  "Gerente de Tecnología",
  "Gerente General",
  "Ingeniero",
  "Ingeniero Especialista",
  "Investigador",
  "Jefe de Cartera",
  "Jefe de Mercadeo",
  "Jefe de Servicio al Cliente",
  "Jefe de Tecnología",
  "Jefe de Ventas",
  "Lider de Operaciones",
  "MONTACARGUISTA",
  "Otros 58",
  "Otros 82",
  "Otros 83",
  "Otros 85",
  "Otros 86",
  "Recepcionista",
  "Secretaria",
  "Soporte Administrativo y Operaciones",
  "Técnico 70",
  "Técnico 84",
  "Telemercadeo",
  "Tesorero",
  "Vigilantea",
]

const CENTROS_COSTOS = [
  "1 - 1 LiP Progressive Integral Logistics",
  "2 - 3 Estibas Agrifeed",
  "2 - 4 Estibas Indupan",
  "2 - 1 Estibas La Insuperable",
  "2 - 2 Estibas Molinos del Atlantico",
  "3 - 1 Dotación Industrial y EPPs",
  "4 - 1 Alquiler de Montacargas",
  "4 - 2 Suministros Montacargas",
  "5 - 4 Desc. Nac. La Insuperable",
  "5 - 5 Desc. Nac. Molinos",
  "5 - 1 Harinera Indupan Bta",
  "5 - 2 Harinera Indupan Funza",
  "5 - 3 La Insuperable Bquilla",
  "5 - 6 Molinos Medellin",
  "5 - 8 Postobon Cucuta",
  "5 - 7 Precocidos Bogotá",
  "6 - 1 Dem. La Insuperable",
  "7 - 1 General",
]

const EPS_LIST = [
  "A.I.C.",
  "Aliansalud",
  "Ambuq Ars",
  "Anas Wayuu",
  "Ars Convida",
  "Asmet Salud",
  "Capital Salud Eps",
  "Capresoca",
  "Ccf De La Guajira",
  "Ccf De Nariño",
  "Comfacor",
  "Comfacundi",
  "Comfamiliar Chocó",
  "Comfamiliar Huila",
  "Comfaoriente",
  "Comfenalco Valle",
  "Comparta",
  "Coomeva",
  "Coosalud",
  "Cruz Blanca Eps",
  "cuantias menores",
  "Dusakawi",
  "Ecoopsos",
  "Emdisalud",
  "Empresas Públicas de Medellín Departamento Médico",
  "Emssanar",
  "EPS Familiar de Colombia S.A.S.",
  "Eps Famisanar",
  "EPS Sura",
  "Fondo de pasivo social de ferrocarriles nacionales de colombia",
  "Fosyga",
  "Fosyga Residente Exterior o Régimen Subsidiado",
  "Mallamas",
  "Medimás",
  "Medimás Movilidad",
  "Mutual Ser",
  "Nueva Eps",
  "Pijaosalud",
  "PROTEGER EPS S.A.S.",
  "Salud MIA EPS",
  "Salud Total Eps",
  "Saludvida",
  "Saludvida S.A. EPS Moviilidad",
  "Sanitas",
  "Savia Salud",
  "Servicio Occidental De Salud",
  "Universidad de Antioquia",
  "Universidad de Cartagena",
  "Universidad de Córdoba",
  "Universidad de Nariño",
  "Universidad del Atlántico",
  "Universidad del Cauca",
  "Universidad del Valle",
  "Universidad Industrial de Santander",
  "Universidad Nacional de Colombia",
  "Universidad Pedagógica - UPTC",
]

const PENSION_LIST = [
  "Caxdac",
  "Colfondos",
  "Colpensiones",
  "Fonprecon",
  "Old Mutual",
  "Old Mutual Alternativo",
  "Pensiones de Antioquia",
  "Porvenir S.A",
  "Positiva Compañía de Seguros",
  "Protección S.A",
]

const ARL_LIST = [
  "Alfa",
  "Colmena",
  "Colpatria ARP",
  "Compañía De Seguros Colsanitas S.A.",
  "La Equidad Seguros",
  "Liberty",
  "Mapfre Colombia Vida Seguros S.A.",
  "Positiva Compañía de Seguros",
  "Seguros Bolívar",
  "Seguros de riesgos laborales suramericana S.A.",
  "Seguros de Vida Aurora",
  "SEGUROS DE VIDA SURAMERICANA",
]

const CAJAS_COMPENSACION = [
  "Cafaba",
  "Cafam",
  "Cafamaz",
  "Cafasur",
  "Cajamag",
  "Cajasai",
  "Cajasan",
  "Ccf De La Guajira",
  "Ccf De Nariño",
  "Cofrem",
  "Colsubsidio",
  "Combarranquilla",
  "Comcaja",
  "Comfaboy",
  "Comfaca",
  "Comfacasanare",
  "Comfacauca",
  "Comfacesar",
  "Comfacor",
  "Comfacundi",
  "Comfama",
  "Comfamiliar",
  "Comfamiliar Camacol",
  "Comfamiliar Cartagena",
  "Comfamiliar Chocó",
  "Comfamiliar Huila",
  "Comfamiliar Risaralda",
  "Comfandi",
  "Comfanorte",
  "Comfaoriente",
  "Comfaputumayo",
  "Comfasucre",
  "Comfatolima",
  "Comfenalco",
  "Comfenalco Cartagena",
  "Comfenalco Quindío",
  "Comfenalco Santander",
  "Comfenalco Tolima",
  "Comfenalco Valle",
  "Comfiar",
  "Confamiliares",
  "cuantias menores",
  "PROTEGER EPS S.A.S.",
]

// Campos obligatorios por paso (para validar antes de avanzar/guardar).
const REQUIRED_STEP_1: (keyof FormState)[] = [
  "primer_nombre",
  "primer_apellido",
  "tipo_documento",
  "numero_documento",
  "correo_electronico",
  "numero_celular",
  "pais_residencia",
  "departamento_residencia",
  "ciudad_residencia",
  "direccion_residencia",
  "metodo_pago",
  "direccion_oficina",
  "pais_oficina",
  "departamento_oficina",
  "ciudad_oficina",
]
const REQUIRED_STEP_2: (keyof FormState)[] = [
  "numero_identificacion",
  "tipo_contrato",
  "fecha_inicio_contrato",
  "sueldo",
  "numero_contrato",
  "grupo_nomina",
  "cargo",
  "tipo_cotizante",
  "subtipo_cotizante",
  "fondo_salud",
  "porcentaje_salud",
]

const NUMERIC_FIELDS: (keyof FormState)[] = [
  "sueldo",
  "porcentaje_salud",
  "porcentaje_pension",
  "deduccion_vivienda",
  "deduccion_medicina_prepagada",
  "aportes_voluntarios_pension_obligatoria",
  "aporte_voluntario_pension_renta_exenta",
  "aporte_voluntario_afc",
]

interface ColaboradorRow extends Record<string, any> {
  id: string
}

export default function GestionColaboradores() {
  const { selectedEmpresaId } = useAuth()
  const [colaboradores, setColaboradores] = useState<ColaboradorRow[]>([])
  const [loading, setLoading] = useState(true)
  const [open, setOpen] = useState(false)
  const [step, setStep] = useState<1 | 2>(1)
  const [saving, setSaving] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState<FormState>(EMPTY_FORM)
  const { toast } = useToast()

  const setField = (key: keyof FormState, value: string | boolean) =>
    setForm((prev) => ({ ...prev, [key]: value }))

  const loadColaboradores = async () => {
    setLoading(true)
    const result = await getColaboradoresTH(selectedEmpresaId ?? undefined)
    if (result.success) {
      setColaboradores(result.data as ColaboradorRow[])
    } else {
      toast({ title: "Error", description: "Error al cargar colaboradores", variant: "destructive" })
    }
    setLoading(false)
  }

  useEffect(() => {
    loadColaboradores()
  }, [selectedEmpresaId])

  const validateStep = (s: 1 | 2): boolean => {
    const required = s === 1 ? REQUIRED_STEP_1 : REQUIRED_STEP_2
    const faltantes = required.filter((k) => !String(form[k] ?? "").trim())
    if (faltantes.length > 0) {
      toast({
        title: "Faltan campos obligatorios",
        description: "Complete todos los campos marcados con *.",
        variant: "destructive",
      })
      return false
    }
    return true
  }

  const handleNext = () => {
    if (validateStep(1)) setStep(2)
  }

  const buildPayload = () => {
    const payload: Record<string, any> = { ...form }
    // Convertir numericos: "" -> null, resto -> Number.
    for (const key of NUMERIC_FIELDS) {
      const raw = String(form[key] ?? "").trim()
      payload[key] = raw === "" ? null : Number(raw)
    }
    // Fechas vacias -> null.
    if (!String(form.fecha_fin_contrato).trim()) payload.fecha_fin_contrato = null
    return payload
  }

  // Solo previene el envio implicito del formulario (p. ej. al presionar Enter).
  // El guardado se hace exclusivamente desde el boton de accion (handleSave).
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
  }

  const handleSave = async () => {
    if (!validateStep(1)) {
      setStep(1)
      return
    }
    if (!validateStep(2)) return

    setSaving(true)
    const payload = buildPayload()
    const result = editingId
      ? await updateColaboradorTH(editingId, payload)
      : await createColaboradorTH(payload, selectedEmpresaId ?? undefined)
    setSaving(false)

    if (result.success) {
      toast({ title: "Éxito", description: editingId ? "Colaborador actualizado" : "Colaborador creado" })
      await loadColaboradores()
      handleOpenChange(false)
    } else {
      toast({ title: "Error", description: result.message, variant: "destructive" })
    }
  }

  const handleEdit = (row: ColaboradorRow) => {
    const next: FormState = { ...EMPTY_FORM }
    for (const key of Object.keys(EMPTY_FORM) as (keyof FormState)[]) {
      const value = row[key]
      if (key === "salario_integral" || key === "aplica_deduccion_dependientes") {
        ;(next[key] as boolean) = Boolean(value)
      } else {
        ;(next[key] as string) = value == null ? "" : String(value)
      }
    }
    setForm(next)
    setEditingId(row.id)
    setStep(1)
    setOpen(true)
  }

  const handleDelete = async (id: string) => {
    if (!confirm("¿Está seguro de que desea eliminar este colaborador?")) return
    const result = await deleteColaboradorTH(id)
    if (result.success) {
      toast({ title: "Éxito", description: "Colaborador eliminado" })
      loadColaboradores()
    } else {
      toast({ title: "Error", description: result.message, variant: "destructive" })
    }
  }

  const handleOpenChange = (newOpen: boolean) => {
    if (!newOpen) {
      setForm(EMPTY_FORM)
      setEditingId(null)
      setStep(1)
    }
    setOpen(newOpen)
  }

  const nombreCompleto = (r: ColaboradorRow) =>
    [r.primer_nombre, r.segundo_nombre, r.primer_apellido, r.segundo_apellido].filter(Boolean).join(" ")

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold text-balance">Gestión de Colaboradores</h2>
        <Dialog open={open} onOpenChange={handleOpenChange}>
          <DialogTrigger asChild>
            <Button className="gap-2">
              <Plus className="w-4 h-4" />
              Nuevo Colaborador
            </Button>
          </DialogTrigger>
          <DialogContent
            className="max-w-3xl max-h-[90vh] overflow-y-auto"
            // Evita que el dialogo se cierre al interactuar con los Select
            // (portales de Radix): el pointer event se interpretaba como "clic
            // fuera" y cerraba la ventana, sobre todo al avanzar al paso 2.
            onInteractOutside={(e) => e.preventDefault()}
            onPointerDownOutside={(e) => e.preventDefault()}
          >
            <DialogHeader>
              <DialogTitle>{editingId ? "Editar Colaborador" : "Nuevo Colaborador"}</DialogTitle>
              <DialogDescription>
                {step === 1
                  ? "Parte 1 de 2 — Hoja de vida"
                  : "Parte 2 de 2 — Información del contrato"}
              </DialogDescription>
            </DialogHeader>

            {/* Indicador de pasos */}
            <div className="flex items-center gap-2 text-sm">
              <span
                className={`flex items-center gap-1.5 rounded-full px-3 py-1 ${
                  step === 1 ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
                }`}
              >
                <User className="h-3.5 w-3.5" /> Hoja de vida
              </span>
              <div className="h-px flex-1 bg-border" />
              <span
                className={`flex items-center gap-1.5 rounded-full px-3 py-1 ${
                  step === 2 ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
                }`}
              >
                <FileText className="h-3.5 w-3.5" /> Contrato
              </span>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              {step === 1 ? (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <FieldInput label="Primer nombre" required value={form.primer_nombre} onChange={(v) => setField("primer_nombre", v)} />
                  <FieldInput label="Segundo nombre" value={form.segundo_nombre} onChange={(v) => setField("segundo_nombre", v)} />
                  <FieldInput label="Primer apellido" required value={form.primer_apellido} onChange={(v) => setField("primer_apellido", v)} />
                  <FieldInput label="Segundo apellido" value={form.segundo_apellido} onChange={(v) => setField("segundo_apellido", v)} />
                  <FieldSelect label="Tipo de documento" required value={form.tipo_documento} options={TIPOS_DOCUMENTO} onChange={(v) => setField("tipo_documento", v)} />
                  <FieldInput label="Número de documento" required value={form.numero_documento} onChange={(v) => setField("numero_documento", v)} />
                  <FieldSelect label="Centro de Costos" value={form.centro_costos} options={CENTROS_COSTOS} onChange={(v) => setField("centro_costos", v)} />
                  <FieldInput label="Correo electrónico" required type="email" value={form.correo_electronico} onChange={(v) => setField("correo_electronico", v)} />
                  <FieldInput label="Número de celular" required value={form.numero_celular} onChange={(v) => setField("numero_celular", v)} />
                  <FieldInput label="Número de teléfono celular" value={form.numero_telefono_celular} onChange={(v) => setField("numero_telefono_celular", v)} />

                  <div className="md:col-span-2">
                    <Separator className="my-1" />
                    <p className="text-sm font-medium text-muted-foreground">Residencia</p>
                  </div>
                  <FieldInput label="País de residencia" required value={form.pais_residencia} onChange={(v) => setField("pais_residencia", v)} />
                  <FieldInput label="Departamento de residencia" required value={form.departamento_residencia} onChange={(v) => setField("departamento_residencia", v)} />
                  <FieldInput label="Ciudad de residencia" required value={form.ciudad_residencia} onChange={(v) => setField("ciudad_residencia", v)} />
                  <FieldInput label="Dirección de residencia" required value={form.direccion_residencia} onChange={(v) => setField("direccion_residencia", v)} />

                  <div className="md:col-span-2">
                    <Separator className="my-1" />
                    <p className="text-sm font-medium text-muted-foreground">Oficina</p>
                  </div>
                  <FieldInput label="Dirección de oficina" required value={form.direccion_oficina} onChange={(v) => setField("direccion_oficina", v)} />
                  <FieldInput label="País de oficina" required value={form.pais_oficina} onChange={(v) => setField("pais_oficina", v)} />
                  <FieldInput label="Departamento de oficina" required value={form.departamento_oficina} onChange={(v) => setField("departamento_oficina", v)} />
                  <FieldInput label="Ciudad de oficina" required value={form.ciudad_oficina} onChange={(v) => setField("ciudad_oficina", v)} />

                  <div className="md:col-span-2">
                    <Separator className="my-1" />
                    <p className="text-sm font-medium text-muted-foreground">Pago</p>
                  </div>
                  <FieldSelect label="Método de pago" required value={form.metodo_pago} options={METODOS_PAGO} onChange={(v) => setField("metodo_pago", v)} />
                  <FieldInput label="Entidad Bancaria" value={form.entidad_bancaria} onChange={(v) => setField("entidad_bancaria", v)} />
                  <FieldSelect label="Tipo de cuenta" value={form.tipo_cuenta} options={TIPOS_CUENTA} onChange={(v) => setField("tipo_cuenta", v)} />
                  <FieldInput label="Número de cuenta" value={form.numero_cuenta} onChange={(v) => setField("numero_cuenta", v)} />
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <FieldInput label="Nombre del empleado" value={form.nombre_empleado} onChange={(v) => setField("nombre_empleado", v)} />
                  <FieldInput label="Número de identificación" required value={form.numero_identificacion} onChange={(v) => setField("numero_identificacion", v)} />
                  <FieldSelect label="Tipo de contrato" required value={form.tipo_contrato} options={TIPOS_CONTRATO} onChange={(v) => setField("tipo_contrato", v)} />
                  <FieldInput label="Número de contrato" required value={form.numero_contrato} onChange={(v) => setField("numero_contrato", v)} />
                  <FieldInput label="Fecha inicio de contrato" required type="date" value={form.fecha_inicio_contrato} onChange={(v) => setField("fecha_inicio_contrato", v)} />
                  <FieldInput label="Fecha fin de contrato" type="date" value={form.fecha_fin_contrato} onChange={(v) => setField("fecha_fin_contrato", v)} />
                  <FieldInput label="Sueldo" required type="number" value={form.sueldo} onChange={(v) => setField("sueldo", v)} />
                  <FieldSelect label="Grupo de nómina" required value={form.grupo_nomina} options={GRUPOS_NOMINA} onChange={(v) => setField("grupo_nomina", v)} />
                  <FieldSelect label="Cargo" required value={form.cargo} options={CARGOS} onChange={(v) => setField("cargo", v)} />
                  <FieldSelect label="Centro de costo" value={form.centro_costo} options={CENTROS_COSTOS} onChange={(v) => setField("centro_costo", v)} />
                  <div className="flex items-center gap-2 pt-6">
                    <Checkbox
                      id="salario_integral"
                      checked={form.salario_integral}
                      onCheckedChange={(c) => setField("salario_integral", Boolean(c))}
                    />
                    <Label htmlFor="salario_integral">Salario integral</Label>
                  </div>

                  <div className="md:col-span-2">
                    <Separator className="my-1" />
                    <p className="text-sm font-medium text-muted-foreground">Seguridad social</p>
                  </div>
                  <FieldInput label="Tipo de cotizante" required value={form.tipo_cotizante} onChange={(v) => setField("tipo_cotizante", v)} />
                  <FieldInput label="Subtipo de Cotizante" required value={form.subtipo_cotizante} onChange={(v) => setField("subtipo_cotizante", v)} />
                  <FieldSelect label="Fondo de salud" required value={form.fondo_salud} options={EPS_LIST} onChange={(v) => setField("fondo_salud", v)} />
                  <FieldInput label="% Salud" required type="number" value={form.porcentaje_salud} onChange={(v) => setField("porcentaje_salud", v)} />
                  <FieldSelect label="Fondo de pensión" value={form.fondo_pension} options={PENSION_LIST} onChange={(v) => setField("fondo_pension", v)} />
                  <FieldInput label="% pensión" type="number" value={form.porcentaje_pension} onChange={(v) => setField("porcentaje_pension", v)} />
                  <FieldSelect label="Fondo ARL" value={form.fondo_arl} options={ARL_LIST} onChange={(v) => setField("fondo_arl", v)} />
                  <FieldInput label="Clase de riesgo" value={form.clase_riesgo} onChange={(v) => setField("clase_riesgo", v)} />
                  <FieldInput label="Código CIIU" value={form.codigo_ciiu} onChange={(v) => setField("codigo_ciiu", v)} />
                  <FieldInput label="Código" value={form.codigo} onChange={(v) => setField("codigo", v)} />
                  <FieldSelect label="Caja de compensación" value={form.caja_compensacion} options={CAJAS_COMPENSACION} onChange={(v) => setField("caja_compensacion", v)} />
                  <FieldInput label="Fondo de cesantías" value={form.fondo_cesantias} onChange={(v) => setField("fondo_cesantias", v)} />

                  <div className="md:col-span-2">
                    <Separator className="my-1" />
                    <p className="text-sm font-medium text-muted-foreground">Deducciones y aportes</p>
                  </div>
                  <FieldInput label="Deducción de vivienda" type="number" value={form.deduccion_vivienda} onChange={(v) => setField("deduccion_vivienda", v)} />
                  <FieldInput label="Deducción medicina prepagada" type="number" value={form.deduccion_medicina_prepagada} onChange={(v) => setField("deduccion_medicina_prepagada", v)} />
                  <FieldInput label="Aportes voluntarios a fondos de pensiones obligatorias" type="number" value={form.aportes_voluntarios_pension_obligatoria} onChange={(v) => setField("aportes_voluntarios_pension_obligatoria", v)} />
                  <FieldInput label="Aporte voluntario de pensión (Renta exenta)" type="number" value={form.aporte_voluntario_pension_renta_exenta} onChange={(v) => setField("aporte_voluntario_pension_renta_exenta", v)} />
                  <FieldInput label="Aporte voluntario AFC" type="number" value={form.aporte_voluntario_afc} onChange={(v) => setField("aporte_voluntario_afc", v)} />
                  <div className="flex items-center gap-2 pt-6">
                    <Checkbox
                      id="aplica_deduccion_dependientes"
                      checked={form.aplica_deduccion_dependientes}
                      onCheckedChange={(c) => setField("aplica_deduccion_dependientes", Boolean(c))}
                    />
                    <Label htmlFor="aplica_deduccion_dependientes">Aplica deducción para dependientes</Label>
                  </div>
                </div>
              )}

              <div className="flex gap-2 justify-between pt-2">
                <Button type="button" variant="outline" onClick={() => handleOpenChange(false)}>
                  Cancelar
                </Button>
                <div className="flex gap-2">
                  {step === 2 && (
                    <Button type="button" variant="outline" onClick={() => setStep(1)}>
                      Atrás
                    </Button>
                  )}
                  {/* Boton de accion unico y estable (siempre type="button").
                      No cambiamos entre button/submit para evitar que, al
                      avanzar de paso, el mismo clic aterrice sobre un boton
                      submit recien montado y dispare el guardado/cierre. */}
                  <Button type="button" disabled={saving} onClick={step === 1 ? handleNext : handleSave}>
                    {step === 1 ? "Siguiente" : saving ? "Guardando..." : editingId ? "Actualizar" : "Crear"}
                  </Button>
                </div>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {loading ? (
        <div className="text-center py-8">Cargando...</div>
      ) : colaboradores.length === 0 ? (
        <div className="text-center py-8 text-muted-foreground">No hay colaboradores registrados</div>
      ) : (
        <div className="border rounded-lg overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nombre</TableHead>
                <TableHead>Documento</TableHead>
                <TableHead>Cargo</TableHead>
                <TableHead>Correo</TableHead>
                <TableHead>Celular</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead className="w-24">Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {colaboradores.map((c) => (
                <TableRow key={c.id}>
                  <TableCell className="font-medium">{nombreCompleto(c)}</TableCell>
                  <TableCell>
                    {c.tipo_documento} {c.numero_documento}
                  </TableCell>
                  <TableCell>{c.cargo || "-"}</TableCell>
                  <TableCell>{c.correo_electronico || "-"}</TableCell>
                  <TableCell>{c.numero_celular || "-"}</TableCell>
                  <TableCell>
                    <span
                      className={`px-2 py-1 rounded-full text-xs font-medium ${
                        c.estado === "activo"
                          ? "bg-green-100 text-green-800"
                          : "bg-red-100 text-red-800"
                      }`}
                    >
                      {c.estado || "activo"}
                    </span>
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-2">
                      <Button variant="outline" size="sm" onClick={() => handleEdit(c)}>
                        <Edit2 className="w-4 h-4" />
                      </Button>
                      <Button variant="destructive" size="sm" onClick={() => handleDelete(c.id)}>
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------
// Subcomponentes de campo reutilizables
// ---------------------------------------------------------------------
function FieldInput({
  label,
  value,
  onChange,
  required = false,
  type = "text",
}: {
  label: string
  value: string
  onChange: (v: string) => void
  required?: boolean
  type?: string
}) {
  return (
    <div className="space-y-1.5">
      <Label>
        {label} {required && <span className="text-destructive">*</span>}
      </Label>
      {type === "date" ? (
        <DatePickerField value={value} onChange={onChange} />
      ) : (
        <Input type={type} value={value} onChange={(e) => onChange(e.target.value)} required={required} />
      )}
    </div>
  )
}

function FieldSelect({
  label,
  value,
  options,
  onChange,
  required = false,
}: {
  label: string
  value: string
  options: string[]
  onChange: (v: string) => void
  required?: boolean
}) {
  // Si el valor guardado no esta en el catalogo (datos previos), lo incluimos
  // para no perderlo al editar.
  const finalOptions = value && !options.includes(value) ? [value, ...options] : options
  return (
    <div className="space-y-1.5">
      <Label>
        {label} {required && <span className="text-destructive">*</span>}
      </Label>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger>
          <SelectValue placeholder="Seleccione..." />
        </SelectTrigger>
        <SelectContent>
          {finalOptions.map((opt) => (
            <SelectItem key={opt} value={opt}>
              {opt}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}
