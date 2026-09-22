-- ============================================================================
-- 182 — NOTIFICACIÓN AL CONDUCTOR
-- ----------------------------------------------------------------------------
-- Avisos automáticos por WhatsApp al conductor en dos momentos de la operación:
--
--   1. ASIGNACIÓN DE MUELLE  — "su vehículo fue asignado al muelle N"
--   2. FIN DE CARGUE         — "puede pasar a recogerlo" + encuesta
--
-- POR QUÉ LA CONFIGURACIÓN VA EN LA BASE Y NO EN EL CÓDIGO
-- El texto de estos mensajes lo ajusta quien opera, no quien programa: una
-- redacción distinta no puede exigir un despliegue. Y el interruptor de
-- activado/desactivado tiene que poder bajarse en segundos si algo sale mal --
-- cada mensaje se cobra y va a un teléfono real.
--
-- EL NÚMERO DE PRUEBA ES PARTE DE LA CONFIGURACIÓN, NO UNA CONSTANTE
-- Mientras `telefono_prueba` tenga valor, TODOS los avisos van ahí en vez de al
-- conductor. Es lo que permite probar en producción sin escribirle a nadie.
-- Vaciarlo es lo que "pone en real" el flujo, y es una decisión consciente de
-- una persona, no un cambio de código.
--
-- Aditivo e idempotente.
-- ============================================================================


-- ----------------------------------------------------------------------------
-- PASO 1 — CONFIGURACIÓN POR EVENTO
-- ----------------------------------------------------------------------------

create table if not exists public.notificaciones_conductor_config (
  id serial primary key,

  -- Qué dispara el aviso: 'muelle_asignado' | 'cargue_finalizado'
  evento text not null unique,
  nombre text not null,

  -- El interruptor. En false no se envía nada, aunque todo lo demás esté listo.
  activo boolean not null default false,

  /*
   * El texto que recibe el conductor.
   *
   * Admite estos marcadores, que se reemplazan al enviar:
   *   {conductor}  nombre del conductor
   *   {muelle}     número de muelle
   *   {placa}      placa del vehículo
   *   {orden}      número de la orden de cargue
   *   {cliente}    empresa para la que se cargó
   *   {encuesta}   el enlace de `url_encuesta`
   *
   * El mensaje viaja en la variable `contenido` de la plantilla estándar, así
   * que NO puede llevar saltos de línea: WhatsApp los rechaza dentro de una
   * variable. El envío los convierte en separadores por si acaso.
   */
  mensaje text not null,

  -- Título del aviso. Va en el encabezado de la plantilla.
  titulo text not null default 'LIP Logística',

  -- Enlace de la encuesta, para el marcador {encuesta}. Solo aplica al cierre.
  url_encuesta text,

  /*
   * Empresas donde el aviso está habilitado.
   *
   * Un arreglo vacío significa NINGUNA, no todas: habilitar por omisión haría
   * que activar el evento empezara a escribirle a conductores de proyectos que
   * nadie revisó.
   */
  empresas int[] not null default '{}',

  /*
   * Desvío de pruebas. Con valor, TODOS los mensajes van a este número en vez
   * de al conductor.
   *
   * Vaciarlo es lo que pone el flujo en real. Mientras tenga valor, ninguna
   * persona externa recibe nada.
   */
  telefono_prueba text,

  actualizado_por text,
  updated_at timestamptz default now(),
  created_at timestamptz default now()
);

comment on table public.notificaciones_conductor_config is
  'Configuración de los avisos automáticos al conductor. Ver scripts/182_notificacion_conductor.sql';
comment on column public.notificaciones_conductor_config.telefono_prueba is
  'Con valor, TODOS los avisos van a este número en vez de al conductor. Vaciarlo pone el flujo en real.';
comment on column public.notificaciones_conductor_config.empresas is
  'Arreglo vacío = ninguna empresa habilitada. No significa "todas".';


-- ----------------------------------------------------------------------------
-- PASO 2 — EVITAR EL AVISO DUPLICADO
-- ----------------------------------------------------------------------------
-- Reasignar un muelle, o volver a guardar una orden ya cerrada, dispararía el
-- mismo aviso otra vez. Al conductor le llegarían dos mensajes iguales y se
-- cobrarían los dos.
--
-- Esta tabla recuerda qué se envió ya, por orden y evento.

create table if not exists public.notificaciones_conductor_enviadas (
  id serial primary key,
  orden_id bigint not null,
  evento text not null,
  telefono text,
  -- Referencia a la fila de whatsapp_mensajes, para ver si llegó.
  mensaje_id uuid,
  created_at timestamptz default now()
);

-- La llave de la idempotencia: una vez por orden y evento.
create unique index if not exists uq_notif_conductor
  on public.notificaciones_conductor_enviadas (orden_id, evento);


-- ----------------------------------------------------------------------------
-- PASO 3 — SEMILLA DE LOS DOS EVENTOS
-- ----------------------------------------------------------------------------
-- Ambos arrancan DESACTIVADOS y con el teléfono de prueba puesto: activarlos y
-- quitar el desvío son decisiones que toma una persona desde la pantalla.

insert into public.notificaciones_conductor_config
  (evento, nombre, activo, mensaje, titulo, url_encuesta, empresas, telefono_prueba)
values
  (
    'muelle_asignado',
    'Asignación de muelle',
    false,
    'su vehículo de placa {placa} fue asignado al muelle {muelle}.',
    'LIP Logística',
    null,
    '{}',
    '573202343157'
  ),
  (
    'cargue_finalizado',
    'Fin de cargue',
    false,
    'su vehículo de placa {placa} ha finalizado su cargue y puede pasar a recogerlo. Cuéntenos cómo le fue: {encuesta}',
    'LIP Logística',
    -- Vacío a propósito: con NULL, el aviso arma el enlace a la encuesta PROPIA
    -- de LIPgo (/encuesta/<token>), que guarda la respuesta en
    -- `sig_satisfaccion` y alimenta el KPI de Satisfacción conductor. Poner acá
    -- una URL externa la reemplaza, y entonces las respuestas quedan fuera del
    -- indicador.
    null,
    '{}',
    '573202343157'
  )
on conflict (evento) do nothing;


-- ----------------------------------------------------------------------------
-- PASO 4 — VERIFICACIÓN (solo lecturas)
-- ----------------------------------------------------------------------------

-- 4a) Los dos eventos, con su estado.
select evento, nombre, activo, empresas, telefono_prueba, url_encuesta
from public.notificaciones_conductor_config
order by evento;

-- 4b) Deben arrancar DESACTIVADOS y con el desvío de pruebas puesto.
select count(*) filter (where activo) as activos,
       count(*) filter (where telefono_prueba is not null) as con_desvio_de_prueba,
       count(*) as total
from public.notificaciones_conductor_config;

-- 4c) Todavía no se ha enviado ninguno.
select count(*) as avisos_enviados from public.notificaciones_conductor_enviadas;

-- 4d) ¿Qué columna de cabeceraoc tiene el teléfono del conductor?
--     Hace falta saberlo ANTES de quitar el desvío de pruebas: sin ella, el
--     aviso no tendría a dónde ir.
select column_name, data_type
from information_schema.columns
where table_schema = 'public'
  and table_name = 'cabeceraoc'
  and (column_name ilike '%conductor%'
       or column_name ilike '%celular%'
       or column_name ilike '%telefono%')
order by column_name;


-- ----------------------------------------------------------------------------
-- REVERSIÓN
-- ----------------------------------------------------------------------------
--   drop table if exists public.notificaciones_conductor_enviadas;
--   drop table if exists public.notificaciones_conductor_config;
