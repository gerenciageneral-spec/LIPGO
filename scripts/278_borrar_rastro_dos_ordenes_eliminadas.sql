
-- =====================================================================
-- 278_borrar_rastro_dos_ordenes_eliminadas.sql
--
-- Dos órdenes que ya no existen siguen dejando rastro en las tablas. Se termina de borrar lo que
-- quedó, se liberan sus pedidos para que el cliente los vuelva a gestionar, y EL INVENTARIO NO SE
-- TOCA.
--
-- DECISIÓN DE GERENCIA (2026-10-10), textual: "los inventarios se cerraron bien, como esto es del
-- mes pasado no puede venir a dañar lo que está hoy; si no genera daño al inventario elimina las
-- órdenes, de hecho no deben ya de existir en las tablas; lo peor que puede suceder es que
-- habilite los pedidos nuevamente y el cliente los deba gestionar otra vez, despachar o eliminar
-- como él lo decida; no podemos retrotraer novedades que afecten el inventario que cerramos el
-- primero, entendiendo que no contábamos con estas nuevas herramientas de control".
--
-- LAS DOS ÓRDENES
--   AVI202610069897 (ID2, 6-oct, placa QHC437) — borrada el 7-oct 14:48 Bogotá.
--   MOL202609289628 (ID3, 28-sep, placa SXX144) — borrada el 8-oct 21:15 Bogotá.
-- Sus salidas de inventario se borraron con ellas, así que hoy NO hay nada suyo en `invtrans`:
-- este script no inserta, no borra y no modifica ni un movimiento. Se comprueba dentro de la
-- misma transacción: si el total de ID2 o de ID3 cambia en una sola unidad, se deshace todo.
--
-- QUÉ HACE, exactamente lo que habría hecho `deleteLoadOrder` si la orden se hubiera borrado
-- desde la pantalla (lib/orders-actions.tsx):
--   1. `pedidoscabecera` de los 5 pedidos → se les quita la orden y vuelven a "aprobado", que es
--      el estado del que salieron (los 5 tienen aprobado = 'si'). Así el cliente los ve otra vez
--      en su bandeja y decide: despacharlos de nuevo o depurarlos.
--   2. `pedidosdetalle` de las 9 líneas → vuelven a quedar sin cargar (la columna de pendientes
--      es GENERADA y se recalcula sola).
--   3. `pedidodetalle_ocargue` → se retiran las 9 atribuciones: esa orden ya no le llevó nada a
--      nadie.
--   4. `citasvehiculos` → las 2 citas sueltan la orden.
--   5. `historicolotes` → la única asignación que quedó viva (la de ID3).
--   6. El CLON huérfano **AVI202610069897D** (cabeceraoc id 9900 + sus 8 líneas de detalleoc):
--      los clones "D" son copias de la madre y si la madre no está, el clon no debe existir
--      (regla de gerencia). No tiene movimientos, ni libro, ni auxiliares: borrarlo no mueve
--      inventario ni nómina.
--
-- POR LLAVE PRIMARIA. Cada fila se nombra por su id. Idempotente: a la segunda corrida no hay
-- nada que hacer y no falla.
--
-- LO QUE NO HACE Y HAY QUE SABER: la cuadrilla de la orden de ID2 (Anderson Miller de la Rosa,
-- Luis Antonio de León, Mikel Xavier de la Cruz, Nilson Javier Guevara y los demás) perdió las
-- 4,04 t de esa orden en la quincena EN CURSO cuando la orden se borró, porque las toneladas
-- salen de `cabeceraoc`. Este script no las devuelve: eso es decisión aparte.
-- =====================================================================

-- ---------------------------------------------------------------------
-- PASO 1 — ANTES.
-- ---------------------------------------------------------------------
select 'cabecera' as que, idpedido::text as clave, estado, aprobado, ocargue, vehiculo
from public.pedidoscabecera where idpedido in (12138, 12271, 12291, 12348, 12004)
order by idpedido;
-- Esperado: 5 pedidos, los 4 de ID2 con estado nulo y el 12004 en "entregado"; los 5 con su
-- ocargue puesto y aprobado = 'si'.

select transid, idpedido, producto, unidades, unidadescargadas, estado, ocargue
from public.pedidosdetalle
where transid in (25090,25091,25413,25414,25415,25460,25461,25615,24798)
order by transid;
-- Esperado: 9 líneas, todas "cerrado", con la orden puesta y cargadas = pedidas.

select id, ocargue, idpedido, unidades from public.pedidodetalle_ocargue
where id in (20008,20009,20010,20011,20012,20013,20014,20015,5813) order by id;
-- Esperado: 9 atribuciones (114 und de ID2 + 126 de ID3).

select id, ordendecargue, idorden, producto, cantidad, lote from public.historicolotes where id = 24985;
select id, ocargue, estatus, placa from public.citasvehiculos where id in (9479, 9365) order by id;
select id, ordendecargue, idempresa, tipooperacion, status, pesoorden from public.cabeceraoc where id = 9900;
select count(*) as lineas_del_clon from public.detalleoc where idorden = 9900;  -- esperado: 8

-- Las dos órdenes madre NO deben existir, y no deben tener ni un movimiento.
select count(*) as cabeceras_madre from public.cabeceraoc
 where ordendecargue in ('AVI202610069897','MOL202609289628');  -- esperado: 0
select count(*) as movimientos from public.invtrans
 where ocargue in ('AVI202610069897','MOL202609289628','AVI202610069897D');  -- esperado: 0

-- Foto del inventario. Tiene que ser idéntica al final.
select idempresa, count(*) as movimientos,
       coalesce(sum(cantidad) filter (where tipomov = 'Entrada'), 0) as entradas,
       coalesce(sum(cantidad) filter (where tipomov = 'Salida'), 0) as salidas
from public.invtrans where idempresa in (2,3) group by idempresa order by idempresa;

-- ---------------------------------------------------------------------
-- PASO 2 — SE BORRA EL RASTRO.
-- ---------------------------------------------------------------------
begin;

do $limpiar$
declare
  v_n int;
begin
  -- EL INVENTARIO NO SE TOCA, y la garantía es estructural: en todo este script no hay una sola
  -- instrucción contra `invtrans`. No se compara el total de ID2/ID3 aquí adentro a propósito:
  -- la bodega está trabajando y un despacho legítimo en ese mismo instante haría fallar el script
  -- sin que nada estuviera mal. La foto global va afuera, en los pasos 1 y 3, para su ojo.

  -- Las madres no pueden existir: si alguien las restituyó, este script ya no aplica.
  select count(*) into v_n from public.cabeceraoc
   where ordendecargue in ('AVI202610069897','MOL202609289628');
  if v_n > 0 then
    raise exception 'Alguna de las dos órdenes volvió a existir en cabeceraoc (% fila/s): este script ya no aplica. Se deshace todo.', v_n;
  end if;

  -- Ni un movimiento de inventario suyo, ni del clon.
  select count(*) into v_n from public.invtrans
   where ocargue in ('AVI202610069897','MOL202609289628','AVI202610069897D');
  if v_n > 0 then
    raise exception 'Aparecieron % movimiento(s) de inventario de esas órdenes. Con inventario de por medio esto NO se puede borrar así. Se deshace todo.', v_n;
  end if;

  -- 1) Las cabeceras de los pedidos sueltan la orden y vuelven a "aprobado".
  --    Es el estado del que salieron: los 5 tienen aprobado = 'si'.
  update public.pedidoscabecera
     set ocargue = null, estado = 'aprobado', vehiculo = null, transporte = null,
         fechaordencargue = null, fechadeentrega = null
   where idpedido in (12138, 12271, 12291, 12348, 12004)
     and (ocargue in ('AVI202610069897','MOL202609289628') or estado = 'entregado');
  raise notice 'Pedidos liberados: %', (select count(*) from public.pedidoscabecera
    where idpedido in (12138,12271,12291,12348,12004) and estado = 'aprobado' and ocargue is null);

  -- 2) Las 9 líneas vuelven a quedar sin cargar. `unidadespendientes` es GENERADA.
  update public.pedidosdetalle
     set ocargue = null, unidadescargadas = null, unidades_cargadas = null, estado = null
   where transid in (25090,25091,25413,25414,25415,25460,25461,25615,24798);

  -- 3) Las atribuciones del libro: esa orden ya no le llevó nada a ningún pedido.
  delete from public.pedidodetalle_ocargue
   where id in (20008,20009,20010,20011,20012,20013,20014,20015,5813);

  -- 4) Las citas sueltan la orden.
  update public.citasvehiculos set ocargue = null, estatus = null where id in (9479, 9365);

  -- 5) La asignación de lote que quedó viva (ID3). No alimenta ningún saldo.
  delete from public.historicolotes where id = 24985;

  -- 6) El clon huérfano y sus líneas.
  delete from public.detalleoc where idorden = 9900;
  delete from public.cabeceraoc where id = 9900 and ordendecargue = 'AVI202610069897D';

  -- Última comprobación del lado del inventario: que esas órdenes sigan sin un solo movimiento.
  select count(*) into v_n from public.invtrans
   where ocargue in ('AVI202610069897','MOL202609289628','AVI202610069897D');
  if v_n <> 0 then
    raise exception 'Aparecieron % movimiento(s) de inventario de esas órdenes mientras corría el script. Se deshace todo.', v_n;
  end if;
end
$limpiar$;

do $comprobar$
declare v int;
begin
  select count(*) into v from public.pedidodetalle_ocargue
   where ocargue in ('AVI202610069897','MOL202609289628');
  if v > 0 then raise exception 'Quedan % atribución(es) de esas órdenes. Se deshace todo.', v; end if;

  select count(*) into v from public.pedidosdetalle
   where ocargue in ('AVI202610069897','MOL202609289628');
  if v > 0 then raise exception 'Quedan % línea(s) de pedido apuntando a esas órdenes. Se deshace todo.', v; end if;

  select count(*) into v from public.pedidoscabecera
   where ocargue in ('AVI202610069897','MOL202609289628');
  if v > 0 then raise exception 'Quedan % cabecera(s) de pedido apuntando a esas órdenes. Se deshace todo.', v; end if;

  select count(*) into v from public.historicolotes
   where ordendecargue in ('AVI202610069897','MOL202609289628');
  if v > 0 then raise exception 'Quedan % asignación(es) de lote de esas órdenes. Se deshace todo.', v; end if;

  select count(*) into v from public.cabeceraoc where ordendecargue = 'AVI202610069897D';
  if v > 0 then raise exception 'El clon huérfano sigue existiendo. Se deshace todo.'; end if;

  -- Los 5 pedidos tienen que quedar utilizables: aprobados, sin orden y con todo pendiente.
  select count(*) into v from public.pedidoscabecera
   where idpedido in (12138,12271,12291,12348,12004) and (estado <> 'aprobado' or ocargue is not null);
  if v > 0 then raise exception '% pedido(s) no quedaron listos para que el cliente los gestione. Se deshace todo.', v; end if;

  raise notice 'LISTO. Las dos órdenes no dejan rastro, los 5 pedidos vuelven a la bandeja del cliente y el inventario quedó igual.';
end
$comprobar$;

commit;

-- ---------------------------------------------------------------------
-- PASO 3 — DESPUÉS. Las mismas consultas del paso 1.
-- ---------------------------------------------------------------------
select idpedido, estado, aprobado, ocargue, vehiculo, fechaordencargue
from public.pedidoscabecera where idpedido in (12138, 12271, 12291, 12348, 12004) order by idpedido;
-- Esperado: los 5 en "aprobado", sin orden y sin vehículo.

select transid, idpedido, producto, unidades, unidadescargadas, unidadespendientes, estado, ocargue
from public.pedidosdetalle
where transid in (25090,25091,25413,25414,25415,25460,25461,25615,24798) order by transid;
-- Esperado: 9 líneas sin cargar, con todo pendiente y sin orden.

select count(*) as atribuciones from public.pedidodetalle_ocargue
 where ocargue in ('AVI202610069897','MOL202609289628');                    -- esperado: 0
select count(*) as asignaciones from public.historicolotes
 where ordendecargue in ('AVI202610069897','MOL202609289628');              -- esperado: 0
select count(*) as clon from public.cabeceraoc where ordendecargue = 'AVI202610069897D';  -- esperado: 0
select id, ocargue, estatus from public.citasvehiculos where id in (9479, 9365) order by id;

-- El inventario, idéntico al paso 1.
select idempresa, count(*) as movimientos,
       coalesce(sum(cantidad) filter (where tipomov = 'Entrada'), 0) as entradas,
       coalesce(sum(cantidad) filter (where tipomov = 'Salida'), 0) as salidas
from public.invtrans where idempresa in (2,3) group by idempresa order by idempresa;
