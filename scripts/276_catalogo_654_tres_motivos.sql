
-- =====================================================================
-- 276_catalogo_654_tres_motivos.sql
--
-- El 654 (Devolución por mal cargue) pasó de dos motivos a TRES, y cada uno hace algo distinto.
-- Este script actualiza el texto que se lee en pantalla para que diga lo que el código hace.
--
-- POR QUÉ HACE FALTA UN SQL: la descripción del código en Transacciones de Inventario no sale de
-- la app, sale de la tabla `sig_tipos_movimiento` (`getCatalogoTransacciones`). El texto viejo
-- decía solo "el camión cargó MENOS", y con eso un coordinador no sabría cuándo marcar
-- "cantidad de más" — que es justo el motivo que NO le baja el peso a la orden.
--
-- LOS TRES MOTIVOS (regla de gerencia 2026-10-09). La cuadrilla cobra por el peso que cargó de
-- verdad al camión:
--   · Trocado             → inventario SÍ · pedido SÍ · peso de la orden y nómina SÍ bajan
--   · Cantidad de más     → inventario SÍ · pedido SÍ · peso y nómina NO se tocan (sí lo cargó)
--   · Cantidad de menos   → inventario SÍ · pedido SÍ · peso de la orden y nómina SÍ bajan
--
-- ES SOLO TEXTO. No toca inventario, ni permisos, ni ningún movimiento. No cambia ningún otro
-- código. Idempotente: se puede correr dos veces. Va junto con el despliegue.
-- =====================================================================

-- ---------------------------------------------------------------------
-- PASO 1 — ANTES.
-- ---------------------------------------------------------------------
select codigo_sap, nombre, clase, afecta_stock, activo, descripcion
from public.sig_tipos_movimiento
where codigo_sap = '654';
-- Esperado: una fila, con la descripción vieja (la que habla solo de "cargó MENOS").

-- ---------------------------------------------------------------------
-- PASO 2 — EL TEXTO NUEVO.
-- ---------------------------------------------------------------------
begin;

do $texto$
declare
  c_desc constant text :=
    'La orden descontó producto que el cliente no recibió: se trocó, volvió en el mismo camión o nunca se cargó. '
    || 'Se escoge la orden y de ella salen el producto, el lote y el tope. En los tres casos el producto entra al '
    || 'inventario y el pedido lo recupera como pendiente. EL MOTIVO DECIDE EL PAGO: con «trocado» y «cantidad de '
    || 'menos» ese peso nunca se cargó al camión, así que el peso de la orden baja y la nómina de los auxiliares con '
    || 'él (solo si la quincena sigue abierta); con «cantidad de más» el peso NO se toca, porque la cuadrilla sí lo '
    || 'cargó. Distinto del 653, que es una devolución del cliente y no toca el pedido.';
  v_filas int;
begin
  update public.sig_tipos_movimiento
     set descripcion = c_desc,
         nombre = 'Devolución por mal cargue',
         clase = 'entrada',
         afecta_stock = true,
         activo = true
   where codigo_sap = '654';
  get diagnostics v_filas = row_count;

  if v_filas = 0 then
    raise exception 'No existe la fila del 654 en el catálogo: corre antes el script 275. Se deshace todo.';
  end if;
  raise notice 'Descripción del 654 actualizada (% fila).', v_filas;
end
$texto$;

do $comprobar$
begin
  -- El texto tiene que nombrar los tres motivos: es lo único que el coordinador va a leer.
  if not exists (
    select 1 from public.sig_tipos_movimiento
     where codigo_sap = '654' and activo
       and descripcion ilike '%trocado%'
       and descripcion ilike '%cantidad de m_s%'
       and descripcion ilike '%cantidad de menos%'
  ) then
    raise exception 'La descripción del 654 no nombra los tres motivos. Se deshace todo.';
  end if;
  -- El permiso sigue donde estaba: este script no lo toca, solo se asegura de que esté.
  if not exists (select 1 from public.autorizacion_procesos where codigo = 'inv_654' and activo) then
    raise exception 'Falta el proceso inv_654: corre antes el script 272. Se deshace todo.';
  end if;
  raise notice 'LISTO. El 654 explica sus tres motivos en pantalla.';
end
$comprobar$;

commit;

-- ---------------------------------------------------------------------
-- PASO 3 — DESPUÉS.
-- ---------------------------------------------------------------------
select codigo_sap, nombre, clase, afecta_stock, activo, descripcion
from public.sig_tipos_movimiento
where codigo_sap = '654';
-- Esperado: la descripción nueva, con los tres motivos y la advertencia del peso.
