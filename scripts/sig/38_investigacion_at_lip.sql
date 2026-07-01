-- =====================================================================
-- 38 · Investigación de AT / Incidentes — formato original LIP (SST-FOR-21)
-- Amplía sst_incidentes con los campos del formato de 6 páginas de LIP y
-- crea la tabla de testigos. Aditivo e idempotente. Correr en Supabase.
-- =====================================================================

-- Persona (FURAT)
alter table public.sst_incidentes add column if not exists documento_tipo   text;
alter table public.sst_incidentes add column if not exists documento_numero text;
alter table public.sst_incidentes add column if not exists fecha_nacimiento  date;
alter table public.sst_incidentes add column if not exists sexo              text;   -- M | F
alter table public.sst_incidentes add column if not exists eps               text;
alter table public.sst_incidentes add column if not exists arl               text;
alter table public.sst_incidentes add column if not exists afp               text;
alter table public.sst_incidentes add column if not exists salario           numeric;
alter table public.sst_incidentes add column if not exists codigo_ocupacion  text;
alter table public.sst_incidentes add column if not exists fecha_ingreso     date;
alter table public.sst_incidentes add column if not exists jornada_habitual  text;   -- diurno|nocturno|mixto|turnos

-- Centro de trabajo (el empleador LIP va fijo en el encabezado)
alter table public.sst_incidentes add column if not exists centro_trabajo    text;
alter table public.sst_incidentes add column if not exists centro_direccion  text;
alter table public.sst_incidentes add column if not exists centro_municipio  text;
alter table public.sst_incidentes add column if not exists codigo_actividad  text;   -- CIIU actividad económica

-- Evento
alter table public.sst_incidentes add column if not exists fecha_reporte           date;
alter table public.sst_incidentes add column if not exists tiempo_laborado_previo  text;   -- "HH:MM"
alter table public.sst_incidentes add column if not exists dentro_fuera_empresa    text;   -- dentro | fuera
alter table public.sst_incidentes add column if not exists requirio_transporte     boolean;

-- Ausentismo
alter table public.sst_incidentes add column if not exists ausentismo_tipo          text;  -- inicial | prorroga
alter table public.sst_incidentes add column if not exists ausentismo_fecha_inicial date;
alter table public.sst_incidentes add column if not exists ausentismo_fecha_final   date;

-- Retroalimentación / lección aprendida
alter table public.sst_incidentes add column if not exists divulgacion_leccion text;
alter table public.sst_incidentes add column if not exists charla_seguridad    text;
alter table public.sst_incidentes add column if not exists retroalimentacion   text;

-- Firmas y responsables (JSON: jefe_inmediato, coordinador_sst, integrante_copasst,
-- responsable_sgsst, reviso, cerro, representante_legal — cada uno {nombre, cargo, cc})
alter table public.sst_incidentes add column if not exists firmas jsonb;

-- Testigos del evento (uno a muchos). Si la tabla ya existe (migración previa),
-- solo se aseguran las columnas usadas por el formulario.
create table if not exists public.sst_incidente_testigos (
  id serial primary key,
  incidente_id int not null references public.sst_incidentes(id) on delete cascade,
  idempresa int,
  nombre text,
  documento text,
  version text,
  cargo text,
  created_at timestamptz default now()
);
alter table public.sst_incidente_testigos add column if not exists nombre    text;
alter table public.sst_incidente_testigos add column if not exists documento text;
alter table public.sst_incidente_testigos add column if not exists version   text;
alter table public.sst_incidente_testigos add column if not exists cargo     text;
alter table public.sst_incidente_testigos add column if not exists idempresa int;
create index if not exists idx_sst_testigos_incidente on public.sst_incidente_testigos (incidente_id);

-- =====================================================================
-- FIN. Módulo Certificaciones → Investigación AT → SST-FOR-21 (LIP).
-- =====================================================================
