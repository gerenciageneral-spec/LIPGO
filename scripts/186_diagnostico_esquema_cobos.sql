-- ============================================================================
-- 186 — EL ESQUEMA `cobos` Y EL ERROR DEL 184
-- ----------------------------------------------------------------------------
-- Diagnóstico. NO modifica nada: solo lecturas.
--
-- DOS COSAS QUE ACLARAR
--
-- 1) El 184 falló diciendo que `public.notificaciones_conductor_config` no
--    existe, pero el 185 la encontró justo ahí. Alguna de las dos lecturas se
--    hizo en condiciones distintas: otra sesión, otro rol, o el editor sin
--    refrescar. Importa porque el 184 es un UPDATE: si falla por permisos y no
--    por ausencia, el mensaje despista.
--
-- 2) Apareció `cobos.sig_satisfaccion`, una SEGUNDA copia de la tabla de
--    encuestas en un esquema que ningún script nuestro crea. Si algo escribe
--    ahí, esas respuestas no cuentan en el indicador --que lee `public`-- y
--    nadie se enteraría.
-- ============================================================================


-- ----------------------------------------------------------------------------
-- 1 — QUÉ VE ESTA SESIÓN
-- ----------------------------------------------------------------------------
-- `search_path` decide qué tabla se usa cuando no se escribe el esquema. Si
-- `cobos` va antes que `public`, un `select ... from sig_satisfaccion` sin
-- prefijo lee la copia, no la real.

select current_user                as usuario,
       current_schema()            as esquema_actual,
       current_setting('search_path') as search_path;


-- ----------------------------------------------------------------------------
-- 2 — ¿LA TABLA DEL 184 ES VISIBLE Y ESCRIBIBLE AQUÍ?
-- ----------------------------------------------------------------------------

select to_regclass('public.notificaciones_conductor_config') as la_ve;
-- Si devuelve el nombre, existe y esta sesión la ve. Si devuelve NULL, no.

select has_table_privilege(
         current_user,
         'public.notificaciones_conductor_config',
         'SELECT, UPDATE'
       ) as puede_leer_y_escribir;
-- false explicaría un error que parece "no existe" pero es de permisos.


-- ----------------------------------------------------------------------------
-- 3 — LO QUE EL 184 QUERÍA VER
-- ----------------------------------------------------------------------------
-- Esta es la consulta que no pudo correr. Muestra si el marcador sigue ahí.

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
-- 4 — QUÉ ES EL ESQUEMA `cobos`
-- ----------------------------------------------------------------------------

select nspname as esquema, pg_get_userbyid(nspowner) as dueno
from pg_namespace
where nspname not in ('pg_catalog', 'information_schema', 'public')
  and nspname not like 'pg_%'
order by nspname;

-- 4b) Qué tablas tiene, y cuántas filas.
select table_name
from information_schema.tables
where table_schema = 'cobos'
order by table_name;

-- 4c) La pregunta que decide si importa: ¿tiene datos?
--     Si está en 0, es una copia vacía --probablemente de una prueba-- y no
--     afecta nada. Si tiene filas, hay encuestas que el indicador no está
--     contando.
select count(*)                                   as filas,
       count(*) filter (where tipo = 'conductor') as de_conductor,
       min(created_at)                            as primera,
       max(created_at)                            as ultima
from cobos.sig_satisfaccion;

-- 4d) Para comparar, la que sí usa el indicador.
select count(*)                                   as filas,
       count(*) filter (where tipo = 'conductor') as de_conductor,
       min(created_at)                            as primera,
       max(created_at)                            as ultima
from public.sig_satisfaccion;


-- ----------------------------------------------------------------------------
-- 5 — ¿LA COPIA TIENE LO QUE PIDE LA ENCUESTA?
-- ----------------------------------------------------------------------------
-- `ref_orden` lo agrega sig/33. Saber si está en una, en otra o en ninguna
-- dice cuál script se corrió y dónde.

select table_schema, column_name
from information_schema.columns
where table_name = 'sig_satisfaccion'
  and column_name in ('ref_orden', 'placa', 'orden_id')
order by table_schema, column_name;
