
-- =====================================================================
-- 283_id3_traslados_pendientes.sql
--
-- Los traslados que quedaron pendientes del script 282, para dejar cada producto en la posición
-- que dice el mapa de la reorganización del 2026-10-10.
--
-- DOS GRUPOS, y los dos por instrucción expresa de gerencia ("realízalo desde donde dice el
-- sistema, la idea es que queden en las ubicaciones que indica el documento"):
--
--   A) LOS QUE NO ESTABAN DONDE DECÍA EL MAPA. El documento anotaba la posición de la que salieron
--      al reorganizar, pero el sistema los tenía en otra. Se mueven desde donde el sistema los
--      tiene hasta su destino del mapa:
--        MACARRON CORTO A LA MESA 500*24   A12 → A20   (el mapa decía A11)
--        ESPAGUETI 125GR*50PQ              E38 → E4    (el mapa decía E53)
--        FIDEO 125GR*48PQ                  E55 → E8    (el mapa decía E61)
--        HNA PREC MANT SAL 24LB BLANCA     E38 → E9    (el mapa decía E45)
--        Indupan Panificacion 12.5 Kg.     E54 → E12   (el mapa decía E49)
--        LA INSUPERABLE REPOSTERIA 50KG    B43 → B1    (el mapa decía B41)
--
--   B) LOS DOS LOTES QUE TENÍAN CAMIÓN CARGANDO cuando corrió el 282 y se saltaron a propósito:
--        LA INSUPERABLE REPOSTERIA 50KG    B43 → B1    lote 20260927 (el mismo de arriba)
--        LA INSUPERABLE POLI PANADERIA     B42 → B3    lote 20260929
--      Si el camión ya cerró, entran en esta corrida. Si todavía no, **se vuelven a saltar** y el
--      script lo dice al final: se corre otra vez cuando salga y listo.
--
-- LO QUE NO SE MUEVE, Y POR QUÉ. El séptimo producto del listado, **PT LA NIEVE PAPEL PANADERIA
-- 25KG (4 unidades)**, el sistema lo tiene en **AV, que no es una posición normal: es
-- "Localizacion Reprocesos"**. Sacarlo de ahí con un traslado sería devolverlo a stock bueno sin
-- que nadie lo decida, y eso no lo hace un traslado: lo hace el flujo de reproceso con su código.
-- Queda informado y sin tocar, a la espera de la decisión de gerencia.
--
-- MISMA MECÁNICA DEL 282: un par 311 por lote (salida de la vieja, entrada a la nueva), las
-- cantidades las lee la base al correr y los lotes con reserva activa se saltan. El inventario no
-- cambia de total: se comprueba al final.
--
-- Idempotente: después de correrlo el origen queda vacío y una segunda corrida no mueve nada.
-- =====================================================================

-- ---------------------------------------------------------------------
-- PASO 1 — ANTES.
-- ---------------------------------------------------------------------
select count(*) as movimientos,
       coalesce(sum(cantidad) filter (where tipomov = 'Entrada'), 0) as entradas,
       coalesce(sum(cantidad) filter (where tipomov in ('Salida','Reproceso')), 0) as salidas,
       coalesce(sum(cantidad) filter (where tipomov = 'Entrada'), 0)
         - coalesce(sum(cantidad) filter (where tipomov in ('Salida','Reproceso')), 0) as neto
from public.invtrans where idempresa = 3 and lower(status) like 'aprob%';
-- Esta cifra tiene que quedar idéntica al final.

select location, nombreproducto, lote, stock_disp, stock_res
from public.saldoinvdetalle
where idempresa = 3 and location in ('A12','B42','B43','E38','E54','E55','AV')
  and coalesce(stock_disp, 0) <> 0
order by location, nombreproducto, lote;
-- Aquí se ve si los dos lotes de B42 y B43 siguen con reserva (columna stock_res).

-- ---------------------------------------------------------------------
-- PASO 2 — LOS TRASLADOS.
-- ---------------------------------------------------------------------
begin;

do $traslados$
declare
  v_mapa text[][] := array[
    ['PT MACARRON CORTO A LA MESA 500*24',            'A12', 'A20'],
    ['PT ESPAGUETI 125GR*50PQ',                       'E38', 'E4'],
    ['PT FIDEO 125GR*48PQ',                           'E55', 'E8'],
    ['PT HNA PREC MANT SAL 24LB BLANCA',              'E38', 'E9'],
    ['Indupan Panificacion 12.5 Kg.',                 'E54', 'E12'],
    ['PT LA INSUPERABLE REPOSTERIA 50KG',             'B43', 'B1'],
    ['PT LA INSUPERABLE POLI PANADERIA 50 KG BOGOTA', 'B42', 'B3']
  ];
  i int;
  v_id bigint;
  v_ahora timestamptz := now();
  v_usuario text := 'script 283 · reorganización de bodega';
  v_pares int := 0;
  v_unidades numeric := 0;
  v_reservados int := 0;
  r record;
begin
  -- a) Los destinos tienen que existir (los creó el 281).
  for i in 1 .. array_length(v_mapa, 1) loop
    if not exists (select 1 from public.locations
                    where idempresa = 3 and upper(trim(codigo)) = upper(trim(v_mapa[i][3]))) then
      raise exception 'La ubicación destino % no existe en el catálogo de ID3: corre antes el script 281. Se deshace todo.', v_mapa[i][3];
    end if;
  end loop;

  select coalesce(max(id), 0) into v_id from public.invtrans;

  -- b) La foto de lo que se mueve, ANTES de escribir: `saldoinvdetalle` es una vista sobre
  --    invtrans y si se recorriera mientras se inserta se mordería la cola.
  create temp table _mover283 on commit drop as
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

  select count(*) into v_reservados from _mover283 where reservado > 0;

  -- c) Un par por lote. Los que sigan con camión cargando se saltan otra vez.
  for r in select * from _mover283 where reservado = 0 order by location_origen, nombreproducto, lote loop
    v_id := v_id + 1;
    insert into public.invtrans (
      id, idempresa, idproducto, codproducto, nombreproducto, lote, location, cantidad,
      tipomov, cod_movimiento, status, origen, creado, creadopor, observaciones
    ) values (
      v_id, 3, r.idproducto, r.codproducto, r.nombreproducto, r.lote, r.location_origen, r.cantidad,
      'Salida', '311', 'aprobado', 'transaccion manual', v_ahora, v_usuario,
      'Reorganización de bodega 2026-10-10 (script 283): traslado de ' || r.location_origen || ' a ' || r.location_destino || '.'
    );
    v_id := v_id + 1;
    insert into public.invtrans (
      id, idempresa, idproducto, codproducto, nombreproducto, lote, location, cantidad,
      tipomov, cod_movimiento, status, origen, creado, creadopor, observaciones
    ) values (
      v_id, 3, r.idproducto, r.codproducto, r.nombreproducto, r.lote, r.location_destino, r.cantidad,
      'Entrada', '311', 'aprobado', 'transaccion manual', v_ahora, v_usuario,
      'Reorganización de bodega 2026-10-10 (script 283): traslado de ' || r.location_origen || ' a ' || r.location_destino || '.'
    );
    v_pares := v_pares + 1;
    v_unidades := v_unidades + r.cantidad;
  end loop;

  raise notice 'Traslados escritos: % lote(s), % filas, % unidades.', v_pares, v_pares * 2, v_unidades;
  if v_reservados > 0 then
    raise notice 'ATENCIÓN: % lote(s) se saltaron porque siguen reservados (camión cargando). Corre este mismo script otra vez cuando el camión salga.', v_reservados;
  end if;
  if v_pares = 0 and v_reservados = 0 then
    raise exception 'No había nada que mover: o ya se corrió, o el stock cambió de sitio. Se deshace todo para que lo revises.';
  end if;
end
$traslados$;

do $comprobar$
declare
  v_ent numeric; v_sal numeric; v_n int;
begin
  select coalesce(sum(cantidad) filter (where tipomov = 'Entrada'), 0),
         coalesce(sum(cantidad) filter (where tipomov = 'Salida'), 0)
    into v_ent, v_sal
    from public.invtrans
   where idempresa = 3 and cod_movimiento = '311' and creadopor = 'script 283 · reorganización de bodega';
  if v_ent <> v_sal then
    raise exception 'El traslado no quedó en neto cero: entradas % contra salidas %. Se deshace todo.', v_ent, v_sal;
  end if;

  select count(*) into v_n from public.saldoinvdetalle where idempresa = 3 and coalesce(stock_disp, 0) < 0;
  if v_n > 0 then
    raise exception '% lote(s) quedaron en negativo. Se deshace todo.', v_n;
  end if;

  -- El producto en Reprocesos (AV) NO se puede haber movido por aquí.
  select count(*) into v_n from public.invtrans
   where idempresa = 3 and creadopor = 'script 283 · reorganización de bodega' and upper(trim(location)) = 'AV';
  if v_n > 0 then
    raise exception 'Este script tocó la ubicación de Reprocesos (AV) y no debe. Se deshace todo.';
  end if;

  raise notice 'LISTO. Neto cero (% unidades movidas) y ningún lote en negativo.', v_ent;
end
$comprobar$;

commit;

-- ---------------------------------------------------------------------
-- PASO 3 — DESPUÉS.
-- ---------------------------------------------------------------------
select count(*) as movimientos,
       coalesce(sum(cantidad) filter (where tipomov = 'Entrada'), 0) as entradas,
       coalesce(sum(cantidad) filter (where tipomov in ('Salida','Reproceso')), 0) as salidas,
       coalesce(sum(cantidad) filter (where tipomov = 'Entrada'), 0)
         - coalesce(sum(cantidad) filter (where tipomov in ('Salida','Reproceso')), 0) as neto
from public.invtrans where idempresa = 3 and lower(status) like 'aprob%';
-- Idéntico al paso 1.

select location, nombreproducto, lote, stock_disp, stock_res
from public.saldoinvdetalle
where idempresa = 3 and location in ('A20','B1','B3','E4','E8','E9','E12')
  and coalesce(stock_disp, 0) <> 0
order by location, nombreproducto, lote;
-- Esperado: cada producto en su posición del mapa.

select location, nombreproducto, lote, stock_disp, stock_res
from public.saldoinvdetalle
where idempresa = 3 and location in ('A12','B42','B43','E38','E54','E55')
  and coalesce(stock_disp, 0) <> 0
order by location, nombreproducto;
-- Lo que quede aquí: o es un producto que NO estaba en el mapa (p. ej. la Harina Catedral de A12,
-- que se queda donde está), o un lote saltado por seguir reservado.

-- Reprocesos, que este script no toca: ahí sigue La Nieve Papel esperando decisión.
select location, nombreproducto, lote, stock_disp
from public.saldoinvdetalle where idempresa = 3 and upper(trim(location)) = 'AV' and coalesce(stock_disp, 0) <> 0;
