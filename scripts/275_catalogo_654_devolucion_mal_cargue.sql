
-- =====================================================================
-- 275_catalogo_654_devolucion_mal_cargue.sql
--
-- El código 654 (Devolución por mal cargue) aparece en el catálogo de Transacciones de
-- Inventario › Movimiento por código.
--
-- POR QUÉ HACE FALTA: la lista de códigos que se ve en pantalla NO sale del código de la app,
-- sale de la tabla `sig_tipos_movimiento` (`getCatalogoTransacciones`). Al crear el 654 se
-- registró su comportamiento (FIELDSETS), su guía, su pantalla y su permiso (script 272), pero
-- faltó la fila del catálogo — y por eso gerencia no lo encontraba en la pantalla.
--
-- ES PURAMENTE ADITIVO: una fila nueva. No cambia ningún código existente, no toca inventario,
-- no toca permisos. Idempotente. Va ANTES de que nadie busque el 654 en la pantalla.
-- =====================================================================

-- ---------------------------------------------------------------------
-- PASO 1 — ANTES.
-- ---------------------------------------------------------------------
select codigo_sap, nombre, clase, afecta_stock, orden, activo
from public.sig_tipos_movimiento
where codigo_sap in ('653', '654')
order by orden;
-- Esperado: solo el 653.

-- ---------------------------------------------------------------------
-- PASO 2 — LA FILA.
-- ---------------------------------------------------------------------
begin;

do $catalogo$
declare
  c_desc constant text :=
    'El camión cargó MENOS de lo que la orden descontó (se trocó un producto o salió menos cantidad): esas unidades nunca salieron de la bodega, así que vuelven al inventario y el pedido las recupera como pendientes. Se escoge la orden y de ella salen el producto, el lote y el tope. Distinto del 653, que es una devolución del cliente y no toca el pedido.';
  v_id int;
begin
  -- Sin `on conflict`: no está confirmado que `codigo_sap` tenga índice único, y un
  -- `on conflict` sobre una columna sin constraint falla con 42P10. Se mira y se decide.
  if exists (select 1 from public.sig_tipos_movimiento where codigo_sap = '654') then
    update public.sig_tipos_movimiento
       set nombre = 'Devolución por mal cargue',
           clase = 'entrada',
           origen_lipgo = 'tipomov=Entrada · origen: devolución por mal cargue',
           descripcion = c_desc,
           afecta_stock = true,
           activo = true
     where codigo_sap = '654';
    raise notice 'El 654 ya estaba en el catálogo: se actualizó su descripción.';
  else
    -- El id tampoco se asume con secuencia: se toma el siguiente libre.
    select coalesce(max(id), 0) + 1 into v_id from public.sig_tipos_movimiento;
    insert into public.sig_tipos_movimiento (id, codigo_sap, nombre, clase, origen_lipgo, descripcion, afecta_stock, orden, activo)
    values (v_id, '654', 'Devolución por mal cargue', 'entrada',
            'tipomov=Entrada · origen: devolución por mal cargue', c_desc, true,
            (select coalesce(max(orden), 0) + 1 from public.sig_tipos_movimiento), true);
    raise notice 'El 654 entró al catálogo con id %.', v_id;
  end if;
end
$catalogo$;

do $comprobar$
declare
  v int;
begin
  select count(*) into v from public.sig_tipos_movimiento where codigo_sap = '654' and activo;
  if v <> 1 then
    raise exception 'El 654 no quedó en el catálogo: se deshace todo.';
  end if;
  -- El permiso tiene que existir, o el código aparecería en pantalla y fallaría al firmarlo.
  if not exists (select 1 from public.autorizacion_procesos where codigo = 'inv_654' and activo) then
    raise exception 'Falta el proceso inv_654: corre antes el script 272. Se deshace todo.';
  end if;
  raise notice 'LISTO. El 654 ya aparece en Transacciones de Inventario › Movimiento por código.';
end
$comprobar$;

commit;

-- ---------------------------------------------------------------------
-- PASO 3 — DESPUÉS.
-- ---------------------------------------------------------------------
select codigo_sap, nombre, clase, afecta_stock, orden, activo
from public.sig_tipos_movimiento
where activo
order by orden;
-- Esperado: 17 códigos, con el 654 de último.
