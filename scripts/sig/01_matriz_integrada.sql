-- =====================================================================
-- SIG - Matriz Integrada de Gestion (ISO 9001 / 14001 / 45001)
-- Modelo de datos + seed. ADITIVO e IDEMPOTENTE (seguro de re-ejecutar).
-- Generado desde "Matriz integrada SGI 1.xlsx" (datos reales LIP).
-- =====================================================================

create table if not exists public.sig_normas (
  id serial primary key,
  codigo text not null unique,
  nombre text not null,
  descripcion text,
  color text,
  orden int default 0,
  activo boolean default true,
  created_at timestamptz default now()
);

create table if not exists public.sig_requisitos (
  id serial primary key,
  numeral text not null unique,
  tema text not null,
  es_comun text not null default 'no',  -- 'si' | 'no' | 'parcial'
  evidencia_comun_sugerida text,
  orden int default 0,
  activo boolean default true,
  created_at timestamptz default now()
);

create table if not exists public.sig_requisito_norma (
  id serial primary key,
  requisito_id int not null references public.sig_requisitos(id) on delete cascade,
  norma_id int not null references public.sig_normas(id) on delete cascade,
  texto text,
  aplica boolean default true,
  unique (requisito_id, norma_id)
);

create table if not exists public.sig_documento_cobertura (
  id serial primary key,
  idempresa int not null,
  soporte_id bigint,  -- logico: soportes_documentales.id (sin FK dura)
  requisito_id int not null references public.sig_requisitos(id) on delete cascade,
  norma_id int not null references public.sig_normas(id) on delete cascade,
  estado text not null default 'pendiente', -- pendiente|cargado|aprobado|no_aplica
  observacion text,
  actualizado_por text,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique (idempresa, requisito_id, norma_id, soporte_id)
);

create index if not exists idx_sig_cobertura_emp on public.sig_documento_cobertura (idempresa);
create index if not exists idx_sig_cobertura_req on public.sig_documento_cobertura (requisito_id);

-- Permisos del modulo (columnas aditivas en permisos_usuarios).
alter table public.permisos_usuarios add column if not exists sig_matriz boolean default false;
alter table public.permisos_usuarios add column if not exists sig_iso9001 boolean default false;
alter table public.permisos_usuarios add column if not exists sig_iso14001 boolean default false;
alter table public.permisos_usuarios add column if not exists sig_iso45001 boolean default false;

insert into public.sig_normas (codigo, nombre, descripcion, color, orden) values
  ('ISO9001', 'ISO 9001:2015', 'Sistema de Gestión de Calidad', '#0D3B6E', 1),
  ('ISO14001', 'ISO 14001:2015', 'Sistema de Gestión Ambiental', '#1E8449', 2),
  ('ISO45001', 'ISO 45001:2018', 'Sistema de Gestión de SST', '#00B4CC', 3)
on conflict (codigo) do update set nombre = excluded.nombre, descripcion = excluded.descripcion, color = excluded.color, orden = excluded.orden;

insert into public.sig_requisitos (numeral, tema, es_comun, evidencia_comun_sugerida, orden) values
  ('4.1', 'Comprensión de la organización y su contexto', 'si', 'Análisis de contexto, matriz DOFA/PESTEL, actas de revisión gerencial.', 10),
  ('4.2', 'Comprensión de las necesidades y expectativas de las partes interesadas', 'si', 'Matriz de partes interesadas y requisitos aplicables.', 20),
  ('4.3', 'Determinación del alcance del sistema de gestión', 'si', 'Documento de alcance aprobado y comunicado.', 30),
  ('4.4', 'Sistema de gestión y sus procesos', 'si', 'Mapa de procesos, caracterizaciones, indicadores y procedimientos.', 40),
  ('5.1', 'Liderazgo y compromiso', 'si', 'Política firmada, actas de comité, comunicaciones de gerencia, asignación de recursos.', 50),
  ('5.2', 'Política', 'si', 'Política aprobada, divulgación, publicación y control documental.', 60),
  ('5.3', 'Roles, responsabilidades y autoridades', 'si', 'Organigrama, manual de funciones, actas de designación.', 70),
  ('5.4', 'Consulta y participación de los trabajadores', 'no', 'Actas COPASST, campañas, buzones/reportes, evidencias de participación.', 80),
  ('6.1', 'Acciones para abordar riesgos y oportunidades', 'si', 'Matrices de riesgos/oportunidades y planes de acción.', 90),
  ('6.1.2', 'Aspectos ambientales / identificación de peligros', 'no', 'Matrices técnicas de identificación y valoración.', 100),
  ('6.1.3', 'Requisitos legales y otros requisitos / obligaciones de cumplimiento', 'si', 'Matriz legal actualizada y evaluaciones periódicas de cumplimiento.', 110),
  ('6.2', 'Objetivos del sistema y planificación para lograrlos', 'si', 'Matriz de objetivos, indicadores, cronogramas y seguimiento.', 120),
  ('6.3', 'Planificación de los cambios', 'si', 'Formato de gestión del cambio, análisis previo y aprobación.', 130),
  ('7.1', 'Recursos', 'si', 'Presupuesto, asignación de personal, equipos, infraestructura.', 140),
  ('7.1.2', 'Personas', 'si', 'Planta de personal, perfiles, asignaciones.', 150),
  ('7.1.3', 'Infraestructura', 'si', 'Inventarios, mantenimientos, inspecciones, hojas de vida de equipos.', 160),
  ('7.1.4', 'Ambiente para la operación de los procesos', 'si', 'Inspecciones, mediciones, mantenimiento, controles locativos.', 170),
  ('7.1.5', 'Recursos de seguimiento y medición', 'si', 'Programa de calibración/verificación, certificados y registros.', 180),
  ('7.1.6', 'Conocimientos de la organización', 'si', 'Matrices de conocimiento, procedimientos, lecciones aprendidas.', 190),
  ('7.2', 'Competencia', 'si', 'Perfiles, hojas de vida, certificados, evaluaciones de eficacia.', 200),
  ('7.3', 'Toma de conciencia', 'si', 'Inducciones, reinducciones, campañas, listas de asistencia, evaluaciones.', 210),
  ('7.4', 'Comunicación', 'si', 'Matriz/plan de comunicaciones, correos, carteleras, actas.', 220),
  ('7.5', 'Información documentada', 'si', 'Procedimiento de control documental, listados maestros, registros controlados.', 230),
  ('8.1', 'Planificación y control operacional', 'si', 'Procedimientos operativos, instructivos, permisos, registros de ejecución.', 240),
  ('8.2', 'Requisitos para productos y servicios / preparación y respuesta ante emergencias', 'no', 'Para 9001: ofertas, contratos, pedidos. Para 14001/45001: plan de emergencias, simulacros.', 250),
  ('8.3', 'Diseño y desarrollo / gestión del cambio', 'no', 'Diseños, revisiones, validaciones; en SST, formatos de gestión del cambio.', 260),
  ('8.4', 'Control de procesos, productos y servicios suministrados externamente / compras', 'si', 'Evaluación de proveedores/contratistas, contratos, requisitos de compra.', 270),
  ('8.5', 'Producción y provisión del servicio', 'parcial', 'Órdenes de trabajo, trazabilidad, registros operacionales, listas de chequeo.', 280),
  ('8.6', 'Liberación de productos y servicios / evaluación del cumplimiento', 'no', 'Registros de inspección, liberación, actas de conformidad.', 290),
  ('8.7', 'Control de salidas no conformes / incidentes y no conformidades operacionales', 'parcial', 'Reportes de no conformidad, segregación, reproceso, investigación.', 300),
  ('9.1', 'Seguimiento, medición, análisis y evaluación', 'si', 'Tableros de indicadores, informes, registros de monitoreo y análisis.', 310),
  ('9.1.2', 'Satisfacción del cliente / evaluación del cumplimiento', 'no', 'Encuestas de satisfacción / informes de cumplimiento legal.', 320),
  ('9.2', 'Auditoría interna', 'si', 'Programa de auditoría, planes, listas de verificación, informes y acciones.', 330),
  ('9.3', 'Revisión por la dirección', 'si', 'Actas, presentaciones, planes de mejora y decisiones.', 340),
  ('10.1', 'Generalidades de mejora', 'si', 'Planes de mejora, proyectos, acciones derivadas de análisis y auditorías.', 350),
  ('10.2', 'No conformidad y acción correctiva', 'si', 'Formato de AC/AP, análisis causa raíz, seguimiento y cierre.', 360),
  ('10.3', 'Mejora continua', 'si', 'Indicadores de mejora, proyectos, lecciones aprendidas, revisiones periódicas.', 370)
on conflict (numeral) do update set tema = excluded.tema, es_comun = excluded.es_comun, evidencia_comun_sugerida = excluded.evidencia_comun_sugerida, orden = excluded.orden;

insert into public.sig_requisito_norma (requisito_id, norma_id, texto, aplica)
select r.id, n.id, v.texto, v.aplica from (values
  ('4.1', 'ISO9001', 'Análisis DOFA/PESTEL, mapa estratégico, diagnóstico del contexto, actas de revisión por la dirección.', true),
  ('4.1', 'ISO14001', 'Análisis de aspectos ambientales del contexto, condiciones del entorno, partes interesadas ambientales, revisión estratégica.', true),
  ('4.1', 'ISO45001', 'Identificación de contexto SST, condiciones de trabajo, factores internos/externos, análisis de riesgos estratégicos SST.', true),
  ('4.2', 'ISO9001', 'Matriz de partes interesadas, requisitos del cliente, legales y reglamentarios.', true),
  ('4.2', 'ISO14001', 'Matriz de partes interesadas, requisitos ambientales legales y otros compromisos.', true),
  ('4.2', 'ISO45001', 'Matriz de partes interesadas, requisitos legales SST, ARL, trabajadores, contratistas.', true),
  ('4.3', 'ISO9001', 'Alcance documentado del SGC.', true),
  ('4.3', 'ISO14001', 'Alcance documentado del SGA considerando aspectos y obligaciones de cumplimiento.', true),
  ('4.3', 'ISO45001', 'Alcance documentado del SGSST considerando centros de trabajo, actividades y control operacional.', true),
  ('4.4', 'ISO9001', 'Mapa de procesos, caracterizaciones, interacciones, indicadores y controles del SGC.', true),
  ('4.4', 'ISO14001', 'Procesos del SGA, interacción, controles ambientales, indicadores.', true),
  ('4.4', 'ISO45001', 'Procesos del SGSST, interacción, controles de riesgos, indicadores y seguimiento.', true),
  ('5.1', 'ISO9001', 'Política de calidad, evidencias de liderazgo, provisión de recursos, enfoque al cliente.', true),
  ('5.1', 'ISO14001', 'Política ambiental, liderazgo en protección ambiental y cumplimiento.', true),
  ('5.1', 'ISO45001', 'Política SST, liderazgo visible, consulta y participación de trabajadores, eliminación de peligros.', true),
  ('5.2', 'ISO9001', 'Política de calidad comunicada y disponible.', true),
  ('5.2', 'ISO14001', 'Política ambiental comunicada y disponible.', true),
  ('5.2', 'ISO45001', 'Política SST comunicada y disponible.', true),
  ('5.3', 'ISO9001', 'Organigrama, perfiles de cargo, responsabilidades del SGC.', true),
  ('5.3', 'ISO14001', 'Responsables del SGA, funciones ambientales, autoridad para cumplimiento.', true),
  ('5.3', 'ISO45001', 'Responsables del SGSST, COPASST, brigada, responsables de investigación de incidentes.', true),
  ('5.4', 'ISO9001', 'No aplica explícitamente en 9001.', false),
  ('5.4', 'ISO14001', 'No aplica explícitamente en 14001.', false),
  ('5.4', 'ISO45001', 'Mecanismos de consulta, COPASST, actas, reportes de actos/condiciones inseguras, participación en IPER.', true),
  ('6.1', 'ISO9001', 'Matriz de riesgos y oportunidades del SGC, acciones de tratamiento.', true),
  ('6.1', 'ISO14001', 'Identificación de aspectos ambientales, evaluación de impactos, riesgos y oportunidades, obligaciones de cumplimiento.', true),
  ('6.1', 'ISO45001', 'Identificación de peligros, evaluación y valoración de riesgos SST, oportunidades SST, requisitos legales.', true),
  ('6.1.2', 'ISO9001', 'No aplica explícitamente.', false),
  ('6.1.2', 'ISO14001', 'Matriz de aspectos e impactos ambientales, criterios de significancia.', true),
  ('6.1.2', 'ISO45001', 'Matriz IPER o identificación de peligros y valoración de riesgos.', true),
  ('6.1.3', 'ISO9001', 'Requisitos legales y reglamentarios aplicables al producto/servicio.', true),
  ('6.1.3', 'ISO14001', 'Matriz legal ambiental y evaluación de cumplimiento.', true),
  ('6.1.3', 'ISO45001', 'Matriz legal SST y evaluación de cumplimiento.', true),
  ('6.2', 'ISO9001', 'Objetivos de calidad, metas, indicadores y planes de acción.', true),
  ('6.2', 'ISO14001', 'Objetivos ambientales, metas, programas y responsables.', true),
  ('6.2', 'ISO45001', 'Objetivos SST, metas, programas, responsables y seguimiento.', true),
  ('6.3', 'ISO9001', 'Control de cambios que afecten el SGC, procesos, recursos o producto.', true),
  ('6.3', 'ISO14001', 'Cambios en procesos/instalaciones con impacto ambiental evaluado.', true),
  ('6.3', 'ISO45001', 'Cambios en procesos, instalaciones, personal o equipos con evaluación de riesgos SST.', true),
  ('7.1', 'ISO9001', 'Determinación y provisión de recursos del SGC.', true),
  ('7.1', 'ISO14001', 'Recursos para implementar y mantener el SGA.', true),
  ('7.1', 'ISO45001', 'Recursos para el SGSST, controles operacionales y emergencias.', true),
  ('7.1.2', 'ISO9001', 'Personal suficiente y competente para el SGC.', true),
  ('7.1.2', 'ISO14001', 'Personal suficiente para gestión ambiental.', true),
  ('7.1.2', 'ISO45001', 'Personal suficiente para controlar riesgos SST.', true),
  ('7.1.3', 'ISO9001', 'Instalaciones, equipos, software, transporte y mantenimiento.', true),
  ('7.1.3', 'ISO14001', 'Infraestructura con controles ambientales asociados.', true),
  ('7.1.3', 'ISO45001', 'Infraestructura segura, inspecciones, mantenimiento, señalización.', true),
  ('7.1.4', 'ISO9001', 'Condiciones adecuadas para calidad del producto/servicio.', true),
  ('7.1.4', 'ISO14001', 'Condiciones operacionales con control ambiental.', true),
  ('7.1.4', 'ISO45001', 'Condiciones de trabajo seguras y saludables.', true),
  ('7.1.5', 'ISO9001', 'Equipos calibrados/verificados, trazabilidad metrológica.', true),
  ('7.1.5', 'ISO14001', 'Equipos de monitoreo ambiental calibrados/verificados.', true),
  ('7.1.5', 'ISO45001', 'Equipos de medición SST calibrados/verificados cuando aplique.', true),
  ('7.1.6', 'ISO9001', 'Lecciones aprendidas, procedimientos, know-how, capacitación.', true),
  ('7.1.6', 'ISO14001', 'Conocimiento sobre aspectos ambientales, emergencias y cumplimiento.', true),
  ('7.1.6', 'ISO45001', 'Conocimiento sobre peligros, controles y respuesta a emergencias.', true),
  ('7.2', 'ISO9001', 'Perfiles, formación, evaluación de competencia del personal.', true),
  ('7.2', 'ISO14001', 'Competencia en controles ambientales y cumplimiento.', true),
  ('7.2', 'ISO45001', 'Competencia en SST, trabajo seguro, brigadas, investigación de incidentes.', true),
  ('7.3', 'ISO9001', 'Conciencia sobre política, objetivos, contribución y consecuencias de no conformidad.', true),
  ('7.3', 'ISO14001', 'Conciencia ambiental, impactos significativos y obligaciones.', true),
  ('7.3', 'ISO45001', 'Conciencia SST, peligros, riesgos, controles y consecuencias de incumplimiento.', true),
  ('7.4', 'ISO9001', 'Plan de comunicación interna/externa del SGC.', true),
  ('7.4', 'ISO14001', 'Comunicación interna/externa sobre desempeño ambiental y emergencias.', true),
  ('7.4', 'ISO45001', 'Comunicación interna/externa SST, reporte de incidentes, participación.', true),
  ('7.5', 'ISO9001', 'Control de documentos y registros del SGC.', true),
  ('7.5', 'ISO14001', 'Control de documentos y registros del SGA.', true),
  ('7.5', 'ISO45001', 'Control de documentos y registros del SGSST.', true),
  ('8.1', 'ISO9001', 'Controles de prestación del servicio/producción, criterios operacionales.', true),
  ('8.1', 'ISO14001', 'Controles operacionales para aspectos ambientales significativos y preparación ante emergencias.', true),
  ('8.1', 'ISO45001', 'Controles operacionales SST, permisos de trabajo, ATS, procedimientos seguros, contratistas.', true),
  ('8.2', 'ISO9001', 'Comunicación con el cliente, revisión de requisitos, cambios de requisitos.', true),
  ('8.2', 'ISO14001', 'Preparación y respuesta ante emergencias ambientales.', true),
  ('8.2', 'ISO45001', 'Preparación y respuesta ante emergencias SST.', true),
  ('8.3', 'ISO9001', 'Planificación y control del diseño y desarrollo, entradas, salidas, revisiones, validación.', true),
  ('8.3', 'ISO14001', 'No hay numeral 8.3 específico equivalente en 14001.', false),
  ('8.3', 'ISO45001', 'Gestión del cambio operacional y controles relacionados (según estructura de 45001, ver 8.1.3).', true),
  ('8.4', 'ISO9001', 'Evaluación y seguimiento de proveedores externos.', true),
  ('8.4', 'ISO14001', 'Control de contratistas/proveedores con criterios ambientales.', true),
  ('8.4', 'ISO45001', 'Control de contratistas, compras seguras, coordinación de actividades empresariales.', true),
  ('8.5', 'ISO9001', 'Control de producción/servicio, identificación, trazabilidad, propiedad del cliente, preservación, actividades post entrega.', true),
  ('8.5', 'ISO14001', 'Aplicable dentro del control operacional ambiental según procesos.', true),
  ('8.5', 'ISO45001', 'Aplicable dentro del control operacional SST según procesos y tareas críticas.', true),
  ('8.6', 'ISO9001', 'Inspección final, criterios de aceptación y liberación.', true),
  ('8.6', 'ISO14001', 'Evaluación del cumplimiento ambiental (en 9.1.2 de 14001).', true),
  ('8.6', 'ISO45001', 'No hay equivalente directo; aplica verificación de controles y cumplimiento operacional.', false),
  ('8.7', 'ISO9001', 'Tratamiento de producto/servicio no conforme.', true),
  ('8.7', 'ISO14001', 'No conformidades ambientales y control de desviaciones.', true),
  ('8.7', 'ISO45001', 'Incidentes, no conformidades y acciones inmediatas sobre desviaciones operacionales.', true),
  ('9.1', 'ISO9001', 'Indicadores, satisfacción del cliente, análisis de datos.', true),
  ('9.1', 'ISO14001', 'Seguimiento de desempeño ambiental, monitoreos, indicadores.', true),
  ('9.1', 'ISO45001', 'Seguimiento de desempeño SST, indicadores, mediciones higiénicas, inspecciones.', true),
  ('9.1.2', 'ISO9001', 'Medición de satisfacción del cliente.', true),
  ('9.1.2', 'ISO14001', 'Evaluación del cumplimiento legal ambiental.', true),
  ('9.1.2', 'ISO45001', 'Evaluación del cumplimiento legal SST.', true),
  ('9.2', 'ISO9001', 'Programa y ejecución de auditorías internas del SGC.', true),
  ('9.2', 'ISO14001', 'Programa y ejecución de auditorías internas del SGA.', true),
  ('9.2', 'ISO45001', 'Programa y ejecución de auditorías internas del SGSST.', true),
  ('9.3', 'ISO9001', 'Actas de revisión por la dirección con entradas y salidas requeridas.', true),
  ('9.3', 'ISO14001', 'Actas de revisión por la dirección con desempeño ambiental y cumplimiento.', true),
  ('9.3', 'ISO45001', 'Actas de revisión por la dirección con desempeño SST, incidentes, cumplimiento y consulta.', true),
  ('10.1', 'ISO9001', 'Determinación de oportunidades de mejora del SGC.', true),
  ('10.1', 'ISO14001', 'Mejora del desempeño ambiental y del SGA.', true),
  ('10.1', 'ISO45001', 'Mejora del desempeño SST y del SGSST.', true),
  ('10.2', 'ISO9001', 'Gestión de no conformidades, causa raíz y acciones correctivas.', true),
  ('10.2', 'ISO14001', 'Gestión de incidentes/no conformidades ambientales y acciones correctivas.', true),
  ('10.2', 'ISO45001', 'Gestión de incidentes/no conformidades SST y acciones correctivas.', true),
  ('10.3', 'ISO9001', 'Evidencia de mejora continua del SGC.', true),
  ('10.3', 'ISO14001', 'Evidencia de mejora continua del SGA.', true),
  ('10.3', 'ISO45001', 'Evidencia de mejora continua del SGSST.', true)
) as v(numeral, codigo, texto, aplica)
join public.sig_requisitos r on r.numeral = v.numeral
join public.sig_normas n on n.codigo = v.codigo
on conflict (requisito_id, norma_id) do update set texto = excluded.texto, aplica = excluded.aplica;
