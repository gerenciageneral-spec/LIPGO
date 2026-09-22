-- ============================================================================
-- 194 — COLUMNAS DE EVIDENCIA EN `iso_clausulas`
-- ----------------------------------------------------------------------------
-- El Centro de Evidencias falla al subir un archivo:
--
--   Could not find the 'evidencia_path' column of 'iso_clausulas'
--   in the schema cache
--
-- El código las escribe desde hace tiempo (`setEvidenciaISO`), pero las
-- columnas nunca se crearon en esta base. Existe `scripts/013_add_iso_evidencia_columns.sql`
-- con el mismo contenido: quedó sin correr.
--
-- Se republica aquí, con número consecutivo, para que quede en la secuencia
-- que sí se ejecuta. El 013 se mantiene como está --renumerarlo rompería la
-- correspondencia con lo ya corrido en otras bases--, y correr los dos no hace
-- daño: ambos son `add column if not exists`.
--
-- Aditivo e idempotente.
-- ============================================================================


-- ----------------------------------------------------------------------------
-- PASO 1 — CÓMO ESTÁ HOY
-- ----------------------------------------------------------------------------

select column_name, data_type
from information_schema.columns
where table_schema = 'public'
  and table_name   = 'iso_clausulas'
order by ordinal_position;


-- ----------------------------------------------------------------------------
-- PASO 2 — LAS COLUMNAS
-- ----------------------------------------------------------------------------
-- Cuatro para el archivo subido, y tres para la gestión manual del estado.

alter table public.iso_clausulas
  -- El archivo de evidencia en Supabase Storage.
  add column if not exists evidencia_url     text,
  -- La ruta interna. Es lo que permite BORRAR o reemplazar el archivo: sin
  -- ella solo quedaría la URL pública, que no sirve para operar sobre él.
  add column if not exists evidencia_path    text,
  add column if not exists evidencia_nombre  text,
  add column if not exists evidencia_fecha   timestamptz,

  /*
   * Estado puesto a mano, que manda sobre el cálculo automático por métrica.
   * NULL = usar el cálculo. Hace falta porque hay cláusulas cuyo cumplimiento
   * no se puede deducir de ningún dato del sistema.
   */
  add column if not exists estado_manual     text,
  add column if not exists nota              text,
  add column if not exists actualizado_en    timestamptz;

comment on column public.iso_clausulas.evidencia_path is
  'Ruta interna en Storage. Necesaria para reemplazar o borrar el archivo; la URL publica no sirve para eso.';
comment on column public.iso_clausulas.estado_manual is
  'Estado puesto a mano. Manda sobre el calculo automatico. NULL = usar el calculo.';


-- ----------------------------------------------------------------------------
-- PASO 3 — VALORES VÁLIDOS DEL ESTADO MANUAL
-- ----------------------------------------------------------------------------
-- Sin esto, un valor mal escrito entraría sin error y la cláusula quedaría con
-- un estado que ninguna pantalla sabe pintar.

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'iso_clausulas_estado_manual_check'
  ) then
    alter table public.iso_clausulas
      add constraint iso_clausulas_estado_manual_check
      check (estado_manual in ('cumple', 'parcial', 'documental', 'pendiente'));
  end if;
end $$;


-- ----------------------------------------------------------------------------
-- PASO 4 — VERIFICACIÓN (solo lecturas)
-- ----------------------------------------------------------------------------

-- 4a) Las siete columnas. Si el conteo da menos, algo falló arriba.
select count(*) as columnas_creadas,
       7        as esperadas,
       case when count(*) = 7 then 'COMPLETO' else 'FALTAN' end as estado
from information_schema.columns
where table_schema = 'public'
  and table_name   = 'iso_clausulas'
  and column_name in (
        'evidencia_url', 'evidencia_path', 'evidencia_nombre', 'evidencia_fecha',
        'estado_manual', 'nota', 'actualizado_en'
      );

-- 4b) La restricción del estado manual.
select conname, pg_get_constraintdef(oid) as definicion
from pg_constraint
where conname = 'iso_clausulas_estado_manual_check';

-- 4c) Nada se perdió: las cláusulas siguen ahí, ahora con las columnas vacías.
select count(*)                          as clausulas,
       count(evidencia_url)               as con_evidencia,
       count(estado_manual)               as con_estado_manual
from public.iso_clausulas;


-- ----------------------------------------------------------------------------
-- REVERSIÓN
-- ----------------------------------------------------------------------------
-- Borra las evidencias registradas. Los archivos en Storage NO se borran:
-- quedarían huérfanos, sin nada que los referencie.
--
--   alter table public.iso_clausulas
--     drop column if exists evidencia_url,
--     drop column if exists evidencia_path,
--     drop column if exists evidencia_nombre,
--     drop column if exists evidencia_fecha,
--     drop column if exists estado_manual,
--     drop column if exists nota,
--     drop column if exists actualizado_en;
