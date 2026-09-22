-- ============================================================================
-- 185 — ¿A QUÉ BASE ESTOY CONECTADO?
-- ----------------------------------------------------------------------------
-- Diagnóstico. NO modifica nada: solo lecturas.
--
-- POR QUÉ
-- La pantalla de Notificación conductor muestra la configuración leída de
-- `notificaciones_conductor_config`, pero el editor SQL responde que esa tabla
-- no existe. Las dos cosas no pueden ser ciertas en la misma base: o el editor
-- está apuntando a otro proyecto de Supabase, o la tabla quedó en un esquema
-- distinto de `public`.
--
-- Esto lo resuelve sin adivinar.
-- ============================================================================


-- ----------------------------------------------------------------------------
-- 1 — IDENTIFICAR LA BASE
-- ----------------------------------------------------------------------------
-- Comparar este resultado con el proyecto de Supabase que usa producción. Si no
-- coinciden, el editor está en otro proyecto y ahí está toda la explicación.

select current_database()          as base,
       current_user                as usuario,
       current_schema()            as esquema_por_defecto,
       inet_server_addr()::text    as servidor;


-- ----------------------------------------------------------------------------
-- 2 — ¿EXISTE LA TABLA, EN CUALQUIER ESQUEMA?
-- ----------------------------------------------------------------------------
-- El script 182 la crea en `public`. Si aparece en otro esquema, el problema es
-- dónde quedó, no si existe.

select table_schema, table_name
from information_schema.tables
where table_name in (
        'notificaciones_conductor_config',
        'notificaciones_conductor_enviadas',
        'sig_satisfaccion',
        'whatsapp_plantillas'
      )
order by table_name, table_schema;
-- Si sale vacío: en ESTA base no se ha corrido ninguno de esos scripts.


-- ----------------------------------------------------------------------------
-- 3 — LAS TABLAS QUE SÍ ESTÁN
-- ----------------------------------------------------------------------------
-- Sirve para reconocer la base: si aparecen `cabeceraoc`, `headcount` y
-- `registroasistencia`, es la base de LIPgo. Si no aparece ninguna, el editor
-- está en un proyecto vacío o distinto.

select count(*) as tablas_en_public
from information_schema.tables
where table_schema = 'public';

select table_name
from information_schema.tables
where table_schema = 'public'
  and table_name in ('cabeceraoc', 'headcount', 'registroasistencia', 'empresas', 'permisos_usuarios')
order by table_name;


-- ----------------------------------------------------------------------------
-- 4 — SI EL PASO 2 ENCONTRÓ LA TABLA, VER QUÉ TIENE DENTRO
-- ----------------------------------------------------------------------------
-- Correr solo si el paso 2 la listó. Es la consulta que el 184 no pudo hacer.
--
--   select evento, activo, url_encuesta, empresas, telefono_prueba
--   from public.notificaciones_conductor_config
--   order by evento;
