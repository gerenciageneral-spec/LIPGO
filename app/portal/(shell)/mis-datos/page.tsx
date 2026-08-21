"use client"

// Mis datos — MEDEVAC (SST-FOR-33) + Perfil Sociodemografico (SST-FOR-32).
//
// Es la misma informacion que gestiona SST desde la app interna: los dos lados
// escriben en las mismas tablas y quedan enlazados por el DOCUMENTO del
// trabajador. Aqui el documento NO se pide ni se muestra editable: sale de la
// sesion y el servidor lo impone, para que nadie pueda escribir sobre la ficha
// de otra persona.
//
// Son dos formularios independientes con guardado propio: el de emergencia es
// corto y urgente, el sociodemografico es largo. Obligar a llenar los dos de un
// tiron para poder guardar algo haria que nadie terminara ninguno.

import { useCallback, useEffect, useMemo, useState, useTransition } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Loader2, HeartPulse, ClipboardList, CheckCircle2, Save, Info } from "lucide-react"
import { usePortal } from "@/components/portal/portal-provider"
import { useToast } from "@/hooks/use-toast"
import {
  getMisDatosPortal, guardarMedevacPortal, guardarPerfilPortal,
  type MedevacPortalInput, type PerfilPortalInput,
} from "@/lib/portal-datos-personales-actions"
import {
  RH_OPCIONES, DOCUMENTO_TIPOS, MESES, CENTROS_TRABAJO, EPS_OPCIONES, ARL_OPCIONES,
  PARENTESCO_OPCIONES, AFP_OPCIONES, SEXO_OPCIONES, ESCOLARIDAD_OPCIONES,
  ESTADO_CIVIL_OPCIONES, SI_NO, TIPO_VIVIENDA_OPCIONES, CARACTERISTICAS_VIVIENDA_OPCIONES,
  ZONA_OPCIONES, ESTRATO_OPCIONES, TRANSPORTE_OPCIONES, INGRESOS_OPCIONES,
  GRUPO_ETNICO_OPCIONES, ACTIVIDAD_FISICA_OPCIONES, FRECUENCIA_CONSUMO_OPCIONES,
  TURNO_OPCIONES, comoOpciones, type Opcion,
} from "@/lib/sst-datos-catalogos"

const MEDEVAC_VACIO: MedevacPortalInput = {
  documento_tipo: "Cedula de ciudadanía", celular: "", rh: "", alergias: "", eps: "", arl: "Sura",
  contacto_nombre: "", contacto_telefono: "", contacto_parentesco: "", email: "", mes_cumple: "",
  centro_trabajo: "",
}

const PERFIL_VACIO: PerfilPortalInput = {
  fecha_nacimiento: "", sexo: "", pais_nacimiento: "Colombia", depto_nacimiento: "",
  municipio_residencia: "", grupo_etnico: "", nivel_escolaridad: "", estado_civil: "",
  cabeza_familia: "", num_hijos: "", personas_hogar: "", ingresos_familiares: "",
  tipo_vivienda: "", caracteristicas_vivienda: "", zona: "", direccion: "", transporte: "",
  estrato: "", consume_alcohol: "", actividad_fisica: "", fumador: "", afp: "", eps: "", arl: "Sura",
  turno: "",
}

export default function MisDatosPage() {
  const { colaborador } = usePortal()
  const { toast } = useToast()
  const identificacion = colaborador?.identificacion ?? ""

  const [cargando, setCargando] = useState(true)
  const [tab, setTab] = useState("medevac")
  const [medevac, setMedevac] = useState<MedevacPortalInput>(MEDEVAC_VACIO)
  const [perfil, setPerfil] = useState<PerfilPortalInput>(PERFIL_VACIO)
  const [medevacGuardado, setMedevacGuardado] = useState(false)
  const [perfilGuardado, setPerfilGuardado] = useState(false)
  const [guardandoMedevac, iniciarMedevac] = useTransition()
  const [guardandoPerfil, iniciarPerfil] = useTransition()

  const cargar = useCallback(async () => {
    if (!identificacion) return
    setCargando(true)
    const d = await getMisDatosPortal(identificacion)
    if (d.medevac) {
      setMedevac({
        documento_tipo: d.medevac.documento_tipo ?? "Cedula de ciudadanía",
        celular: d.medevac.celular ?? d.headcount?.celular ?? "",
        rh: d.medevac.rh ?? "",
        alergias: d.medevac.alergias ?? "",
        eps: d.medevac.eps ?? "",
        arl: d.medevac.arl ?? "Sura",
        contacto_nombre: d.medevac.contacto_nombre ?? "",
        contacto_telefono: d.medevac.contacto_telefono ?? "",
        contacto_parentesco: d.medevac.contacto_parentesco ?? "",
        email: d.medevac.email ?? "",
        mes_cumple: d.medevac.mes_cumple ?? "",
        centro_trabajo: d.medevac.centro_trabajo ?? "",
      })
    } else {
      setMedevac({ ...MEDEVAC_VACIO, celular: d.headcount?.celular ?? "" })
    }
    if (d.perfil) {
      setPerfil({
        fecha_nacimiento: d.perfil.fecha_nacimiento ?? "",
        sexo: d.perfil.sexo ?? "",
        pais_nacimiento: d.perfil.pais_nacimiento ?? "Colombia",
        depto_nacimiento: d.perfil.depto_nacimiento ?? "",
        municipio_residencia: d.perfil.municipio_residencia ?? "",
        grupo_etnico: d.perfil.grupo_etnico ?? "",
        nivel_escolaridad: d.perfil.nivel_escolaridad ?? "",
        estado_civil: d.perfil.estado_civil ?? "",
        cabeza_familia: d.perfil.cabeza_familia ?? "",
        num_hijos: d.perfil.num_hijos == null ? "" : String(d.perfil.num_hijos),
        personas_hogar: d.perfil.personas_hogar == null ? "" : String(d.perfil.personas_hogar),
        ingresos_familiares: d.perfil.ingresos_familiares ?? "",
        tipo_vivienda: d.perfil.tipo_vivienda ?? "",
        caracteristicas_vivienda: d.perfil.caracteristicas_vivienda ?? "",
        zona: d.perfil.zona ?? "",
        direccion: d.perfil.direccion ?? "",
        transporte: d.perfil.transporte ?? "",
        estrato: d.perfil.estrato ?? "",
        consume_alcohol: d.perfil.consume_alcohol ?? "",
        actividad_fisica: d.perfil.actividad_fisica ?? "",
        fumador: d.perfil.fumador ?? "",
        afp: d.perfil.afp ?? "",
        eps: d.perfil.eps ?? d.medevac?.eps ?? "",
        arl: d.perfil.arl ?? "Sura",
        turno: d.perfil.turno ?? "",
      })
    }
    setCargando(false)
  }, [identificacion])

  useEffect(() => { cargar() }, [cargar])

  // Lo minimo que hace util una ficha de emergencia. Es el mismo criterio que
  // aplica el servidor y la vista de SST, para que las tres no discrepen.
  const medevacCompleto = useMemo(
    () => [medevac.rh, medevac.alergias, medevac.eps, medevac.contacto_nombre, medevac.contacto_telefono]
      .every((v) => String(v ?? "").trim() !== ""),
    [medevac],
  )
  const perfilCompleto = useMemo(
    () => [perfil.fecha_nacimiento, perfil.sexo, perfil.nivel_escolaridad, perfil.estado_civil, perfil.tipo_vivienda]
      .every((v) => String(v ?? "").trim() !== ""),
    [perfil],
  )

  const setM = (k: keyof MedevacPortalInput, v: string) => setMedevac((f) => ({ ...f, [k]: v }))
  const setP = (k: keyof PerfilPortalInput, v: string) => setPerfil((f) => ({ ...f, [k]: v }))

  function guardarMedevac() {
    iniciarMedevac(async () => {
      const r = await guardarMedevacPortal(identificacion, medevac)
      if (r.success) {
        setMedevacGuardado(true)
        toast({ title: "Datos de emergencia guardados", description: "Gracias. Esta informacion solo se usa si te pasa algo." })
        if (!perfilCompleto) setTab("perfil")
      } else {
        toast({ title: "No se pudo guardar", description: r.error, variant: "destructive" })
      }
    })
  }

  function guardarPerfil() {
    iniciarPerfil(async () => {
      const r = await guardarPerfilPortal(identificacion, perfil)
      if (r.success) {
        setPerfilGuardado(true)
        toast({ title: "Perfil guardado", description: "Ya puedes usar todas las secciones del portal." })
      } else {
        toast({ title: "No se pudo guardar", description: r.error, variant: "destructive" })
      }
    })
  }

  if (cargando) {
    return (
      <div className="flex items-center justify-center py-16 text-sm text-muted-foreground">
        <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Cargando tus datos...
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold">Mis datos</h1>
        <p className="text-sm text-muted-foreground">
          Datos de emergencia y perfil sociodemografico. Se piden una sola vez y puedes
          actualizarlos cuando cambien.
        </p>
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="medevac" className="gap-1.5">
            <HeartPulse className="h-4 w-4" />
            Emergencia
            {(medevacCompleto || medevacGuardado) && <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />}
          </TabsTrigger>
          <TabsTrigger value="perfil" className="gap-1.5">
            <ClipboardList className="h-4 w-4" />
            Mi perfil
            {(perfilCompleto || perfilGuardado) && <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />}
          </TabsTrigger>
        </TabsList>

        {/* ---------------- MEDEVAC ---------------- */}
        <TabsContent value="medevac" className="mt-4">
          <Card>
            <CardHeader>
              <div className="flex flex-wrap items-center gap-2">
                <CardTitle className="text-base">Datos de emergencia</CardTitle>
                <Badge variant={medevacCompleto ? "default" : "secondary"} className={medevacCompleto ? "bg-emerald-600" : ""}>
                  {medevacCompleto ? "Completo" : "Incompleto"}
                </Badge>
              </div>
              <CardDescription>
                Esto es lo que mira una ambulancia o la ARL si te pasa algo trabajando. Los campos
                marcados con <span className="text-red-600">*</span> son obligatorios.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              <Aviso>
                Tu nombre, tu documento y tu cargo salen de tu contrato: no se piden aqui. Si algo
                esta mal, avisa a Gestion Humana.
              </Aviso>

              <Grupo titulo="Tus datos">
                <Campo l="Tipo de documento">
                  <Selector v={medevac.documento_tipo} on={(v) => setM("documento_tipo", v)} o={DOCUMENTO_TIPOS} />
                </Campo>
                <Campo l="Tu celular">
                  <Input inputMode="tel" value={medevac.celular} onChange={(e) => setM("celular", e.target.value)} placeholder="3001234567" />
                </Campo>
                <Campo l="Centro de trabajo">
                  <Selector v={medevac.centro_trabajo} on={(v) => setM("centro_trabajo", v)} o={comoOpciones(CENTROS_TRABAJO)} placeholder="Donde trabajas" />
                </Campo>
                <Campo l="Correo electronico">
                  <Input type="email" inputMode="email" value={medevac.email} onChange={(e) => setM("email", e.target.value)} placeholder="Dejalo vacio si no tienes" />
                </Campo>
                <Campo l="Mes de tu cumpleanos">
                  <Selector v={medevac.mes_cumple} on={(v) => setM("mes_cumple", v)} o={MESES} placeholder="Selecciona el mes" />
                </Campo>
              </Grupo>

              <Grupo titulo="Salud">
                <Campo l="Grupo sanguineo (RH)" obligatorio>
                  <Selector v={medevac.rh} on={(v) => setM("rh", v)} o={RH_OPCIONES} placeholder="Selecciona" />
                </Campo>
                <Campo l="Alergias" obligatorio ayuda="Si no tienes, escribe Ninguna.">
                  <Input value={medevac.alergias} onChange={(e) => setM("alergias", e.target.value)} placeholder="Ninguna" />
                </Campo>
                <Campo l="EPS" obligatorio>
                  <Selector v={medevac.eps} on={(v) => setM("eps", v)} o={comoOpciones(EPS_OPCIONES)} placeholder="Selecciona tu EPS" />
                </Campo>
                <Campo l="ARL">
                  <Selector v={medevac.arl} on={(v) => setM("arl", v)} o={comoOpciones(ARL_OPCIONES)} />
                </Campo>
              </Grupo>

              <Grupo titulo="A quien llamamos si te pasa algo">
                <Campo l="Nombre completo" obligatorio>
                  <Input value={medevac.contacto_nombre} onChange={(e) => setM("contacto_nombre", e.target.value)} placeholder="Nombre y apellidos" />
                </Campo>
                <Campo l="Telefono" obligatorio>
                  <Input inputMode="tel" value={medevac.contacto_telefono} onChange={(e) => setM("contacto_telefono", e.target.value)} placeholder="3001234567" />
                </Campo>
                <Campo l="Que es tuyo">
                  <Selector v={medevac.contacto_parentesco} on={(v) => setM("contacto_parentesco", v)} o={comoOpciones(PARENTESCO_OPCIONES)} placeholder="Parentesco" />
                </Campo>
              </Grupo>

              <Button onClick={guardarMedevac} disabled={guardandoMedevac} className="w-full sm:w-auto">
                {guardandoMedevac ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                Guardar datos de emergencia
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ---------------- PERFIL SOCIODEMOGRAFICO ---------------- */}
        <TabsContent value="perfil" className="mt-4">
          <Card>
            <CardHeader>
              <div className="flex flex-wrap items-center gap-2">
                <CardTitle className="text-base">Mi perfil</CardTitle>
                <Badge variant={perfilCompleto ? "default" : "secondary"} className={perfilCompleto ? "bg-emerald-600" : ""}>
                  {perfilCompleto ? "Completo" : "Incompleto"}
                </Badge>
              </div>
              <CardDescription>
                Sirve para disenar los programas de salud y bienestar. Es informacion agregada:
                nadie revisa tu caso individual.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              <Grupo titulo="Datos personales">
                <Campo l="Fecha de nacimiento" obligatorio>
                  <Input type="date" value={perfil.fecha_nacimiento} onChange={(e) => setP("fecha_nacimiento", e.target.value)} />
                </Campo>
                <Campo l="Sexo" obligatorio>
                  <Selector v={perfil.sexo} on={(v) => setP("sexo", v)} o={SEXO_OPCIONES} placeholder="Selecciona" />
                </Campo>
                <Campo l="Pais de nacimiento">
                  <Input value={perfil.pais_nacimiento} onChange={(e) => setP("pais_nacimiento", e.target.value)} />
                </Campo>
                <Campo l="Departamento de nacimiento">
                  <Input value={perfil.depto_nacimiento} onChange={(e) => setP("depto_nacimiento", e.target.value)} />
                </Campo>
                <Campo l="Grupo etnico">
                  <Selector v={perfil.grupo_etnico} on={(v) => setP("grupo_etnico", v)} o={GRUPO_ETNICO_OPCIONES} placeholder="Selecciona" />
                </Campo>
                <Campo l="Nivel de escolaridad" obligatorio>
                  <Selector v={perfil.nivel_escolaridad} on={(v) => setP("nivel_escolaridad", v)} o={ESCOLARIDAD_OPCIONES} placeholder="Hasta donde estudiaste" />
                </Campo>
              </Grupo>

              <Grupo titulo="Tu familia">
                <Campo l="Estado civil" obligatorio>
                  <Selector v={perfil.estado_civil} on={(v) => setP("estado_civil", v)} o={ESTADO_CIVIL_OPCIONES} placeholder="Selecciona" />
                </Campo>
                <Campo l="Eres cabeza de familia">
                  <Selector v={perfil.cabeza_familia} on={(v) => setP("cabeza_familia", v)} o={SI_NO} placeholder="Selecciona" />
                </Campo>
                <Campo l="Cuantos hijos tienes">
                  <Input type="number" min={0} inputMode="numeric" value={perfil.num_hijos} onChange={(e) => setP("num_hijos", e.target.value)} />
                </Campo>
                <Campo l="Cuantas personas viven contigo" ayuda="Incluyendote.">
                  <Input type="number" min={1} inputMode="numeric" value={perfil.personas_hogar} onChange={(e) => setP("personas_hogar", e.target.value)} />
                </Campo>
                <Campo l="Ingresos del hogar">
                  <Selector v={perfil.ingresos_familiares} on={(v) => setP("ingresos_familiares", v)} o={INGRESOS_OPCIONES} placeholder="Selecciona" />
                </Campo>
              </Grupo>

              <Grupo titulo="Donde vives">
                <Campo l="Tipo de vivienda" obligatorio>
                  <Selector v={perfil.tipo_vivienda} on={(v) => setP("tipo_vivienda", v)} o={TIPO_VIVIENDA_OPCIONES} placeholder="Selecciona" />
                </Campo>
                <Campo l="Como es la vivienda">
                  <Selector v={perfil.caracteristicas_vivienda} on={(v) => setP("caracteristicas_vivienda", v)} o={CARACTERISTICAS_VIVIENDA_OPCIONES} placeholder="Selecciona" />
                </Campo>
                <Campo l="Zona">
                  <Selector v={perfil.zona} on={(v) => setP("zona", v)} o={ZONA_OPCIONES} placeholder="Selecciona" />
                </Campo>
                <Campo l="Estrato">
                  <Selector v={perfil.estrato} on={(v) => setP("estrato", v)} o={ESTRATO_OPCIONES} placeholder="Selecciona" />
                </Campo>
                <Campo l="Municipio donde vives">
                  <Input value={perfil.municipio_residencia} onChange={(e) => setP("municipio_residencia", e.target.value)} />
                </Campo>
                <Campo l="Direccion">
                  <Input value={perfil.direccion} onChange={(e) => setP("direccion", e.target.value)} />
                </Campo>
                <Campo l="Como te transportas al trabajo">
                  <Selector v={perfil.transporte} on={(v) => setP("transporte", v)} o={TRANSPORTE_OPCIONES} placeholder="Selecciona" />
                </Campo>
              </Grupo>

              <Grupo titulo="Habitos" >
                <Campo l="Actividad fisica">
                  <Selector v={perfil.actividad_fisica} on={(v) => setP("actividad_fisica", v)} o={ACTIVIDAD_FISICA_OPCIONES} placeholder="Selecciona" />
                </Campo>
                <Campo l="Consumo de alcohol">
                  <Selector v={perfil.consume_alcohol} on={(v) => setP("consume_alcohol", v)} o={FRECUENCIA_CONSUMO_OPCIONES} placeholder="Selecciona" />
                </Campo>
                <Campo l="Fumas">
                  <Selector v={perfil.fumador} on={(v) => setP("fumador", v)} o={FRECUENCIA_CONSUMO_OPCIONES} placeholder="Selecciona" />
                </Campo>
              </Grupo>

              <Grupo titulo="Afiliaciones">
                <Campo l="EPS">
                  <Selector v={perfil.eps} on={(v) => setP("eps", v)} o={comoOpciones(EPS_OPCIONES)} placeholder="Selecciona" />
                </Campo>
                <Campo l="Fondo de pensiones (AFP)">
                  <Selector v={perfil.afp} on={(v) => setP("afp", v)} o={comoOpciones(AFP_OPCIONES)} placeholder="Selecciona" />
                </Campo>
                <Campo l="ARL">
                  <Selector v={perfil.arl} on={(v) => setP("arl", v)} o={comoOpciones(ARL_OPCIONES)} />
                </Campo>
                <Campo l="Turno">
                  <Selector v={perfil.turno} on={(v) => setP("turno", v)} o={TURNO_OPCIONES} placeholder="Selecciona" />
                </Campo>
              </Grupo>

              <Button onClick={guardarPerfil} disabled={guardandoPerfil} className="w-full sm:w-auto">
                {guardandoPerfil ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                Guardar mi perfil
              </Button>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}

function Aviso({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-2 rounded-lg border bg-slate-50 p-3 text-xs text-muted-foreground">
      <Info className="mt-0.5 h-4 w-4 shrink-0" />
      <span>{children}</span>
    </div>
  )
}

function Grupo({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3">
      <h3 className="text-sm font-semibold">{titulo}</h3>
      <div className="grid gap-3 sm:grid-cols-2">{children}</div>
    </section>
  )
}

function Campo({
  l, obligatorio, ayuda, children,
}: { l: string; obligatorio?: boolean; ayuda?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs">
        {l} {obligatorio && <span className="text-red-600">*</span>}
      </Label>
      {children}
      {ayuda && <p className="text-[11px] text-muted-foreground">{ayuda}</p>}
    </div>
  )
}

/** Select con placeholder. Radix no admite un item con valor vacio, asi que
 *  cuando no hay valor se pasa `undefined` y se muestra el placeholder. */
function Selector({
  v, on, o, placeholder,
}: { v: string; on: (v: string) => void; o: Opcion[]; placeholder?: string }) {
  return (
    <Select value={v || undefined} onValueChange={on}>
      <SelectTrigger>
        <SelectValue placeholder={placeholder ?? "Selecciona"} />
      </SelectTrigger>
      <SelectContent>
        {o.map(([val, lab]) => (
          <SelectItem key={val} value={val}>{lab}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
