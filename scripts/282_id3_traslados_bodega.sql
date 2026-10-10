
-- =====================================================================
-- 282_id3_traslados_bodega.sql
--
-- Los traslados de la reorganización de bodega de ID3 del 2026-10-10, con el código 311.
-- Todo lo que haya en la ubicación de origen se va a la nueva, LOTE POR LOTE y por su cantidad
-- completa, tal como dice el mapa que pasó gerencia.
--
-- EL INVENTARIO NO CAMBIA DE TOTAL. Un 311 es un par de filas con neto cero: una SALIDA de la
-- ubicación vieja y una ENTRADA a la nueva, mismo lote, misma cantidad, mismo instante. Es
-- exactamente lo que escribe la pantalla de Transacciones de Inventario para un traslado
-- (lib/transacciones-codigo-actions.ts), así que el Kardex y los paneles lo leen igual que
-- siempre. Al final se comprueba que el total de ID3 quedó idéntico.
--
-- LAS CANTIDADES NO VAN ESCRITAS AQUÍ, A PROPÓSITO. El script lee el saldo vivo de cada lote en
-- el momento en que se corre: la bodega sigue despachando y una cantidad escrita hoy a las 12 del
-- día podría estar vieja cuando se ejecute. Lo que se declara es el MAPA (producto, de dónde, a
-- dónde); las unidades las pone la base.
--
-- QUÉ COLUMNA ES EL FÍSICO (medido el 2026-10-10, y no es obvio):
--   `stock_disp`   = saldo por movimientos APROBADOS → es lo que hay físicamente en la posición.
--   `stock_res`    = reservado por un picking sin confirmar (una orden cargando ahora mismo).
--   `stock_actual` = stock_disp − stock_res → lo que queda libre para asignar.
-- Se mueve `stock_disp`, que es lo que de verdad está en el estante.
--
-- LOS LOTES CON RESERVA ACTIVA NO SE MUEVEN. Si un lote está reservado, hay un camión cargándolo
-- contra esa ubicación: cambiársela a mitad del picking es pedir un problema. Se informan al
-- final para moverlos cuando el camión salga. Medido antes de escribir esto: eran 2 de 56.
--
-- LOS 7 DEL LISTADO QUE NO ESTÁN DONDE DICE EL MAPA TAMPOCO SE MUEVEN, y van aparte porque son
-- una decisión, no un dato. El sistema los tiene en otra posición:
--   MACARRON CORTO A LA MESA 500*24   el mapa dice A11 · el sistema lo tiene en A12 (405 und)
--   LA INSUPERABLE REPOSTERIA 50KG    el mapa dice B41 · el sistema lo tiene en B43 (488 und)
--   ESPAGUETI 125GR*50PQ              el mapa dice E53 · el sistema lo tiene en E38 (21 und)
--   FIDEO 125GR*48PQ                  el mapa dice E61 · el sistema lo tiene en E55 (39 und)
--   HNA PREC MANT SAL 24LB BLANCA     el mapa dice E45 · el sistema lo tiene en E38 (50 und)
--   LA NIEVE PAPEL PANADERIA 25KG     el mapa dice E58 · el sistema lo tiene en AV (4 und)
--   Indupan Panificacion 12.5 Kg.     el mapa dice E49 · el sistema lo tiene en E54 (30 und)
--
-- REQUISITO: correr antes el script 281, que crea las 25 posiciones nuevas. Si falta una, este
-- script se niega entero.
--
-- Idempotente de hecho: después de correrlo, el origen queda vacío, así que una segunda corrida
-- no encuentra nada que mover y no duplica.
-- =====================================================================

-- ---------------------------------------------------------------------
-- PASO 1 — ANTES.
-- ---------------------------------------------------------------------
-- El total de ID3: tiene que quedar idéntico al final.
select count(*) as movimientos,
       coalesce(sum(cantidad) filter (where tipomov = 'Entrada'), 0) as entradas,
       coalesce(sum(cantidad) filter (where tipomov in ('Salida','Reproceso')), 0) as salidas,
       coalesce(sum(cantidad) filter (where tipomov = 'Entrada'), 0)
         - coalesce(sum(cantidad) filter (where tipomov in ('Salida','Reproceso')), 0) as neto
from public.invtrans where idempresa = 3 and lower(status) like 'aprob%';

-- Lo que hay hoy en las ubicaciones de origen.
select location, nombreproducto, lote, stock_disp, stock_res, stock_actual
from public.saldoinvdetalle
where idempresa = 3
  and location in ('A14','A19','A20','A21','A22','E37','E38','A11','E61','A15','A17','B42','B43','E53','E54','E52','A16','B40','E58')
  and coalesce(stock_disp, 0) <> 0
order by location, nombreproducto, lote;

-- ---------------------------------------------------------------------
-- PASO 2 — LOS TRASLADOS.
-- ---------------------------------------------------------------------
begin;

do $traslados$
declare
  -- EL MAPA: producto · de dónde · a dónde. Solo las filas donde la ubicación CAMBIA; las que en
  -- el archivo quedan igual (A1→A1, A2→A2 …) no necesitan movimiento.
  v_mapa text[][] := array[
    ['PT HARINA PREC MAIZ 24LB BLANCA',            'A14', 'A11'],
    ['PT CONCHITAS 250GR*24PQ',                    'A19', 'A13'],
    ['PT FIDEO 500GR*24 PQ',                       'A20', 'A14'],
    ['PT MACARRON G.250GR*24PQ',                   'A21', 'A15'],
    ['PT ESPAGUETI 500GR*24PQ',                    'A22', 'A16'],
    ['PT FIDEO 1000GR*12PQ',                       'E37', 'A17'],
    ['PT LA NIEVE 25LB LEUDANTE',                  'E38', 'A18'],
    ['Conchas 1000 gr X 12 und',                   'A11', 'A19'],
    ['PT FIDEO A LA MESA 500*12',                  'A11', 'A21'],
    ['PT ESPAGUETI A LA MESA 250*24',              'A11', 'A22'],
    ['PT FIDEO A LA MESA 250*24',                  'A11', 'A23'],
    ['PT ESPAGUETI A LA MESA 500*12',              'A11', 'A24'],
    ['PT FIDEO A LA MESA 1000*12',                 'A11', 'A25'],
    ['PT ESPAGUETI A LA MESA 1000*12',             'A11', 'A26'],
    ['PT HARINA TRIGO 25 LB LEUDANTE QUICKSY',     'E61', 'A27'],
    ['PT CABELLO ANGEL CAPRISSIMA 250*24',         'A15', 'A28'],
    ['Conchita Caprissima. 250 Gr. X 24 Und',      'A15', 'A29'],
    ['PT ESPAGUETI CAPRISSIMA 1000GR*12PQ',        'A17', 'A30'],
    ['PT LA INSUPERABLE REPOSTERIA ESPECIAL 25KG', 'B43', 'B2'],
    ['PT LA INSUPERABLE POLI PANADERIA 50 KG BOGOTA', 'B42', 'B3'],
    ['Indupan Panificacion 50 Kg.',                'B43', 'B4'],
    ['PT LA INSUPERABLE REPOSTERIA PREMIUM 12.5 KG','E53', 'E1'],
    ['PT LA INSUPERABLE PANADERIA 12.5KG',         'E54', 'E2'],
    ['PT LA INSUPERABLE REPOSTERIA 12.5KG',        'E54', 'E3'],
    ['PT HNA PREC MASAPAN 24 LB BLANCA',           'E52', 'E5'],
    ['PT HARINA PREC MAIZ 250GRX48 BLANCA',        'A16', 'E6'],
    ['PT CABELLO ANGEL 250GR*24',                  'E37', 'E7'],
    ['PT HARINA PREC MAIZ 20KG AMARILLA',          'B40', 'E10'],
    ['indupan panificacion 1000Kg x20',            'E58', 'E13']
  ];
  i int;
  v_prod text; v_de text; v_a text;
  v_id bigint;
  v_ahora timestamptz := now();
  v_usuario text := 'script 282 · reorganización de bodega';
  v_pares int := 0;
  v_unidades numeric := 0;
  v_reservados int := 0;
  r record;
begin
  -- a) Las 29 posiciones de destino tienen que existir. Si falta una, no se mueve nada.
  for i in 1 .. array_length(v_mapa, 1) loop
    if not exists (select 1 from public.locations
                    where idempresa = 3 and upper(trim(codigo)) = upper(trim(v_mapa[i][3]))) then
      raise exception 'La ubicación destino % no existe en el catálogo de ID3: corre antes el script 281. Se deshace todo.', v_mapa[i][3];
    end if;
  end loop;

  select coalesce(max(id), 0) into v_id from public.invtrans;

  -- b) La foto de lo que se va a mover, tomada ANTES de escribir: `saldoinvdetalle` es una vista
  --    sobre invtrans, así que si se recorriera mientras se insertan filas se mordería la cola.
  create temp table _mover on commit drop as
  select s.idproducto, s.codproducto, s.nombreproducto, s.lote, m.de as location_origen, m.a as location_destino,
         coalesce(s.stock_disp, 0) as cantidad, coalesce(s.stock_res, 0) as reservado
    from (
      select v_mapa[g][1] as producto, v_mapa[g][2] as de, v_mapa[g][3] as a
        from generate_series(1, array_length(v_mapa, 1)) g
    ) m
    join public.saldoinvdetalle s
      on s.idempresa = 3
     and upper(trim(s.nombreproducto)) = upper(trim(m.producto))
     and upper(trim(s.location)) = upper(trim(m.de))
   where coalesce(s.stock_disp, 0) > 0;

  select count(*) into v_reservados from _mover where reservado > 0;

  -- c) Un par de filas por lote: salida de la vieja, entrada a la nueva. Los lotes con reserva
  --    activa se saltan: hay un camión cargando contra esa ubicación.
  for r in select * from _mover where reservado = 0 order by location_origen, nombreproducto, lote loop
    v_id := v_id + 1;
    insert into public.invtrans (
      id, idempresa, idproducto, codproducto, nombreproducto, lote, location, cantidad,
      tipomov, cod_movimiento, status, origen, creado, creadopor, observaciones
    ) values (
      v_id, 3, r.idproducto, r.codproducto, r.nombreproducto, r.lote, r.location_origen, r.cantidad,
      'Salida', '311', 'aprobado', 'transaccion manual', v_ahora, v_usuario,
      'Reorganización de bodega 2026-10-10 (script 282): traslado de ' || r.location_origen || ' a ' || r.location_destino || '.'
    );
    v_id := v_id + 1;
    insert into public.invtrans (
      id, idempresa, idproducto, codproducto, nombreproducto, lote, location, cantidad,
      tipomov, cod_movimiento, status, origen, creado, creadopor, observaciones
    ) values (
      v_id, 3, r.idproducto, r.codproducto, r.nombreproducto, r.lote, r.location_destino, r.cantidad,
      'Entrada', '311', 'aprobado', 'transaccion manual', v_ahora, v_usuario,
      'Reorganización de bodega 2026-10-10 (script 282): traslado de ' || r.location_origen || ' a ' || r.location_destino || '.'
    );
    v_pares := v_pares + 1;
    v_unidades := v_unidades + r.cantidad;
  end loop;

  raise notice 'Traslados escritos: % lotes (% filas) por % unidades · lotes saltados por tener reserva activa: %',
    v_pares, v_pares * 2, v_unidades, v_reservados;
  if v_pares = 0 then
    raise exception 'No se movió ningún lote: o ya se corrió este script, o el stock cambió de sitio. Se deshace todo para que lo revises.';
  end if;
end
$traslados$;

do $comprobar$
declare
  v_ent numeric; v_sal numeric; v_n int;
begin
  -- a) El par tiene que estar completo: por cada salida 311 de hoy, su entrada.
  select coalesce(sum(cantidad) filter (where tipomov = 'Entrada'), 0),
         coalesce(sum(cantidad) filter (where tipomov = 'Salida'), 0)
    into v_ent, v_sal
    from public.invtrans
   where idempresa = 3 and cod_movimiento = '311' and creadopor = 'script 282 · reorganización de bodega';
  if v_ent <> v_sal then
    raise exception 'El traslado no quedó en neto cero: entradas % contra salidas %. Se deshace todo.', v_ent, v_sal;
  end if;

  -- b) Ningún lote puede haber quedado en negativo por el traslado.
  select count(*) into v_n from public.saldoinvdetalle where idempresa = 3 and coalesce(stock_disp, 0) < 0;
  if v_n > 0 then
    raise exception '% lote(s) quedaron en negativo. Se deshace todo.', v_n;
  end if;

  raise notice 'LISTO. El traslado quedó en neto cero (% unidades movidas) y ningún lote quedó en negativo.', v_ent;
end
$comprobar$;

commit;

-- ---------------------------------------------------------------------
-- PASO 3 — DESPUÉS.
-- ---------------------------------------------------------------------
-- El total de ID3, idéntico al paso 1.
select count(*) as movimientos,
       coalesce(sum(cantidad) filter (where tipomov = 'Entrada'), 0) as entradas,
       coalesce(sum(cantidad) filter (where tipomov in ('Salida','Reproceso')), 0) as salidas,
       coalesce(sum(cantidad) filter (where tipomov = 'Entrada'), 0)
         - coalesce(sum(cantidad) filter (where tipomov in ('Salida','Reproceso')), 0) as neto
from public.invtrans where idempresa = 3 and lower(status) like 'aprob%';

-- Dónde quedó cada cosa.
select location, nombreproducto, lote, stock_disp, stock_res
from public.saldoinvdetalle
where idempresa = 3
  and location in ('A11','A13','A14','A15','A16','A17','A18','A19','A21','A22','A23','A24','A25','A26',
                   'A27','A28','A29','A30','B2','B3','B4','E1','E2','E3','E5','E6','E7','E10','E13')
  and coalesce(stock_disp, 0) <> 0
order by location, nombreproducto, lote;

-- Las ubicaciones viejas tienen que quedar vacías de esos productos.
select location, nombreproducto, lote, stock_disp
from public.saldoinvdetalle
where idempresa = 3
  and location in ('A20','A21','A22','E37','E38','E52','E53','E54','E61','B40','B42','B43','E58')
  and coalesce(stock_disp, 0) <> 0
order by location, nombreproducto;
-- Lo que quede aquí son productos que NO estaban en el mapa, o lotes saltados por tener reserva.

-- Los lotes que se saltaron por reserva activa: moverlos cuando salga el camión.
select location, nombreproducto, lote, stock_disp, stock_res
from public.saldoinvdetalle
where idempresa = 3 and coalesce(stock_res, 0) > 0
order by location, nombreproducto;
