-- ============================================================================
-- 183 — ENCUESTA PÚBLICA DEL CONDUCTOR
-- ----------------------------------------------------------------------------
-- El conductor abre un enlace desde el WhatsApp de fin de cargue y califica el
-- servicio desde su celular. La respuesta entra a `sig_satisfaccion` con
-- `tipo = 'conductor'`, que es lo que ya alimenta el KPI "Satisfacción
-- conductor" del módulo Satisfacción y PQRSF.
--
-- NO SE CREA UNA TABLA NUEVA. Esa encuesta ya existe: hoy la digita alguien de
-- LIP después de preguntarle al conductor (el campo `canal` distingue si fue
-- telefónica o presencial). Lo que falta es que el conductor pueda responder
-- él mismo. Una tabla aparte daría dos fuentes para el mismo indicador.
--
-- LO QUE SÍ HACE FALTA es poder atar la respuesta a la orden: sin eso no se
-- sabe qué cargue calificó, y tampoco se puede impedir que la misma persona
-- responda veinte veces desde el mismo enlace.
--
-- Aditivo e idempotente.
-- ============================================================================


-- ----------------------------------------------------------------------------
-- PASO 1 — ATAR LA RESPUESTA A LA ORDEN
-- ----------------------------------------------------------------------------

alter table public.sig_satisfaccion
  add column if not exists orden_id bigint;

-- Placa y orden quedan guardadas aparte del nombre para poder cruzar después
-- con la operación. `encuestado` es texto libre y ya se usa para nombre, empresa
-- o placa indistintamente.
alter table public.sig_satisfaccion
  add column if not exists placa text;
alter table public.sig_satisfaccion
  add column if not exists orden_codigo text;

comment on column public.sig_satisfaccion.orden_id is
  'Orden de cargue que se calificó (cabeceraoc.id). NULL en las encuestas digitadas a mano.';

-- Una respuesta por orden: el enlace del WhatsApp es el mismo cada vez que se
-- abra, y sin esto una persona podría responder veinte veces y mover el
-- indicador. El índice es PARCIAL porque las encuestas digitadas a mano no
-- tienen orden y deben poder ser muchas.
create unique index if not exists uq_satisfaccion_orden
  on public.sig_satisfaccion (orden_id)
  where orden_id is not null;

create index if not exists idx_satisfaccion_tipo_fecha
  on public.sig_satisfaccion (tipo, fecha desc);


-- ----------------------------------------------------------------------------
-- PASO 2 — VERIFICACIÓN (solo lecturas)
-- ----------------------------------------------------------------------------

-- 2a) Las columnas nuevas.
select column_name, data_type, is_nullable
from information_schema.columns
where table_schema = 'public'
  and table_name = 'sig_satisfaccion'
  and column_name in ('orden_id', 'placa', 'orden_codigo')
order by column_name;

-- 2b) Nada cambió para lo ya registrado: las encuestas existentes quedan con
--     orden_id en NULL y siguen contando igual en el indicador.
select count(*) as encuestas,
       count(*) filter (where tipo = 'conductor') as de_conductor,
       count(orden_id) as atadas_a_una_orden
from public.sig_satisfaccion;

-- 2c) El KPI filtra por `activo` y `tipo`: una respuesta del formulario tiene
--     que cumplir ambos para contar. Esta consulta reproduce el cálculo.
select tipo,
       count(*) as n,
       round(avg(calificacion), 2) as promedio_1a5,
       round(avg(calificacion) / 5 * 100, 1) as pct
from public.sig_satisfaccion
where activo = true and calificacion > 0
group by tipo;


-- ----------------------------------------------------------------------------
-- REVERSIÓN
-- ----------------------------------------------------------------------------
-- Las respuestas ya recibidas NO se borran: son encuestas reales y siguen
-- contando en el indicador. Solo se pierde el vínculo con la orden.
--
--   drop index if exists uq_satisfaccion_orden;
--   alter table public.sig_satisfaccion drop column if exists orden_id;
--   alter table public.sig_satisfaccion drop column if exists placa;
--   alter table public.sig_satisfaccion drop column if exists orden_codigo;
