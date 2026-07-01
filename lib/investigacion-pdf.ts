// Generador de PDF (no editable) del formato SST-FOR-21 a partir de los datos
// de la investigación (sst_incidentes) + acciones + testigos. Se usa tanto en
// Investigación AT como en el Repositorio (ojito "Ver documento"). Cliente.

const EMPLEADOR_LIP = {
  razon_social: "LIP PROGRESSIVE INTEGRAL LOGISTICS SAS",
  tipo_id: "NIT",
  nit: "901725963-8",
  direccion: "CL 4 B 20 A 66 BRR CALLEJAS",
  departamento: "CESAR",
  municipio: "VALLEDUPAR",
  email: "gerenciageneral@lip-sas.com",
  actividad:
    "MANIPULACIÓN DE CARGA, INCLUYE LA CARGA Y DESCARGA DE MERCANCÍAS Y EQUIPAJE POR ESTIBADORES, COTEROS, PALETIZADORES, EXCEPTO CARGUE Y DESCARGUE DE EMBARCACIONES AÉREAS, MARÍTIMAS Y/O FLUVIALES.",
}
const TIPOS: [string, string][] = [["incidente", "Incidente"], ["accidente", "Accidente de trabajo"], ["enfermedad_laboral", "Enfermedad laboral"]]
const GRAVEDAD: [string, string][] = [["leve", "Leve"], ["grave", "Grave"], ["mortal", "Mortal"]]
const VINCULACION: [string, string][] = [["planta", "Planta"], ["mision", "Misión"], ["contratista", "Contratista"], ["independiente", "Independiente"], ["dependiente", "Dependiente"], ["aprendiz", "Aprendiz"]]
const JORNADA: [string, string][] = [["normal", "Normal"], ["extra", "Extra"]]
const JORNADA_HAB: [string, string][] = [["diurno", "Diurno"], ["nocturno", "Nocturno"], ["mixto", "Mixto"], ["turnos", "Por turnos"]]
const SEXO: [string, string][] = [["M", "Masculino"], ["F", "Femenino"]]
const DIA_SEMANA: [string, string][] = [["lunes", "Lunes"], ["martes", "Martes"], ["miercoles", "Miércoles"], ["jueves", "Jueves"], ["viernes", "Viernes"], ["sabado", "Sábado"], ["domingo", "Domingo"]]
const ZONA: [string, string][] = [["urbana", "Urbana"], ["rural", "Rural"]]
const DENTRO_FUERA: [string, string][] = [["dentro", "Dentro de la empresa"], ["fuera", "Fuera de la empresa"]]
const AUS_TIPO: [string, string][] = [["inicial", "Inicial"], ["prorroga", "Prórroga"]]
const TIPO_ACC: [string, string][] = [["propios_trabajo", "Propios del Trabajo"], ["violencia", "Violencia"], ["transito", "Tránsito"], ["deportivo", "Deportivo"], ["recreativo", "Recreativo o Cultural"]]
const CONTROL: [string, string][] = [["fuente", "Fuente (F)"], ["medio", "Medio (M)"], ["individuo", "Individuo (I)"]]

const labelOf = (o: [string, string][], v: any) => o.find(([k]) => k === String(v))?.[1] ?? (v ?? "")

async function loadLogo(): Promise<string | null> {
  try {
    const r = await fetch("/lip-logo.png")
    const b = await r.blob()
    return await new Promise((res) => {
      const fr = new FileReader()
      fr.onload = () => res(fr.result as string)
      fr.onerror = () => res(null)
      fr.readAsDataURL(b)
    })
  } catch {
    return null
  }
}

export async function generarPdfInvestigacion(data: any, accs: any[] = [], tess: any[] = []) {
  const { default: jsPDF } = await import("jspdf")
  const autoTable = (await import("jspdf-autotable")).default
  const doc = new jsPDF({ unit: "pt", format: "letter" })
  const MW = doc.internal.pageSize.getWidth()
  const navy: [number, number, number] = [13, 59, 110]
  const b = (v: any) => (v === true || v === "true" ? "SÍ" : v === false || v === "false" ? "NO" : v ?? "")
  const logo = await loadLogo()
  if (logo) { try { doc.addImage(logo, "PNG", 40, 28, 96, 30) } catch {} }
  doc.setFontSize(11).setFont("helvetica", "bold").setTextColor(...navy)
  doc.text("FORMATO DE INVESTIGACIÓN DE ACCIDENTE / INCIDENTE LABORAL", MW / 2, 40, { align: "center" })
  doc.setFontSize(8).setFont("helvetica", "normal").setTextColor(90)
  doc.text("Seguridad y Salud en el Trabajo · Código: SST-FOR-21 · Res. 1401/2007", MW / 2, 54, { align: "center" })
  doc.text(EMPLEADOR_LIP.razon_social + " · NIT " + EMPLEADOR_LIP.nit, MW - 40, 34, { align: "right" })

  const sec = (title: string, body: any[][]) =>
    autoTable(doc, {
      startY: (doc as any).lastAutoTable ? (doc as any).lastAutoTable.finalY + 8 : 68,
      head: [[{ content: title, colSpan: 2 }]],
      body,
      theme: "grid",
      styles: { fontSize: 7.5, cellPadding: 2, textColor: 20 },
      headStyles: { fillColor: navy, textColor: 255, fontStyle: "bold", fontSize: 8 },
      columnStyles: { 0: { fontStyle: "bold", cellWidth: 150 } },
    })

  sec("1. IDENTIFICACIÓN DEL EMPLEADOR / CONTRATANTE", [
    ["Razón social", EMPLEADOR_LIP.razon_social],
    ["Tipo id / NIT", `${EMPLEADOR_LIP.tipo_id} · ${EMPLEADOR_LIP.nit}`],
    ["Dirección", `${EMPLEADOR_LIP.direccion} · ${EMPLEADOR_LIP.municipio} (${EMPLEADOR_LIP.departamento})`],
    ["Correo", EMPLEADOR_LIP.email],
    ["Actividad económica", EMPLEADOR_LIP.actividad],
    ["Centro de trabajo", `${data.centro_trabajo ?? data.sede ?? ""} · ${data.centro_direccion ?? ""} · ${data.centro_municipio ?? ""}`],
    ["Clasificación / Severidad", `${labelOf(TIPOS, data.tipo)} · ${labelOf(GRAVEDAD, data.gravedad)}`],
    ["Fecha de reporte", data.fecha_reporte ?? ""],
  ])
  sec("2. INFORMACIÓN DE LA PERSONA", [
    ["Nombres y apellidos", data.trabajador ?? ""],
    ["Documento", `${data.documento_tipo ?? ""} ${data.documento_numero ?? ""}`],
    ["Fecha nacimiento / Sexo", `${data.fecha_nacimiento ?? ""} · ${labelOf(SEXO, data.sexo)}`],
    ["EPS / ARL / AFP", `${data.eps ?? ""} · ${data.arl ?? ""} · ${data.afp ?? ""}`],
    ["Cargo / Ocupación", `${data.cargo ?? ""} · ${data.ocupacion_habitual ?? ""} (cód ${data.codigo_ocupacion ?? ""})`],
    ["Vinculación", labelOf(VINCULACION, data.tipo_vinculacion)],
    ["Ingreso / Antigüedad", `${data.fecha_ingreso ?? ""} · ${data.antiguedad_dias ?? 0} días`],
    ["Salario / Jornada habitual", `$${(Number(data.salario) || 0).toLocaleString("es-CO")} · ${labelOf(JORNADA_HAB, data.jornada_habitual)}`],
    ["Funciones asignadas", data.funciones_asignadas ?? ""],
    ["EPP y dotación", data.epp_portado ?? ""],
  ])
  sec("3. INFORMACIÓN SOBRE EL ACCIDENTE / INCIDENTE", [
    ["Fecha / Día / Hora", `${data.fecha_evento ?? ""} · ${labelOf(DIA_SEMANA, data.dia_semana)} · ${data.hora_evento ?? ""}`],
    ["Jornada / T. laborado previo", `${labelOf(JORNADA, data.jornada_evento)} · ${data.tiempo_laborado_previo ?? ""}`],
    ["¿Labor habitual? / Tipo", `${b(data.labor_habitual)} · ${labelOf(TIPO_ACC, data.tipo_accidente)}`],
    ["Ocurrió", `${labelOf(DENTRO_FUERA, data.dentro_fuera_empresa)} · ${data.departamento_evento ?? ""} ${data.municipio_evento ?? ""} (${labelOf(ZONA, data.zona_evento)})`],
    ["Área / Lugar", `${data.area_ocurrencia ?? ""} · ${data.lugar_ocurrencia ?? ""}`],
    ["Tipo de lesión", data.tipo_lesion ?? ""],
    ["Parte del cuerpo", data.parte_cuerpo ?? ""],
    ["Agente", data.agente_accidente ?? ""],
    ["Mecanismo / forma", data.mecanismo ?? ""],
    ["Descripción", data.descripcion ?? ""],
  ])
  sec("4. MANEJO Y AUSENTISMO", [
    ["¿Causó muerte?", b(data.causo_muerte)],
    ["Primeros auxilios / Remitido", `${b(data.primeros_auxilios)} · ${b(data.remitido_centro_salud)} ${data.centro_salud ? "(" + data.centro_salud + ")" : ""}`],
    ["Hospitalizado / Transporte", `${b(data.hospitalizado)} · ${b(data.requirio_transporte)}`],
    ["Ausentismo", `${labelOf(AUS_TIPO, data.ausentismo_tipo)} · ${data.ausentismo_fecha_inicial ?? ""} → ${data.ausentismo_fecha_final ?? ""}`],
    ["Días inicial / prórroga / total", `${data.dias_incapacidad_inicial ?? 0} · ${data.dias_prorroga ?? 0} · ${data.dias_incapacidad ?? 0}`],
    ["CIE-10", `${data.cie10_codigo ?? ""} ${data.cie10_diagnostico ?? ""}`],
    ["Reporte legal", `ARL: ${b(data.reportado_arl)} (${data.fecha_reporte_arl ?? ""}) · FURAT: ${data.furat_radicado ?? ""} · MinTrabajo: ${b(data.reportado_mintrabajo)}`],
  ])
  if (tess.length) {
    autoTable(doc, {
      startY: (doc as any).lastAutoTable.finalY + 8,
      head: [["TESTIGO", "CÉDULA", "VERSIÓN"]],
      body: tess.map((t) => [t.nombre ?? "", t.documento ?? "", t.version ?? ""]),
      theme: "grid",
      styles: { fontSize: 7.5, cellPadding: 2 },
      headStyles: { fillColor: navy, textColor: 255, fontSize: 8 },
    })
  }
  const ish = data.ishikawa || null
  sec("5. ANÁLISIS DE CAUSAS (Ishikawa · causalidad)", [
    ["Efecto analizado", ish?.efecto ?? ""],
    ["Causas inmediatas – Actos inseguros", data.causa_actos_inseguros ?? ""],
    ["Causas inmediatas – Condiciones inseguras", data.causa_condiciones_inseguras ?? ""],
    ["Causas básicas – Factores personales", data.causa_factores_personales ?? ""],
    ["Causas básicas – Factores del trabajo", data.causa_factores_trabajo ?? ""],
    ["Observaciones investigadores", data.observaciones_investigadores ?? ""],
    ["Equipo investigador / Fecha", `${data.equipo_investigador ?? ""} · ${data.fecha_investigacion ?? ""}`],
  ])
  if (accs.length) {
    autoTable(doc, {
      startY: (doc as any).lastAutoTable.finalY + 8,
      head: [["MEDIDA DE INTERVENCIÓN", "CONTROL", "RESP. EJEC.", "F. IMPL.", "VERIFICA", "ESTADO"]],
      body: accs.map((a) => [
        a.plan ?? "", labelOf(CONTROL, a.tipo_control), a.responsable_ejecucion ?? "",
        a.fecha_implementacion ?? "", a.responsable_verificacion ?? "", a.estado ?? "",
      ]),
      theme: "grid",
      styles: { fontSize: 7, cellPadding: 2 },
      headStyles: { fillColor: navy, textColor: 255, fontSize: 7.5 },
    })
  }
  sec("6. RETROALIMENTACIÓN Y LECCIÓN APRENDIDA", [
    ["Divulgación / lección aprendida", data.divulgacion_leccion ?? ""],
    ["Charla de seguridad", data.charla_seguridad ?? ""],
    ["Retroalimentación", data.retroalimentacion ?? ""],
  ])
  const fr = data.firmas || {}
  const rolLab: [string, string][] = [
    ["jefe_inmediato", "Jefe inmediato / Coord. operación"],
    ["coordinador_sst", "Coordinador SST"],
    ["integrante_copasst", "Integrante COPASST"],
    ["responsable_sgsst", "Responsable SG-SST"],
    ["reviso", "Revisó"],
    ["cerro", "Cerró"],
    ["representante_legal", "Representante legal"],
  ]
  autoTable(doc, {
    startY: (doc as any).lastAutoTable.finalY + 8,
    head: [["ROL", "NOMBRE", "CARGO", "C.C."]],
    body: rolLab.map(([k, l]) => [l, fr[k]?.nombre ?? "", fr[k]?.cargo ?? "", fr[k]?.cc ?? ""]),
    theme: "grid",
    styles: { fontSize: 7.5, cellPadding: 2 },
    headStyles: { fillColor: navy, textColor: 255, fontSize: 8 },
  })
  doc.save(`SST-FOR-21 investigacion ${(data.trabajador || "").trim() || data.fecha_evento || ""}.pdf`)
}
