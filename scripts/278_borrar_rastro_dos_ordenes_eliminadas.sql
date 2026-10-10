
-- =====================================================================
-- 278_ordenes_eliminadas_sin_rastro_suelto.sql  (archivo: 278_borrar_rastro_dos_ordenes_eliminadas.sql)
--
-- Dos órdenes borradas dejaron rastro suelto. Se cierra el rastro SIN tocar el inventario, SIN
-- perder facturación y SIN liberar pedidos ya entregados.
--
-- ============ POR QUÉ ESTA VERSIÓN NO SE PARECE A LA PRIMERA ============
-- La primera versión borraba el rastro y devolvía los 5 pedidos a la bandeja del cliente. Al
-- revisarlo con datos, antes de correrlo, aparecieron TRES cosas que lo habrían vuelto un
-- problema peor que el que arregla:
--
--   1. EL CLON "D" DE ID2 ES EL QUE FACTURA. `AVI202610069897D` (cabeceraoc 9900) tiene 8 líneas
--      en la vista `facturacion`: 4,4397 t y $183.324, a los MISMOS cuatro clientes de los cuatro
--      pedidos. La orden madre, en cambio, ya no factura nada (se borró). Y ninguna prefactura de
--      ID2 llega al 6-oct todavía (la última cierra el 4-oct), así que ese dinero está POR COBRAR.
--      Borrar el clon era borrar una factura que LIP no ha emitido.
--   2. LIBERAR LOS PEDIDOS DE ID2 ABRÍA UN DOBLE DESPACHO. Esa mercancía SÍ se entregó y se va a
--      cobrar por el clon. Si los pedidos vuelven a "aprobado" con todo pendiente, alguien
--      despacha otra vez 114 unidades ya entregadas y ya facturadas.
--   3. NINGUNA CITA DE LA BASE TIENE `estatus` NULO (se contaron: cero). Poner esas dos en nulo
--      creaba un estado que no existe en producción, y dejaba dos vehículos de hace diez días
--      pareciendo sin procesar en Portería.
--
-- ============ LO QUE SÍ ES VERDAD, Y POR ESO ES LO QUE SE ESCRIBE ============
-- El clon `AVI202610069897D` es la orden de DISTRIBUCIÓN de la misma placa (QHC437), del mismo
-- día, del mismo transporte, y sus 8 líneas de `detalleoc` son EXACTAMENTE las 8 atribuciones del
-- libro: 50 + 16 + 12 + 30 + 1 + 1 + 2 + 2 = 114 unidades, a Ultramar, Palencia Barreto, Quintero
-- Parra y Manosalva Gómez. O sea: el clon no es un residuo, es la orden que entregó. Así que el
-- rastro no está huérfano por falta de orden, está apuntando a la orden EQUIVOCADA (la madre
-- borrada) cuando la orden viva lo describe mejor.
--   → ID2: el rastro se REAPUNTA al clon. Nadie pierde plata, nadie despacha dos veces, los
--     pedidos siguen entregados y la alerta de "rastro sin orden" se cierra de verdad.
--   → ID3: `MOL202609289628` NO tiene clon y no factura nada (la vista está en cero), así que no
--     hay a qué reapuntar. Su pedido 12004 (Jerónimo Martins) SÍ se entregó —1,512 t de báscula—
--     y se deja como está, entregado: liberarlo sería pedirle al cliente que despache otra vez
--     126 unidades que ya recibió. Solo se retira la ASIGNACIÓN DE LOTE suelta, que es lo que
--     enciende la alerta crítica y no alimenta ningún saldo (verificado en todo el repo).
--
-- EL INVENTARIO NO SE TOCA, y la garantía es estructural: en todo el script no hay una sola
-- instrucción contra `invtrans`. Decisión de gerencia (10-oct): "no podemos retrotraer novedades
-- que afecten el inventario que cerramos el primero".
--
-- LO QUE QUEDA ANOTADO Y NO SE RESUELVE AQUÍ (son decisiones, no datos):
--   · La cuadrilla de ID2 perdió las 4,04 t de la orden madre en la quincena EN CURSO, porque las
--     toneladas de nómina salen de `cabeceraoc` y la madre ya no existe. El clon no las sostiene:
--     no tiene auxiliares.
--   · Las prefacturas 65, 66 y 67 de ID3 (28-sep → 4-oct) se aprobaron cuando la orden de ID3
--     todavía existía, y se borró el 8-oct: su soporte ya no muestra esa orden. El total aprobado
--     quedó guardado; el soporte encogió después.
--
-- POR LLAVE PRIMARIA, con el estado esperado exigido antes de escribir. Idempotente.
-- =====================================================================

-- ---------------------------------------------------------------------
-- PASO 1 — ANTES.
-- ---------------------------------------------------------------------
-- La madre no existe; el clon sí, y es el que factura.
select 'madre' as que, count(*) as filas from public.cabeceraoc where ordendecargue = 'AVI202610069897'
union all
select 'clon', count(*) from public.cabeceraoc where ordendecargue = 'AVI202610069897D'
union all
select 'madre ID3', count(*) from public.cabeceraoc where ordendecargue = 'MOL202609289628';
-- Esperado: madre 0 · clon 1 · madre ID3 0.

select numeroorden, producto, cliente, toneladas, cantidad, valor_a_facturar
from public.facturacion where numeroorden = 'AVI202610069897D' order by producto, cantidad;
-- Esperado: 8 líneas, 4,4397 t, $183.324 en total. Esto es lo que NO se puede perder.

select id, transid, idpedido, ocargue, idorden, unidades
from public.pedidodetalle_ocargue
where id in (20008,20009,20010,20011,20012,20013,20014,20015) order by id;
-- Esperado: 8 atribuciones apuntando a la MADRE (AVI202610069897), idorden nulo, 114 und.

select transid, idpedido, producto, unidades, unidadescargadas, estado, ocargue
from public.pedidosdetalle
where transid in (25090,25091,25413,25414,25415,25460,25461,25615) order by transid;
-- Esperado: 8 líneas "cerrado", apuntando a la madre.

select idpedido, estado, aprobado, ocargue, vehiculo, transporte
from public.pedidoscabecera where idpedido in (12138,12271,12291,12348) order by idpedido;
-- Esperado: las 4 con ocargue = AVI202610069897 y vehículo QHC437.

select id, ordendecargue, idorden, producto, cantidad, lote, location
from public.historicolotes where id = 24985;
-- Esperado: 1 fila, 126 und de PT FIDEO A LA MESA 1000*12, de la orden de ID3 que no existe.

-- Foto del inventario: tiene que quedar idéntica al final.
select idempresa, count(*) as movimientos,
       coalesce(sum(cantidad) filter (where tipomov = 'Entrada'), 0) as entradas,
       coalesce(sum(cantidad) filter (where tipomov = 'Salida'), 0) as salidas
from public.invtrans where idempresa in (2,3) group by idempresa order by idempresa;

-- ---------------------------------------------------------------------
-- PASO 2 — EL RASTRO DE ID2 PASA A LA ORDEN VIVA, Y SE RETIRA LA ASIGNACIÓN SUELTA DE ID3.
-- ---------------------------------------------------------------------
begin;

do $arreglar$
declare
  v_clon_id int;
  v_n int;
  -- Las toneladas son NUMERIC con cuatro decimales (4,4397): si se compararan en una variable
  -- entera se redondearían a 4 y el script abortaría en falso.
  v_ton numeric;
  v_ton_despues numeric;
begin
  -- a) El clon tiene que existir: es el destino del reapunte y la factura de esas 114 unidades.
  select id into v_clon_id from public.cabeceraoc where ordendecargue = 'AVI202610069897D';
  if v_clon_id is null then
    raise exception 'El clon AVI202610069897D no existe: sin él no hay a qué reapuntar ni qué facturar. Se deshace todo.';
  end if;
  if v_clon_id <> 9900 then
    raise exception 'El clon cambió de id (esperado 9900, encontrado %). Se revisa a mano. Se deshace todo.', v_clon_id;
  end if;

  -- b) La madre NO puede existir: si alguien la restituyó, este arreglo ya no aplica.
  if exists (select 1 from public.cabeceraoc where ordendecargue in ('AVI202610069897','MOL202609289628')) then
    raise exception 'Alguna de las dos órdenes volvió a existir en cabeceraoc: este script ya no aplica. Se deshace todo.';
  end if;

  -- c) Las cantidades del clon y las del libro tienen que ser las mismas 114 unidades, o el
  --    reapunte sería una mentira cómoda.
  select coalesce(sum(cantidad), 0) into v_n from public.detalleoc where idorden = v_clon_id;
  if v_n <> 114 then
    raise exception 'El clon tiene % unidades en detalleoc y el libro 114: no son la misma entrega. Se deshace todo.', v_n;
  end if;
  select coalesce(sum(unidades), 0) into v_n from public.pedidodetalle_ocargue
   where id in (20008,20009,20010,20011,20012,20013,20014,20015);
  if v_n not in (0, 114) then
    raise exception 'Las 8 atribuciones suman % y no 114. Se deshace todo.', v_n;
  end if;

  -- d) La facturación del clon antes de tocar nada, para compararla al final.
  select coalesce(sum(toneladas), 0) into v_ton from public.facturacion where numeroorden = 'AVI202610069897D';
  raise notice 'Facturación del clon antes: % toneladas', v_ton;

  -- 1) EL LIBRO DEL PEDIDO pasa a nombrar la orden viva, con su id (así deja de ser un rastro
  --    huérfano y queda ligado por llave, no por texto).
  update public.pedidodetalle_ocargue
     set ocargue = 'AVI202610069897D', idorden = v_clon_id
   where id in (20008,20009,20010,20011,20012,20013,20014,20015)
     and ocargue = 'AVI202610069897';

  -- 2) LAS LÍNEAS DEL PEDIDO. No se toca ni una cantidad: siguen cargadas y cerradas, porque se
  --    entregaron. Solo cambia a qué orden dicen pertenecer.
  update public.pedidosdetalle
     set ocargue = 'AVI202610069897D'
   where transid in (25090,25091,25413,25414,25415,25460,25461,25615)
     and ocargue = 'AVI202610069897';

  -- 3) LA CABECERA DEL PEDIDO. El vehículo y el transporte ya son los del clon (QHC437, AVIMOL):
  --    no se tocan. El estado tampoco: esos pedidos se entregaron.
  update public.pedidoscabecera
     set ocargue = 'AVI202610069897D'
   where idpedido in (12138,12271,12291,12348)
     and ocargue = 'AVI202610069897';

  -- 4) LA CITA DE ID2 pasa a la orden viva. No se le toca el `estatus`: el vehículo llegó y se
  --    procesó, y ninguna cita de la base tiene estatus nulo.
  update public.citasvehiculos
     set ocargue = 'AVI202610069897D'
   where id = 9479 and ocargue = 'AVI202610069897';

  -- 5) ID3: la asignación de lote suelta. Su orden no existe, no tiene clon, no factura y
  --    `historicolotes` no alimenta ningún saldo. Es lo único que se borra en todo el script.
  delete from public.historicolotes where id = 24985 and ordendecargue = 'MOL202609289628';

  -- e) La facturación del clon tiene que seguir intacta: es la prueba de que no se perdió plata.
  select coalesce(sum(toneladas), 0) into v_ton_despues from public.facturacion where numeroorden = 'AVI202610069897D';
  if v_ton_despues is distinct from v_ton then
    raise exception 'La facturación del clon cambió de % a % toneladas. Se deshace todo.', v_ton, v_ton_despues;
  end if;

  -- f) Ni un movimiento de inventario de esas órdenes, antes y ahora.
  select count(*) into v_n from public.invtrans
   where ocargue in ('AVI202610069897','MOL202609289628','AVI202610069897D');
  if v_n <> 0 then
    raise exception 'Aparecieron % movimiento(s) de inventario de esas órdenes. Se deshace todo.', v_n;
  end if;
end
$arreglar$;

do $comprobar$
declare v int;
begin
  -- No puede quedar nada nombrando a las dos órdenes borradas.
  select count(*) into v from public.pedidodetalle_ocargue where ocargue = 'AVI202610069897';
  if v > 0 then raise exception 'Quedan % atribución(es) en la orden madre. Se deshace todo.', v; end if;
  select count(*) into v from public.pedidosdetalle where ocargue = 'AVI202610069897';
  if v > 0 then raise exception 'Quedan % línea(s) de pedido en la orden madre. Se deshace todo.', v; end if;
  select count(*) into v from public.pedidoscabecera where ocargue = 'AVI202610069897';
  if v > 0 then raise exception 'Quedan % cabecera(s) de pedido en la orden madre. Se deshace todo.', v; end if;
  select count(*) into v from public.citasvehiculos where ocargue = 'AVI202610069897';
  if v > 0 then raise exception 'Queda % cita(s) en la orden madre. Se deshace todo.', v; end if;
  select count(*) into v from public.historicolotes where ordendecargue in ('AVI202610069897','MOL202609289628');
  if v > 0 then raise exception 'Quedan % asignación(es) de lote sin orden. Se deshace todo.', v; end if;

  -- Y el clon tiene que seguir ahí, con su facturación.
  if not exists (select 1 from public.cabeceraoc where id = 9900 and ordendecargue = 'AVI202610069897D') then
    raise exception 'El clon desapareció. Se deshace todo.';
  end if;
  select count(*) into v from public.facturacion where numeroorden = 'AVI202610069897D';
  if v <> 8 then raise exception 'La facturación del clon quedó en % líneas y eran 8. Se deshace todo.', v; end if;

  -- Las 8 atribuciones siguen sumando 114 unidades, ahora en la orden viva.
  select coalesce(sum(unidades), 0) into v from public.pedidodetalle_ocargue where ocargue = 'AVI202610069897D';
  if v <> 114 then raise exception 'El libro quedó en % unidades y eran 114. Se deshace todo.', v; end if;

  -- Los 4 pedidos de ID2 siguen entregados (no se liberó ninguno) y el 12004 de ID3 igual.
  select count(*) into v from public.pedidosdetalle
   where transid in (25090,25091,25413,25414,25415,25460,25461,25615,24798)
     and (unidadescargadas is null or estado is distinct from 'cerrado');
  if v > 0 then raise exception '% línea(s) de pedido se descargaron sin querer. Se deshace todo.', v; end if;

  raise notice 'LISTO. El rastro de ID2 quedó ligado a la orden que de verdad entregó y factura; ID3 ya no tiene asignación huérfana; ni el inventario ni la facturación ni los pedidos se movieron.';
end
$comprobar$;

commit;

-- ---------------------------------------------------------------------
-- PASO 3 — DESPUÉS. Las mismas consultas del paso 1.
-- ---------------------------------------------------------------------
select id, transid, idpedido, ocargue, idorden, unidades
from public.pedidodetalle_ocargue where id in (20008,20009,20010,20011,20012,20013,20014,20015) order by id;
-- Esperado: las 8 en AVI202610069897D con idorden 9900, sumando 114.

select idpedido, estado, aprobado, ocargue, vehiculo from public.pedidoscabecera
where idpedido in (12138,12271,12291,12348) order by idpedido;
-- Esperado: las 4 en AVI202610069897D, mismo vehículo QHC437.

-- `valor_a_facturar` es TEXTO en la vista, así que hay que convertirlo (esta misma consulta se
-- cayó con "42883: function sum(text) does not exist" el 2026-10-10; fue DESPUÉS del commit, así
-- que el arreglo ya se había aplicado). El filtro nunca lanza: lo que no sea un número va a cero.
select count(*) as facturacion_del_clon, coalesce(sum(toneladas),0) as toneladas,
       coalesce(sum(case when btrim(valor_a_facturar::text) ~ '^-?[0-9]+(\.[0-9]+)?$'
                         then btrim(valor_a_facturar::text)::numeric else 0 end), 0) as valor
from public.facturacion where numeroorden = 'AVI202610069897D';
-- Esperado: 8 líneas, 4,4397 t, $183.324. Intacto.

select count(*) as asignaciones_huerfanas from public.historicolotes
where ordendecargue in ('AVI202610069897','MOL202609289628');  -- esperado: 0

-- El inventario, idéntico al paso 1.
select idempresa, count(*) as movimientos,
       coalesce(sum(cantidad) filter (where tipomov = 'Entrada'), 0) as entradas,
       coalesce(sum(cantidad) filter (where tipomov = 'Salida'), 0) as salidas
from public.invtrans where idempresa in (2,3) group by idempresa order by idempresa;
