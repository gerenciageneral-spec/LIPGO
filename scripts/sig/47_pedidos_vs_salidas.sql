-- =====================================================================
-- 47 — Conciliación PEDIDOS (cargados) vs SALIDAS (invtrans)
-- ----------------------------------------------------------------------------
-- Control de integridad comercial↔logístico: valida que lo marcado como
-- CARGADO en los pedidos (pedidosdetalle.unidadescargadas) efectivamente SALIÓ
-- del inventario (invtrans, tipomov='Salida', status aprobado).
--
-- CRUCE por (ocargue, producto) — SIN incluir la empresa en la llave, porque el
-- id_empresa puede venir mal etiquetado entre pedido y salida; el ocargue es la
-- clave real del despacho. Si coincide todo excepto la empresa, se toma como
-- COINCIDENCIA: se conserva el idempresa de INVTRANS y se marca 'empresa_distinta'.
--
-- 'estado_alerta':
--   OK                -> cargado = salida (incluye ambos = 0, y coincidencias cruzadas de empresa)
--   CANTIDAD_DIFERENTE-> ambos existen pero difieren
--   PEDIDO_SIN_SALIDA -> hay pedido cargado sin salida en invtrans
--   SALIDA_SIN_PEDIDO -> hay salida en invtrans sin pedido (INFORMATIVA, no es
--                        diferencia: salió con orden de cargue+lote+aprobada, el
--                        producto salió; el pedido probablemente fue borrado)
--
-- Reglas (confirmadas con el negocio):
--   * Cantidad de pedido = unidadescargadas (la poblada; unidades_cargadas es
--     legado → COALESCE). 'unidades' se expone como referencia (pedidas).
--   * Salidas válidas: tipomov='Salida' y status LIKE 'aprob%' (solo aprobado).
--   * Se excluyen pedidos anulados (estado en detalle O cabecera).
--   * Nombre de producto normalizado (upper+trim) para reducir falsos desajustes.
--   * Ambos valores en 0 (pedido y salida) => OK.
--
-- Se lee vía service role (getSupabaseAdmin); RLS se omite ahí. Solo lectura;
-- NO toca invtrans ni el físico. Aditivo/idempotente (create or replace view).
-- =====================================================================

-- Se elimina primero porque cambian columnas/orden (CREATE OR REPLACE no permite
-- reordenar). Es una VISTA (no tiene datos) → borrarla no afecta el inventario.
drop view if exists public.v_pedidos_vs_salidas;

create view public.v_pedidos_vs_salidas as
with ped as (
  select
    pd.ocargue                                      as ocargue,
    upper(trim(pd.producto))                        as prod_key,
    max(pd.id_empresa)                              as idempresa_pedido,
    max(pd.producto)                                as producto,
    sum(coalesce(pd.unidadescargadas, pd.unidades_cargadas, 0)) as ped_cargadas,
    sum(coalesce(pd.unidades, 0))                   as ped_unidades,
    -- El pedido/línea se considera CERRADO si todas las líneas están cerrado/entregado.
    bool_and(lower(coalesce(pd.estado, '')) in ('cerrado', 'entregado')) as pedido_cerrado,
    max(pd.estado)                                  as estado_pedido
  from public.pedidosdetalle pd
  left join public.pedidoscabecera pc on pc.idpedido = pd.idpedido
  where pd.ocargue is not null and btrim(pd.ocargue) <> ''
    and lower(coalesce(pd.estado, '')) not in ('anulado', 'anulada')
    and lower(coalesce(pc.estado, '')) not in ('anulado', 'anulada')
  group by pd.ocargue, upper(trim(pd.producto))
),
sal as (
  select
    it.ocargue                                      as ocargue,
    upper(trim(it.nombreproducto))                  as prod_key,
    max(it.idempresa)                               as idempresa_salida,
    max(it.nombreproducto)                          as nombreproducto,
    sum(coalesce(it.cantidad, 0))                   as salida_qty,
    -- ¿la salida tiene lote asignado? confirma que el proceso (cargue+lote) se completó.
    bool_or(btrim(coalesce(it.lote, '')) <> '')     as salida_con_lote
  from public.invtrans it
  where it.tipomov = 'Salida'
    and lower(coalesce(it.status, '')) like 'aprob%'
    and it.ocargue is not null and btrim(it.ocargue) <> ''
    and coalesce(it.location, '') <> 'AJUSTE-SIG'
  group by it.ocargue, upper(trim(it.nombreproducto))
)
select
  coalesce(s.idempresa_salida, p.idempresa_pedido)  as idempresa,  -- se conserva el de INVTRANS
  p.idempresa_pedido                                as idempresa_pedido,
  s.idempresa_salida                                as idempresa_salida,
  coalesce(p.ocargue, s.ocargue)                    as ocargue,
  coalesce(p.producto, s.nombreproducto)            as producto,
  coalesce(p.ped_unidades, 0)                       as ped_unidades,
  coalesce(p.ped_cargadas, 0)                       as ped_cargadas,
  coalesce(s.salida_qty, 0)                         as salida_qty,
  round(coalesce(p.ped_cargadas, 0) - coalesce(s.salida_qty, 0)) as diferencia,
  greatest(round(coalesce(p.ped_unidades, 0) - coalesce(p.ped_cargadas, 0)), 0) as pendiente_despacho,
  coalesce(p.pedido_cerrado, false)                 as pedido_cerrado,
  p.estado_pedido                                   as estado_pedido,
  coalesce(s.salida_con_lote, false)                as salida_con_lote,
  (p.idempresa_pedido is not null and s.idempresa_salida is not null
    and p.idempresa_pedido <> s.idempresa_salida)   as empresa_distinta,
  case
    when coalesce(p.ped_cargadas, 0) = 0 and coalesce(s.salida_qty, 0) = 0 then 'OK'
    when p.prod_key is null then 'SALIDA_SIN_PEDIDO'
    when s.prod_key is null then 'PEDIDO_SIN_SALIDA'
    -- Integridad: lo cargado debe = lo que salió del inventario.
    when round(coalesce(p.ped_cargadas, 0) - coalesce(s.salida_qty, 0)) <> 0 then 'CANTIDAD_DIFERENTE'
    -- Aquí cargadas = salida (integridad OK). Si se pidió más de lo cargado:
    --   pedido cerrado  -> el cliente aceptó el parcial y cerró -> OK (no es diferencia)
    --   pedido abierto  -> falta despachar -> PENDIENTE_DESPACHO (tampoco es diferencia)
    when round(coalesce(p.ped_unidades, 0) - coalesce(p.ped_cargadas, 0)) > 0
      then case when coalesce(p.pedido_cerrado, false) then 'OK' else 'PENDIENTE_DESPACHO' end
    else 'OK'
  end                                               as estado_alerta
from ped p
full outer join sal s
  on s.ocargue = p.ocargue and s.prod_key = p.prod_key;

-- =====================================================================
-- FIN. Se consume en Panel LIP · Inventario → pestaña
-- "Conciliación pedidos vs salidas" (getConciliacionPedidosVsSalidas).
-- =====================================================================
