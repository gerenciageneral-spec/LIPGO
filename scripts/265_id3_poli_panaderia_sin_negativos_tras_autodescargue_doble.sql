
-- =====================================================================
-- 265_id3_poli_panaderia_sin_negativos_tras_autodescargue_doble.sql
--
-- ID3 (Cedi Funza). Deja sin negativos los lotes de PT LA INSUPERABLE POLI
-- PANADERIA 50 KG BOGOTA que quedaron en rojo al borrar el ingreso doble del
-- descargue MOL202609299667.
--
-- Autorizado por gerencia el 2026-10-08 ("corrige esas salidas y deja el
-- inventario sin negativos... ya tienen claro el pedido").
-- Correcciones POR LLAVE PRIMARIA, estado esperado verificado antes, antes/después
-- impreso y comprobación de coherencia al final. Idempotente. NO inserta filas.
-- =====================================================================
--
-- QUÉ PASÓ
--
-- El 2-oct el ingreso automático del descargue MOL202609299667 entró DOS veces
-- (defecto del código, corregido en main edad554 el 8-oct): los lotes 20260922 (39),
-- 20260928 (40) y 20260929 (305) de POLI PANADERIA quedaron en B43 con el doble.
-- Sobre ese saldo inflado se trabajó el 8-oct (horas de Bogotá):
--   08:28  la orden MOL202610089979 sacó 60 del lote 20260922 (39 de B42 + 21 de B43)
--          cuando de ese lote solo existían 39.
--   09:55  311 (traslado B43 → B42) de 610 del 20260929: solo existían 305.
--   09:56  311 de 80 del 20260928: solo existían 40.
--   09:57  311 de 18 del 20260922: sí existían (había 39 en B43).
--   13:38  gerencia borró las 4 filas repetidas (#33931–#33934).
-- Saldo hoy: 20260922 B42 −21 · 20260928 B43 −40 (B42 +80) · 20260929 B43 −305 (B42 +643).
--
-- El TOTAL del producto en ID3 (357) es correcto. Lo que está mal es el reparto por
-- lote y ubicación, y 21 unidades salieron "del 20260922" sin existir en ese lote:
-- físicamente salieron de otro lote.
--
-- LA CORRECCIÓN (6 filas de invtrans y 2 de historicolotes, todas por id)
--   1. Los dos 311 imposibles se recortan a lo que de verdad había en B43:
--        #35017/#35018 (lote 20260929) 610 → 305
--        #35019/#35020 (lote 20260928)  80 → 40
--   2. El 311 del 20260922 (#35021/#35022) pasa de 18 a 39: las 39 que había en B43 se
--      mueven completas a B42, que es de donde la orden sacó 39 (#35002 queda igual).
--   3. Las 21 que la orden descontó de B43 "del 20260922" (#35003) pasan al lote
--      v_lote_alterno en B42, y lo mismo las dos filas de la asignación de lote de
--      esa orden (historicolotes #25900 = 6 y #25903 = 15). v_lote_alterno = 20260928,
--      el siguiente lote más antiguo con saldo (FIFO).
--      >>> Si el CEDI sabe que esas 21 salieron del 20260929, cambiar v_lote_alterno
--          abajo ANTES de correr. El script comprueba que el lote elegido tenga saldo. <<<
--
-- RESULTADO ESPERADO (POLI PANADERIA, ID3)
--   20260922  B42 0   · B43 0   (lote agotado)
--   20260928  B42 19  · B43 0
--   20260929  B42 338 · B43 0
--   total 357, el mismo de antes. Cero negativos en ID3.
--
-- QUÉ NO SE TOCA
-- El total de la orden MOL202610089979 (4 líneas, 139 und: ni una unidad más ni menos),
-- el pedido, el descargue MOL202609299667 (6 filas, 484), la Repostería de la misma
-- orden, ningún otro producto, lote ni proyecto.
-- =====================================================================

-- ---------------------------------------------------------------------
-- PASO 1 — ANTES. Guardar estas tres salidas.
-- ---------------------------------------------------------------------

-- 1a. Las 7 filas de invtrans que se van a tocar o que sirven de referencia.
select id, nombreproducto, lote, location, cantidad, tipomov, cod_movimiento, status,
       origen, ocargue, creado, creadopor, observaciones
from public.invtrans
where id in (35002, 35003, 35017, 35018, 35019, 35020, 35021, 35022)
order by id;

-- 1b. La asignación de lote de la orden (historicolotes.cantidad es TEXTO).
select id, producto, lote, location, cantidad, cliente, ordendecargue
from public.historicolotes
where ordendecargue = 'MOL202610089979'
order by id;

-- 1c. Saldo de hoy del producto en ID3 (debe mostrar los 3 negativos).
select lote, location, stock_actual
from public.saldoinvdetalle
where idempresa = 3
  and nombreproducto = 'PT LA INSUPERABLE POLI PANADERIA 50 KG BOGOTA'
  and lote in ('20260922', '20260928', '20260929')
order by lote, location;

-- ---------------------------------------------------------------------
-- PASO 2 — CORRECCIÓN. Todo o nada, con candados antes y después.
-- ---------------------------------------------------------------------
begin;

do $corregir$
declare
  c_producto     constant text := 'PT LA INSUPERABLE POLI PANADERIA 50 KG BOGOTA';
  c_orden        constant text := 'MOL202610089979';
  c_nota         constant text := ' · Corregido por 265 (8-oct-2026): saldo inflado por el ingreso doble del descargue MOL202609299667';
  v_lote_alterno constant text := '20260928';   -- <<< cambiar a '20260929' solo si el CEDI lo sabe
  r              record;
  v_total_antes  numeric;
  v_total_desp   numeric;
  v_orden_antes  numeric;
  v_orden_desp   numeric;
  v_neg          int;
  v_saldo        numeric;
begin
  -- ¿Ya se corrió? (idempotencia)
  if exists (select 1 from public.invtrans where id = 35003 and lote = v_lote_alterno)
     and exists (select 1 from public.invtrans where id = 35017 and cantidad = 305) then
    raise notice 'El 265 ya se corrió: nada que hacer.';
    return;
  end if;

  -- Fotos que deben conservarse.
  select coalesce(sum(case when tipomov = 'Entrada' then cantidad else -cantidad end), 0)
    into v_total_antes
    from public.invtrans
   where idempresa = 3 and nombreproducto = c_producto and lower(status) = 'aprobado'
     and tipomov in ('Entrada', 'Salida');
  select coalesce(sum(cantidad), 0) into v_orden_antes
    from public.invtrans where ocargue = c_orden and tipomov = 'Salida';

  -- ESTADO ESPERADO, fila por fila. Si algo no calza, no se toca nada.
  for r in
    select * from (values
      (35002, '20260922', 'B42', 39::numeric, 'Salida',  '601', c_orden),
      (35003, '20260922', 'B43', 21,          'Salida',  '601', c_orden),
      (35017, '20260929', 'B43', 610,         'Salida',  '311', null),
      (35018, '20260929', 'B42', 610,         'Entrada', '311', null),
      (35019, '20260928', 'B43', 80,          'Salida',  '311', null),
      (35020, '20260928', 'B42', 80,          'Entrada', '311', null),
      (35021, '20260922', 'B43', 18,          'Salida',  '311', null),
      (35022, '20260922', 'B42', 18,          'Entrada', '311', null)
    ) as e(id, lote, loc, cant, tipo, cod, oc)
  loop
    if not exists (
      select 1 from public.invtrans i
       where i.id = r.id and i.idempresa = 3 and i.nombreproducto = c_producto
         and i.lote = r.lote and i.location = r.loc and i.cantidad = r.cant
         and i.tipomov = r.tipo and i.cod_movimiento::text = r.cod
         and lower(i.status) = 'aprobado'
         and (r.oc is null or i.ocargue = r.oc)
    ) then
      raise exception 'invtrans #% no está como se esperaba (lote %, % %, % und, %): se deshace todo y hay que revisar.',
        r.id, r.lote, r.loc, r.tipo, r.cant, r.cod;
    end if;
  end loop;

  if not exists (select 1 from public.historicolotes where id = 25900 and ordendecargue = c_orden
                   and producto = c_producto and lote = '20260922' and location = 'B43' and cantidad = '6')
     or not exists (select 1 from public.historicolotes where id = 25903 and ordendecargue = c_orden
                   and producto = c_producto and lote = '20260922' and location = 'B43' and cantidad = '15') then
    raise exception 'historicolotes #25900/#25903 no están como se esperaba: se deshace todo.';
  end if;

  -- El descargue de origen debe estar ya limpio (6 filas, 484 und); si no, este
  -- diagnóstico no se sostiene.
  if (select count(*) from public.invtrans where ocargue = 'MOL202609299667') <> 6
     or (select sum(cantidad) from public.invtrans where ocargue = 'MOL202609299667') <> 484 then
    raise exception 'MOL202609299667 no tiene las 6 filas / 484 und esperadas: se deshace todo.';
  end if;

  -- 2a. Los dos 311 imposibles, a lo que había.
  update public.invtrans set cantidad = 305, observaciones = coalesce(observaciones, '') || c_nota || ' (era 610)'
   where id in (35017, 35018);
  update public.invtrans set cantidad = 40,  observaciones = coalesce(observaciones, '') || c_nota || ' (era 80)'
   where id in (35019, 35020);
  raise notice '311 del 20260929: 610 -> 305. 311 del 20260928: 80 -> 40.';

  -- 2b. El 311 del 20260922 mueve las 39 completas a B42.
  update public.invtrans set cantidad = 39,  observaciones = coalesce(observaciones, '') || c_nota || ' (era 18)'
   where id in (35021, 35022);
  raise notice '311 del 20260922: 18 -> 39.';

  -- 2c. Las 21 que no existían en el 20260922 salen del lote alterno, en B42.
  update public.invtrans
     set lote = v_lote_alterno, location = 'B42',
         observaciones = coalesce(observaciones, '') || c_nota || ' (era lote 20260922 B43)'
   where id = 35003;
  update public.historicolotes
     set lote = v_lote_alterno, location = 'B42'
   where id in (25900, 25903);
  raise notice 'Salida #35003 (21 und) y asignación #25900/#25903: lote 20260922 B43 -> % B42.', v_lote_alterno;

  -- COHERENCIA FINAL.
  select coalesce(sum(case when tipomov = 'Entrada' then cantidad else -cantidad end), 0)
    into v_total_desp
    from public.invtrans
   where idempresa = 3 and nombreproducto = c_producto and lower(status) = 'aprobado'
     and tipomov in ('Entrada', 'Salida');
  if v_total_desp <> v_total_antes then
    raise exception 'El total del producto cambió (% -> %): se deshace todo.', v_total_antes, v_total_desp;
  end if;

  select coalesce(sum(cantidad), 0) into v_orden_desp
    from public.invtrans where ocargue = c_orden and tipomov = 'Salida';
  if v_orden_desp <> v_orden_antes or v_orden_desp <> 139 then
    raise exception 'La orden % cambió de total (% -> %): se deshace todo.', c_orden, v_orden_antes, v_orden_desp;
  end if;

  if (select sum(cantidad::numeric) from public.historicolotes where ordendecargue = c_orden) <> 139 then
    raise exception 'La asignación de lote de % ya no suma 139: se deshace todo.', c_orden;
  end if;

  -- El lote alterno tiene que quedar con saldo (si no, la elección del lote está mal).
  select coalesce(sum(stock_actual), 0) into v_saldo
    from public.saldoinvdetalle
   where idempresa = 3 and nombreproducto = c_producto and lote = v_lote_alterno;
  if v_saldo < 0 then
    raise exception 'El lote alterno % quedaría en % : no tenía saldo para las 21. Se deshace todo; elegir otro lote.', v_lote_alterno, v_saldo;
  end if;

  select count(*) into v_neg from public.saldoinvdetalle where idempresa = 3 and stock_actual < 0;
  if v_neg > 0 then
    raise exception 'ID3 sigue con % lote(s) en negativo: se deshace todo.', v_neg;
  end if;

  raise notice 'LISTO. ID3 sin negativos; total de POLI PANADERIA intacto (%).', v_total_desp;
end
$corregir$;

commit;

-- ---------------------------------------------------------------------
-- PASO 3 — DESPUÉS. Comprobaciones.
-- ---------------------------------------------------------------------

-- 3a. Las 8 filas, ya corregidas (35002 sin cambio).
select id, lote, location, cantidad, tipomov, cod_movimiento, ocargue, observaciones
from public.invtrans
where id in (35002, 35003, 35017, 35018, 35019, 35020, 35021, 35022)
order by id;

-- 3b. Saldo del producto: esperado 20260922 B42 0 / B43 0 · 20260928 B42 19 / B43 0 ·
--     20260929 B42 338 / B43 0.
select lote, location, stock_actual
from public.saldoinvdetalle
where idempresa = 3
  and nombreproducto = 'PT LA INSUPERABLE POLI PANADERIA 50 KG BOGOTA'
  and lote in ('20260922', '20260928', '20260929')
order by lote, location;

-- 3c. Negativos de ID3: esperado 0 filas.
select nombreproducto, lote, location, stock_actual
from public.saldoinvdetalle
where idempresa = 3 and stock_actual < 0
order by stock_actual;

-- 3d. La orden sigue cuadrada con su detalle (139 autorizadas, 139 despachadas).
select ocargue, producto, autorizado, despachado, estado_alerta
from public.v_orden_vs_salidas
where ocargue = 'MOL202610089979'
order by producto;
