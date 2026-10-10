
-- =====================================================================
-- 277_ligar_rastros_7oct_a_su_orden.sql
--
-- Las 26 filas del 7 de octubre que nombran su orden de cargue por TEXTO y no guardaron su id.
-- Se les escribe el `idorden` que les corresponde. Nada más.
--
-- QUÉ ES ESTO. La comprobación de convergencia "Rastros nuevos que no quedaron ligados a su orden
-- por id" lleva días en alerta. El código de la orden NO es único (cabeceraoc tiene códigos
-- repetidos), así que una fila que solo guarda el texto no siempre sabe de qué orden habla. El
-- script 251 ligó el histórico; estas 26 filas se escaparon el 7-oct y son el residuo: después de
-- ese día TODO quedó ligado (medido el 10-oct: cero filas sueltas el 8, el 9 y el 10, contra
-- cientos ligadas cada día). La fuga está cerrada; esto limpia lo que quedó.
--
-- NO TOCA NI UNA CANTIDAD. No hay movimientos, no hay saldos, no hay pesos, no hay permisos. Solo
-- se rellena una columna de vínculo que hoy está en nulo. El inventario de ID1, ID2 e ID3 queda
-- exactamente igual: se comprueba al final.
--
-- POR LLAVE PRIMARIA. Cada fila se corrige por su id, con el código de orden que tiene que tener;
-- si una sola fila no está en el estado esperado, no se escribe nada. Idempotente: correrlo dos
-- veces no cambia nada la segunda.
--
-- LAS 26 FILAS
--   invtrans (9)        34974-34978 → AVI202610079969 · 34979 → IND202610079962 · 34984-34986 → AVI202610079971
--   historicolotes (15) 25868-25873 → AVI202610079969 · 25874 → IND202610079962 · 25879-25886 → AVI202610079971
--   libro de pedidos (2) 20175-20176 → IND202610079970
--
-- LO QUE ESTE SCRIPT NO ARREGLA (va aparte, con decisión de gerencia): las 8 atribuciones del
-- libro de AVI202610069897 (114 und, 4 pedidos de ID2) y la asignación de MOL202609289628
-- (126 und, pedido 12004 de ID3). Esas dos órdenes FUERON BORRADAS, así que no hay a qué ligarlas.
-- =====================================================================

-- ---------------------------------------------------------------------
-- PASO 1 — ANTES. Las filas sueltas y la orden a la que dicen pertenecer.
-- ---------------------------------------------------------------------
select 'invtrans' as tabla, id, ocargue, idorden, creado::date as dia
from public.invtrans where id in (34974,34975,34976,34977,34978,34979,34984,34985,34986)
union all
select 'historicolotes', id, ordendecargue, idorden, fecha::date
from public.historicolotes where id in (25868,25869,25870,25871,25872,25873,25874,25879,25880,25881,25882,25883,25884,25885,25886)
union all
select 'pedidodetalle_ocargue', id, ocargue, idorden, creado_en::date
from public.pedidodetalle_ocargue where id in (20175,20176)
order by tabla, id;
-- Esperado: 26 filas, todas con idorden NULO.

select id, idempresa, ordendecargue, tipooperacion, status, fechacargue
from public.cabeceraoc
where ordendecargue in ('AVI202610079969','IND202610079962','AVI202610079971','IND202610079970')
order by id;
-- Esperado: 4 órdenes, una por código (ninguna repetida).

-- Foto del inventario de los tres proyectos, para comparar al final.
select idempresa, count(*) as movimientos, sum(cantidad) filter (where tipomov = 'Entrada') as entradas,
       sum(cantidad) filter (where tipomov = 'Salida') as salidas
from public.invtrans where idempresa in (1,2,3) group by idempresa order by idempresa;

-- ---------------------------------------------------------------------
-- PASO 2 — EL VÍNCULO.
-- ---------------------------------------------------------------------
begin;

do $ligar$
declare
  -- id de la fila → código de orden que debe tener. La llave primaria manda.
  v_inv  jsonb := '{"34974":"AVI202610079969","34975":"AVI202610079969","34976":"AVI202610079969","34977":"AVI202610079969","34978":"AVI202610079969","34979":"IND202610079962","34984":"AVI202610079971","34985":"AVI202610079971","34986":"AVI202610079971"}';
  v_hl   jsonb := '{"25868":"AVI202610079969","25869":"AVI202610079969","25870":"AVI202610079969","25871":"AVI202610079969","25872":"AVI202610079969","25873":"AVI202610079969","25874":"IND202610079962","25879":"AVI202610079971","25880":"AVI202610079971","25881":"AVI202610079971","25882":"AVI202610079971","25883":"AVI202610079971","25884":"AVI202610079971","25885":"AVI202610079971","25886":"AVI202610079971"}';
  v_lib  jsonb := '{"20175":"IND202610079970","20176":"IND202610079970"}';
  r record;
  v_idorden int;
  v_cuantas int;
  v_tocadas int := 0;
  v_saltadas int := 0;
begin
  -- Una sola rutina para las tres tablas: misma regla, mismo rigor.
  for r in
    select 'invtrans' as tabla, key::bigint as fila_id, value::text as codigo from jsonb_each_text(v_inv)
    union all select 'historicolotes', key::bigint, value::text from jsonb_each_text(v_hl)
    union all select 'pedidodetalle_ocargue', key::bigint, value::text from jsonb_each_text(v_lib)
    order by tabla, fila_id
  loop
    -- La orden tiene que existir y ser ÚNICA por ese código, o no se sabe de cuál habla.
    select count(*), min(id) into v_cuantas, v_idorden
    from public.cabeceraoc where ordendecargue = r.codigo;
    if v_cuantas = 0 then
      raise exception 'La orden % no existe en cabeceraoc (fila % de %). Se deshace todo.', r.codigo, r.fila_id, r.tabla;
    elsif v_cuantas > 1 then
      raise exception 'El código % está repetido % veces en cabeceraoc: no se puede saber de cuál habla la fila % de %. Se deshace todo.', r.codigo, v_cuantas, r.fila_id, r.tabla;
    end if;

    if r.tabla = 'invtrans' then
      update public.invtrans set idorden = v_idorden
       where id = r.fila_id and ocargue = r.codigo and idorden is null;
    elsif r.tabla = 'historicolotes' then
      update public.historicolotes set idorden = v_idorden
       where id = r.fila_id and ordendecargue = r.codigo and idorden is null;
    else
      update public.pedidodetalle_ocargue set idorden = v_idorden
       where id = r.fila_id and ocargue = r.codigo and idorden is null;
    end if;

    if found then
      v_tocadas := v_tocadas + 1;
    else
      -- Ya estaba ligada (segunda corrida) o el código no coincide. Se mira cuál de las dos.
      v_saltadas := v_saltadas + 1;
      execute format('select count(*) from public.%I where id = $1 and idorden = $2', r.tabla)
        into v_cuantas using r.fila_id, v_idorden;
      if v_cuantas = 0 then
        raise exception 'La fila % de % no quedó ligada y NO está ya ligada a la orden %: su código no coincide con lo esperado. Se deshace todo.', r.fila_id, r.tabla, r.codigo;
      end if;
    end if;
  end loop;

  raise notice 'Ligadas ahora: % · ya estaban ligadas: % · total procesado: % (se esperan 26)', v_tocadas, v_saltadas, v_tocadas + v_saltadas;
  if v_tocadas + v_saltadas <> 26 then
    raise exception 'Se esperaban 26 filas y se procesaron %. Se deshace todo.', v_tocadas + v_saltadas;
  end if;
end
$ligar$;

do $comprobar$
declare
  v int;
begin
  -- Ninguna de las 26 puede quedar en nulo.
  select count(*) into v from public.invtrans
   where id in (34974,34975,34976,34977,34978,34979,34984,34985,34986) and idorden is null;
  if v > 0 then raise exception '% movimiento(s) de invtrans siguen sin idorden. Se deshace todo.', v; end if;

  select count(*) into v from public.historicolotes
   where id in (25868,25869,25870,25871,25872,25873,25874,25879,25880,25881,25882,25883,25884,25885,25886) and idorden is null;
  if v > 0 then raise exception '% asignación(es) siguen sin idorden. Se deshace todo.', v; end if;

  select count(*) into v from public.pedidodetalle_ocargue where id in (20175,20176) and idorden is null;
  if v > 0 then raise exception '% atribución(es) del libro siguen sin idorden. Se deshace todo.', v; end if;

  -- El vínculo tiene que apuntar a la orden cuyo CÓDIGO dice la propia fila. Si alguna quedó
  -- apuntando a otra orden, el remedio sería peor que la enfermedad.
  select count(*) into v
    from public.invtrans t join public.cabeceraoc c on c.id = t.idorden
   where t.id in (34974,34975,34976,34977,34978,34979,34984,34985,34986) and c.ordendecargue <> t.ocargue;
  if v > 0 then raise exception '% movimiento(s) quedaron apuntando a una orden con otro código. Se deshace todo.', v; end if;

  select count(*) into v
    from public.historicolotes h join public.cabeceraoc c on c.id = h.idorden
   where h.id in (25868,25869,25870,25871,25872,25873,25874,25879,25880,25881,25882,25883,25884,25885,25886)
     and c.ordendecargue <> h.ordendecargue;
  if v > 0 then raise exception '% asignación(es) quedaron apuntando a otra orden. Se deshace todo.', v; end if;

  raise notice 'LISTO. Las 26 filas del 7-oct ya dicen a qué orden pertenecen, y ninguna cantidad se movió.';
end
$comprobar$;

commit;

-- ---------------------------------------------------------------------
-- PASO 3 — DESPUÉS. Las mismas consultas del paso 1.
-- ---------------------------------------------------------------------
select 'invtrans' as tabla, id, ocargue, idorden
from public.invtrans where id in (34974,34975,34976,34977,34978,34979,34984,34985,34986)
union all
select 'historicolotes', id, ordendecargue, idorden
from public.historicolotes where id in (25868,25869,25870,25871,25872,25873,25874,25879,25880,25881,25882,25883,25884,25885,25886)
union all
select 'pedidodetalle_ocargue', id, ocargue, idorden
from public.pedidodetalle_ocargue where id in (20175,20176)
order by tabla, id;
-- Esperado: 26 filas, todas con su idorden (9969, 9962, 9971 o 9970).

-- El inventario tiene que estar IGUAL que en el paso 1.
select idempresa, count(*) as movimientos, sum(cantidad) filter (where tipomov = 'Entrada') as entradas,
       sum(cantidad) filter (where tipomov = 'Salida') as salidas
from public.invtrans where idempresa in (1,2,3) group by idempresa order by idempresa;
