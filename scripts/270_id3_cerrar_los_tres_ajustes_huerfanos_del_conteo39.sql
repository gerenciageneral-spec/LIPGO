
-- =====================================================================
-- 270_id3_cerrar_los_tres_ajustes_huerfanos_del_conteo39.sql
--
-- ID3 (Cedi Funza). Deja el Kardex de octubre en CERO "sin soporte": cierra los tres ajustes
-- del Conteo total #39 que decían haber movido stock y cuyo movimiento ya no existe.
--
-- Autorizado por gerencia el 2026-10-08: "es claro con lo que inició el mes, los ingresos y
-- las salidas, esto es lo que debe primar; por eso estamos haciendo inventario inicial cada
-- mes y todo se muestra en Kardex" + "adelante, empieza y dejemos todo organizado de raíz".
--
-- Correcciones POR LLAVE PRIMARIA, estado esperado verificado antes, antes/después impreso y
-- comprobación de coherencia al final. Idempotente.
-- =====================================================================
--
-- QUÉ PASÓ
--
-- Un conteo vive en DOS sitios: la línea (fija el inicial del mes) y su ajuste + movimiento en
-- invtrans (mueve el stock). El 7 de octubre se borraron en invtrans los movimientos que
-- dejaban lotes en negativo —decisión correcta— pero los ajustes quedaron "aprobados": el
-- conteo da por descontado algo que el inventario nunca descontó. Resultado: 316 unidades
-- "sin soporte" en el Kardex de octubre de ID3, repartidas en tres productos.
--
-- CADA CASO SE CIERRA HACIA DONDE APUNTA EL FÍSICO. No hay una regla única:
--
-- A) POLI PANADERIA · aj#171 · lote 20260827 · −285 → EL CONTEO ESTABA MAL.
--    El conteo dijo 49 en ese lote cuando el sistema tenía 334. Reponer el faltante dejaría el
--    producto en 72 contra 348 unidades físicas de la hoja del 8-oct: imposible. Y el stock de
--    hoy (357) está a 9 del físico, así que el sistema tenía razón. Se corrige la LÍNEA del
--    conteo (49 → 334), la base pasa de 982 a 1.267 y el ajuste se anula. El stock NO se toca.
--      Comprobación: 1.267 + (−910 de octubre) = 357 = stock de hoy. Sin soporte 0.
--
-- B) HARINA 24LB · aj#190 · lote 20260824 · −40 → MANDA LA BASE QUE FIJÓ GERENCIA.
--    El inicial quedó en 4.836 (script 269, por instrucción expresa). El sistema tenía 4.866 al
--    amanecer del 1-oct, así que faltan por descontar 30, no 40: el 269 ya devolvió 10 al anular
--    el faltante del lote 20260910. Se repone el movimiento por 30 en el lote 20260824 (donde el
--    conteo dijo que no había nada; ese día el sistema le daba 40) y el ajuste se corrige a −30.
--      Comprobación: 4.836 + 3.642 = 8.478 = stock nuevo. Sin soporte 0.
--      Y contra la hoja física del 8-oct (8.481) la diferencia baja de −27 a −3: la mejor
--      prueba de que 4.836 era el número correcto.
--
-- C) FIDEO A LA MESA 1000*12 · aj#176 · lote 20260828 · +125 → SOLO LIMPIAR EL REGISTRO.
--    El producto ya cuadra sin ese ajuste: base 318 + (−83) = 235 contra 236 de stock. El −1 es
--    diferencia física, no de registro. Se anula el ajuste (su movimiento no existe) y no se
--    toca ni el conteo ni el stock.
--
-- EFECTO TOTAL: ID3 pasa de −316 "sin soporte" en octubre a −1 (el de Fideo a la Mesa, físico).
-- Stock: HARINA 8.508 → 8.478. POLI y FIDEO sin cambio. Cero lotes negativos.
-- =====================================================================

-- ---------------------------------------------------------------------
-- PASO 1 — ANTES.
-- ---------------------------------------------------------------------
select id, cuadre_id, codproducto, producto, lote, location, cantidad, tipo, estado, activo, invtrans_id
from public.sig_inventario_ajuste where id in (171, 176, 190) order by id;

select id, codproducto, lote, location, sistema, conteo, diferencia
from public.sig_inventario_cuadre_detalle
where cuadre_id = 39 and ((codproducto = 'PT000054' and lote = '20260827') or (codproducto = 'PT000043' and lote = '20260824') or (codproducto = 'PT000182' and lote = '20260828'))
order by codproducto;

select codproducto, sum(coalesce(conteo, sistema)) as inicial_octubre
from public.sig_inventario_cuadre_detalle
where cuadre_id = 39 and codproducto in ('PT000054', 'PT000043', 'PT000182')
group by codproducto order by 1;
-- Esperado: PT000043 = 4836 · PT000054 = 982 · PT000182 = 318.

select codproducto, sum(stock_actual) as stock_hoy
from public.saldoinvdetalle
where idempresa = 3 and codproducto in ('PT000054', 'PT000043', 'PT000182')
group by codproducto order by 1;
-- Esperado: PT000043 = 8508 · PT000054 = 357 · PT000182 = 236.

-- ---------------------------------------------------------------------
-- PASO 2 — CORRECCIÓN. Todo o nada.
-- ---------------------------------------------------------------------
begin;

do $corregir$
declare
  c_creado_aj constant timestamptz := timestamptz '2026-09-30 15:00:00+00'; -- la víspera, como los 29 del #39
  v_inv       bigint;
  v_base      numeric;
  v_stock     numeric;
  v_sistema   numeric;
  v_conteo    numeric;
  v_condif    int;
  v_neg       int;
begin
  -- ¿Ya se corrió?
  if not exists (select 1 from public.sig_inventario_ajuste where id = 171 and activo) then
    raise notice 'El 270 ya se corrió: nada que hacer.';
    return;
  end if;

  -- ================= ESTADO ESPERADO =================
  if not exists (select 1 from public.sig_inventario_ajuste where id = 171 and cuadre_id = 39 and proyecto_id = 3
                   and codproducto = 'PT000054' and lote = '20260827' and cantidad = -285 and activo and estado = 'aprobado' and invtrans_id = 34032)
     or not exists (select 1 from public.sig_inventario_ajuste where id = 176 and cuadre_id = 39 and proyecto_id = 3
                   and codproducto = 'PT000182' and lote = '20260828' and cantidad = 125 and activo and estado = 'aprobado' and invtrans_id = 34037)
     or not exists (select 1 from public.sig_inventario_ajuste where id = 190 and cuadre_id = 39 and proyecto_id = 3
                   and codproducto = 'PT000043' and lote = '20260824' and cantidad = -40 and activo and estado = 'aprobado' and invtrans_id = 34048) then
    raise exception 'Los ajustes 171/176/190 no están como se esperaba: se deshace todo y hay que revisar.';
  end if;
  if exists (select 1 from public.invtrans where id in (34032, 34037, 34048)) then
    raise exception 'Alguno de los movimientos 34032/34037/34048 volvió a existir: este script supone que están borrados. Se deshace todo.';
  end if;
  if not exists (select 1 from public.sig_inventario_cuadre_detalle
                  where cuadre_id = 39 and codproducto = 'PT000054' and lote = '20260827' and location = 'B42' and sistema = 334 and conteo = 49) then
    raise exception 'La línea de POLI (lote 20260827, sistema 334, contado 49) no está como se esperaba: se deshace todo.';
  end if;
  if (select coalesce(sum(coalesce(conteo, sistema)), 0) from public.sig_inventario_cuadre_detalle where cuadre_id = 39 and codproducto = 'PT000043') <> 4836 then
    raise exception 'El inicial de PT000043 no es 4836 (¿se corrió el 269?): se deshace todo.';
  end if;
  if (select coalesce(sum(stock_actual), 0) from public.saldoinvdetalle where idempresa = 3 and codproducto = 'PT000043') <> 8508
     or (select coalesce(sum(stock_actual), 0) from public.saldoinvdetalle where idempresa = 3 and codproducto = 'PT000054') <> 357 then
    raise exception 'El stock de PT000043 (8508) o PT000054 (357) cambió: hubo movimientos nuevos. Se deshace todo y hay que recalcular.';
  end if;
  if (select coalesce(sum(stock_actual), 0) from public.saldoinvdetalle where idempresa = 3 and codproducto = 'PT000043' and lote = '20260824') < 30 then
    raise exception 'El lote 20260824 de Harina no tiene 30 unidades para descontar: se deshace todo.';
  end if;

  -- ================= A) POLI PANADERIA: el conteo estaba mal =================
  update public.sig_inventario_cuadre_detalle
     set conteo = 334,
         diferencia = 0,
         observacion = coalesce(nullif(observacion, ''), '') || case when coalesce(observacion, '') = '' then '' else ' · ' end ||
           'Corregido por 270 (8-oct-2026): el conteo había digitado 49 y el sistema tenía 334. El faltante de 285 se borró de invtrans el 7-oct porque dejaba el lote en negativo, y el físico de la hoja del 8-oct (348 del producto) confirma que el sistema tenía razón. El inicial de octubre de PT000054 pasa de 982 a 1.267.'
   where cuadre_id = 39 and codproducto = 'PT000054' and lote = '20260827' and location = 'B42';
  update public.sig_inventario_ajuste
     set activo = false,
         motivo = coalesce(motivo, '') || ' · ANULADA por 270 (8-oct-2026): su movimiento #34032 se borró el 7-oct y el conteo de ese lote estaba mal; se corrigió la línea del conteo (49 → 334).'
   where id = 171;
  raise notice 'A) POLI PANADERIA: conteo del lote 20260827 49 -> 334 (inicial 982 -> 1.267); aj#171 anulada. Stock sin cambio.';

  -- ================= B) HARINA 24LB: manda la base de 4.836 =================
  -- El movimiento que faltaba, por 30 (no 40: el 269 ya devolvió 10 por el otro lote).
  select coalesce(max(id), 0) + 1 into v_inv from public.invtrans;
  insert into public.invtrans
    (id, idempresa, idproducto, codproducto, nombreproducto, lote, location, cantidad,
     tipomov, cod_movimiento, status, origen, creado, creadopor, observaciones)
  values
    (v_inv, 3, 43, 'PT000043', 'PT HARINA PREC MAIZ 24LB BLANCA', '20260824', 'A14', 30,
     'Salida', '702', 'aprobado', 'transaccion manual', c_creado_aj, 'Gerencia General',
     'Corrección de inventario · cuadre #39 · faltante · Ajuste por conteo físico (cuadre) [aj#190] · repuesto por 270 (8-oct-2026) por 30 y no 40: el 269 ya devolvió 10 al anular el faltante del lote 20260910.');
  update public.sig_inventario_ajuste
     set cantidad = -30,
         invtrans_id = v_inv,
         motivo = coalesce(motivo, '') || ' · REPUESTA por 270 (8-oct-2026) con 30 unidades (su movimiento #34048 se había borrado el 7-oct): el inicial que fijó gerencia es 4.836 y el sistema tenía 4.866 al amanecer del 1-oct.'
   where id = 190;
  raise notice 'B) HARINA 24LB: movimiento #% creado (702 de 30, lote 20260824, fechado el 30-sep); aj#190 corregida a -30.', v_inv;

  -- ================= C) FIDEO A LA MESA: solo limpiar el registro =================
  update public.sig_inventario_ajuste
     set activo = false,
         motivo = coalesce(motivo, '') || ' · ANULADA por 270 (8-oct-2026): su movimiento #34037 ya no existe y el producto cuadra sin ella (base 318 + movimientos −83 = 235 contra 236 de stock; el −1 es diferencia física).'
   where id = 176;
  raise notice 'C) FIDEO A LA MESA: aj#176 anulada. Conteo y stock sin cambio.';

  -- ================= Cabecera del #39, recalculada desde su detalle =================
  select coalesce(sum(sistema), 0), coalesce(sum(coalesce(conteo, sistema)), 0),
         count(*) filter (where coalesce(conteo, sistema) <> sistema)
    into v_sistema, v_conteo, v_condif
    from public.sig_inventario_cuadre_detalle where cuadre_id = 39;
  update public.sig_inventario_cuadre
     set total_sistema = round(v_sistema::numeric, 2),
         total_conteo = round(v_conteo::numeric, 2),
         total_diferencia = round((v_conteo - v_sistema)::numeric, 2),
         items_con_diferencia = v_condif,
         updated_at = now()
   where id = 39;
  raise notice 'Cabecera del #39: sistema % · conteo % · diferencia % · % líneas con diferencia.', v_sistema, v_conteo, v_conteo - v_sistema, v_condif;

  -- ================= COHERENCIA FINAL: el Kardex tiene que cerrar =================
  -- POLI: base 1.267 + (−910) = 357.
  select coalesce(sum(coalesce(conteo, sistema)), 0) into v_base from public.sig_inventario_cuadre_detalle where cuadre_id = 39 and codproducto = 'PT000054';
  select coalesce(sum(stock_actual), 0) into v_stock from public.saldoinvdetalle where idempresa = 3 and codproducto = 'PT000054';
  if v_base <> 1267 or v_stock <> 357 then
    raise exception 'POLI quedó con base % y stock % (esperado 1267 y 357): se deshace todo.', v_base, v_stock;
  end if;

  -- HARINA: base 4.836 + 3.642 = 8.478.
  select coalesce(sum(stock_actual), 0) into v_stock from public.saldoinvdetalle where idempresa = 3 and codproducto = 'PT000043';
  if v_stock <> 8478 then
    raise exception 'HARINA quedó con stock % y debía quedar en 8478: se deshace todo.', v_stock;
  end if;

  -- Ningún ajuste de conteo puede quedar huérfano en ID3.
  if exists (
    select 1 from public.sig_inventario_ajuste a
     where a.proyecto_id = 3 and a.activo and a.estado = 'aprobado' and a.cuadre_id is not null
       and (a.invtrans_id is null or not exists (select 1 from public.invtrans i where i.id = a.invtrans_id))
  ) then
    raise exception 'Todavía queda algún ajuste de conteo sin su movimiento en ID3: se deshace todo.';
  end if;

  if (select count(*) from public.sig_inventario_cuadre_detalle where cuadre_id = 39) <> 95 then
    raise exception 'El conteo #39 ya no tiene sus 95 líneas: se deshace todo.';
  end if;

  select count(*) into v_neg from public.saldoinvdetalle where idempresa = 3 and stock_actual < 0;
  if v_neg > 0 then
    raise exception 'ID3 quedó con % lote(s) en negativo: se deshace todo.', v_neg;
  end if;

  raise notice 'LISTO. Kardex de octubre de ID3: POLI y HARINA en cero sin soporte; FIDEO A LA MESA queda en −1 (diferencia física). Cero ajustes huérfanos, cero lotes negativos.';
end
$corregir$;

commit;

-- ---------------------------------------------------------------------
-- PASO 3 — DESPUÉS.
-- ---------------------------------------------------------------------

-- 3a. Los tres ajustes.
select id, codproducto, lote, cantidad, tipo, estado, activo, invtrans_id
from public.sig_inventario_ajuste where id in (171, 176, 190) order by id;
-- Esperado: 171 activo=false · 176 activo=false · 190 activo=true con cantidad −30 y su invtrans nuevo.

-- 3b. El inicial de octubre de los tres productos.
select codproducto, sum(coalesce(conteo, sistema)) as inicial_octubre
from public.sig_inventario_cuadre_detalle
where cuadre_id = 39 and codproducto in ('PT000054', 'PT000043', 'PT000182')
group by codproducto order by 1;
-- Esperado: PT000043 = 4836 · PT000054 = 1267 · PT000182 = 318.

-- 3c. El stock.
select codproducto, sum(stock_actual) as stock
from public.saldoinvdetalle
where idempresa = 3 and codproducto in ('PT000054', 'PT000043', 'PT000182')
group by codproducto order by 1;
-- Esperado: PT000043 = 8478 · PT000054 = 357 · PT000182 = 236.

-- 3d. Ningún ajuste de conteo huérfano en todo ID3, y cero negativos.
select a.id, a.cuadre_id, a.producto, a.cantidad, a.invtrans_id
from public.sig_inventario_ajuste a
where a.proyecto_id = 3 and a.activo and a.estado = 'aprobado' and a.cuadre_id is not null
  and (a.invtrans_id is null or not exists (select 1 from public.invtrans i where i.id = a.invtrans_id));
-- Esperado: 0 filas.

select count(*) as lotes_negativos_id3 from public.saldoinvdetalle where idempresa = 3 and stock_actual < 0;
-- Esperado: 0.
