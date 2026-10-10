
-- =====================================================================
-- 280_conteo_43_id3_corregir_reloj.sql
--
-- El conteo cíclico #43 de ID3 (9-oct) muestra un faltante de 720 unidades que NO EXISTE. Se
-- corrige esa línea con el dato real y el conteo queda diciendo la verdad. NO SE TOCA EL
-- INVENTARIO: en todo el script no hay una sola instrucción contra `invtrans`.
--
-- ============ QUÉ PASÓ, CON LAS HORAS ============
-- El conteo cíclico fotografía el sistema cuando se CREA, pero la bodega despacha toda la mañana
-- y la línea se cuenta horas después. En este caso (horas UTC, Bogotá menos cinco):
--
--   13:34:19  se crea el conteo #43 y fotografía el sistema → 896 und de PT ESPAGUETI CAPRISSIMA
--             1000GR*12PQ, lote 20260914, ubicación A17.
--   13:58:42  sale la orden de cargue MOL2026100910017 con 720 unidades de ese mismo lote
--             (invtrans #35270, código 601, aprobada).
--   15:01:55  el contador (Ander Fabián) cuenta esa línea y encuentra 176.
--
--   896 − 720 = 176.  EL CONTEO ESTABA PERFECTO.
--
-- El sistema lo pintó como un faltante de 720 porque comparó la foto de las 8:34 de la mañana
-- contra un conteo de las 10:01. La novedad que escribió el contador —"mal envio"— apunta a lo
-- mismo: el producto salió, no se perdió. El mismo producto ya había aparecido con −796 en el
-- conteo #42 por la misma razón.
--
-- SI ALGUIEN HUBIERA "CORREGIDO" ESE FALTANTE con un 702, habría borrado del sistema 720 unidades
-- que sí existían y el inventario de ID3 habría quedado 720 unidades bajo lo real. Por eso la
-- regla de gerencia de no ajustar un cíclico con el código genérico es la correcta.
--
-- ============ LA CAUSA YA ESTÁ CERRADA EN EL CÓDIGO ============
-- `guardarLineaConteoCuadre` ahora, en un conteo CÍCLICO, vuelve a leer el stock vivo de la línea
-- en el instante en que se guarda, en vez de creerle a la foto del amanecer. La ventana baja de
-- horas a segundos. El Conteo TOTAL no cambia: ahí la foto del corte SÍ es la referencia, a
-- propósito. Este script solo arregla el dato que quedó mal escrito antes de ese cambio.
--
-- ============ LAS OTRAS NUEVE DIFERENCIAS SON REALES Y SE DEJAN ============
-- Se comprobó una por una si había movimientos entre la foto y su hora de conteo: ninguna los
-- tiene. Son −2, −1, +1, −2, +1, +7, −2, −1, +1 (18 unidades en valor absoluto sobre 67.111 del
-- sistema). Se quedan como están, para que las gestione quien corresponde con el código de su
-- causa desde "Diferencias".
--
-- POR LLAVE PRIMARIA, con el estado esperado exigido antes de escribir. Idempotente.
-- =====================================================================

-- ---------------------------------------------------------------------
-- PASO 1 — ANTES.
-- ---------------------------------------------------------------------
select id, cuadre_id, producto, lote, location, sistema, conteo, diferencia, observacion,
       contado_por, contado_en
from public.sig_inventario_cuadre_detalle where id = 4294;
-- Esperado: sistema 896 · conteo 176 · diferencia −720 · contado 2026-10-09 15:01:55.

select id, nombreproducto, lote, location, cod_movimiento, tipomov, cantidad, creado, ocargue, status
from public.invtrans where id = 35270;
-- Esperado: la salida de 720 del 2026-10-09 13:58:42, orden MOL2026100910017, aprobada.
-- Es la prueba de que las 720 salieron de verdad: esta fila NO se toca.

select id, fecha, tipo, estado, total_sistema, total_conteo, total_diferencia, items, items_con_diferencia
from public.sig_inventario_cuadre where id = 43;
-- Esperado: cíclico, contado, sistema 67.111 · conteo 66.393 · diferencia −718 · 10 con diferencia.

-- Foto del inventario de ID3: tiene que quedar idéntica al final.
select count(*) as movimientos,
       coalesce(sum(cantidad) filter (where tipomov = 'Entrada'), 0) as entradas,
       coalesce(sum(cantidad) filter (where tipomov = 'Salida'), 0) as salidas
from public.invtrans where idempresa = 3;

-- ---------------------------------------------------------------------
-- PASO 2 — LA LÍNEA QUEDA DICIENDO LA VERDAD.
-- ---------------------------------------------------------------------
begin;

do $corregir$
declare
  v_sistema numeric;
  v_conteo numeric;
  v_dif numeric;
  v_salida numeric;
  v_n int;
begin
  -- a) La línea tiene que estar como se midió, o este script no aplica.
  select sistema, conteo, diferencia into v_sistema, v_conteo, v_dif
    from public.sig_inventario_cuadre_detalle where id = 4294 and cuadre_id = 43;
  if v_sistema is null then
    raise exception 'No existe la línea 4294 del conteo 43. Se deshace todo.';
  end if;
  if v_conteo <> 176 then
    raise exception 'La línea 4294 tiene un conteo de % y se esperaba 176: alguien la volvió a contar. Se revisa a mano. Se deshace todo.', v_conteo;
  end if;
  if v_sistema = 176 and v_dif = 0 then
    raise notice 'La línea 4294 ya estaba corregida: no hay nada que hacer.';
  else
    if v_sistema <> 896 then
      raise exception 'La línea 4294 tiene un sistema de % y se esperaba 896. Se deshace todo.', v_sistema;
    end if;

    -- b) La salida de 720 tiene que existir, estar aprobada y haber ocurrido ENTRE la foto del
    --    conteo y la hora en que se contó la línea. Es toda la justificación del cambio.
    select coalesce(sum(t.cantidad), 0) into v_salida
      from public.invtrans t
      join public.sig_inventario_cuadre c on c.id = 43
      join public.sig_inventario_cuadre_detalle d on d.id = 4294
     where t.idempresa = 3
       and t.nombreproducto = d.producto
       and t.lote = d.lote
       and t.location = d.location
       and t.tipomov = 'Salida'
       and lower(t.status) like 'aprob%'
       and t.creado > c.created_at
       and t.creado <= d.contado_en;
    if v_salida <> 720 then
      raise exception 'Las salidas entre la foto y el conteo suman % y se esperaban 720: la explicación ya no cuadra. Se deshace todo.', v_salida;
    end if;

    -- c) El sistema de esa línea pasa a ser el que había cuando se contó: 896 − 720 = 176.
    update public.sig_inventario_cuadre_detalle
       set sistema = 176,
           diferencia = 0,
           observacion = 'mal envio · CORREGIDO 2026-10-10: no era faltante. La foto del conteo se tomó a las 8:34 con 896 und; a las 8:58 salió la orden MOL2026100910017 con 720 (invtrans #35270) y a las 10:01 se contaron 176. 896-720=176: el conteo estaba exacto. El sistema de la línea se ajusta a lo que había al momento de contar. Inventario NO tocado (script 280).'
     where id = 4294 and cuadre_id = 43 and conteo = 176;
    get diagnostics v_n = row_count;
    if v_n <> 1 then
      raise exception 'Se esperaba corregir 1 línea y se corrigieron %. Se deshace todo.', v_n;
    end if;
    raise notice 'Línea 4294: sistema 896 → 176 · diferencia -720 → 0.';
  end if;
end
$corregir$;

-- Los totales de la cabecera se recalculan desde el detalle, igual que hace la pantalla.
do $totales$
declare
  v_sis numeric; v_con numeric; v_dif numeric; v_items int; v_condif int;
begin
  select coalesce(sum(sistema), 0), coalesce(sum(conteo), 0), coalesce(sum(diferencia), 0),
         count(*), count(*) filter (where diferencia <> 0)
    into v_sis, v_con, v_dif, v_items, v_condif
    from public.sig_inventario_cuadre_detalle where cuadre_id = 43;

  update public.sig_inventario_cuadre
     set total_sistema = round(v_sis, 2), total_conteo = round(v_con, 2),
         total_diferencia = round(v_dif, 2), items = v_items, items_con_diferencia = v_condif,
         updated_at = now()
   where id = 43;

  raise notice 'Cabecera del #43: sistema % · conteo % · diferencia % · % líneas, % con diferencia.',
    round(v_sis, 2), round(v_con, 2), round(v_dif, 2), v_items, v_condif;
  if v_condif <> 9 then
    raise exception 'Se esperaban 9 líneas con diferencia (las reales) y quedaron %. Se deshace todo.', v_condif;
  end if;
end
$totales$;

commit;

-- ---------------------------------------------------------------------
-- PASO 3 — DESPUÉS.
-- ---------------------------------------------------------------------
select id, producto, lote, location, sistema, conteo, diferencia from public.sig_inventario_cuadre_detalle where id = 4294;
-- Esperado: sistema 176 · conteo 176 · diferencia 0.

select id, fecha, tipo, estado, total_sistema, total_conteo, total_diferencia, items, items_con_diferencia
from public.sig_inventario_cuadre where id = 43;
-- Esperado: 9 líneas con diferencia y una diferencia total de +2 (las nueve reales).

select producto, lote, location, sistema, conteo, diferencia, observacion
from public.sig_inventario_cuadre_detalle
where cuadre_id = 43 and diferencia <> 0 order by abs(diferencia) desc, id;
-- Esperado: las 9 reales (−2, −1, +1, −2, +1, +7, −2, −1, +1), ninguna de 720.

-- El inventario de ID3, idéntico al paso 1.
select count(*) as movimientos,
       coalesce(sum(cantidad) filter (where tipomov = 'Entrada'), 0) as entradas,
       coalesce(sum(cantidad) filter (where tipomov = 'Salida'), 0) as salidas
from public.invtrans where idempresa = 3;
