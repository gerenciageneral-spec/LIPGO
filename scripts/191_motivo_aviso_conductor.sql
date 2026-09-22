-- ============================================================================
-- 191 — GUARDAR POR QUÉ NO SALIÓ UN AVISO AL CONDUCTOR
-- ----------------------------------------------------------------------------
-- Al pasar los avisos a modo real, el dato de cada orden decide si el mensaje
-- sale: un celular vacío o mal digitado no produce ningún error visible, el
-- conductor simplemente no recibe nada.
--
-- El historial ya muestra esos casos como "Sin enviar", pero no puede decir
-- POR QUÉ: hoy no se guarda el motivo. Quien revise ve un hueco y no sabe si
-- fue el celular de esa orden, la plantilla, o la conexión con Meta --que son
-- tres problemas distintos con tres soluciones distintas--.
--
-- Aditivo e idempotente.
-- ============================================================================


-- ----------------------------------------------------------------------------
-- PASO 1 — LA COLUMNA
-- ----------------------------------------------------------------------------

alter table public.notificaciones_conductor_enviadas
  add column if not exists motivo text;

comment on column public.notificaciones_conductor_enviadas.motivo is
  'Por que no se envio, cuando aplica: celular invalido, plantilla no aprobada, etc. NULL cuando el envio si se hizo.';


-- ----------------------------------------------------------------------------
-- PASO 2 — VERIFICACIÓN (solo lecturas)
-- ----------------------------------------------------------------------------

select column_name, data_type
from information_schema.columns
where table_schema = 'public'
  and table_name   = 'notificaciones_conductor_enviadas'
order by ordinal_position;

-- 2b) Los avisos que no llegaron a enviarse, con su razón.
select orden_id, evento, telefono, motivo, created_at
from public.notificaciones_conductor_enviadas
where mensaje_id is null
order by created_at desc
limit 20;


-- ----------------------------------------------------------------------------
-- REVERSIÓN
-- ----------------------------------------------------------------------------
--   alter table public.notificaciones_conductor_enviadas drop column if exists motivo;
