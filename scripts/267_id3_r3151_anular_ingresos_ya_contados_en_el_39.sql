
-- =====================================================================
-- 267_id3_r3151_anular_ingresos_ya_contados_en_el_39.sql
--
-- ID3 (Cedi Funza). El descargue manual R- 3151 (Molinos, placa LPL6177, 43 und) se creó el
-- 1-oct-2026 a las 16:00, pero la mercancía llegó el 30 de septiembre y el Conteo total #39
-- del 1-oct (amanecer) YA la contó. Sus 6 ingresos automáticos del 1-oct (16:17, aprobados por
-- admin esa noche) la sumaron por SEGUNDA vez: el inventario sobra 43 unidades.
--
-- Autorizado por gerencia el 2026-10-08: "esta orden quedó con fecha del primero pero es del 30
-- de septiembre... esto debe descontar, no debe sumar; el inicial es el conteo 39, no
-- modificar; está sobrando en el inventario". Mismo proceso que el 266.
--
-- Correcciones POR LLAVE PRIMARIA, estado esperado verificado antes, antes/después impreso y
-- comprobación de coherencia al final. Idempotente. No borra: los ingresos quedan en
-- 'rechazado' con la razón escrita y el saldo deja de contarlos. El conteo #39 y la orden
-- (fecha, báscula, nómina) no se tocan; solo se le escribe la nota en observaciones.
-- =====================================================================
--
-- LOS 6 INGRESOS (todos lote NUEVO, que no existía en el conteo: la mercancía se contó
-- bajo los lotes que ya estaban en bodega)
--   #33833  Surtida 250 Gr. X 24 Und.      lote 20260828 A9    1
--   #33834  PT FIDEO 250*24PQ              lote 20260916 A7    8
--   #33835  PT CONCHAS 250*24              lote 20260917 A6    3   ← el lote ya se gastó (orden 9868)
--   #33836  PT MACARRON C.250GR*24PQ       lote 20260917 A8   13   ← el lote ya se gastó (órdenes 9868 y 9854)
--   #33837  PT ESPAGUETI 1000GR*12PQ       lote 20260924 A5    5
--   #33838  PT HARINA PREC MAIZ 24LB BLANCA lote 20260924 A14  13
--
-- DOS LOTES FANTASMA YA SE DESPACHARON. Al anular sus ingresos quedarían en negativo, así que
-- las salidas que los citan pasan al lote donde el conteo puso esa mercancía:
--   Conchas 250: el conteo del 1-oct encontró +65 en el lote 20260918 A6 (y 0 en el 20260917).
--     Salida #34202 (3 und, orden 9868) y su asignación #25510 → lote 20260918 A6 (saldo 526).
--   Macarrón C: el conteo encontró +13 en el lote 20260920 A8, pero ese lote ya se agotó
--     (348 → 0). Las salidas #34209 (5, orden 9868) y #34232 (8, orden 9854) y sus asignaciones
--     #25517 y #25540 pasan al siguiente lote más antiguo con saldo: 20260923 A8 (586).
--     >>> Si el CEDI sabe que esos 13 salieron del 20260930, lo mueve con un 311. <<<
--
-- RESULTADO ESPERADO (ID3): Surtida 2.166 → 2.165 · Fideo 250 3.624 → 3.616 · Conchas 250
-- 2.026 → 2.023 · Macarrón C 1.186 → 1.173 · Espagueti 1000 577 → 572 · Harina 24LB 8.511 → 8.498.
-- Total −43. Contra la hoja física del 8-oct: Espagueti 1000 y Fideo 250 quedan en 0, Conchas y
-- Macarrón en −1, Harina en −17, Surtida en +1. Ningún lote nuevo en negativo. Las órdenes 9868 y
-- 9854 no cambian de total.
-- =====================================================================

-- ---------------------------------------------------------------------
-- PASO 1 — ANTES.
-- ---------------------------------------------------------------------
select id, nombreproducto, lote, location, cantidad, tipomov, cod_movimiento, status, ocargue, creado, observaciones
from public.invtrans
where id in (33833, 33834, 33835, 33836, 33837, 33838, 34202, 34209, 34232)
order by id;

select id, ordendecargue, producto, lote, location, cantidad
from public.historicolotes
where id in (25510, 25517, 25540)
order by id;

select nombreproducto, sum(stock_actual) as total
from public.saldoinvdetalle
where idempresa = 3
  and nombreproducto in ('Surtida 250 Gr. X 24 Und.', 'PT FIDEO 250*24PQ', 'PT CONCHAS 250*24',
                         'PT MACARRON C.250GR*24PQ', 'PT ESPAGUETI 1000GR*12PQ', 'PT HARINA PREC MAIZ 24LB BLANCA')
group by nombreproducto
order by 1;

-- ---------------------------------------------------------------------
-- PASO 2 — CORRECCIÓN. Todo o nada.
-- ---------------------------------------------------------------------
begin;

do $anular$
declare
  c_nota        constant text := ' · Anulado por 267 (8-oct-2026): la mercancía de R- 3151 llegó el 30-sep y ya la contó el Conteo total #39 del 1-oct; este ingreso la sumaba por segunda vez.';
  c_nota_salida constant text := ' · Lote corregido por 267 (8-oct-2026): el lote 20260917 era del ingreso anulado de R- 3151; la mercancía estaba contada en este lote.';
  r             record;
  v_neg_0       int;
  v_neg         int;
  v_t           numeric;
begin
  if exists (select 1 from public.invtrans where id = 33833 and lower(status) = 'rechazado') then
    raise notice 'El 267 ya se corrió: nada que hacer.';
    return;
  end if;

  select count(*) into v_neg_0 from public.saldoinvdetalle where idempresa = 3 and stock_actual < 0;

  -- ESTADO ESPERADO de los 6 ingresos. Si algo no calza, no se toca nada.
  for r in
    select * from (values
      (33833, 'Surtida 250 Gr. X 24 Und.',       '20260828', 'A9',  1::numeric),
      (33834, 'PT FIDEO 250*24PQ',               '20260916', 'A7',  8),
      (33835, 'PT CONCHAS 250*24',               '20260917', 'A6',  3),
      (33836, 'PT MACARRON C.250GR*24PQ',        '20260917', 'A8',  13),
      (33837, 'PT ESPAGUETI 1000GR*12PQ',        '20260924', 'A5',  5),
      (33838, 'PT HARINA PREC MAIZ 24LB BLANCA', '20260924', 'A14', 13)
    ) as e(id, producto, lote, loc, cant)
  loop
    if not exists (
      select 1 from public.invtrans i
       where i.id = r.id and i.idempresa = 3 and i.nombreproducto = r.producto
         and i.lote = r.lote and i.location = r.loc and i.cantidad = r.cant
         and i.tipomov = 'Entrada' and i.cod_movimiento::text = '101'
         and lower(i.status) = 'aprobado' and i.ocargue = 'R- 3151'
    ) then
      raise exception 'invtrans #% no está como se esperaba (% lote % % %): se deshace todo y hay que revisar.', r.id, r.producto, r.lote, r.loc, r.cant;
    end if;
  end loop;

  -- ESTADO ESPERADO de las 3 salidas y 3 asignaciones que citan el lote fantasma 20260917.
  if not exists (select 1 from public.invtrans where id = 34202 and nombreproducto = 'PT CONCHAS 250*24' and lote = '20260917' and location = 'A6' and cantidad = 3 and tipomov = 'Salida' and ocargue = 'MOL202610059868' and lower(status) = 'aprobado')
     or not exists (select 1 from public.invtrans where id = 34209 and nombreproducto = 'PT MACARRON C.250GR*24PQ' and lote = '20260917' and location = 'A8' and cantidad = 5 and tipomov = 'Salida' and ocargue = 'MOL202610059868' and lower(status) = 'aprobado')
     or not exists (select 1 from public.invtrans where id = 34232 and nombreproducto = 'PT MACARRON C.250GR*24PQ' and lote = '20260917' and location = 'A8' and cantidad = 8 and tipomov = 'Salida' and ocargue = 'MOL202610059854' and lower(status) = 'aprobado') then
    raise exception 'Las salidas #34202/#34209/#34232 no están como se esperaba: se deshace todo.';
  end if;
  if not exists (select 1 from public.historicolotes where id = 25510 and ordendecargue = 'MOL202610059868' and producto = 'PT CONCHAS 250*24' and lote = '20260917' and location = 'A6' and cantidad = '3')
     or not exists (select 1 from public.historicolotes where id = 25517 and ordendecargue = 'MOL202610059868' and producto = 'PT MACARRON C.250GR*24PQ' and lote = '20260917' and location = 'A8' and cantidad = '5')
     or not exists (select 1 from public.historicolotes where id = 25540 and ordendecargue = 'MOL202610059854' and producto = 'PT MACARRON C.250GR*24PQ' and lote = '20260917' and location = 'A8' and cantidad = '8') then
    raise exception 'historicolotes #25510/#25517/#25540 no están como se esperaba: se deshace todo.';
  end if;

  -- El conteo #39 tiene que ser la base aprobada de octubre.
  if not exists (select 1 from public.sig_inventario_cuadre where id = 39 and proyecto_id = 3 and tipo = 'total' and activo and estado = 'aprobado' and fecha = '2026-10-01') then
    raise exception 'El conteo #39 no es la base aprobada de octubre en ID3: se deshace todo.';
  end if;

  -- 2a. Los 6 ingresos dejan de contar.
  update public.invtrans set status = 'rechazado', observaciones = coalesce(observaciones, '') || c_nota
   where id in (33833, 33834, 33835, 33836, 33837, 33838);
  raise notice 'R- 3151: 6 ingresos (43 und) anulados.';

  -- 2b. Las salidas del lote fantasma pasan al lote donde la mercancía estaba contada.
  update public.invtrans set lote = '20260918', observaciones = coalesce(observaciones, '') || c_nota_salida where id = 34202;
  update public.historicolotes set lote = '20260918' where id = 25510;
  update public.invtrans set lote = '20260923', observaciones = coalesce(observaciones, '') || c_nota_salida where id in (34209, 34232);
  update public.historicolotes set lote = '20260923' where id in (25517, 25540);
  raise notice 'Salidas #34202 -> lote 20260918 A6; #34209 y #34232 -> lote 20260923 A8 (y sus asignaciones).';

  -- 2c. La orden queda explicada.
  update public.cabeceraoc
     set observaciones = coalesce(observaciones, '') || 'Mercancía recibida el 30-sep-2026 y contada en el Conteo total #39 del 1-oct; sus ingresos del 1-oct se anularon (script 267).'
   where id = 9771 and ordendecargue = 'R- 3151' and idempresa = 3;

  -- COHERENCIA FINAL.
  for r in
    select * from (values
      ('Surtida 250 Gr. X 24 Und.',       2165::numeric),
      ('PT FIDEO 250*24PQ',               3616),
      ('PT CONCHAS 250*24',               2023),
      ('PT MACARRON C.250GR*24PQ',        1173),
      ('PT ESPAGUETI 1000GR*12PQ',        572),
      ('PT HARINA PREC MAIZ 24LB BLANCA', 8498)
    ) as e(producto, esperado)
  loop
    select coalesce(sum(stock_actual), 0) into v_t from public.saldoinvdetalle where idempresa = 3 and nombreproducto = r.producto;
    if v_t <> r.esperado then
      raise exception '% debía quedar en % y quedó en %: se deshace todo (¿hubo movimientos nuevos hoy? revisar y ajustar los esperados).', r.producto, r.esperado, v_t;
    end if;
  end loop;

  if (select sum(cantidad) from public.invtrans where ocargue = 'MOL202610059868' and tipomov = 'Salida' and lower(status) = 'aprobado')
     <> (select sum(cantidad::numeric) from public.historicolotes where ordendecargue = 'MOL202610059868')
     or (select sum(cantidad) from public.invtrans where ocargue = 'MOL202610059854' and tipomov = 'Salida' and lower(status) = 'aprobado')
     <> (select sum(cantidad::numeric) from public.historicolotes where ordendecargue = 'MOL202610059854') then
    raise exception 'Las órdenes 9868/9854 dejaron de cuadrar con su asignación: se deshace todo.';
  end if;

  select count(*) into v_neg from public.saldoinvdetalle where idempresa = 3 and stock_actual < 0;
  if v_neg > v_neg_0 then
    raise exception 'ID3 pasó de % a % lotes en negativo: se deshace todo.', v_neg_0, v_neg;
  end if;

  raise notice 'LISTO. R- 3151 ya no suma: −43 und en ID3. El conteo #39 no se tocó. Lotes en negativo: % (los mismos de antes).', v_neg;
end
$anular$;

commit;

-- ---------------------------------------------------------------------
-- PASO 3 — DESPUÉS. Esperado: 6 ingresos en 'rechazado'; salidas en 20260918 / 20260923;
--   Surtida 2.165 · Fideo 3.616 · Conchas 2.023 · Macarrón 1.173 · Espagueti 1000 572 · Harina 8.498.
-- ---------------------------------------------------------------------
select id, nombreproducto, lote, location, cantidad, status
from public.invtrans
where id in (33833, 33834, 33835, 33836, 33837, 33838, 34202, 34209, 34232)
order by id;

select nombreproducto, sum(stock_actual) as total
from public.saldoinvdetalle
where idempresa = 3
  and nombreproducto in ('Surtida 250 Gr. X 24 Und.', 'PT FIDEO 250*24PQ', 'PT CONCHAS 250*24',
                         'PT MACARRON C.250GR*24PQ', 'PT ESPAGUETI 1000GR*12PQ', 'PT HARINA PREC MAIZ 24LB BLANCA')
group by nombreproducto
order by 1;

select nombreproducto, lote, location, stock_actual
from public.saldoinvdetalle
where idempresa = 3 and stock_actual < 0
order by nombreproducto, lote;
-- Esperado: solo los 3 lotes de POLI PANADERIA mientras no se corra el 265; ninguno nuevo.
