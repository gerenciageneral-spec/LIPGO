
-- =====================================================================
-- 269_id3_conteo39_harina24lb_inicial_4836.sql
--
-- ID3 (Cedi Funza). Corrige DOS productos del Conteo total #39 (1-oct-2026, la BASE DE
-- OCTUBRE), por instrucción expresa de gerencia el 2026-10-08:
--
--   A) PT000043 · PT HARINA PREC MAIZ 24LB BLANCA        4.826 → 4.836   (+10)
--      "por error en el inventario inicial le pusimos 4.826 cuando en realidad era 4.836".
--   B) PT000116 · Conchita Caprissima. 250 Gr. X 24 Und    371 →   370   (−1)
--      "371 son 370 inventario inicial, corregir el conteo 39 de ID 3".
--
-- ES UNA EXCEPCIÓN EXPRESA a la regla "los Conteos totales aprobados no se modifican"
-- (gerencia, 2026-10-02). Queda registrada en la observación de cada línea.
--
-- Correcciones POR LLAVE PRIMARIA, estado esperado verificado antes, antes/después impreso y
-- comprobación de coherencia al final. Idempotente.
-- =====================================================================
--
-- LOS DOS CASOS SON OPUESTOS, Y POR ESO SE TRATAN DISTINTO
--
-- El inventario tiene que seguir cumpliendo: base del mes + movimientos = stock vivo. Si solo
-- se cambia el conteo, la base se mueve y el stock no, y el Kardex de octubre mostraría la
-- diferencia como "sin soporte". Entonces:
--
-- A) HARINA 24LB: SOBRA un ajuste. El detalle del #39 tiene 9 líneas para este producto y suma
--    4.826. Una sola tiene diferencia, y es exactamente de 10:
--        línea #3689 · lote 20260910 A14 · sistema 850 · contado 840 · dif −10
--    Corregirla a 850 da 4.836 EXACTO, la cifra de gerencia: fue un error de digitación.
--    Ese −10 generó la corrección aj#181 → invtrans #34021 (702 Salida de 10, lote 20260910,
--    fechada el 30-sep), que descontó stock por un faltante que no existió. SE ANULA.
--    >>> Si el CEDI sabe que esas 10 iban en otro lote, cambiar c_linea_a / c_ajuste_a /
--        c_invtrans_a. El candado exige que el total quede en 4.836 de todas formas. <<<
--
-- B) CONCHITA CAPRISSIMA: FALTA un ajuste. Su única línea cuadraba (sistema 371 = contado 371),
--    así que bajar el contado a 370 crea una diferencia de −1 que nadie descontó. SE CREA el
--    faltante que el conteo habría generado: una corrección en sig_inventario_ajuste y su
--    702 de 1 unidad en invtrans, fechado 2026-09-30 15:00 como todos los ajustes del #39.
--    El producto no se ha movido desde el conteo (último movimiento: 21-sep), así que el stock
--    pasa de 371 a 370 y queda igual al físico de la hoja del 8-oct.
--
-- POR QUÉ NO SE USA EL BOTÓN "REVERSAR" DE LA APP EN EL CASO A
-- Ese botón crea un movimiento contrario con fecha de HOY: metería +10 en los movimientos de
-- OCTUBRE y volvería a romper base + movimientos = stock. Aquí se anula el movimiento
-- original, que está fechado en septiembre, y la ecuación se mantiene.
--
-- DE PASO, LA CABECERA DEL #39 YA VENÍA DESCUADRADA DE SU PROPIO DETALLE
-- Cabecera: total_conteo 57.709 · diferencia −282 · 27 líneas con diferencia.
-- Detalle real: 57.609 · −382 · 29 líneas. Se desfasó el 2-oct, cuando gerencia restauró dos
-- líneas y no se recalculó la cabecera. Como este script ya toca el detalle, la cabecera se
-- recalcula DESDE EL DETALLE (no se le suman 9 a un número que ya estaba mal). La base del mes
-- la lee la app del DETALLE, así que esto es cosmético pero deja el acta coherente.
--
-- RESULTADO ESPERADO
--   Conteo #39 · PT000043: 4.826 → 4.836 (lote 20260910: 840 → 850, sin diferencia).
--   Conteo #39 · PT000116:   371 →   370 (lote 20260717: diferencia −1, con su faltante).
--   Conteo #39 completo: total_conteo 57.618 · diferencia −373 · 29 líneas con diferencia.
--   Stock vivo: Harina 24LB 8.498 → 8.508 (lote 20260910 A14: 468 → 478).
--               Conchita Caprissima 371 → 370 (lote 20260717 A15).
--   ID3 sigue sin lotes negativos. Ningún otro producto, conteo, orden ni proyecto cambia.
--
-- EFECTO EN LA HOJA FÍSICA DEL 8-OCT (informativo)
--   Conchita Caprissima: queda en 370 contra 370 físico → diferencia CERO.
--   Harina 24LB: su hoja da 8.480 + 1 avería = 8.481. Hoy LIPgo dice 8.498 (−17); después
--   dirá 8.508 (−27). La corrección es del INICIAL, así que si el 1-oct había 4.836, ese
--   faltante de 27 apareció DURANTE octubre, no el día 1: hay que buscarlo en los movimientos
--   del mes, no en el conteo.
-- =====================================================================

-- ---------------------------------------------------------------------
-- PASO 1 — ANTES.
-- ---------------------------------------------------------------------
select id, codproducto, lote, location, sistema, conteo, diferencia, observacion
from public.sig_inventario_cuadre_detalle
where cuadre_id = 39 and codproducto in ('PT000043', 'PT000116')
order by codproducto, lote;

select codproducto, sum(coalesce(conteo, sistema)) as inicial_octubre
from public.sig_inventario_cuadre_detalle
where cuadre_id = 39 and codproducto in ('PT000043', 'PT000116')
group by codproducto order by 1;
-- Esperado: PT000043 = 4826 · PT000116 = 371.

select id, fecha, codproducto, lote, cantidad, tipo, estado, activo, invtrans_id
from public.sig_inventario_ajuste where id = 181;

select id, codproducto, lote, location, cantidad, tipomov, cod_movimiento, status, creado
from public.invtrans where id = 34021;

select codproducto, sum(stock_actual) as stock_hoy
from public.saldoinvdetalle
where idempresa = 3 and codproducto in ('PT000043', 'PT000116')
group by codproducto order by 1;
-- Esperado: PT000043 = 8498 · PT000116 = 371.

-- ---------------------------------------------------------------------
-- PASO 2 — CORRECCIÓN. Todo o nada.
-- ---------------------------------------------------------------------
begin;

do $corregir$
declare
  -- A) Harina 24LB: sobra un faltante.
  c_prod_a     constant text   := 'PT HARINA PREC MAIZ 24LB BLANCA';
  c_cod_a      constant text   := 'PT000043';
  c_linea_a    constant bigint := 3689;   -- línea del #39, lote 20260910 A14
  c_ajuste_a   constant bigint := 181;    -- su corrección
  c_invtrans_a constant bigint := 34021;  -- y el movimiento que descontó
  c_contado_a  constant numeric := 850;   -- lo que de verdad se contó
  -- B) Conchita Caprissima: falta un faltante.
  c_prod_b     constant text   := 'Conchita Caprissima. 250 Gr. X 24 Und';
  c_cod_b      constant text   := 'PT000116';
  c_idprod_b   constant int    := 116;
  c_linea_b    constant bigint := 3728;   -- línea del #39, lote 20260717 A15
  c_lote_b     constant text   := '20260717';
  c_loc_b      constant text   := 'A15';
  c_contado_b  constant numeric := 370;   -- lo que de verdad se contó (decía 371)
  -- Convención de los 29 ajustes del #39: fecha de la víspera, 15:00, "Gerencia General".
  c_fecha_aj   constant date   := date '2026-09-30';
  c_creado_aj  constant timestamptz := timestamptz '2026-09-30 15:00:00+00';
  v_aj_b       bigint;
  v_inv_b      bigint;
  v_suma       numeric;
  v_sistema    numeric;
  v_conteo     numeric;
  v_condif     int;
  v_stock      numeric;
  v_lote       numeric;
  v_neg        int;
begin
  -- ¿Ya se corrió?
  if exists (select 1 from public.sig_inventario_cuadre_detalle where id = c_linea_a and conteo = c_contado_a)
     and exists (select 1 from public.sig_inventario_cuadre_detalle where id = c_linea_b and conteo = c_contado_b) then
    raise notice 'El 269 ya se corrió: nada que hacer.';
    return;
  end if;

  -- ================= ESTADO ESPERADO (si algo no calza, no se toca nada) =================

  -- A)
  if not exists (
    select 1 from public.sig_inventario_cuadre_detalle
     where id = c_linea_a and cuadre_id = 39 and codproducto = c_cod_a and producto = c_prod_a
       and lote = '20260910' and location = 'A14' and sistema = 850 and conteo = 840
  ) then
    raise exception 'La línea #% del conteo #39 no está como se esperaba (lote 20260910 A14, sistema 850, contado 840): se deshace todo.', c_linea_a;
  end if;
  select coalesce(sum(coalesce(conteo, sistema)), 0) into v_suma
    from public.sig_inventario_cuadre_detalle where cuadre_id = 39 and codproducto = c_cod_a;
  if v_suma <> 4826 then
    raise exception 'El conteo #39 de % suma % y se esperaban 4826: se deshace todo.', c_cod_a, v_suma;
  end if;
  if not exists (
    select 1 from public.sig_inventario_ajuste
     where id = c_ajuste_a and cuadre_id = 39 and proyecto_id = 3 and codproducto = c_cod_a
       and lote = '20260910' and cantidad = -10 and tipo = 'faltante'
       and estado = 'aprobado' and activo and invtrans_id = c_invtrans_a
  ) then
    raise exception 'La corrección aj#% no está como se esperaba: se deshace todo.', c_ajuste_a;
  end if;
  if not exists (
    select 1 from public.invtrans
     where id = c_invtrans_a and idempresa = 3 and nombreproducto = c_prod_a
       and lote = '20260910' and location = 'A14' and cantidad = 10
       and tipomov = 'Salida' and cod_movimiento::text = '702' and lower(status) = 'aprobado'
  ) then
    raise exception 'El movimiento #% no está como se esperaba: se deshace todo.', c_invtrans_a;
  end if;

  -- B)
  if not exists (
    select 1 from public.sig_inventario_cuadre_detalle
     where id = c_linea_b and cuadre_id = 39 and codproducto = c_cod_b and producto = c_prod_b
       and lote = c_lote_b and location = c_loc_b and sistema = 371 and conteo = 371
  ) then
    raise exception 'La línea #% del conteo #39 no está como se esperaba (% lote % %, sistema 371, contado 371): se deshace todo.', c_linea_b, c_cod_b, c_lote_b, c_loc_b;
  end if;
  if (select count(*) from public.sig_inventario_cuadre_detalle where cuadre_id = 39 and codproducto = c_cod_b) <> 1 then
    raise exception 'El conteo #39 tiene más de una línea de %: revisar antes de corregir. Se deshace todo.', c_cod_b;
  end if;
  if (select coalesce(sum(stock_actual), 0) from public.saldoinvdetalle
       where idempresa = 3 and codproducto = c_cod_b) <> 371 then
    raise exception 'El stock de % no es 371: hubo movimientos nuevos. Se deshace todo y hay que recalcular.', c_cod_b;
  end if;
  if exists (select 1 from public.sig_inventario_ajuste
              where cuadre_id = 39 and codproducto = c_cod_b and activo) then
    raise exception 'Ya existe una corrección activa de % en el cuadre #39: se deshace todo.', c_cod_b;
  end if;

  -- El conteo tiene que ser la base aprobada de octubre.
  if not exists (select 1 from public.sig_inventario_cuadre
                  where id = 39 and proyecto_id = 3 and tipo = 'total' and activo and estado = 'aprobado' and fecha = '2026-10-01') then
    raise exception 'El conteo #39 no es la base aprobada de octubre en ID3: se deshace todo.';
  end if;

  -- ================= A) HARINA 24LB: el conteo dice 850 y el faltante se anula =================

  update public.sig_inventario_cuadre_detalle
     set conteo = c_contado_a,
         diferencia = c_contado_a - sistema,
         observacion = coalesce(nullif(observacion, ''), '') ||
           case when coalesce(observacion, '') = '' then '' else ' · ' end ||
           'Corregido por 269 (8-oct-2026) por instrucción expresa de gerencia: se había digitado 840 y el físico era 850. El inicial de octubre de PT000043 pasa de 4.826 a 4.836.'
   where id = c_linea_a;

  update public.sig_inventario_ajuste
     set activo = false,
         motivo = coalesce(motivo, '') || ' · ANULADA por 269 (8-oct-2026): el faltante venía de un error de digitación del conteo (840 en vez de 850); no hubo faltante.'
   where id = c_ajuste_a;

  update public.invtrans
     set status = 'rechazado',
         observaciones = coalesce(observaciones, '') ||
           ' · Anulado por 269 (8-oct-2026): el conteo #39 decía 840 por error de digitación; el físico era 850, así que este faltante de 10 no existió.'
   where id = c_invtrans_a;

  raise notice 'A) PT000043: conteo 840 -> 850 (inicial 4.826 -> 4.836); aj#% anulada e invtrans #% rechazado (+10 al stock, fechado en septiembre).', c_ajuste_a, c_invtrans_a;

  -- ================= B) CONCHITA CAPRISSIMA: el conteo dice 370 y nace su faltante =================

  update public.sig_inventario_cuadre_detalle
     set conteo = c_contado_b,
         diferencia = c_contado_b - sistema,
         observacion = coalesce(nullif(observacion, ''), '') ||
           case when coalesce(observacion, '') = '' then '' else ' · ' end ||
           'Corregido por 269 (8-oct-2026) por instrucción expresa de gerencia: se había digitado 371 y el físico era 370. El inicial de octubre de PT000116 pasa de 371 a 370.'
   where id = c_linea_b;

  -- La corrección, con la misma forma que las 29 del conteo (sig_inventario_ajuste tiene
  -- secuencia propia: se deja que la asigne y se lee para el marcador [aj#id]).
  insert into public.sig_inventario_ajuste
    (proyecto_id, cuadre_id, fecha, codproducto, producto, lote, location, cantidad, tipo,
     motivo, responsable, estado, activo, direccion, cod_movimiento, aprobado_por, aprobado_fecha)
  values
    (3, 39, c_fecha_aj, c_cod_b, c_prod_b, c_lote_b, c_loc_b, c_contado_b - 371, 'faltante',
     'Ajuste por conteo físico (cuadre) · creado por 269 (8-oct-2026): el conteo decía 371 y el físico era 370.',
     'YULL CONTENTO', 'aprobado', true, 'salida', '702', 'Gerencia General', now())
  returning id into v_aj_b;

  -- El movimiento. `invtrans` NO usa secuencia confiable en este sistema: id = max + 1
  -- (misma convención que todo el código, ver docs/diccionario-trampas.md §5).
  select coalesce(max(id), 0) + 1 into v_inv_b from public.invtrans;
  insert into public.invtrans
    (id, idempresa, idproducto, codproducto, nombreproducto, lote, location, cantidad,
     tipomov, cod_movimiento, status, origen, creado, creadopor, observaciones)
  values
    (v_inv_b, 3, c_idprod_b, c_cod_b, c_prod_b, c_lote_b, c_loc_b, 371 - c_contado_b,
     'Salida', '702', 'aprobado', 'transaccion manual', c_creado_aj, 'Gerencia General',
     'Corrección de inventario · cuadre #39 · faltante · Ajuste por conteo físico (cuadre) [aj#' || v_aj_b || ']');

  update public.sig_inventario_ajuste set invtrans_id = v_inv_b where id = v_aj_b;

  raise notice 'B) PT000116: conteo 371 -> 370; corrección aj#% e invtrans #% creados (702 de 1 und, fechado el 30-sep).', v_aj_b, v_inv_b;

  -- ================= La cabecera del #39, recalculada DESDE SU DETALLE =================

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
  raise notice 'Cabecera del #39 recalculada desde el detalle: sistema % · conteo % · diferencia % · % líneas con diferencia.',
    v_sistema, v_conteo, v_conteo - v_sistema, v_condif;

  -- ================= COHERENCIA FINAL =================

  select coalesce(sum(coalesce(conteo, sistema)), 0) into v_suma
    from public.sig_inventario_cuadre_detalle where cuadre_id = 39 and codproducto = c_cod_a;
  if v_suma <> 4836 then
    raise exception 'El inicial de % quedó en % y debía quedar en 4836: se deshace todo.', c_cod_a, v_suma;
  end if;
  select coalesce(sum(coalesce(conteo, sistema)), 0) into v_suma
    from public.sig_inventario_cuadre_detalle where cuadre_id = 39 and codproducto = c_cod_b;
  if v_suma <> 370 then
    raise exception 'El inicial de % quedó en % y debía quedar en 370: se deshace todo.', c_cod_b, v_suma;
  end if;

  select coalesce(sum(stock_actual), 0) into v_stock
    from public.saldoinvdetalle where idempresa = 3 and codproducto = c_cod_a;
  if v_stock <> 8508 then
    raise exception 'El stock de % quedó en % y debía quedar en 8508 (8498 + 10): se deshace todo. ¿Hubo movimientos nuevos hoy?', c_cod_a, v_stock;
  end if;
  select coalesce(sum(stock_actual), 0) into v_lote
    from public.saldoinvdetalle where idempresa = 3 and codproducto = c_cod_a and lote = '20260910';
  if v_lote <> 478 then
    raise exception 'El lote 20260910 quedó en % y debía quedar en 478: se deshace todo.', v_lote;
  end if;

  select coalesce(sum(stock_actual), 0) into v_stock
    from public.saldoinvdetalle where idempresa = 3 and codproducto = c_cod_b;
  if v_stock <> 370 then
    raise exception 'El stock de % quedó en % y debía quedar en 370: se deshace todo.', c_cod_b, v_stock;
  end if;

  -- El conteo conserva sus 95 líneas y nadie más se movió.
  if (select count(*) from public.sig_inventario_cuadre_detalle where cuadre_id = 39) <> 95 then
    raise exception 'El conteo #39 ya no tiene sus 95 líneas: se deshace todo.';
  end if;

  select count(*) into v_neg from public.saldoinvdetalle where idempresa = 3 and stock_actual < 0;
  if v_neg > 0 then
    raise exception 'ID3 quedó con % lote(s) en negativo: se deshace todo.', v_neg;
  end if;

  raise notice 'LISTO. Inicial de octubre: PT000043 = 4.836 · PT000116 = 370. Stock 8.508 y 370. ID3 sin negativos.';
end
$corregir$;

commit;

-- ---------------------------------------------------------------------
-- PASO 3 — DESPUÉS.
-- ---------------------------------------------------------------------

-- 3a. El detalle de los dos productos.
select id, codproducto, lote, location, sistema, conteo, diferencia
from public.sig_inventario_cuadre_detalle
where cuadre_id = 39 and codproducto in ('PT000043', 'PT000116')
order by codproducto, lote;

select codproducto, sum(coalesce(conteo, sistema)) as inicial_octubre
from public.sig_inventario_cuadre_detalle
where cuadre_id = 39 and codproducto in ('PT000043', 'PT000116')
group by codproducto order by 1;
-- Esperado: PT000043 = 4836 · PT000116 = 370.

-- 3b. La cabecera, ya coherente con su detalle.
select total_sistema, total_conteo, total_diferencia, items, items_con_diferencia
from public.sig_inventario_cuadre where id = 39;
-- Esperado: 57991 · 57618 · -373 · 95 · 29.

-- 3c. Las correcciones: la anulada y la nueva.
select id, codproducto, lote, cantidad, tipo, estado, activo, invtrans_id, motivo
from public.sig_inventario_ajuste
where cuadre_id = 39 and codproducto in ('PT000043', 'PT000116')
order by id;

select id, codproducto, lote, location, cantidad, tipomov, cod_movimiento, status, creado, observaciones
from public.invtrans
where id = 34021
   or (idempresa = 3 and codproducto = 'PT000116' and cod_movimiento::text = '702')
order by id;

-- 3d. Stock vivo y negativos.
select codproducto, sum(stock_actual) as stock
from public.saldoinvdetalle
where idempresa = 3 and codproducto in ('PT000043', 'PT000116')
group by codproducto order by 1;
-- Esperado: PT000043 = 8508 · PT000116 = 370.

select count(*) as lotes_negativos_id3
from public.saldoinvdetalle where idempresa = 3 and stock_actual < 0;
-- Esperado: 0.
