
-- =====================================================================
-- 273_id3_enlazar_ingresos_a_mano_con_su_descargue.sql
--
-- ID3 (Cedi Funza). Once ingresos digitados a mano quedan atribuidos al descargue con el que
-- de verdad llegaron, y la orden 107200 se corrige a lo que realmente se recibió.
--
-- Autorizado por gerencia el 2026-10-09: "es el mismo patrón... si revisas la orden 107200, la
-- foto que suben en packing de la orden de descargue, llegaron 1600 no 1500 de Fideo 250, por
-- eso el coordinador se equivoca, no lo aprueba, lo rechaza y luego hace el ingreso manual.
-- Vamos a corregir todas... los ingresos manuales son de esas órdenes".
--
-- Correcciones POR LLAVE PRIMARIA, estado esperado verificado antes, antes/después impreso y
-- comprobación de coherencia al final. Idempotente.
-- =====================================================================
--
-- EL PATRÓN, IDÉNTICO EN LAS OCHO ÓRDENES
--
-- El ingreso automático del descargue nace con la cantidad que dice la orden. Cuando lo que
-- llegó no coincide, el coordinador lo RECHAZA y digita uno nuevo a mano con la cantidad real
-- — pero sin el número de orden. Resultado: el inventario queda bien y la orden figura
-- "recibió menos" para siempre. Las ocho tienen su movimiento rechazado por la cantidad exacta
-- de la orden, y su ingreso a mano del mismo producto en los días siguientes.
--
-- ESTE SCRIPT NO MUEVE UNA SOLA UNIDAD DE INVENTARIO. Solo le pone a once movimientos el
-- número de orden que les faltaba. El producto ya está en la bodega desde que se digitó.
--
-- LOS ONCE ENLACES
--   107052 (17-sep)  #31773 Surtida 250        1.800   exacto
--                    #31774 Conchas 250        1.000   exacto
--                    #31775 Harina 24LB          870   exacto
--                    #31776 Macarrón C           450   exacto
--   107055 (18-sep)  #31868 Espagueti 250      2.653   la orden decía 2.655 → faltan 2 reales
--   107051 (18-sep)  #31875 Fideo 250          2.283   la orden decía 2.290 → faltan 7 reales
--   107131 (28-sep)  #33315 La Nieve 25LB      1.650   la orden decía 1.660 → faltan 10 reales
--   107148 (28-sep)  #33314 La Nieve 25LB        991   la orden decía 1.000 → faltan 9 reales
--   107138 (28-sep)  #33175 Esp. a la Mesa       500 } los dos suman los 800 de la orden
--                    #33313 Esp. a la Mesa       300 }
--   107200 ( 2-oct)  #34214 Fideo 250          1.600   LLEGARON 1.600, no 1.500 (ver abajo)
--   107215 ( 8-oct)  #35045 Conchas 500GR        100   exacto
--
-- LA ORDEN 107200 SE CORRIGE A 1.600
-- La foto del packing lo prueba y la báscula lo confirma: el tiquete 88133 pesó 34,34 t contra
-- las 33 t que declaraba la orden. Con 100 unidades más de Fideo 250 (0,006 t cada una) el peso
-- sube a 33,6 t, más cerca de la báscula. Por eso la línea pasa de 1.500 a 1.600 unidades y de
-- 9 a 9,6 toneladas, y el peso de la orden de 33 a 33,6.
--   OJO NÓMINA: en un DESCARGUE de CEDI el pago se calcula con `pesovascula` (34,34) cuando
--   existe, no con `pesoorden` — así que este cambio NO toca la nómina de nadie.
--   OJO FACTURACIÓN: el servicio del descargue se cobra por el PESO DE BÁSCULA del tiquete
--   (`basculaTiqueteDescargue`, lib/facturacion-control-actions.ts), que sigue siendo 34,34 t.
--   El valor a facturar NO cambia; lo que cambia es que el soporte dirá las 1.600 unidades que
--   de verdad llegaron. Y llega a tiempo: la orden está en "CF - Factura solicitada", sin
--   número de Siigo, así que no hay ninguna factura emitida que corregir. El script se niega a
--   correr si para cuando se ejecute ya tuviera factura.
--
-- LO QUE NO SE TOCA, Y POR QUÉ
--   · 107054: sus cuatro movimientos están APROBADOS y no hay ninguno rechazado. Su diferencia
--     de 1 unidad (3.000 contra 2.999 de Espagueti 250) es física real, no un error de
--     registro. El ingreso #31868 que parecía candidato es de la orden 107055.
--   · #32134 (79 und de Fideo 250, 21-sep): su observación dice "devolución en buen estado
--     39003-3132". Es una devolución, no el descargue de 107051.
--
-- CÓMO QUEDA CADA ORDEN DESPUÉS
--   Cuadran exacto: 107052, 107138, 107200, 107215.
--   Con la diferencia REAL a la vista: 107055 (−2), 107051 (−7), 107131 (−10), 107148 (−9).
--   Esas cuatro diferencias son merma de transporte y ahora se ven como lo que son, en vez de
--   esconderse detrás de un "recibió menos" por el total.
-- =====================================================================

-- ---------------------------------------------------------------------
-- PASO 1 — ANTES.
-- ---------------------------------------------------------------------
select id, nombreproducto, lote, location, cantidad, status, ocargue, creado, creadopor
from public.invtrans
where id in (31773, 31774, 31775, 31776, 31868, 31875, 33315, 33314, 33175, 33313, 34214, 35045)
order by id;
-- Esperado: los 12 con ocargue NULO y status aprobado. (#35045 incluido por si ya se enlazó
-- desde la pantalla: el script lo respeta.)

select d.id, c.ordendecargue, d.producto, d.cantidad, d.toneladas, c.pesoorden, c.pesovascula
from public.detalleoc d
join public.cabeceraoc c on c.id = d.idorden
where c.idempresa = 3 and c.ordendecargue = '107200'
order by d.id;
-- Esperado: Fideo 250 con 1500 und y 9 t; la orden con pesoorden 33 y pesovascula 34.34.

-- ---------------------------------------------------------------------
-- PASO 2 — CORRECCIÓN. Todo o nada.
-- ---------------------------------------------------------------------
begin;

do $enlazar$
declare
  r           record;
  v_enlazados int := 0;
  v_stock_0   numeric;
  v_stock_1   numeric;
  v_neg       int;
  v_nota      text;
begin
  -- Foto del inventario ANTES: este script no puede mover ni una unidad.
  select coalesce(sum(stock_actual), 0) into v_stock_0 from public.saldoinvdetalle where idempresa = 3;
  select count(*) into v_neg from public.saldoinvdetalle where idempresa = 3 and stock_actual < 0;

  for r in
    select * from (values
      (31773, '107052', 'Surtida 250 Gr. X 24 Und.',        1800::numeric),
      (31774, '107052', 'PT CONCHAS 250*24',                1000),
      (31775, '107052', 'PT HARINA PREC MAIZ 24LB BLANCA',   870),
      (31776, '107052', 'PT MACARRON C.250GR*24PQ',          450),
      (31868, '107055', 'PT ESPAGUETI 250GR*24PQ',          2653),
      (31875, '107051', 'PT FIDEO 250*24PQ',                2283),
      (33315, '107131', 'PT LA NIEVE 25LB',                 1650),
      (33314, '107148', 'PT LA NIEVE 25LB',                  991),
      (33175, '107138', 'PT ESPAGUETI A LA MESA 500*12',     500),
      (33313, '107138', 'PT ESPAGUETI A LA MESA 500*12',     300),
      (34214, '107200', 'PT FIDEO 250*24PQ',                1600),
      (35045, '107215', 'PT CONCHAS 500GR*24PQ',             100)
    ) as e(id, oc, producto, cantidad)
  loop
    -- Ya enlazado (por la pantalla o por una corrida anterior): se deja como está.
    if exists (select 1 from public.invtrans where id = r.id and ocargue = r.oc) then
      continue;
    end if;

    -- ESTADO ESPERADO, fila por fila. Si algo no calza, no se toca NADA.
    if not exists (
      select 1 from public.invtrans
       where id = r.id and idempresa = 3 and nombreproducto = r.producto and cantidad = r.cantidad
         and tipomov = 'Entrada' and cod_movimiento::text = '101'
         and lower(status) like 'aprob%' and ocargue is null
    ) then
      raise exception 'invtrans #% no está como se esperaba (% de %, 101 aprobado y SIN orden): se deshace todo y hay que revisar.', r.id, r.producto, r.cantidad;
    end if;
    if not exists (select 1 from public.cabeceraoc where idempresa = 3 and ordendecargue = r.oc and tipooperacion = 'Descargue') then
      raise exception 'No existe el descargue % en ID3: se deshace todo.', r.oc;
    end if;

    update public.invtrans
       set ocargue = r.oc,
           observaciones = coalesce(observaciones, '') ||
             ' · Enlazado al descargue ' || r.oc || ' por el script 273 (9-oct-2026, autorizado por gerencia): el ingreso automático se rechazó y este se digitó a mano sin el número de orden. No se movió ninguna unidad.'
     where id = r.id;
    v_enlazados := v_enlazados + 1;
  end loop;

  raise notice 'Enlazados % movimientos a su descargue.', v_enlazados;

  -- LA ORDEN 107200: llegaron 1.600, no 1.500 (foto del packing + báscula 34,34 t).
  --
  -- CANDADO DE FACTURACIÓN: si para cuando esto corra la orden ya tuviera factura emitida en
  -- Siigo, cambiarle la cantidad dejaría el soporte diciendo algo distinto a lo facturado. En
  -- ese caso no se toca y se avisa: la corrección tendría que ir por nota de ajuste.
  select facturasiigo into v_nota from public.cabeceraoc where idempresa = 3 and ordendecargue = '107200';
  if coalesce(trim(v_nota), '') <> '' then
    raise exception 'La orden 107200 ya tiene factura en Siigo (%): no se le cambia la cantidad desde aquí. Se deshace todo; eso va por nota de ajuste.', v_nota;
  end if;

  if exists (
    select 1 from public.detalleoc d join public.cabeceraoc c on c.id = d.idorden
     where c.idempresa = 3 and c.ordendecargue = '107200' and d.producto = 'PT FIDEO 250*24PQ' and d.cantidad = 1500
  ) then
    update public.detalleoc d
       set cantidad = 1600, toneladas = 9.6
      from public.cabeceraoc c
     where c.id = d.idorden and c.idempresa = 3 and c.ordendecargue = '107200'
       and d.producto = 'PT FIDEO 250*24PQ' and d.cantidad = 1500;
    update public.cabeceraoc
       set pesoorden = 33.6,
           observaciones = coalesce(observaciones, '') ||
             'Corregida por el script 273 (9-oct-2026): llegaron 1.600 unidades de Fideo 250, no 1.500 (foto del packing y báscula 34,34 t del tiquete 88133). Peso de la orden 33 -> 33,6 t. La nómina del descargue se calcula con la báscula, así que no cambia.'
     where idempresa = 3 and ordendecargue = '107200';
    raise notice '107200: Fideo 250 pasa de 1.500 a 1.600 unidades (9 -> 9,6 t) y el peso de la orden de 33 a 33,6.';
  else
    raise notice '107200: la línea de Fideo 250 ya no está en 1.500; se deja como está.';
  end if;

  -- COHERENCIA FINAL: el inventario NO se movió y no nacieron negativos.
  select coalesce(sum(stock_actual), 0) into v_stock_1 from public.saldoinvdetalle where idempresa = 3;
  if v_stock_1 <> v_stock_0 then
    raise exception 'El inventario de ID3 cambió (% -> %) y este script no debe mover ninguna unidad: se deshace todo.', v_stock_0, v_stock_1;
  end if;
  if (select count(*) from public.saldoinvdetalle where idempresa = 3 and stock_actual < 0) > v_neg then
    raise exception 'Aparecieron lotes en negativo: se deshace todo.';
  end if;

  -- Ningún movimiento puede haber quedado en una orden que no es suya.
  if exists (
    select 1 from public.invtrans i
     where i.id in (31773, 31774, 31775, 31776, 31868, 31875, 33315, 33314, 33175, 33313, 34214, 35045)
       and not exists (select 1 from public.cabeceraoc c where c.ordendecargue = i.ocargue and c.idempresa = 3)
  ) then
    raise exception 'Algún movimiento quedó apuntando a una orden que no existe en ID3: se deshace todo.';
  end if;

  raise notice 'LISTO. Inventario intacto (% unidades). Cuadran exacto 107052, 107138, 107200 y 107215; quedan a la vista las mermas reales de 107055 (-2), 107051 (-7), 107131 (-10) y 107148 (-9).', v_stock_1;
end
$enlazar$;

commit;

-- ---------------------------------------------------------------------
-- PASO 3 — DESPUÉS.
-- ---------------------------------------------------------------------

-- 3a. Los doce movimientos, ya con su orden.
select id, ocargue, nombreproducto, cantidad, status
from public.invtrans
where id in (31773, 31774, 31775, 31776, 31868, 31875, 33315, 33314, 33175, 33313, 34214, 35045)
order by ocargue, id;

-- 3b. La orden 107200 corregida.
select d.producto, d.cantidad, d.toneladas, c.pesoorden, c.pesovascula
from public.detalleoc d join public.cabeceraoc c on c.id = d.idorden
where c.idempresa = 3 and c.ordendecargue = '107200'
order by d.id;
-- Esperado: Fideo 250 con 1600 und y 9,6 t; pesoorden 33,6; pesovascula 34,34 (sin cambio).

-- 3c. Cada orden contra lo que recibió. Esperado: cuatro en 0 y cuatro con su merma real.
select c.ordendecargue,
       d.producto,
       d.cantidad as dice_la_orden,
       coalesce((select sum(i.cantidad) from public.invtrans i
                  where i.ocargue = c.ordendecargue and i.tipomov = 'Entrada'
                    and i.cod_movimiento::text = '101' and lower(i.status) like 'aprob%'
                    and i.nombreproducto = d.producto), 0) as entro,
       coalesce((select sum(i.cantidad) from public.invtrans i
                  where i.ocargue = c.ordendecargue and i.tipomov = 'Entrada'
                    and i.cod_movimiento::text = '101' and lower(i.status) like 'aprob%'
                    and i.nombreproducto = d.producto), 0) - d.cantidad as diferencia
from public.cabeceraoc c
join public.detalleoc d on d.idorden = c.id
where c.idempresa = 3
  and c.ordendecargue in ('107052', '107055', '107051', '107131', '107148', '107138', '107200', '107215')
order by c.ordendecargue, d.producto;

-- 3d. Ingresos a mano que SIGUEN sin orden en ID3 (deberían quedar solo los que no son de un
--     descargue: devoluciones en buen estado y cosas así).
select id, nombreproducto, lote, cantidad, creado, creadopor, observaciones
from public.invtrans
where idempresa = 3 and tipomov = 'Entrada' and cod_movimiento::text = '101'
  and ocargue is null and lower(status) like 'aprob%' and creado >= '2026-09-01'
order by id;

-- 3e. El inventario no se movió: cero lotes negativos.
select count(*) as lotes_negativos_id3 from public.saldoinvdetalle where idempresa = 3 and stock_actual < 0;

-- 3f. El soporte de facturación de 107200. El servicio se cobra por el peso de BÁSCULA, que no
--     cambió: lo que se corrigió es la cantidad que muestra el soporte.
select ordendecargue, fechacargue, tipooperacion,
       pesoorden      as peso_declarado_en_la_orden,
       pesovascula    as peso_de_bascula_que_se_factura,
       tiquetebascula, estadofactura, facturasiigo, mediopago
from public.cabeceraoc
where idempresa = 3 and ordendecargue = '107200';
-- Esperado: pesoorden 33,6 · pesovascula 34,34 (sin cambio) · sin número de factura.
