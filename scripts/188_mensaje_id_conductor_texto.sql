-- ============================================================================
-- 188 — `mensaje_id` DEBE SER TEXTO, NO uuid
-- ----------------------------------------------------------------------------
-- El script 182 declaró `notificaciones_conductor_enviadas.mensaje_id` como
-- `uuid`, para cruzar cada aviso con su fila de `whatsapp_mensajes`.
--
-- EL PROBLEMA
-- El identificador que devuelve Meta NO es un uuid. Es una cadena con su propio
-- formato, del estilo `wamid.HBgMNTczMjAyMzQzMTU3FQIAERgS...`, y así está
-- declarado en `whatsapp_mensajes.message_id` (text, script 180).
--
-- Guardar ese valor en una columna `uuid` falla. No se notó antes porque el
-- código nunca llegó a escribir ahí: el insert solo ponía orden, evento y
-- teléfono, así que la columna quedó siempre en NULL y el error no apareció.
--
-- Al empezar a guardarlo --que es lo que permite saber qué orden fue cada aviso
-- en el historial-- el tipo equivocado habría hecho fallar el registro del
-- envío. Y ese registro es lo que impide que un reintento automático le mande
-- el mismo mensaje dos veces al conductor.
--
-- Aditivo e idempotente. La columna está vacía, así que no hay nada que migrar.
-- ============================================================================


-- ----------------------------------------------------------------------------
-- PASO 1 — CÓMO ESTÁ HOY
-- ----------------------------------------------------------------------------

select column_name, data_type
from information_schema.columns
where table_schema = 'public'
  and table_name   = 'notificaciones_conductor_enviadas'
  and column_name  = 'mensaje_id';
-- Si ya dice `text`, este script no tiene nada que hacer.

-- 1b) Confirmar que está vacía antes de tocarla.
select count(*)               as filas,
       count(mensaje_id)      as con_mensaje_id
from public.notificaciones_conductor_enviadas;
-- Lo esperado: `con_mensaje_id` en 0.


-- ----------------------------------------------------------------------------
-- PASO 2 — EL CAMBIO DE TIPO
-- ----------------------------------------------------------------------------
-- `using mensaje_id::text` conserva lo que hubiera: si alguna fila llegara a
-- tener un uuid, queda como su representación en texto en vez de perderse.

do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name   = 'notificaciones_conductor_enviadas'
      and column_name  = 'mensaje_id'
      and data_type    = 'uuid'
  ) then
    alter table public.notificaciones_conductor_enviadas
      alter column mensaje_id type text using mensaje_id::text;
  end if;
end $$;

comment on column public.notificaciones_conductor_enviadas.mensaje_id is
  'Identificador de Meta (wamid...), el mismo de whatsapp_mensajes.message_id. Es TEXTO, no uuid.';


-- ----------------------------------------------------------------------------
-- PASO 3 — VERIFICACIÓN
-- ----------------------------------------------------------------------------

select column_name, data_type
from information_schema.columns
where table_schema = 'public'
  and table_name   = 'notificaciones_conductor_enviadas'
  and column_name  = 'mensaje_id';
-- Esperado: text.

-- 3b) El cruce que hace posible el historial: cada aviso con su estado real.
select e.orden_id,
       e.evento,
       e.telefono,
       m.estado,
       m.error_codigo,
       e.created_at
from public.notificaciones_conductor_enviadas e
left join public.whatsapp_mensajes m on m.message_id = e.mensaje_id
order by e.created_at desc
limit 20;


-- ----------------------------------------------------------------------------
-- REVERSIÓN
-- ----------------------------------------------------------------------------
-- Volver a `uuid` rompería el guardado. Si hiciera falta:
--   alter table public.notificaciones_conductor_enviadas
--     alter column mensaje_id type uuid using mensaje_id::uuid;
-- (falla si hay algún wamid guardado, que es justamente el caso normal)
