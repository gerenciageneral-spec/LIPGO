
-- =====================================================================
-- 279_ordenes_eliminadas.sql
--
-- Una orden eliminada ya no desaparece: queda en `public.ordenes_eliminadas` con su cabecera
-- completa, sus líneas, QUIÉN la borró, por dónde la borró y —esto es lo nuevo— las SEÑALES DE
-- RIESGO que tenía en el momento de borrarla.
--
-- POR QUÉ. Medido el 2026-10-10: de 241 órdenes eliminadas, **177 quedaron sin usuario en sesión**
-- ("sistema"), y dos de ellas se llevaron por delante salidas de inventario APROBADAS (ID2, 114
-- unidades; ID3, 126). Hoy la única huella está en `auditoria`, que sirve para reconstruir a mano
-- pero no es una bandeja: nadie se entera, nadie lo revisa y la respuesta a "quién borró esta
-- orden" tarda media hora de consultas. Gerencia (10-oct): "eso es un mal manejo".
--
-- CÓMO QUEDA EL ACTOR. La auditoría ya resuelve esto bien y aquí se reusa su mecanismo EXACTO: el
-- actor sale del encabezado HTTP `x-audit-user` que inyecta la app en `getSupabaseAdmin`, con
-- respaldo en los claims del JWT. Si no hay actor, el borrado NO viene de una pantalla: viene de
-- la base o de un script, y la fila lo dice con `origen = 'base de datos'`. Así "sistema" deja de
-- ser un misterio y pasa a ser un dato.
--
-- LAS SEÑALES DE RIESGO, que son la lección del día:
--   · `movimientos_inventario` — cuántas salidas tenía esa orden. Las dos órdenes del 7 y el 8 de
--     octubre tenían 3 y 1 salidas APROBADAS, y nadie lo vio hasta hoy.
--   · `facturaba_toneladas` / `facturaba_valor` — lo que esa orden valía en la vista `facturacion`.
--     El clon AVI202610069897D facturaba 4,4397 t y $183.324 SIN tener un solo movimiento de
--     inventario: por eso un candado que solo mira inventario no alcanza.
--   · `tenia_clon` / `clon_de` — la pareja madre/clon "D", porque la app borra el clon en cascada.
--
-- NO CAMBIA NINGÚN COMPORTAMIENTO EXISTENTE. Es una tabla nueva más un disparador que solo
-- ESCRIBE en ella. Si el archivado fallara, el borrado sigue adelante con un aviso: un archivo
-- roto no puede dejar a la operación sin poder borrar una orden mal creada.
--
-- IDEMPOTENTE. Se puede correr dos veces: la tabla y el disparador se crean si no existen y el
-- relleno histórico no duplica.
-- =====================================================================

-- ---------------------------------------------------------------------
-- PASO 1 — ANTES.
-- ---------------------------------------------------------------------
select to_regclass('public.ordenes_eliminadas') as tabla_existe;  -- esperado: null la 1a vez
select count(*) as borrados_en_auditoria from public.auditoria
 where tabla = 'cabeceraoc' and operacion = 'DELETE';             -- esperado: ~241
select count(*) filter (where actor_id is null) as sin_usuario,
       count(*) filter (where actor_id is not null) as con_usuario
from public.auditoria where tabla = 'cabeceraoc' and operacion = 'DELETE';

-- ---------------------------------------------------------------------
-- PASO 2 — LA TABLA.
-- ---------------------------------------------------------------------
begin;

create table if not exists public.ordenes_eliminadas (
  id                      bigint generated always as identity primary key,
  -- Lo que era la orden.
  idorden                 integer not null,
  ordendecargue           text,
  idempresa               integer,
  tipooperacion           text,
  status                  text,
  fechaorden              text,
  fechacargue             text,
  placa                   text,
  cliente                 text,
  pesoorden               numeric,
  pesovascula             numeric,
  auxiliares              text,
  cabecera                jsonb not null,
  lineas                  jsonb not null default '[]'::jsonb,
  lineas_cantidad         integer not null default 0,
  unidades                numeric not null default 0,
  -- Señales de riesgo en el momento del borrado.
  movimientos_inventario  integer not null default 0,
  unidades_inventario     numeric not null default 0,
  facturaba_toneladas     numeric not null default 0,
  facturaba_valor         numeric not null default 0,
  clon_de                 text,
  tenia_clon              text,
  -- Quién, cuándo y por dónde.
  eliminada_en            timestamptz not null default now(),
  eliminada_por           uuid,
  eliminada_por_nombre    text not null default 'sistema',
  origen                  text not null default 'base de datos',
  motivo                  text
);

comment on table public.ordenes_eliminadas is
  'Una orden eliminada queda aquí con su cabecera, sus líneas, quién la borró y las señales de riesgo que tenía (salidas de inventario y facturación). La llena el disparador trg_archivar_orden_eliminada sobre cabeceraoc; ninguna pantalla escribe aquí a mano. Creada el 2026-10-10 porque 177 de 241 borrados no decían quién los hizo.';
comment on column public.ordenes_eliminadas.origen is
  '"app" = se borró desde una pantalla y hay usuario; "base de datos" = se borró con SQL directo o por un script, sin sesión.';
comment on column public.ordenes_eliminadas.movimientos_inventario is
  'Salidas/entradas que la orden tenía al borrarla. Si es mayor que cero, el inventario se devolvió al stock: hay que revisarlo.';
comment on column public.ordenes_eliminadas.facturaba_valor is
  'Lo que esa orden valía en la vista facturacion al borrarla. Un clon "D" puede facturar sin tener ningún movimiento de inventario (caso AVI202610069897D: $183.324).';

create index if not exists ordenes_eliminadas_empresa_fecha_idx
  on public.ordenes_eliminadas (idempresa, eliminada_en desc);
create index if not exists ordenes_eliminadas_codigo_idx
  on public.ordenes_eliminadas (ordendecargue);
create index if not exists ordenes_eliminadas_idorden_idx
  on public.ordenes_eliminadas (idorden);

commit;

-- ---------------------------------------------------------------------
-- PASO 3 — EL DISPARADOR.
-- ---------------------------------------------------------------------
create or replace function public.fn_archivar_orden_eliminada()
returns trigger
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_actor    uuid;
  v_nombre   text;
  v_lineas   jsonb := '[]'::jsonb;
  v_nlineas  int := 0;
  v_unidades numeric := 0;
  v_movs     int := 0;
  v_und_inv  numeric := 0;
  v_ton      numeric := 0;
  v_valor    numeric := 0;
  v_cod      text := coalesce(OLD.ordendecargue, '');
  v_clon     text;
  v_madre    text;
begin
  -- 1) El actor, con el MISMO mecanismo de la auditoría (fn_auditoria): encabezado
  --    `x-audit-user` que inyecta la app, con respaldo en los claims del JWT.
  begin
    v_actor := nullif(
      coalesce(
        current_setting('request.headers', true)::json ->> 'x-audit-user',
        current_setting('request.jwt.claims', true)::json ->> 'sub',
        current_setting('app.audit_user', true)
      ), ''
    )::uuid;
  exception when others then
    v_actor := null;
  end;
  if v_actor is not null then
    select p.usuario into v_nombre from public.profiles p where p.id = v_actor;
  end if;

  -- 2) Las líneas. La app borra `detalleoc` ANTES que la cabecera, así que puede que ya no
  --    queden: en ese caso se recuperan de la auditoría, que las guardó completas al borrarlas.
  begin
    select coalesce(jsonb_agg(to_jsonb(d)), '[]'::jsonb), count(*), coalesce(sum(d.cantidad), 0)
      into v_lineas, v_nlineas, v_unidades
      from public.detalleoc d where d.idorden = OLD.id;

    if v_nlineas = 0 then
      select coalesce(jsonb_agg(a.antes), '[]'::jsonb), count(*),
             coalesce(sum(nullif(a.antes ->> 'cantidad', '')::numeric), 0)
        into v_lineas, v_nlineas, v_unidades
        from public.auditoria a
       where a.tabla = 'detalleoc' and a.operacion = 'DELETE'
         and a.antes ? 'idorden' and a.antes ->> 'idorden' ~ '^[0-9]+$'
         and (a.antes ->> 'idorden')::int = OLD.id
         and a.ts > now() - interval '15 minutes';
    end if;
  exception when others then
    v_lineas := '[]'::jsonb; v_nlineas := 0; v_unidades := 0;
  end;

  -- 3) ¿Tenía movimientos de inventario? Lo mismo: si ya los borraron en esta misma operación,
  --    se cuentan desde la auditoría. Es la señal que faltó ver el 7 y el 8 de octubre.
  begin
    if v_cod <> '' then
      select count(*), coalesce(sum(t.cantidad), 0) into v_movs, v_und_inv
        from public.invtrans t where t.ocargue = v_cod;
      if v_movs = 0 then
        select count(*), coalesce(sum(nullif(a.antes ->> 'cantidad', '')::numeric), 0)
          into v_movs, v_und_inv
          from public.auditoria a
         where a.tabla = 'invtrans' and a.operacion = 'DELETE'
           and a.antes ->> 'ocargue' = v_cod
           and a.ts > now() - interval '15 minutes';
      end if;
    end if;
  exception when others then
    v_movs := 0; v_und_inv := 0;
  end;

  -- 4) ¿Qué facturaba? La vista todavía ve la orden porque esto corre ANTES del borrado.
  begin
    if v_cod <> '' then
      select coalesce(sum(f.toneladas), 0), coalesce(sum(f.valor_a_facturar), 0)
        into v_ton, v_valor
        from public.facturacion f where f.numeroorden = v_cod;
    end if;
  exception when others then
    v_ton := 0; v_valor := 0;
  end;

  -- 5) La pareja madre/clon "D".
  begin
    if v_cod <> '' and right(v_cod, 1) = 'D' then
      v_madre := left(v_cod, length(v_cod) - 1);
    elsif v_cod <> '' then
      select c.ordendecargue into v_clon from public.cabeceraoc c
       where c.ordendecargue = v_cod || 'D' limit 1;
    end if;
  exception when others then
    v_clon := null; v_madre := null;
  end;

  insert into public.ordenes_eliminadas (
    idorden, ordendecargue, idempresa, tipooperacion, status, fechaorden, fechacargue,
    placa, cliente, pesoorden, pesovascula, auxiliares, cabecera, lineas, lineas_cantidad,
    unidades, movimientos_inventario, unidades_inventario, facturaba_toneladas, facturaba_valor,
    clon_de, tenia_clon, eliminada_en, eliminada_por, eliminada_por_nombre, origen
  ) values (
    OLD.id, OLD.ordendecargue, OLD.idempresa, OLD.tipooperacion, OLD.status,
    (to_jsonb(OLD) ->> 'fechaorden'), (to_jsonb(OLD) ->> 'fechacargue'),
    (to_jsonb(OLD) ->> 'placa'), (to_jsonb(OLD) ->> 'cliente'),
    nullif(to_jsonb(OLD) ->> 'pesoorden', '')::numeric,
    nullif(to_jsonb(OLD) ->> 'pesovascula', '')::numeric,
    (to_jsonb(OLD) ->> 'auxiliares'),
    to_jsonb(OLD), v_lineas, v_nlineas, v_unidades, v_movs, v_und_inv, v_ton, v_valor,
    v_madre, v_clon, now(), v_actor,
    coalesce(v_nombre, 'sistema'),
    case when v_actor is not null then 'app' else 'base de datos' end
  );

  return OLD;
exception when others then
  -- Un archivo roto NO puede impedir borrar una orden mal creada. Queda el aviso en el log de
  -- Postgres y la auditoría sigue teniendo la fila.
  raise warning 'No se pudo archivar la orden % (%): %', OLD.id, OLD.ordendecargue, sqlerrm;
  return OLD;
end
$fn$;

drop trigger if exists trg_archivar_orden_eliminada on public.cabeceraoc;
create trigger trg_archivar_orden_eliminada
  before delete on public.cabeceraoc
  for each row execute function public.fn_archivar_orden_eliminada();

-- ---------------------------------------------------------------------
-- PASO 4 — EL HISTÓRICO. Las 241 ya borradas entran a la tabla desde la auditoría.
--
-- La app escribe DOS filas de auditoría por borrado (una explícita con el texto descriptivo y
-- otra del disparador con la fila completa), así que se agrupan por orden y minuto y se toma la
-- cabecera más completa, con el texto más largo como motivo.
-- ---------------------------------------------------------------------
begin;

with borrados as (
  select a.id, a.ts, a.actor_id, a.actor_nombre, a.descripcion, a.antes,
         coalesce(nullif(a.antes ->> 'id', ''), a.registro_id) as idorden_txt,
         row_number() over (
           partition by a.registro_id, date_trunc('minute', a.ts)
           order by (select count(*) from jsonb_object_keys(coalesce(a.antes, '{}'::jsonb))) desc, a.id
         ) as rn,
         first_value(a.descripcion) over (
           partition by a.registro_id, date_trunc('minute', a.ts)
           order by length(coalesce(a.descripcion, '')) desc, a.id
         ) as motivo,
         -- La app escribe dos filas por borrado y solo una puede traer el usuario: se toma el de
         -- cualquiera de las dos, y el nombre real si alguna lo tiene.
         max(a.actor_id::text) over (partition by a.registro_id, date_trunc('minute', a.ts)) as actor_del_grupo,
         max(nullif(a.actor_nombre, 'sistema')) over (partition by a.registro_id, date_trunc('minute', a.ts)) as nombre_del_grupo,
         min(a.ts) over (partition by a.registro_id, date_trunc('minute', a.ts)) as ts_grupo
    from public.auditoria a
   where a.tabla = 'cabeceraoc' and a.operacion = 'DELETE'
     and a.antes is not null
)
insert into public.ordenes_eliminadas (
  idorden, ordendecargue, idempresa, tipooperacion, status, fechaorden, fechacargue,
  placa, cliente, pesoorden, pesovascula, auxiliares, cabecera, lineas, lineas_cantidad,
  unidades, movimientos_inventario, unidades_inventario, facturaba_toneladas, facturaba_valor,
  clon_de, tenia_clon, eliminada_en, eliminada_por, eliminada_por_nombre, origen, motivo
)
select
  case when b.idorden_txt ~ '^[0-9]+$' then b.idorden_txt::int else 0 end,
  b.antes ->> 'ordendecargue',
  nullif(b.antes ->> 'idempresa', '')::int,
  b.antes ->> 'tipooperacion',
  b.antes ->> 'status',
  b.antes ->> 'fechaorden',
  b.antes ->> 'fechacargue',
  b.antes ->> 'placa',
  b.antes ->> 'cliente',
  nullif(b.antes ->> 'pesoorden', '')::numeric,
  nullif(b.antes ->> 'pesovascula', '')::numeric,
  b.antes ->> 'auxiliares',
  b.antes,
  -- Las líneas de esa orden, tal como las guardó la auditoría al borrarlas (±10 minutos).
  coalesce((
    select jsonb_agg(d.antes) from public.auditoria d
     where d.tabla = 'detalleoc' and d.operacion = 'DELETE'
       and d.antes ? 'idorden' and d.antes ->> 'idorden' ~ '^[0-9]+$'
       and b.idorden_txt ~ '^[0-9]+$' and (d.antes ->> 'idorden')::int = b.idorden_txt::int
       and d.ts between b.ts_grupo - interval '10 minutes' and b.ts_grupo + interval '10 minutes'
  ), '[]'::jsonb),
  coalesce((
    select count(*)::int from public.auditoria d
     where d.tabla = 'detalleoc' and d.operacion = 'DELETE'
       and d.antes ? 'idorden' and d.antes ->> 'idorden' ~ '^[0-9]+$'
       and b.idorden_txt ~ '^[0-9]+$' and (d.antes ->> 'idorden')::int = b.idorden_txt::int
       and d.ts between b.ts_grupo - interval '10 minutes' and b.ts_grupo + interval '10 minutes'
  ), 0),
  coalesce((
    select sum(nullif(d.antes ->> 'cantidad', '')::numeric) from public.auditoria d
     where d.tabla = 'detalleoc' and d.operacion = 'DELETE'
       and d.antes ? 'idorden' and d.antes ->> 'idorden' ~ '^[0-9]+$'
       and b.idorden_txt ~ '^[0-9]+$' and (d.antes ->> 'idorden')::int = b.idorden_txt::int
       and d.ts between b.ts_grupo - interval '10 minutes' and b.ts_grupo + interval '10 minutes'
  ), 0),
  -- Movimientos de inventario que se borraron con ella: la señal que importa.
  coalesce((
    select count(*)::int from public.auditoria m
     where m.tabla = 'invtrans' and m.operacion = 'DELETE'
       and m.antes ->> 'ocargue' = b.antes ->> 'ordendecargue'
       and m.ts between b.ts_grupo - interval '10 minutes' and b.ts_grupo + interval '10 minutes'
  ), 0),
  coalesce((
    select sum(nullif(m.antes ->> 'cantidad', '')::numeric) from public.auditoria m
     where m.tabla = 'invtrans' and m.operacion = 'DELETE'
       and m.antes ->> 'ocargue' = b.antes ->> 'ordendecargue'
       and m.ts between b.ts_grupo - interval '10 minutes' and b.ts_grupo + interval '10 minutes'
  ), 0),
  0, 0,  -- la facturación del pasado no se puede reconstruir: la vista ya no ve esas órdenes
  case when right(coalesce(b.antes ->> 'ordendecargue', ''), 1) = 'D'
       then left(b.antes ->> 'ordendecargue', length(b.antes ->> 'ordendecargue') - 1) end,
  null,
  b.ts_grupo,
  nullif(b.actor_del_grupo, '')::uuid,
  coalesce(b.nombre_del_grupo, 'sistema'),
  case when b.actor_del_grupo is not null then 'app' else 'base de datos' end,
  nullif(b.motivo, 'Eliminó registro')
from borrados b
where b.rn = 1
  and not exists (
    select 1 from public.ordenes_eliminadas oe
     where oe.idorden = case when b.idorden_txt ~ '^[0-9]+$' then b.idorden_txt::int else 0 end
       and oe.eliminada_en = b.ts_grupo
  );

do $comprobar$
declare
  v_total int;
  v_riesgo int;
  v_sin int;
begin
  select count(*) into v_total from public.ordenes_eliminadas;
  select count(*) into v_riesgo from public.ordenes_eliminadas where movimientos_inventario > 0;
  select count(*) into v_sin from public.ordenes_eliminadas where origen = 'base de datos';
  if v_total = 0 then
    raise exception 'El histórico quedó vacío: algo salió mal con el relleno. Se deshace todo.';
  end if;
  raise notice 'Órdenes eliminadas archivadas: % · sin usuario (borradas desde la base): % · CON movimientos de inventario al borrarlas: %',
    v_total, v_sin, v_riesgo;
end
$comprobar$;

commit;

-- ---------------------------------------------------------------------
-- PASO 5 — DESPUÉS.
-- ---------------------------------------------------------------------
select count(*) as archivadas,
       count(*) filter (where origen = 'base de datos') as sin_usuario,
       count(*) filter (where movimientos_inventario > 0) as con_inventario_devuelto
from public.ordenes_eliminadas;

-- Las que se llevaron inventario: esto es lo que nadie estaba viendo.
select eliminada_en, eliminada_por_nombre, origen, idempresa, ordendecargue, status,
       movimientos_inventario, unidades_inventario, motivo
from public.ordenes_eliminadas
where movimientos_inventario > 0
order by eliminada_en desc
limit 20;

-- Y el disparador queda armado para la próxima.
select tgname, tgenabled from pg_trigger where tgname = 'trg_archivar_orden_eliminada';
