-- ============================================================================
-- 192 — COBERTURA REAL DEL AVISO, CONTANDO EL RESPALDO
-- ----------------------------------------------------------------------------
-- Diagnóstico. NO modifica nada: solo lecturas.
--
-- EL 190 MIDIÓ LAS DOS FUENTES POR SEPARADO, Y ESO SUBESTIMA
-- Dio 37,5% de cargues con celular en `cabeceraoc`, y aparte 41,3% de citas con
-- teléfono. Pero el aviso usa `citasvehiculos.telefono` CUANDO `cabeceraoc.celular`
-- viene vacío, así que lo que importa es cuántos cargues tienen AL MENOS UNO
-- de los dos --y eso no se puede sumar: los dos porcentajes se solapan.
--
-- LA PREGUNTA QUE RESPONDE
-- De los cargues reales, ¿a cuántos conductores se les podría escribir hoy?
-- Ese número decide si el aviso se activa ya, se activa para una empresa, o
-- primero hay que capturar el dato.
--
-- El cruce es por `citasvehiculos.ocargue = cabeceraoc.ordendecargue`, el mismo
-- que usa el código del aviso.
-- ============================================================================


-- ----------------------------------------------------------------------------
-- 1 — COBERTURA COMBINADA
-- ----------------------------------------------------------------------------

with util as (
  -- Misma regla que `normalizarTelefono`: se quitan los no-dígitos y se mira
  -- el largo. Se define una vez para no repetirla en cada consulta.
  select o.id,
         o.idempresa,
         o.fechacargue,
         regexp_replace(coalesce(o.celular, ''), '[^0-9]', '', 'g')   as dig_orden,
         regexp_replace(coalesce(c.telefono, ''), '[^0-9]', '', 'g')  as dig_cita
  from public.cabeceraoc o
  left join public.citasvehiculos c on c.ocargue = o.ordendecargue
  where o.fechacargue >= current_date - 90
),
clasificado as (
  select id, idempresa, fechacargue,
         ((length(dig_orden) = 10 and dig_orden like '3%')
          or (length(dig_orden) = 12 and dig_orden like '57%')) as sirve_orden,
         ((length(dig_cita) = 10 and dig_cita like '3%')
          or (length(dig_cita) = 12 and dig_cita like '57%'))   as sirve_cita
  from util
)
select count(*)                                                as cargues,
       count(*) filter (where sirve_orden)                      as por_la_orden,
       count(*) filter (where not sirve_orden and sirve_cita)   as solo_por_la_cita,
       count(*) filter (where sirve_orden or sirve_cita)        as se_le_puede_escribir,
       round(100.0 * count(*) filter (where sirve_orden or sirve_cita) / nullif(count(*), 0), 1)
                                                                as pct_cobertura
from clasificado;
-- `solo_por_la_cita` es lo que el 190 no vio: cargues sin celular en la orden
-- que SÍ se pueden avisar gracias al respaldo.


-- ----------------------------------------------------------------------------
-- 2 — POR EMPRESA
-- ----------------------------------------------------------------------------
-- El aviso se habilita por empresa. Si una tiene el dato completo y otra no,
-- se puede arrancar por la que sí, en vez de esperar a todas.

with util as (
  select o.id, o.idempresa,
         regexp_replace(coalesce(o.celular, ''), '[^0-9]', '', 'g')  as dig_orden,
         regexp_replace(coalesce(c.telefono, ''), '[^0-9]', '', 'g') as dig_cita
  from public.cabeceraoc o
  left join public.citasvehiculos c on c.ocargue = o.ordendecargue
  where o.fechacargue >= current_date - 90
)
select idempresa,
       count(*) as cargues,
       count(*) filter (
         where (length(dig_orden) = 10 and dig_orden like '3%')
            or (length(dig_orden) = 12 and dig_orden like '57%')
            or (length(dig_cita)  = 10 and dig_cita  like '3%')
            or (length(dig_cita)  = 12 and dig_cita  like '57%')
       ) as se_le_puede_escribir,
       round(100.0 * count(*) filter (
         where (length(dig_orden) = 10 and dig_orden like '3%')
            or (length(dig_orden) = 12 and dig_orden like '57%')
            or (length(dig_cita)  = 10 and dig_cita  like '3%')
            or (length(dig_cita)  = 12 and dig_cita  like '57%')
       ) / nullif(count(*), 0), 1) as pct
from util
group by idempresa
order by cargues desc;


-- ----------------------------------------------------------------------------
-- 3 — ¿ESTÁ MEJORANDO O EMPEORANDO?
-- ----------------------------------------------------------------------------
-- Si la captura del celular es recente, el promedio de 90 días esconde que el
-- mes pasado ya se está registrando bien. Decide si conviene esperar o no.

with util as (
  select o.id,
         date_trunc('month', o.fechacargue)::date as mes,
         regexp_replace(coalesce(o.celular, ''), '[^0-9]', '', 'g')  as dig_orden,
         regexp_replace(coalesce(c.telefono, ''), '[^0-9]', '', 'g') as dig_cita
  from public.cabeceraoc o
  left join public.citasvehiculos c on c.ocargue = o.ordendecargue
  where o.fechacargue >= current_date - 180
)
select mes,
       count(*) as cargues,
       count(*) filter (
         where (length(dig_orden) = 10 and dig_orden like '3%')
            or (length(dig_orden) = 12 and dig_orden like '57%')
            or (length(dig_cita)  = 10 and dig_cita  like '3%')
            or (length(dig_cita)  = 12 and dig_cita  like '57%')
       ) as con_telefono,
       round(100.0 * count(*) filter (
         where (length(dig_orden) = 10 and dig_orden like '3%')
            or (length(dig_orden) = 12 and dig_orden like '57%')
            or (length(dig_cita)  = 10 and dig_cita  like '3%')
            or (length(dig_cita)  = 12 and dig_cita  like '57%')
       ) / nullif(count(*), 0), 1) as pct
from util
group by mes
order by mes;


-- ----------------------------------------------------------------------------
-- 4 — ¿DE DÓNDE SALE EL CELULAR CUANDO SÍ ESTÁ?
-- ----------------------------------------------------------------------------
-- Si el dato aparece casi siempre en la cita y casi nunca en la orden, el
-- lugar donde hay que pedirlo es la cita, no la orden.

with util as (
  select o.id,
         regexp_replace(coalesce(o.celular, ''), '[^0-9]', '', 'g')  as dig_orden,
         regexp_replace(coalesce(c.telefono, ''), '[^0-9]', '', 'g') as dig_cita
  from public.cabeceraoc o
  left join public.citasvehiculos c on c.ocargue = o.ordendecargue
  where o.fechacargue >= current_date - 90
)
select case
         when (length(dig_orden) = 10 and dig_orden like '3%') and
              (length(dig_cita)  = 10 and dig_cita  like '3%')  then 'en las dos'
         when (length(dig_orden) = 10 and dig_orden like '3%')  then 'solo en la orden'
         when (length(dig_cita)  = 10 and dig_cita  like '3%')  then 'solo en la cita'
         else                                                        'en ninguna'
       end as donde,
       count(*) as cargues
from util
group by 1
order by cargues desc;
