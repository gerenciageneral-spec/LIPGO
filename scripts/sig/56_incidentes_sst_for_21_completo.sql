-- ============================================================================
-- SST-FOR-21 COMPLETO: los campos del formato que faltaban en `sst_incidentes`
--
-- Se contrastó el formato original (SST-FOR-21, versión 1, 6 páginas) contra lo
-- que el módulo guardaba. La mayoría ya estaba; estos son los que faltaban.
--
-- LO QUE NO SE AGREGA, Y POR QUÉ:
--   · Datos del empleador (razón social, NIT, dirección, teléfono, actividad
--     económica): son constantes de LIP, viven en EMPLEADOR_LIP dentro del
--     código y salen solos en el PDF. Guardarlos por fila solo abriría la
--     puerta a que una investigación quede con el NIT mal escrito.
--   · Firmas y licencia SST: ya viven en la columna `firmas` (jsonb).
--
-- NO BORRA NI MODIFICA NADA. Solo agrega columnas, y `if not exists` hace que
-- correrlo dos veces sea inofensivo.
-- ============================================================================

-- --- Centro de trabajo (pág. 1) ---------------------------------------------
-- El formato pide departamento, teléfono y zona del CENTRO, aparte de los del
-- lugar del accidente, que ya existían. No son lo mismo: el accidente pudo
-- ocurrir fuera del centro.
alter table public.sst_incidentes
  add column if not exists centro_departamento text;
alter table public.sst_incidentes
  add column if not exists centro_telefono text;
alter table public.sst_incidentes
  add column if not exists centro_zona text;

-- --- Datos de la persona (pág. 1) -------------------------------------------
alter table public.sst_incidentes
  add column if not exists telefono text;
alter table public.sst_incidentes
  add column if not exists fax text;
alter table public.sst_incidentes
  add column if not exists direccion_trabajador text;
alter table public.sst_incidentes
  add column if not exists eps_codigo text;
alter table public.sst_incidentes
  add column if not exists arl_codigo text;
alter table public.sst_incidentes
  add column if not exists afp_codigo text;

-- Antigüedad en el cargo. El formato la pide en Días / Meses / Años, tres
-- casillas separadas. Ya existía `antiguedad_dias`; faltaban las otras dos.
alter table public.sst_incidentes
  add column if not exists antiguedad_meses integer;
alter table public.sst_incidentes
  add column if not exists antiguedad_anios integer;

-- --- Campos "Otro (especificar)" (págs. 2 y 3) -------------------------------
-- Cuatro listas del formato terminan en "Otro / especifique" con una línea para
-- escribir. Sin estas columnas, escoger "Otro" no dice nada: se pierde
-- justamente el dato que la opción existe para capturar.
alter table public.sst_incidentes
  add column if not exists lugar_otro text;
alter table public.sst_incidentes
  add column if not exists tipo_lesion_otro text;
alter table public.sst_incidentes
  add column if not exists agente_otro text;
alter table public.sst_incidentes
  add column if not exists mecanismo_otro text;

comment on column public.sst_incidentes.centro_zona is
  'Urbana / Rural del CENTRO DE TRABAJO. Distinto de zona_evento, que es la del lugar del accidente.';
comment on column public.sst_incidentes.antiguedad_meses is
  'Antigüedad en el cargo, casilla "Meses" del formato. Se acompaña de antiguedad_dias y antiguedad_anios.';
comment on column public.sst_incidentes.lugar_otro is
  'Texto de la opción "9. Otros especifica" del lugar donde ocurrió el evento.';
comment on column public.sst_incidentes.tipo_lesion_otro is
  'Texto de la opción "16. Otro (especificar)" del tipo de lesión.';
comment on column public.sst_incidentes.agente_otro is
  'Texto de la opción "8. Otros Agentes no clasificados" del agente del accidente.';
comment on column public.sst_incidentes.mecanismo_otro is
  'Texto de la opción "10. Otro (especificar)" del mecanismo o forma del accidente.';


-- ----------------------------------------------------------------------------
-- VERIFICACIÓN. Deben aparecer las 15 columnas.
-- ----------------------------------------------------------------------------
select column_name, data_type
  from information_schema.columns
 where table_schema = 'public'
   and table_name = 'sst_incidentes'
   and column_name in (
     'centro_departamento', 'centro_telefono', 'centro_zona',
     'telefono', 'fax', 'direccion_trabajador',
     'eps_codigo', 'arl_codigo', 'afp_codigo',
     'antiguedad_meses', 'antiguedad_anios',
     'lugar_otro', 'tipo_lesion_otro', 'agente_otro', 'mecanismo_otro'
   )
 order by column_name;

-- Las investigaciones que ya existían quedan con estos campos en null, que es
-- lo correcto: nadie los diligenció porque no existían. Se llenan al editar.
select count(*) as investigaciones_existentes,
       count(*) filter (where telefono is null) as sin_telefono
  from public.sst_incidentes;
