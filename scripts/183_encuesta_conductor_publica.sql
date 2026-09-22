-- ============================================================================
-- 183 — ENCUESTA PÚBLICA DEL CONDUCTOR
-- ----------------------------------------------------------------------------
-- El conductor abre un enlace desde el WhatsApp de fin de cargue y califica el
-- servicio desde su celular. La respuesta entra a `sig_satisfaccion` con
-- `tipo = 'conductor'`, que es lo que alimenta el KPI "Satisfacción conductor"
-- (IND-G-02) del módulo Satisfacción y PQRSF.
--
-- NO SE CREA UNA TABLA NUEVA, y TAMPOCO SE CREAN COLUMNAS NUEVAS.
--
-- Esa encuesta ya existe en dos formas: la que digita alguien de LIP después de
-- preguntarle al conductor, y el kiosko 🟢🟡🔴 del script sig/33. El kiosko ya
-- ató la respuesta a la orden con `ref_orden` y ya puso el índice único que
-- impide calificar dos veces el mismo cargue.
--
-- Este script se monta sobre ESO. Una versión anterior creaba una columna
-- `orden_id bigint` propia; habría quedado la orden guardada en dos columnas
-- distintas y DOS índices únicos que se vigilan por separado, así que una
-- respuesta de kiosko y una del enlace de WhatsApp para el MISMO cargue no se
-- habrían visto como duplicado entre sí y el conductor habría contado dos veces
-- en el indicador.
--
-- Lo que sí queda aquí: el índice que hace rápida la consulta del indicador, y
-- las notas que dejan escrito qué significa cada `canal`.
--
-- REQUIERE, EN ESTE ORDEN:
--   scripts/sig/15_satisfaccion_pqrsf.sql   → crea `sig_satisfaccion`
--   scripts/sig/33_calificacion_conductor.sql → agrega `ref_orden` y `placa`
--                                               + el índice único por orden
--
-- Aditivo e idempotente.
-- ============================================================================


-- ----------------------------------------------------------------------------
-- PASO 1 — COMPROBAR QUE LO ANTERIOR ESTÁ CORRIDO
-- ----------------------------------------------------------------------------
-- Falla con un mensaje claro en vez del "relation does not exist" de Postgres,
-- que no dice cuál script falta.

do $$
begin
  if to_regclass('public.sig_satisfaccion') is null then
    raise exception
      'Falta correr scripts/sig/15_satisfaccion_pqrsf.sql (crea la tabla sig_satisfaccion).';
  end if;

  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'sig_satisfaccion'
      and column_name = 'ref_orden'
  ) then
    raise exception
      'Falta correr scripts/sig/33_calificacion_conductor.sql (agrega ref_orden, placa y el indice unico por orden).';
  end if;
end $$;


-- ----------------------------------------------------------------------------
-- PASO 2 — RED DE SEGURIDAD DEL ÍNDICE ÚNICO
-- ----------------------------------------------------------------------------
-- Lo crea el 33. Se repite aquí por si aquel se corrió en una versión anterior
-- que no lo traía: sin este índice, el mismo enlace de WhatsApp respondido
-- veinte veces mueve el indicador veinte veces.
--
-- Es PARCIAL a propósito: las encuestas digitadas a mano no tienen orden y
-- deben poder ser muchas.

create unique index if not exists uq_sig_satisfaccion_ref_orden
  on public.sig_satisfaccion (ref_orden)
  where ref_orden is not null;


-- ----------------------------------------------------------------------------
-- PASO 3 — ÍNDICE PARA EL INDICADOR
-- ----------------------------------------------------------------------------
-- El KPI consulta por tipo y ordena por fecha. Es la única lectura que crece
-- sin techo: una encuesta por cargue, todos los días.

create index if not exists idx_satisfaccion_tipo_fecha
  on public.sig_satisfaccion (tipo, fecha desc);


-- ----------------------------------------------------------------------------
-- PASO 4 — DEJAR ESCRITO QUÉ SIGNIFICA CADA COLUMNA
-- ----------------------------------------------------------------------------

comment on column public.sig_satisfaccion.ref_orden is
  'Orden de cargue calificada (cabeceraoc.ordendecargue, el codigo). NULL en las encuestas digitadas a mano.';

comment on column public.sig_satisfaccion.canal is
  'De donde vino la respuesta: encuesta_conductor = enlace de WhatsApp al celular del conductor; kiosko = dispositivo de LIP en sitio; telefonico/presencial = digitada por alguien de LIP; historico = generada por el poblado del periodo anterior al corte.';


-- ----------------------------------------------------------------------------
-- PASO 5 — VERIFICACIÓN (solo lecturas)
-- ----------------------------------------------------------------------------

-- 5a) La tabla tiene lo que el flujo necesita.
select column_name, data_type, is_nullable
from information_schema.columns
where table_schema = 'public'
  and table_name = 'sig_satisfaccion'
  and column_name in ('ref_orden', 'placa', 'tipo', 'canal', 'calificacion', 'proyecto_id', 'activo')
order by column_name;

-- 5b) El índice único por orden tiene que existir, y ser PARCIAL.
select indexname, indexdef
from pg_indexes
where schemaname = 'public'
  and tablename = 'sig_satisfaccion'
order by indexname;

-- 5c) Nada cambió para lo ya registrado.
select count(*) as encuestas,
       count(*) filter (where tipo = 'conductor') as de_conductor,
       count(ref_orden) as atadas_a_una_orden
from public.sig_satisfaccion;

-- 5d) El KPI filtra por `activo` y `tipo`: una respuesta del formulario tiene
--     que cumplir ambos para contar. Esta consulta reproduce el cálculo.
select tipo,
       canal,
       count(*) as n,
       round(avg(calificacion), 2) as promedio_1a5,
       round(avg(calificacion) / 5 * 100, 1) as pct
from public.sig_satisfaccion
where activo = true and calificacion > 0
group by tipo, canal
order by tipo, canal;


-- ----------------------------------------------------------------------------
-- REVERSIÓN
-- ----------------------------------------------------------------------------
-- Este script no crea columnas, así que no hay nada que borrar sin perder datos.
-- Solo el índice de lectura es suyo:
--
--   drop index if exists idx_satisfaccion_tipo_fecha;
--
-- El índice único `uq_sig_satisfaccion_ref_orden` pertenece a sig/33: NO se
-- borra aquí, porque es lo que impide calificar dos veces el mismo cargue.
