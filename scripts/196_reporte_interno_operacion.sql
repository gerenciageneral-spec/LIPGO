-- ============================================================================
-- 196 — REPORTE INTERNO DE OPERACIÓN
-- ----------------------------------------------------------------------------
-- Avisos por WhatsApp a un número interno de LIP con las novedades de cada
-- cargue, en los cinco momentos de la línea de tiempo:
--
--   1. PESAJE          — el vehículo pasó por báscula
--   2. ORDEN CREADA    — se generó la orden de cargue
--   3. LOTE ASIGNADO   — se asignó el lote a la orden
--   4. MUELLE ASIGNADO — el vehículo tiene muelle
--   5. CARGUE CERRADO  — terminó el cargue
--
-- NO ES LO MISMO QUE LA NOTIFICACIÓN AL CONDUCTOR
-- Aquella le escribe al conductor de cada orden. Esta le escribe a LIP: un
-- número fijo, los cinco eventos, y sin encuesta ni enlaces. Comparten la idea
-- pero no el destinatario ni el contenido, así que van en tablas separadas:
-- mezclarlas obligaría a que cada consulta filtrara por "para quién es".
--
-- UNA SOLA PLANTILLA PARA LOS CINCO
-- Tres variables --qué pasó, de qué vehículo y los datos del momento-- dentro
-- de un cuerpo con bastante texto fijo. La proporción importa tanto como el
-- contenido: Meta rechaza como UTILITY una plantilla donde las variables pesan
-- más que lo verificable, porque entonces puede decir cualquier cosa.
--
-- Se llegó aquí por dos rechazos. `plantilla_estandar` (cuerpo entero «Hola
-- {{usuario}}, {{contenido}}») no tenía nada fijo que verificar --ver
-- scripts/193--. Y la primera versión de ESTA, con seis variables, dio:
--
--     "Esta plantilla tiene demasiadas variables en relación con su longitud."
--
-- El PASO 1 tiene el detalle de qué se cambió y por qué.
--
-- CADA EVENTO SE ENCIENDE POR SEPARADO
-- Con ~35 cargues al día, los cinco eventos serían ~175 mensajes diarios por
-- destinatario, y cada uno se cobra. Arrancan todos apagados.
--
-- Aditivo e idempotente.
-- ============================================================================


-- ----------------------------------------------------------------------------
-- PASO 1 — LA PLANTILLA EN WHATSAPP MANAGER (crear a mano, antes de correr)
-- ----------------------------------------------------------------------------
-- LIPgo no puede crear plantillas: las crea una persona en Meta y Meta las
-- aprueba. Este script solo la REGISTRA para que el código sepa qué variables
-- lleva y en qué orden.
--
-- Nombre:    reporte_interno_operacion
-- Categoría: UTILITY  (Utilidad)
-- Idioma:    Español (COL)   -> es_CO
--
-- ENCABEZADO (texto):
--     Reporte Interno Operación
--   FIJO, sin variables. Un encabezado fijo y descriptivo ayuda a que Meta lo
--   lea como aviso operativo, y evita el fallo de mandar un encabezado con
--   variable sin su parámetro.
--
-- CUERPO:
--     Novedad de operación registrada en LIPgo.
--
--     Evento: {{evento}}
--     Vehículo y orden: {{vehiculo}}
--     Detalle: {{detalle}}
--
--     Este reporte corresponde a la operación de cargue de LIP Progressive
--     Integral Logistics.
--
-- POR QUÉ SOLO TRES VARIABLES
-- La primera versión llevaba seis (evento, placa, orden, detalle, hora, sede)
-- y Meta la rechazó:
--
--     "Esta plantilla tiene demasiadas variables en relación con su longitud.
--      Reduce el número de variables o aumenta la longitud del mensaje. Las
--      variables no pueden estar al principio ni al final de la plantilla."
--
-- Dos problemas distintos. Uno, la proporción: seis variables sostenidas por
-- poco texto fijo se parece a una plantilla que puede decir cualquier cosa, que
-- es justo lo que Meta no aprueba como UTILITY. Dos, `{{evento}}` abría el
-- cuerpo, y una variable al principio no deja nada verificable antes de ella.
--
-- Esta versión tiene 165 caracteres de texto fijo para 3 variables --55 por
-- variable-- y ni empieza ni termina con una. `placa` y `orden` se fusionan en
-- `vehiculo` ("ABC123 · IND20260922001"); `hora` y `sede` se van dentro de
-- `detalle`, donde además solo aparecen cuando aportan algo.
--
-- PIE DE PÁGINA:
--     Mensaje automático de LIPgo.
--
-- EJEMPLOS que pide Meta al crearla (los usa para revisar):
--     evento   -> Muelle asignado
--     vehiculo -> ABC123 · Orden IND20260922001
--     detalle  -> Muelle 3 · Conductor: Jorge Ramirez · 14:35 · Harinera Indupan
--
-- OJO CON LOS SALTOS DE LÍNEA: van en el TEXTO FIJO de la plantilla, nunca
-- dentro de una variable. WhatsApp rechaza una variable que traiga saltos.


-- ----------------------------------------------------------------------------
-- PASO 2 — REGISTRARLA EN LIPgo
-- ----------------------------------------------------------------------------

insert into public.whatsapp_plantillas
  (nombre, idioma, descripcion, uso, variables)
values (
  'reporte_interno_operacion',
  'es_CO',
  'Reporte interno de la operación: pesaje, orden, lote, muelle y cierre de cargue.',
  'Los cinco avisos internos de la línea de tiempo del cargue. Es UTILITY, así que no tiene el tope por destinatario de las de MARKETING.',
  '{"header": [], "body": ["evento", "vehiculo", "detalle"]}'::jsonb
)
on conflict (nombre) do update
  set idioma      = excluded.idioma,
      descripcion = excluded.descripcion,
      uso         = excluded.uso,
      variables   = excluded.variables;


-- ----------------------------------------------------------------------------
-- PASO 3 — CONFIGURACIÓN POR EVENTO
-- ----------------------------------------------------------------------------
-- Mismo criterio que la notificación al conductor (script 182): el texto y el
-- interruptor los maneja quien opera, no quien programa.

create table if not exists public.reporte_interno_config (
  id serial primary key,

  -- pesaje | orden_creada | lote_asignado | muelle_asignado | cargue_cerrado
  evento text not null unique,
  nombre text not null,
  -- Para ordenarlos en la pantalla según la línea de tiempo real.
  orden_linea int not null default 0,

  activo boolean not null default false,

  /*
   * Qué se manda en la variable `detalle`.
   *
   * Admite marcadores que se reemplazan al enviar. Los disponibles dependen
   * del evento --no hay muelle en el pesaje, ni peso al crear la orden-- y la
   * pantalla solo ofrece los que aplican:
   *   {conductor} {cliente} {muelle} {lote} {peso} {tiquete}
   *   {transporte} {hora} {sede}
   *
   * `placa` y `orden` NO están aquí: van en la variable `vehiculo` de la
   * plantilla, siempre, y repetirlos los diría dos veces.
   *
   * Un marcador sin dato se reemplaza por vacío, no rompe el envío.
   *
   * NO puede llevar saltos de línea: viaja dentro de una variable y WhatsApp
   * los rechaza ahí.
   */
  detalle text not null,

  /*
   * Empresas donde aplica. Arreglo vacío = NINGUNA, no todas.
   *
   * Habilitar por omisión haría que activar un evento empezara a mandar
   * mensajes de proyectos que nadie revisó.
   */
  empresas int[] not null default '{}',

  actualizado_por text,
  updated_at timestamptz default now(),
  created_at timestamptz default now()
);

comment on table public.reporte_interno_config is
  'Los cinco avisos internos de operación. Cada uno se enciende por separado: con ~35 cargues al dia, los cinco son ~175 mensajes diarios por destinatario. Ver scripts/196.';


-- ----------------------------------------------------------------------------
-- PASO 4 — A QUIÉN SE LE MANDA
-- ----------------------------------------------------------------------------
-- Tabla aparte y no una columna de texto, porque va a crecer: primero un
-- número de prueba, después un grupo o varios destinatarios. Con filas, agregar
-- a alguien no exige un script.
--
-- `solo_eventos` vacío = todos los activos. Permite que coordinación reciba
-- muelle y lote mientras gerencia solo recibe el cierre, sin duplicar la
-- configuración.

create table if not exists public.reporte_interno_destinatarios (
  id serial primary key,
  nombre text not null,
  telefono text not null,
  activo boolean not null default true,
  solo_eventos text[] not null default '{}',
  created_at timestamptz default now()
);

-- Un mismo número no puede estar dos veces: recibiría cada aviso duplicado y
-- se cobrarían los dos.
create unique index if not exists uq_reporte_interno_telefono
  on public.reporte_interno_destinatarios (telefono);

comment on column public.reporte_interno_destinatarios.solo_eventos is
  'Arreglo vacio = recibe TODOS los eventos activos. Con valores, solo esos.';


-- ----------------------------------------------------------------------------
-- PASO 5 — EVITAR EL AVISO DUPLICADO
-- ----------------------------------------------------------------------------
-- Reasignar un muelle, corregir un peso o volver a guardar una orden dispararía
-- el mismo aviso otra vez.

create table if not exists public.reporte_interno_enviados (
  id serial primary key,
  orden_id bigint not null,
  evento text not null,
  telefono text,
  mensaje_id text,
  -- Por qué no salió, cuando aplica. NULL si se envió.
  motivo text,
  created_at timestamptz default now()
);

-- Una vez por orden, evento y destinatario.
create unique index if not exists uq_reporte_interno_envio
  on public.reporte_interno_enviados (orden_id, evento, telefono);


-- ----------------------------------------------------------------------------
-- PASO 6 — SEMILLA DE LOS CINCO EVENTOS
-- ----------------------------------------------------------------------------
-- Todos DESACTIVADOS y sin empresas. Encenderlos es una decisión de una
-- persona desde la pantalla.

insert into public.reporte_interno_config
  (evento, nombre, orden_linea, activo, detalle, empresas)
values
  ('pesaje',          'Pesaje del vehículo', 1, false,
   'Peso: {peso} kg · Tiquete: {tiquete} · Conductor: {conductor} · {hora} · {sede}', '{}'),
  ('orden_creada',    'Orden de cargue creada', 2, false,
   'Conductor: {conductor} · Transporte: {transporte} · Peso programado: {peso} kg · {hora} · {sede}', '{}'),
  ('lote_asignado',   'Lote asignado', 3, false,
   'Lote: {lote} · Cliente: {cliente} · {hora} · {sede}', '{}'),
  ('muelle_asignado', 'Muelle asignado', 4, false,
   'Muelle {muelle} · Conductor: {conductor} · {hora} · {sede}', '{}'),
  ('cargue_cerrado',  'Cargue finalizado', 5, false,
   'Conductor: {conductor} · Peso: {peso} kg · {hora} · {sede}', '{}')
on conflict (evento) do nothing;


-- ----------------------------------------------------------------------------
-- PASO 7 — EL NÚMERO DE PRUEBA
-- ----------------------------------------------------------------------------
-- El mismo que se viene usando para las pruebas de WhatsApp. Se cambia desde
-- la pantalla cuando pase a los destinatarios reales.

insert into public.reporte_interno_destinatarios (nombre, telefono, activo)
values ('Pruebas', '573202343157', true)
on conflict (telefono) do nothing;


-- ----------------------------------------------------------------------------
-- PASO 8 — VERIFICACIÓN (solo lecturas)
-- ----------------------------------------------------------------------------

-- 8a) Los cinco eventos, en orden de la línea de tiempo.
select orden_linea, evento, nombre, activo, empresas, detalle
from public.reporte_interno_config
order by orden_linea;

-- 8b) Deben arrancar los cinco apagados.
select count(*) filter (where activo) as activos,
       count(*)                       as total
from public.reporte_interno_config;
-- Esperado: 0 activos de 5.

-- 8c) A quién le llegaría.
select nombre, telefono, activo, solo_eventos
from public.reporte_interno_destinatarios
order by nombre;

-- 8d) Todavía no se ha enviado ninguno.
select count(*) as avisos_enviados from public.reporte_interno_enviados;

-- 8e) Cuántos mensajes diarios implicaría encender todo, con el volumen real
--     de los últimos 30 días. El número que decide qué eventos vale la pena
--     activar.
select round(count(*) / 30.0, 1)     as cargues_por_dia,
       round(count(*) / 30.0 * 5, 0) as mensajes_por_dia_si_se_activan_los_cinco
from public.cabeceraoc
where fechacargue >= current_date - 30;


-- ----------------------------------------------------------------------------
-- REVERSIÓN
-- ----------------------------------------------------------------------------
--   drop table if exists public.reporte_interno_enviados;
--   drop table if exists public.reporte_interno_destinatarios;
--   drop table if exists public.reporte_interno_config;
--   delete from public.whatsapp_plantillas where nombre = 'reporte_interno_operacion';
