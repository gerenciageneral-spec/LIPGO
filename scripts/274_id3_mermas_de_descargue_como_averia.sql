
-- =====================================================================
-- 274_id3_mermas_de_descargue_como_averia.sql
--
-- ID3 (Cedi Funza). Las 28 unidades que no llegaron completas en cuatro descargues dejan de
-- ser una "diferencia" y quedan registradas como lo que fueron: AVERÍA, producto que llegó
-- dañado.
--
-- Autorizado por gerencia el 2026-10-09: "esa diferencia la debes enviar a avería, llegó
-- dañada" · "debes tener en cuenta que es adicionar a la orden y quitar el ingreso manual, de
-- lo contrario queda doble".
--
-- Correcciones POR LLAVE PRIMARIA, estado esperado verificado antes, antes/después impreso y
-- comprobación de coherencia al final. Idempotente. Va DESPUÉS del script 273.
-- =====================================================================
--
-- NO SE DUPLICA NADA, Y ASÍ SE GARANTIZA
--
-- La advertencia de gerencia es exacta: si se "adicionara" el faltante como un ingreso NUEVO y
-- se dejara el que ya existe, el producto entraría dos veces. Por eso aquí NO nace ningún
-- ingreso: SUBE el que ya está enlazado hasta lo que dice la orden, y sale la avería por la
-- diferencia. Es el mismo movimiento, no uno nuevo.
--
--   107055  Espagueti 250    ingreso #31868  2.653 → 2.655   avería  2
--   107051  Fideo 250        ingreso #31875  2.283 → 2.290   avería  7
--   107131  La Nieve 25LB    ingreso #33315  1.650 → 1.660   avería 10
--   107148  La Nieve 25LB    ingreso #33314    991 → 1.000   avería  9
--                                                            TOTAL  28
--
-- EL STOCK NO SE MUEVE NI UNA UNIDAD: lo que sube el ingreso (+28) lo baja la avería (−28).
-- El script compara el total de ID3 antes y después y, si cambia en algo, deshace todo.
--
-- POR QUÉ 551 Y NO 555
-- El 551 (merma/reproceso) es el que ID3 ya usa para producto que llega o queda en mal estado
-- ("despacho de material por mal estado sale como venta por avería"). El 555 es desecho por
-- calidad y exige que el producto esté primero en CUARENTENA (344), que no es el caso: esto es
-- merma de transporte detectada al descargar.
--
-- LAS FECHAS: el movimiento de avería se fecha el DÍA DEL DESCARGUE, porque ese día llegó
-- dañado. Septiembre ya está conciliado y su cierre es el Conteo #39, pero eso no se altera:
-- el ingreso sube y la avería baja lo mismo EL MISMO DÍA, así que el saldo con el que amaneció
-- el 1 de octubre queda idéntico.
--
-- EN EL KARDEX estas 28 unidades pasan de no existir a verse en la columna AVERÍAS, que es
-- donde gerencia espera encontrarlas ("le restan las órdenes de cargue y las averías").
-- Y las cuatro órdenes pasan a CUADRAR en el Cuadre por orden.
-- =====================================================================

-- ---------------------------------------------------------------------
-- PASO 1 — ANTES.
-- ---------------------------------------------------------------------
select i.id, i.ocargue, i.nombreproducto, i.lote, i.location, i.cantidad, i.status,
       (select d.cantidad from public.detalleoc d
         join public.cabeceraoc c on c.id = d.idorden
        where c.ordendecargue = i.ocargue and c.idempresa = 3 and d.producto = i.nombreproducto) as dice_la_orden
from public.invtrans i
where i.id in (31868, 31875, 33315, 33314)
order by i.id;
-- Esperado: 2653/2655 · 2283/2290 · 1650/1660 · 991/1000, los cuatro con su orden ya puesta.

select coalesce(sum(stock_actual), 0) as stock_id3_antes from public.saldoinvdetalle where idempresa = 3;

-- ---------------------------------------------------------------------
-- PASO 2 — CORRECCIÓN. Todo o nada.
-- ---------------------------------------------------------------------
begin;

do $averiar$
declare
  r         record;
  v_id      bigint;
  v_stock_0 numeric;
  v_stock_1 numeric;
  v_neg_0   int;
  v_neg_1   int;
  v_hechas  int := 0;
  v_fecha   date;
begin
  select coalesce(sum(stock_actual), 0) into v_stock_0 from public.saldoinvdetalle where idempresa = 3;
  select count(*) into v_neg_0 from public.saldoinvdetalle where idempresa = 3 and stock_actual < 0;

  for r in
    select * from (values
      (31868, '107055', 'PT ESPAGUETI 250GR*24PQ', 'PT000027', 27, '20260829', 'A1', 2653::numeric, 2655::numeric),
      (31875, '107051', 'PT FIDEO 250*24PQ',       'PT000080', 80, '20260815', 'A7', 2283,          2290),
      (33315, '107131', 'PT LA NIEVE 25LB',        'PT000048', 48, '20260920', 'A2', 1650,          1660),
      (33314, '107148', 'PT LA NIEVE 25LB',        'PT000048', 48, '20260921', 'A2',  991,          1000)
    ) as e(id, oc, producto, codprod, idprod, lote, loc, entro, orden)
  loop
    -- ¿Ya se corrió para esta línea?
    if exists (select 1 from public.invtrans where id = r.id and cantidad = r.orden) then
      continue;
    end if;

    -- ESTADO ESPERADO. Si algo no calza, no se toca NADA.
    if not exists (
      select 1 from public.invtrans
       where id = r.id and idempresa = 3 and ocargue = r.oc and nombreproducto = r.producto
         and lote = r.lote and location = r.loc and cantidad = r.entro
         and tipomov = 'Entrada' and cod_movimiento::text = '101' and lower(status) like 'aprob%'
    ) then
      raise exception 'invtrans #% no está como se esperaba (% de % en la orden %, lote %): ¿se corrió el 273? Se deshace todo.', r.id, r.producto, r.entro, r.oc, r.lote;
    end if;
    if not exists (
      select 1 from public.detalleoc d join public.cabeceraoc c on c.id = d.idorden
       where c.idempresa = 3 and c.ordendecargue = r.oc and d.producto = r.producto and d.cantidad = r.orden
    ) then
      raise exception 'La orden % no pide % de %: se deshace todo.', r.oc, r.orden, r.producto;
    end if;

    select fechacargue into v_fecha from public.cabeceraoc where idempresa = 3 and ordendecargue = r.oc;

    -- 1) El ingreso sube a lo que dice la orden. NO nace otro: es el mismo movimiento, para
    --    que el producto no entre dos veces (advertencia expresa de gerencia).
    update public.invtrans
       set cantidad = r.orden,
           observaciones = coalesce(observaciones, '') ||
             ' · Script 274 (9-oct-2026): el ingreso sube de ' || r.entro || ' a ' || r.orden ||
             ' (lo que llegó físicamente, incluido lo dañado) y la diferencia sale como avería 551. El stock no cambia.'
     where id = r.id;

    -- 2) Y sale la avería por lo que llegó dañado, el mismo día y del mismo lote.
    select coalesce(max(id), 0) + 1 into v_id from public.invtrans;
    insert into public.invtrans
      (id, idempresa, idproducto, codproducto, nombreproducto, lote, location, cantidad,
       tipomov, cod_movimiento, status, origen, ocargue, creado, creadopor, observaciones)
    values
      (v_id, 3, r.idprod, r.codprod, r.producto, r.lote, r.loc, r.orden - r.entro,
       'Reproceso', '551', 'aprobado', 'transaccion manual', r.oc,
       (v_fecha::text || ' 18:00:00')::timestamptz, 'Gerencia General',
       'Movimiento por código 551 · Avería del descargue ' || r.oc || ': llegaron ' || (r.orden - r.entro) ||
       ' unidades dañadas de ' || r.orden || '. Registrado por el script 274 (9-oct-2026) por instrucción de gerencia: "esa diferencia la debes enviar a avería, llegó dañada".');

    v_hechas := v_hechas + 1;
    raise notice '% · %: ingreso % -> % y avería de % unidades (invtrans #%).', r.oc, r.producto, r.entro, r.orden, r.orden - r.entro, v_id;
  end loop;

  -- COHERENCIA FINAL.
  -- 1. El stock NO puede haberse movido: lo que subió el ingreso lo bajó la avería.
  select coalesce(sum(stock_actual), 0) into v_stock_1 from public.saldoinvdetalle where idempresa = 3;
  if v_stock_1 <> v_stock_0 then
    raise exception 'El inventario de ID3 cambió (% -> %): lo que sube el ingreso tiene que bajarlo la avería. Se deshace todo.', v_stock_0, v_stock_1;
  end if;

  -- 2. Ningún lote en negativo nuevo.
  select count(*) into v_neg_1 from public.saldoinvdetalle where idempresa = 3 and stock_actual < 0;
  if v_neg_1 > v_neg_0 then
    raise exception 'Aparecieron lotes en negativo (% -> %): se deshace todo.', v_neg_0, v_neg_1;
  end if;

  -- 3. Las cuatro órdenes tienen que CUADRAR contra su detalle.
  if exists (
    select 1
      from public.cabeceraoc c
      join public.detalleoc d on d.idorden = c.id
     where c.idempresa = 3 and c.ordendecargue in ('107055', '107051', '107131', '107148')
       and abs(coalesce((select sum(i.cantidad) from public.invtrans i
                          where i.ocargue = c.ordendecargue and i.tipomov = 'Entrada'
                            and i.cod_movimiento::text = '101' and lower(i.status) like 'aprob%'
                            and i.nombreproducto = d.producto), 0) - d.cantidad) > 0.5
  ) then
    raise exception 'Alguna de las cuatro órdenes sigue sin cuadrar con su detalle: se deshace todo.';
  end if;

  raise notice 'LISTO. % líneas pasadas a avería (28 unidades). Stock de ID3 intacto: %. Las cuatro órdenes cuadran.', v_hechas, v_stock_1;
end
$averiar$;

commit;

-- ---------------------------------------------------------------------
-- PASO 3 — DESPUÉS.
-- ---------------------------------------------------------------------

-- 3a. Los cuatro ingresos, ya con la cantidad de la orden.
select id, ocargue, nombreproducto, lote, cantidad, status
from public.invtrans where id in (31868, 31875, 33315, 33314) order by id;
-- Esperado: 2655 · 2290 · 1660 · 1000.

-- 3b. Las cuatro averías nuevas.
select id, ocargue, nombreproducto, lote, location, cantidad, tipomov, cod_movimiento, creado, observaciones
from public.invtrans
where idempresa = 3 and cod_movimiento::text = '551' and ocargue in ('107055', '107051', '107131', '107148')
order by id;
-- Esperado: 4 filas (2, 7, 10 y 9 unidades), fechadas el día de su descargue.

-- 3c. Las cuatro órdenes contra lo que recibieron: todas en cero.
select c.ordendecargue, d.producto, d.cantidad as dice_la_orden,
       coalesce((select sum(i.cantidad) from public.invtrans i
                  where i.ocargue = c.ordendecargue and i.tipomov = 'Entrada'
                    and i.cod_movimiento::text = '101' and lower(i.status) like 'aprob%'
                    and i.nombreproducto = d.producto), 0) as entro,
       coalesce((select sum(i.cantidad) from public.invtrans i
                  where i.ocargue = c.ordendecargue and i.tipomov = 'Reproceso'
                    and i.cod_movimiento::text = '551' and i.nombreproducto = d.producto), 0) as averia
from public.cabeceraoc c
join public.detalleoc d on d.idorden = c.id
where c.idempresa = 3 and c.ordendecargue in ('107055', '107051', '107131', '107148')
order by c.ordendecargue, d.producto;

-- 3d. El inventario no se movió y sigue sin negativos.
select coalesce(sum(stock_actual), 0) as stock_id3_despues,
       (select count(*) from public.saldoinvdetalle where idempresa = 3 and stock_actual < 0) as lotes_negativos
from public.saldoinvdetalle where idempresa = 3;
-- Esperado: el MISMO total del paso 1, y 0 negativos.
