-- ============================================================================
-- 186 — POR QUÉ FALLÓ EL 184
-- ----------------------------------------------------------------------------
-- Diagnóstico. NO modifica nada: solo lecturas.
--
-- EL 184 FALLÓ DICIENDO QUE LA TABLA NO EXISTE, PERO SÍ EXISTE
-- El 185 encontró `public.notificaciones_conductor_config` justo donde el 184
-- dijo que no estaba. Alguna de las dos lecturas se hizo en condiciones
-- distintas: otro rol, otra sesión, o el editor sin refrescar su caché de
-- esquema.
--
-- Importa porque el 184 es un UPDATE. Si el motivo real fueran permisos,
-- Postgres lo reporta con un mensaje que parece de tabla ausente, y se pierde
-- el tiempo buscando en el lugar equivocado --como pasó aquí--.
--
-- SOBRE EL ESQUEMA `cobos`
-- El 185 encontró un `cobos.sig_satisfaccion`. Este proyecto usa ÚNICAMENTE
-- `public`: la aplicación no llama nunca a `.schema()`, así que lo que esté en
-- otro esquema es invisible para LIPgo. No se consulta ni se toca aquí; queda
-- solo la comprobación de que lo nuestro está donde debe.
-- ============================================================================


-- ----------------------------------------------------------------------------
-- 1 — QUÉ VE ESTA SESIÓN
-- ----------------------------------------------------------------------------
-- `search_path` decide dónde se crea o se busca una tabla cuando no se escribe
-- el esquema. Es la razón por la que todos los scripts dicen `public.`
-- explícitamente: sin eso, el mismo script deja la tabla en sitios distintos
-- según quién lo corra.

select current_user                   as usuario,
       current_schema()               as esquema_actual,
       current_setting('search_path') as search_path;


-- ----------------------------------------------------------------------------
-- 2 — ¿LA TABLA DEL 184 ES VISIBLE Y ESCRIBIBLE AQUÍ?
-- ----------------------------------------------------------------------------

select to_regclass('public.notificaciones_conductor_config') as la_ve;
-- Devuelve el nombre si existe y esta sesión la ve; NULL si no.

select has_table_privilege(
         current_user,
         'public.notificaciones_conductor_config',
         'SELECT, UPDATE'
       ) as puede_leer_y_escribir;
-- false explicaría un error que parece "no existe" pero es de permisos.


-- ----------------------------------------------------------------------------
-- 3 — LO QUE EL 184 QUERÍA VER
-- ----------------------------------------------------------------------------
-- Esta es la consulta que no pudo correr: si el marcador muerto sigue ahí.

select evento,
       activo,
       url_encuesta,
       case
         when url_encuesta is null then 'usa la encuesta de LIPgo'
         when url_encuesta = 'https://forms.gle/PENDIENTE' then 'MARCADOR MUERTO'
         else 'formulario externo'
       end as diagnostico,
       empresas,
       telefono_prueba
from public.notificaciones_conductor_config
order by evento;


-- ----------------------------------------------------------------------------
-- 4 — QUÉ SCRIPTS ESTÁN CORRIDOS EN `public`
-- ----------------------------------------------------------------------------
-- Dice qué falta sin tener que correr cada script para averiguarlo.

select 'sig/15 — sig_satisfaccion'            as script,
       (to_regclass('public.sig_satisfaccion') is not null) as corrido
union all
select 'sig/33 — ref_orden en sig_satisfaccion',
       exists (select 1 from information_schema.columns
               where table_schema = 'public'
                 and table_name   = 'sig_satisfaccion'
                 and column_name  = 'ref_orden')
union all
select '180 — whatsapp_plantillas',
       (to_regclass('public.whatsapp_plantillas') is not null)
union all
select '182 — notificaciones_conductor_config',
       (to_regclass('public.notificaciones_conductor_config') is not null)
union all
select '183 — idx_satisfaccion_tipo_fecha',
       exists (select 1 from pg_indexes
               where schemaname = 'public'
                 and indexname  = 'idx_satisfaccion_tipo_fecha')
order by script;


-- ----------------------------------------------------------------------------
-- 5 — QUE NADA DE LIPgo HAYA QUEDADO FUERA DE `public`
-- ----------------------------------------------------------------------------
-- Si alguna de nuestras tablas aparece en otro esquema, el script que la creó
-- corrió sin el prefijo `public.` y la dejó donde la aplicación no la lee.

select table_schema, table_name
from information_schema.tables
where table_schema not in ('public', 'pg_catalog', 'information_schema')
  and table_schema not like 'pg_%'
  and (table_name like 'sig_%'
       or table_name like 'whatsapp_%'
       or table_name like 'notificaciones_%')
order by table_schema, table_name;
-- Lo esperado aquí es que salga VACÍO. Lo que aparezca no lo usa LIPgo.
