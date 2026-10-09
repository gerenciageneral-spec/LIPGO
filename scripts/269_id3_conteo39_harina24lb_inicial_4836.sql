
-- =====================================================================
-- 269_id3_conteo39_harina24lb_inicial_4836.sql
--
-- ID3 (Cedi Funza). Corrige el Conteo total #39 (1-oct-2026, la BASE DE OCTUBRE) en
-- PT HARINA PREC MAIZ 24LB BLANCA (PT000043): el inicial quedó en 4.826 y el físico real
-- era 4.836.
--
-- Autorizado por gerencia el 2026-10-08: "por error en el inventario inicial de PT000043 le
-- pusimos que era 4.826 cuando en realidad era 4.836; corregir el conteo 39 del CEDI y ajustar
-- el inventario inicial del conteo 39 del mes de octubre con la cantidad 4.836, ID 3".
--
-- ES UNA EXCEPCIÓN EXPRESA a la regla "los Conteos totales aprobados no se modifican"
-- (gerencia, 2026-10-02). Queda registrada en la observación de la línea.
--
-- Correcciones POR LLAVE PRIMARIA, estado esperado verificado antes, antes/después impreso y
-- comprobación de coherencia al final. Idempotente.
-- =====================================================================
--
-- DÓNDE ESTÁ EL ERROR (medido antes de escribir esto)
--
-- El detalle del #39 para este producto tiene 9 líneas y suma 4.826. Una sola tiene una
-- diferencia pequeña contra el sistema, y es exactamente de 10:
--
--   línea #3689  lote 20260910 A14   sistema 850 · contado 840 · dif −10
--
-- Las otras ocho cuadran o fueron restauradas a mano por gerencia el 2-oct (lotes 20251210
-- +52 y 20260824 −40, con su observación). Corregir esa línea a 850 da 4.836 EXACTO, que es
-- la cifra que pide gerencia. Es un error de digitación: el coordinador escribió 840.
--
-- >>> Si el CEDI sabe que esas 10 unidades iban en OTRO lote, cambiar `c_linea` y `c_ajuste`
--     abajo antes de correr. El script comprueba que el total quede en 4.836 de todas formas. <<<
--
-- QUÉ MÁS HAY QUE TOCAR, O EL KARDEX QUEDA DESCUADRADO
--
-- Esa diferencia de −10 generó un ajuste de faltante que YA descontó stock:
--   corrección aj#181 (sig_inventario_ajuste) → invtrans #34021, 702 Salida de 10 und,
--   lote 20260910 A14, fechada el 30-sep (la víspera, como todos los ajustes del conteo).
-- Si el conteo dice 850 pero el faltante sigue descontado, la base del mes sube 10 y el stock
-- no: el Kardex de octubre mostraría 10 "sin soporte". Por eso el ajuste se anula.
--
-- NO se crea un reverso con fecha de hoy (que es lo que hace el botón "Reversar" de la app):
-- eso metería +10 en los movimientos de OCTUBRE y volvería a descuadrar la ecuación
-- base + movimientos = stock. Se anula el movimiento original, que está fechado en septiembre.
--
-- DE PASO, LA CABECERA DEL #39 YA VENÍA DESCUADRADA DE SU PROPIO DETALLE
-- Cabecera: total_conteo 57.709 · diferencia −282 · 27 líneas con diferencia.
-- Detalle real: 57.609 · −382 · 29 líneas. Se desfasó el 2-oct, cuando gerencia restauró dos
-- líneas y no se recalculó la cabecera. Como este script ya toca el detalle, la cabecera se
-- recalcula DESDE EL DETALLE (no se le suma 10 a un número que ya estaba mal). La base del mes
-- la lee la app del DETALLE, así que esto es cosmético pero deja el acta coherente.
--
-- RESULTADO ESPERADO
--   Conteo #39, PT000043: 4.826 → 4.836 (lote 20260910: 840 → 850, sin diferencia).
--   Conteo #39 completo: total_conteo 57.619 · diferencia −372 · 28 líneas con diferencia.
--   Stock vivo del producto: 8.498 → 8.508 (lote 20260910 A14: 468 → 478).
--   ID3 sigue sin lotes negativos. Ningún otro producto, conteo, orden ni proyecto cambia.
--
-- OJO, EFECTO EN LA HOJA FÍSICA DEL 8-OCT (informativo, gerencia decide):
-- su hoja da 8.480 + 1 avería = 8.481 para este producto. Hoy LIPgo dice 8.498 (−17); después
-- de esto dirá 8.508 (−27). La corrección es del INICIAL de octubre, así que si el inicial
-- real era 4.836, el faltante de hoy es de 27 y apareció durante octubre, no el día 1.
-- =====================================================================

-- ---------------------------------------------------------------------
-- PASO 1 — ANTES.
-- ---------------------------------------------------------------------
select id, lote, location, sistema, conteo, diferencia, observacion
from public.sig_inventario_cuadre_detalle
where cuadre_id = 39 and codproducto = 'PT000043'
order by lote;

select sum(coalesce(conteo, sistema)) as suma_contado_producto
from public.sig_inventario_cuadre_detalle
where cuadre_id = 39 and codproducto = 'PT000043';
-- Esperado: 4826.

select id, fecha, lote, location, cantidad, tipo, estado, activo, invtrans_id
from public.sig_inventario_ajuste where id = 181;

select id, lote, location, cantidad, tipomov, cod_movimiento, status, creado, observaciones
from public.invtrans where id = 34021;

select lote, location, stock_actual
from public.saldoinvdetalle
where idempresa = 3 and nombreproducto = 'PT HARINA PREC MAIZ 24LB BLANCA' and stock_actual <> 0
order by lote;

-- ---------------------------------------------------------------------
-- PASO 2 — CORRECCIÓN. Todo o nada.
-- ---------------------------------------------------------------------
begin;

do $corregir$
declare
  c_producto  constant text := 'PT HARINA PREC MAIZ 24LB BLANCA';
  c_cod       constant text := 'PT000043';
  c_linea     constant bigint := 3689;    -- <<< línea del detalle del #39 (lote 20260910 A14)
  c_ajuste    constant bigint := 181;     -- <<< su corrección (invtrans #34021)
  c_invtrans  constant bigint := 34021;
  c_contado   constant numeric := 850;    -- <<< lo que de verdad se contó en ese lote
  v_suma      numeric;
  v_sistema   numeric;
  v_conteo    numeric;
  v_condif    int;
  v_stock     numeric;
  v_lote      numeric;
  v_neg       int;
begin
  -- ¿Ya se corrió?
  if exists (select 1 from public.sig_inventario_cuadre_detalle where id = c_linea and conteo = c_contado)
     and exists (select 1 from public.invtrans where id = c_invtrans and lower(status) = 'rechazado') then
    raise notice 'El 269 ya se corrió: nada que hacer.';
    return;
  end if;

  -- ESTADO ESPERADO. Si algo no calza, no se toca nada.
  if not exists (
    select 1 from public.sig_inventario_cuadre_detalle
     where id = c_linea and cuadre_id = 39 and codproducto = c_cod and producto = c_producto
       and lote = '20260910' and location = 'A14' and sistema = 850 and conteo = 840
  ) then
    raise exception 'La línea #% del conteo #39 no está como se esperaba (lote 20260910 A14, sistema 850, contado 840): se deshace todo y hay que revisar.', c_linea;
  end if;

  select coalesce(sum(coalesce(conteo, sistema)), 0) into v_suma
    from public.sig_inventario_cuadre_detalle where cuadre_id = 39 and codproducto = c_cod;
  if v_suma <> 4826 then
    raise exception 'El conteo #39 de % suma % y se esperaban 4826: se deshace todo.', c_cod, v_suma;
  end if;

  if not exists (
    select 1 from public.sig_inventario_ajuste
     where id = c_ajuste and cuadre_id = 39 and proyecto_id = 3 and codproducto = c_cod
       and lote = '20260910' and cantidad = -10 and tipo = 'faltante'
       and estado = 'aprobado' and activo and invtrans_id = c_invtrans
  ) then
    raise exception 'La corrección aj#% no está como se esperaba (faltante de 10 del lote 20260910, aprobada y activa): se deshace todo.', c_ajuste;
  end if;

  if not exists (
    select 1 from public.invtrans
     where id = c_invtrans and idempresa = 3 and nombreproducto = c_producto
       and lote = '20260910' and location = 'A14' and cantidad = 10
       and tipomov = 'Salida' and cod_movimiento::text = '702' and lower(status) = 'aprobado'
  ) then
    raise exception 'El movimiento #% no está como se esperaba (702 de 10 und, lote 20260910 A14, aprobado): se deshace todo.', c_invtrans;
  end if;

  if not exists (select 1 from public.sig_inventario_cuadre
                  where id = 39 and proyecto_id = 3 and tipo = 'total' and activo and estado = 'aprobado' and fecha = '2026-10-01') then
    raise exception 'El conteo #39 no es la base aprobada de octubre en ID3: se deshace todo.';
  end if;

  -- 2a. El conteo dice lo que de verdad se contó.
  update public.sig_inventario_cuadre_detalle
     set conteo = c_contado,
         diferencia = c_contado - sistema,
         observacion = coalesce(nullif(observacion, ''), '') ||
           case when coalesce(observacion, '') = '' then '' else ' · ' end ||
           'Corregido por 269 (8-oct-2026) por instrucción expresa de gerencia: se había digitado 840 y el físico era 850. El inicial de octubre de PT000043 pasa de 4.826 a 4.836.'
   where id = c_linea;
  raise notice 'Conteo #39, lote 20260910 A14: contado 840 -> %.', c_contado;

  -- 2b. El faltante que nació de ese error deja de descontar.
  update public.sig_inventario_ajuste
     set activo = false,
         motivo = coalesce(motivo, '') || ' · ANULADA por 269 (8-oct-2026): el faltante venía de un error de digitación del conteo (840 en vez de 850); no hubo faltante.'
   where id = c_ajuste;
  update public.invtrans
     set status = 'rechazado',
         observaciones = coalesce(observaciones, '') ||
           ' · Anulado por 269 (8-oct-2026): el conteo #39 decía 840 por error de digitación; el físico era 850, así que este faltante de 10 no existió.'
   where id = c_invtrans;
  raise notice 'Corrección aj#% anulada e invtrans #% rechazado (+10 al stock, fechado en septiembre).', c_ajuste, c_invtrans;

  -- 2c. La cabecera del #39, recalculada DESDE SU DETALLE (ya venía desfasada del 2-oct).
  select coalesce(sum(sistema), 0),
         coalesce(sum(coalesce(conteo, sistema)), 0),
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
  raise notice 'Cabecera del #39 recalculada desde el detalle: sistema % · conteo % · diferencia % · % lineas con diferencia.',
    v_sistema, v_conteo, v_conteo - v_sistema, v_condif;

  -- COHERENCIA FINAL.
  select coalesce(sum(coalesce(conteo, sistema)), 0) into v_suma
    from public.sig_inventario_cuadre_detalle where cuadre_id = 39 and codproducto = c_cod;
  if v_suma <> 4836 then
    raise exception 'El inicial de % quedó en % y debía quedar en 4836: se deshace todo.', c_cod, v_suma;
  end if;

  select coalesce(sum(stock_actual), 0) into v_stock
    from public.saldoinvdetalle where idempresa = 3 and nombreproducto = c_producto;
  if v_stock <> 8508 then
    raise exception 'El stock vivo de % quedó en % y debía quedar en 8508 (8498 + 10): se deshace todo. ¿Hubo movimientos nuevos hoy?', c_producto, v_stock;
  end if;

  select coalesce(sum(stock_actual), 0) into v_lote
    from public.saldoinvdetalle where idempresa = 3 and nombreproducto = c_producto and lote = '20260910';
  if v_lote <> 478 then
    raise exception 'El lote 20260910 quedó en % y debía quedar en 478: se deshace todo.', v_lote;
  end if;

  -- Ninguna otra línea del conteo se movió.
  if (select count(*) from public.sig_inventario_cuadre_detalle where cuadre_id = 39) <> 95 then
    raise exception 'El conteo #39 ya no tiene sus 95 líneas: se deshace todo.';
  end if;

  select count(*) into v_neg from public.saldoinvdetalle where idempresa = 3 and stock_actual < 0;
  if v_neg > 0 then
    raise exception 'ID3 quedó con % lote(s) en negativo: se deshace todo.', v_neg;
  end if;

  raise notice 'LISTO. Inicial de octubre de PT000043 = 4.836. Stock vivo 8.508. ID3 sin negativos.';
end
$corregir$;

commit;

-- ---------------------------------------------------------------------
-- PASO 3 — DESPUÉS.
-- ---------------------------------------------------------------------

-- 3a. El detalle del producto: el lote 20260910 en 850 y sin diferencia; suma 4.836.
select id, lote, location, sistema, conteo, diferencia
from public.sig_inventario_cuadre_detalle
where cuadre_id = 39 and codproducto = 'PT000043'
order by lote;

select sum(coalesce(conteo, sistema)) as inicial_octubre_pt000043
from public.sig_inventario_cuadre_detalle
where cuadre_id = 39 and codproducto = 'PT000043';
-- Esperado: 4836.

-- 3b. La cabecera, ya coherente con su detalle.
select total_sistema, total_conteo, total_diferencia, items, items_con_diferencia
from public.sig_inventario_cuadre where id = 39;
-- Esperado: 57991 · 57619 · -372 · 95 · 28.

-- 3c. El ajuste anulado y su movimiento.
select id, activo, estado, motivo from public.sig_inventario_ajuste where id = 181;
select id, cantidad, status from public.invtrans where id = 34021;

-- 3d. Stock vivo: 8.508 en total, lote 20260910 en 478, y ID3 sin negativos.
select sum(stock_actual) as total_producto
from public.saldoinvdetalle where idempresa = 3 and nombreproducto = 'PT HARINA PREC MAIZ 24LB BLANCA';

select lote, location, stock_actual
from public.saldoinvdetalle
where idempresa = 3 and nombreproducto = 'PT HARINA PREC MAIZ 24LB BLANCA' and stock_actual <> 0
order by lote;

select count(*) as lotes_negativos_id3
from public.saldoinvdetalle where idempresa = 3 and stock_actual < 0;
-- Esperado: 0.
