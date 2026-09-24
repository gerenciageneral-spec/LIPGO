-- ============================================================================
-- 197 — ENVÍO AUTOMÁTICO DEL CIERRE DIARIO DE PRODUCCIÓN
-- ----------------------------------------------------------------------------
-- El cierre del día de producción sale en PDF por WhatsApp. Hoy se manda a mano
-- desde el Dashboard de Producción; esto permite programarlo y decidir a
-- quiénes les llega.
--
-- POR QUÉ UNA TABLA DE UNA SOLA FILA
-- Es una sola configuración, no una por evento: hay un solo cierre al día. Una
-- tabla con `id = 1` fijo deja que quien opera cambie la hora y el interruptor
-- sin desplegar código, que es la misma razón por la que existen las tablas de
-- los otros avisos.
--
-- LA HORA SE GUARDA, PERO EL CRON NO LA LEE
-- Vercel programa los crons en `vercel.json`, no en la base: cambiar la hora
-- aquí NO cambia cuándo corre. Lo que hace esta columna es decirle al cron si
-- ya es su hora, para que un despliegue con la hora equivocada no mande el
-- reporte a deshora. Si se quiere cambiar de verdad, hay que tocar las dos.
--
-- Aditivo e idempotente.
-- ============================================================================


-- ----------------------------------------------------------------------------
-- PASO 1 — LA CONFIGURACIÓN
-- ----------------------------------------------------------------------------

create table if not exists public.cierre_produccion_config (
  -- Fila única. El check impide que alguien agregue una segunda y que después
  -- nadie sepa cuál manda.
  id int primary key default 1 check (id = 1),

  activo boolean not null default false,

  /*
   * Hora de envío, en hora de Colombia.
   *
   * El cron de Vercel se programa aparte, en `vercel.json`, y corre en UTC.
   * Esta columna es la verificación: el cron comprueba que sea su hora antes
   * de mandar nada. Así, si las dos se desalinean, no sale un reporte a las
   * 3 de la mañana.
   */
  hora_envio time not null default '20:00',

  /*
   * Empresa cuyas cifras se reportan.
   *
   * Fija en 1 porque la producción NO está segmentada por empresa: ninguna
   * consulta del dashboard filtra por `idempresa`. Se deja como columna para
   * el día en que sí se pueda atribuir.
   */
  empresa_id int not null default 1,

  actualizado_por text,
  updated_at timestamptz default now(),
  created_at timestamptz default now()
);

comment on table public.cierre_produccion_config is
  'Configuracion del envio automatico del cierre diario de produccion. Fila unica. La hora real del cron esta en vercel.json; esta columna es la verificacion. Ver scripts/197.';


-- ----------------------------------------------------------------------------
-- PASO 2 — A QUIÉNES LES LLEGA
-- ----------------------------------------------------------------------------
-- Tabla aparte, igual que en el reporte interno: la lista va a crecer y
-- agregar a alguien no debe exigir un script.

create table if not exists public.cierre_produccion_destinatarios (
  id serial primary key,
  nombre text not null,
  telefono text not null,
  activo boolean not null default true,
  created_at timestamptz default now()
);

-- Un mismo número no puede estar dos veces: recibiría el PDF duplicado y se
-- cobrarían los dos mensajes.
create unique index if not exists uq_cierre_prod_telefono
  on public.cierre_produccion_destinatarios (telefono);


-- ----------------------------------------------------------------------------
-- PASO 3 — QUÉ SE MANDÓ Y CUÁNDO
-- ----------------------------------------------------------------------------
-- Sin esto, un cron que corriera dos veces --un redespliegue, un reintento--
-- mandaría el mismo cierre otra vez y se cobraría de nuevo.

create table if not exists public.cierre_produccion_enviados (
  id serial primary key,
  fecha date not null,
  telefono text not null,
  mensaje_id text,
  -- Por qué no salió, cuando aplica. NULL si se envió.
  motivo text,
  -- 'manual' o 'automatico', para distinguir las pruebas de lo programado.
  origen text not null default 'automatico',
  created_at timestamptz default now()
);

-- Una vez por día y destinatario, SOLO para los automáticos. Las pruebas
-- manuales se pueden repetir: es justo lo que se hace al probar.
create unique index if not exists uq_cierre_prod_envio
  on public.cierre_produccion_enviados (fecha, telefono)
  where origen = 'automatico';


-- ----------------------------------------------------------------------------
-- PASO 4 — SEMILLA
-- ----------------------------------------------------------------------------
-- Arranca DESACTIVADO. Encenderlo es una decisión de una persona desde la
-- pantalla, después de haber visto el PDF.

insert into public.cierre_produccion_config (id, activo, hora_envio, empresa_id)
values (1, false, '20:00', 1)
on conflict (id) do nothing;

-- El mismo número que se viene usando para las pruebas de WhatsApp.
insert into public.cierre_produccion_destinatarios (nombre, telefono, activo)
values ('Pruebas', '573202343157', true)
on conflict (telefono) do nothing;


-- ----------------------------------------------------------------------------
-- PASO 5 — VERIFICACIÓN (solo lecturas)
-- ----------------------------------------------------------------------------

-- 5a) La configuración. Debe arrancar apagada.
select id, activo, hora_envio, empresa_id from public.cierre_produccion_config;

-- 5b) A quién le llegaría.
select nombre, telefono, activo from public.cierre_produccion_destinatarios order by nombre;

-- 5c) Todavía no se ha enviado ninguno.
select count(*) as enviados from public.cierre_produccion_enviados;

-- 5d) Cuántos mensajes al mes implicaría: uno por destinatario y día.
select (select count(*) from public.cierre_produccion_destinatarios where activo) as destinatarios,
       (select count(*) from public.cierre_produccion_destinatarios where activo) * 30
         as mensajes_al_mes;


-- ----------------------------------------------------------------------------
-- REVERSIÓN
-- ----------------------------------------------------------------------------
--   drop table if exists public.cierre_produccion_enviados;
--   drop table if exists public.cierre_produccion_destinatarios;
--   drop table if exists public.cierre_produccion_config;
