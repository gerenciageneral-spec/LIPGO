-- =====================================================================
-- SIG - Ajuste de Inventario: campos para formulario guiado + aprobación
-- Enriquece sig_inventario_ajuste para que el ajuste respete la
-- configuración de LIPgo (ubicación), registre la dirección (ingreso/salida),
-- el código de transacción de la nomenclatura (cod_movimiento) y el flujo de
-- aprobación (quién aprueba y cuándo). Aditivo e idempotente.
-- =====================================================================

alter table public.sig_inventario_ajuste add column if not exists location text;          -- ubicación (config LIPgo)
alter table public.sig_inventario_ajuste add column if not exists direccion text;          -- ingreso | salida
alter table public.sig_inventario_ajuste add column if not exists cod_movimiento text;     -- código de transacción (nomenclatura)
alter table public.sig_inventario_ajuste add column if not exists aprobado_por text;        -- usuario que aprueba
alter table public.sig_inventario_ajuste add column if not exists aprobado_fecha timestamptz;
alter table public.sig_inventario_ajuste add column if not exists invtrans_id bigint;       -- movimiento real generado al aprobar (mueve stock; evita doble conteo)

-- Backfill de dirección a partir del signo de la cantidad (histórico).
update public.sig_inventario_ajuste
   set direccion = case when coalesce(cantidad,0) < 0 then 'salida' else 'ingreso' end
 where direccion is null;

-- Backfill del código de transacción a partir del tipo semántico (histórico).
update public.sig_inventario_ajuste
   set cod_movimiento = case tipo
        when 'faltante'   then '702'
        when 'sobrante'   then '701'
        when 'averia'     then '551'
        when 'devolucion' then '101'
        when 'correccion' then case when coalesce(cantidad,0) < 0 then '702' else '701' end
        else null end
 where cod_movimiento is null;

create index if not exists idx_sig_ajuste_estado on public.sig_inventario_ajuste (estado);

-- =====================================================================
-- FIN. Campos de ajuste guiado + aprobación.
-- =====================================================================
