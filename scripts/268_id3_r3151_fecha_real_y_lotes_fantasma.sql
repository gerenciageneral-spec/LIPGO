
-- =====================================================================
-- 268_id3_r3151_fecha_real_y_lotes_fantasma.sql
--
-- ID3 (Cedi Funza). Reemplaza al 267: gerencia BORRÓ directamente en invtrans los 6 ingresos
-- del descargue R- 3151 (8-oct-2026, 43 und que ya estaban contadas en el Conteo total #39).
-- Quedan dos cosas por cerrar:
--
--   1. LA ORDEN SIGUE FECHADA EL 1-OCT. Un descargue finalizado sin ningún ingreso es lo que el
--      Cuadre por orden debe marcar como "Sin inventario", y por eso la sigue listando. La
--      mercancía llegó el 30 de septiembre (gerencia: "quedó con fecha del primero pero es del
--      30 de septiembre"): se le pone su fecha real y sale del cuadre de octubre.
--      OJO: en los CEDIs el peso del descargue entra al cálculo de nómina (pesoBaseCalculo):
--      0,366 t pasan del 1-oct al 30-sep. Es la realidad del despacho; gerencia decide.
--
--   2. DOS LOTES FANTASMA YA SE HABÍAN DESPACHADO. Al borrar los ingresos quedaron en negativo:
--        PT CONCHAS 250*24        lote 20260917 A6  −3   (salida #34202, orden 9868)
--        PT MACARRON C.250GR*24PQ lote 20260917 A8  −13  (salidas #34209 orden 9868 y #34232 orden 9854)
--      Esas salidas y sus asignaciones pasan al lote donde el conteo encontró la mercancía:
--        Conchas → 20260918 A6 (el conteo halló +65 ahí; saldo 526).
--        Macarrón → 20260923 A8 (el conteo puso +13 en el 20260920, pero ese lote ya se agotó;
--                   20260923 es el siguiente más antiguo con saldo, 586).
--        >>> Si el CEDI sabe que esos 13 salieron del 20260930, lo mueve después con un 311. <<<
--
-- Correcciones POR LLAVE PRIMARIA, estado esperado verificado antes, antes/después impreso y
-- comprobación de coherencia al final. Idempotente. El conteo #39 no se toca. Los totales por
-- producto NO cambian (solo cambia el lote de 3 salidas y la fecha de una cabecera).
-- =====================================================================

-- ---------------------------------------------------------------------
-- PASO 1 — ANTES.
-- ---------------------------------------------------------------------
select id, ordendecargue, status, fechaorden, fechacargue, pesoorden, observaciones
from public.cabeceraoc where id = 9771;

select id, nombreproducto, lote, location, cantidad, status, ocargue
from public.invtrans where id in (34202, 34209, 34232) order by id;

select id, ordendecargue, producto, lote, location, cantidad
from public.historicolotes where id in (25510, 25517, 25540) order by id;

select nombreproducto, lote, location, stock_actual
from public.saldoinvdetalle where idempresa = 3 and stock_actual < 0 order by nombreproducto, lote;

-- ---------------------------------------------------------------------
-- PASO 2 — CORRECCIÓN. Todo o nada.
-- ---------------------------------------------------------------------
begin;

do $corregir$
declare
  c_nota   constant text := ' · Lote corregido por 268 (8-oct-2026): el lote 20260917 era del ingreso borrado de R- 3151; la mercancía estaba contada en este lote.';
  v_neg_0  int;
  v_neg    int;
  v_conchas_0 numeric; v_conchas numeric;
  v_mac_0     numeric; v_mac     numeric;
begin
  if exists (select 1 from public.cabeceraoc where id = 9771 and fechacargue = date '2026-09-30')
     and exists (select 1 from public.invtrans where id = 34202 and lote = '20260918') then
    raise notice 'El 268 ya se corrió: nada que hacer.';
    return;
  end if;

  -- ESTADO ESPERADO.
  if not exists (select 1 from public.cabeceraoc where id = 9771 and ordendecargue = 'R- 3151' and idempresa = 3
                   and tipooperacion = 'Descargue' and fechacargue = date '2026-10-01' and fechaorden = date '2026-10-01') then
    raise exception 'La orden 9771 (R- 3151) no está como se esperaba: se deshace todo.';
  end if;
  if exists (select 1 from public.invtrans where ocargue = 'R- 3151') then
    raise exception 'R- 3151 todavía tiene movimientos en invtrans: este script supone que gerencia ya los borró. Se deshace todo.';
  end if;
  if not exists (select 1 from public.invtrans where id = 34202 and nombreproducto = 'PT CONCHAS 250*24' and lote = '20260917' and location = 'A6' and cantidad = 3 and tipomov = 'Salida' and ocargue = 'MOL202610059868' and lower(status) = 'aprobado')
     or not exists (select 1 from public.invtrans where id = 34209 and nombreproducto = 'PT MACARRON C.250GR*24PQ' and lote = '20260917' and location = 'A8' and cantidad = 5 and tipomov = 'Salida' and ocargue = 'MOL202610059868' and lower(status) = 'aprobado')
     or not exists (select 1 from public.invtrans where id = 34232 and nombreproducto = 'PT MACARRON C.250GR*24PQ' and lote = '20260917' and location = 'A8' and cantidad = 8 and tipomov = 'Salida' and ocargue = 'MOL202610059854' and lower(status) = 'aprobado') then
    raise exception 'Las salidas #34202/#34209/#34232 no están como se esperaba: se deshace todo.';
  end if;
  if not exists (select 1 from public.historicolotes where id = 25510 and ordendecargue = 'MOL202610059868' and producto = 'PT CONCHAS 250*24' and lote = '20260917' and cantidad = '3')
     or not exists (select 1 from public.historicolotes where id = 25517 and ordendecargue = 'MOL202610059868' and producto = 'PT MACARRON C.250GR*24PQ' and lote = '20260917' and cantidad = '5')
     or not exists (select 1 from public.historicolotes where id = 25540 and ordendecargue = 'MOL202610059854' and producto = 'PT MACARRON C.250GR*24PQ' and lote = '20260917' and cantidad = '8') then
    raise exception 'historicolotes #25510/#25517/#25540 no están como se esperaba: se deshace todo.';
  end if;

  select count(*) into v_neg_0 from public.saldoinvdetalle where idempresa = 3 and stock_actual < 0;
  select coalesce(sum(stock_actual),0) into v_conchas_0 from public.saldoinvdetalle where idempresa = 3 and nombreproducto = 'PT CONCHAS 250*24';
  select coalesce(sum(stock_actual),0) into v_mac_0     from public.saldoinvdetalle where idempresa = 3 and nombreproducto = 'PT MACARRON C.250GR*24PQ';

  -- 2a. La orden recupera su fecha real.
  update public.cabeceraoc
     set fechacargue = date '2026-09-30',
         fechaorden  = date '2026-09-30',
         observaciones = coalesce(observaciones, '') ||
           'Mercancía recibida el 30-sep-2026 y contada en el Conteo total #39 del 1-oct; la orden se había creado el 1-oct. Fecha corregida y sus ingresos del 1-oct retirados por gerencia (script 268).'
   where id = 9771;
  raise notice 'R- 3151: fecha de cargue y de orden 2026-10-01 -> 2026-09-30.';

  -- 2b. Las salidas del lote fantasma, al lote donde estaba contada la mercancía.
  update public.invtrans set lote = '20260918', observaciones = coalesce(observaciones, '') || c_nota where id = 34202;
  update public.historicolotes set lote = '20260918' where id = 25510;
  update public.invtrans set lote = '20260923', observaciones = coalesce(observaciones, '') || c_nota where id in (34209, 34232);
  update public.historicolotes set lote = '20260923' where id in (25517, 25540);
  raise notice 'Salida #34202 -> lote 20260918 A6; #34209 y #34232 -> lote 20260923 A8 (y sus asignaciones).';

  -- COHERENCIA FINAL: totales por producto iguales, órdenes cuadradas con su asignación,
  -- los dos lotes fantasma fuera de negativo y ninguno nuevo.
  select coalesce(sum(stock_actual),0) into v_conchas from public.saldoinvdetalle where idempresa = 3 and nombreproducto = 'PT CONCHAS 250*24';
  select coalesce(sum(stock_actual),0) into v_mac     from public.saldoinvdetalle where idempresa = 3 and nombreproducto = 'PT MACARRON C.250GR*24PQ';
  if v_conchas <> v_conchas_0 or v_mac <> v_mac_0 then
    raise exception 'Cambió el total de Conchas (% -> %) o Macarrón (% -> %): se deshace todo.', v_conchas_0, v_conchas, v_mac_0, v_mac;
  end if;
  if (select sum(cantidad) from public.invtrans where ocargue = 'MOL202610059868' and tipomov = 'Salida' and lower(status) = 'aprobado')
     <> (select sum(cantidad::numeric) from public.historicolotes where ordendecargue = 'MOL202610059868')
     or (select sum(cantidad) from public.invtrans where ocargue = 'MOL202610059854' and tipomov = 'Salida' and lower(status) = 'aprobado')
     <> (select sum(cantidad::numeric) from public.historicolotes where ordendecargue = 'MOL202610059854') then
    raise exception 'Las órdenes 9868/9854 dejaron de cuadrar con su asignación: se deshace todo.';
  end if;
  if exists (select 1 from public.saldoinvdetalle where idempresa = 3 and stock_actual < 0
              and nombreproducto in ('PT CONCHAS 250*24', 'PT MACARRON C.250GR*24PQ')) then
    raise exception 'Conchas o Macarrón siguen con un lote en negativo: se deshace todo.';
  end if;
  select count(*) into v_neg from public.saldoinvdetalle where idempresa = 3 and stock_actual < 0;
  if v_neg >= v_neg_0 then
    raise exception 'Los negativos de ID3 no bajaron (% -> %): se deshace todo.', v_neg_0, v_neg;
  end if;

  raise notice 'LISTO. R- 3151 fechada el 30-sep y fuera del cuadre de octubre. Negativos en ID3: % (deben ser solo los de POLI hasta correr el 265).', v_neg;
end
$corregir$;

commit;

-- ---------------------------------------------------------------------
-- PASO 3 — DESPUÉS. Esperado: 9771 con fecha 2026-09-30; salidas en 20260918/20260923;
--   negativos de ID3 = solo los 3 lotes de POLI (o 0 si ya corrió el 265).
-- ---------------------------------------------------------------------
select id, ordendecargue, fechaorden, fechacargue, observaciones from public.cabeceraoc where id = 9771;

select id, nombreproducto, lote, location, cantidad from public.invtrans where id in (34202, 34209, 34232) order by id;

select nombreproducto, lote, location, stock_actual
from public.saldoinvdetalle where idempresa = 3 and stock_actual < 0 order by nombreproducto, lote;
