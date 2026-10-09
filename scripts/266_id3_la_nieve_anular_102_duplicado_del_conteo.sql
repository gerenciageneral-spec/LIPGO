
-- =====================================================================
-- 266_id3_la_nieve_anular_102_duplicado_del_conteo.sql
--
-- ID3 (Cedi Funza). Anula el movimiento 102 #33805 (reverso de 116 und de PT LA NIEVE 25LB,
-- lote 20260916 A2, hecho el 1-oct-2026 a las 15:03) porque descuenta por SEGUNDA vez un
-- faltante que el Conteo total #39 del 1-oct ya había absorbido.
--
-- Autorizado por gerencia el 2026-10-08: "el 102 del 1 de octubre es un movimiento del 30:
-- eso se le debía descontar al inventario inicial del mes, es decir al conteo 39 del CEDI;
-- por eso tienes ese positivo".
-- Corrección POR LLAVE PRIMARIA, estado esperado verificado antes, antes/después impreso y
-- comprobación de coherencia al final. Idempotente. No borra: la fila queda con status
-- 'rechazado' y la razón escrita, igual que un ingreso rechazado, y el saldo deja de contarla.
-- =====================================================================
--
-- LOS NÚMEROS
--   · 29-sep 08:33  entra el descargue R-06557: 1.500 und de La Nieve al lote 20260916 (#33251).
--   · 1-oct (amanecer) Conteo total #39: físico 18.520 contra 18.659 del sistema = −139, que
--     incluye las 116 que "no llegaron" (ajustes del conteo ya posteados: 20260918 −509,
--     20260914 +370). Desde ese momento el sistema ya NO tiene esas 116.
--   · 1-oct 15:03  el coordinador hace el 102 #33805 "material no llegó, faltante de 116"
--     contra #33251: las mismas 116 salen OTRA vez.
--   · 8-oct  hoja de gerencia: físico 17.092 + 1 avería = 17.093 contra 16.970 en LIPgo:
--     +123 = las 116 descontadas dos veces + 7 de diferencia física.
--
-- RESULTADO ESPERADO: La Nieve 25LB pasa de 16.970 a 17.086 (lote 20260916 A2: 5.242 → 5.358).
-- Contra el físico de hoy queda +7. El conteo #39 no se toca. Ningún otro producto cambia.
-- =====================================================================

-- ---------------------------------------------------------------------
-- PASO 1 — ANTES.
-- ---------------------------------------------------------------------
select id, nombreproducto, lote, location, cantidad, tipomov, cod_movimiento, status,
       creado, creadopor, observaciones
from public.invtrans
where id in (33251, 33805)
order by id;

select lote, location, stock_actual
from public.saldoinvdetalle
where idempresa = 3 and nombreproducto = 'PT LA NIEVE 25LB'
order by lote, location;

-- ---------------------------------------------------------------------
-- PASO 2 — CORRECCIÓN. Todo o nada.
-- ---------------------------------------------------------------------
begin;

do $anular$
declare
  v_total_antes numeric;
  v_total_desp  numeric;
begin
  if exists (select 1 from public.invtrans where id = 33805 and lower(status) = 'rechazado') then
    raise notice 'El 266 ya se corrió: nada que hacer.';
    return;
  end if;

  -- ESTADO ESPERADO de la fila. Si no calza, no se toca nada.
  if not exists (
    select 1 from public.invtrans
     where id = 33805 and idempresa = 3
       and nombreproducto = 'PT LA NIEVE 25LB' and lote = '20260916' and location = 'A2'
       and cantidad = 116 and tipomov = 'Salida' and cod_movimiento::text = '102'
       and lower(status) = 'aprobado'
       and observaciones like '%reversa invtrans #33251%'
  ) then
    raise exception 'invtrans #33805 no está como se esperaba (102 de 116, La Nieve 20260916 A2, aprobado, reversa de #33251): se deshace todo y hay que revisar.';
  end if;

  -- El ingreso original (#33251) debe seguir aprobado con sus 1.500.
  if not exists (select 1 from public.invtrans where id = 33251 and tipomov = 'Entrada' and cantidad = 1500 and lower(status) = 'aprobado' and ocargue = 'R-06557') then
    raise exception 'El ingreso #33251 (R-06557, 1.500 und) no está como se esperaba: se deshace todo.';
  end if;

  -- El conteo #39 tiene que ser la base de octubre y estar aprobado.
  if not exists (select 1 from public.sig_inventario_cuadre where id = 39 and proyecto_id = 3 and tipo = 'total' and activo and estado = 'aprobado' and fecha = '2026-10-01') then
    raise exception 'El conteo #39 no es la base aprobada de octubre en ID3: se deshace todo.';
  end if;

  select coalesce(sum(stock_actual), 0) into v_total_antes
    from public.saldoinvdetalle where idempresa = 3 and nombreproducto = 'PT LA NIEVE 25LB';

  update public.invtrans
     set status = 'rechazado',
         observaciones = coalesce(observaciones, '') ||
           ' · Anulado por 266 (8-oct-2026): el faltante de 116 ya lo absorbió el Conteo total #39 del 1-oct; este 102 lo descontaba por segunda vez.'
   where id = 33805;

  select coalesce(sum(stock_actual), 0) into v_total_desp
    from public.saldoinvdetalle where idempresa = 3 and nombreproducto = 'PT LA NIEVE 25LB';

  if v_total_desp <> v_total_antes + 116 then
    raise exception 'La Nieve debía subir exactamente 116 (de % a %) y quedó en %: se deshace todo.', v_total_antes, v_total_antes + 116, v_total_desp;
  end if;

  raise notice 'LISTO. La Nieve 25LB: % -> % (lote 20260916 A2 +116). El conteo #39 no se tocó.', v_total_antes, v_total_desp;
end
$anular$;

commit;

-- ---------------------------------------------------------------------
-- PASO 3 — DESPUÉS. Esperado: #33805 en 'rechazado'; La Nieve 17.086; lote 20260916 A2 5.358.
-- ---------------------------------------------------------------------
select id, cantidad, status, observaciones from public.invtrans where id = 33805;

select lote, location, stock_actual
from public.saldoinvdetalle
where idempresa = 3 and nombreproducto = 'PT LA NIEVE 25LB'
order by lote, location;

select sum(stock_actual) as la_nieve_total
from public.saldoinvdetalle
where idempresa = 3 and nombreproducto = 'PT LA NIEVE 25LB';
