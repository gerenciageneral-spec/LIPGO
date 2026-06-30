-- =====================================================================
-- LIPgo - Código de tipo de movimiento en invtrans (identificación auditable)
-- Agrega invtrans.cod_movimiento, lo backfillea hacia atrás según el
-- origen/tipomov, y crea un trigger para que los movimientos NUEVOS lo
-- calculen automáticamente. Nomenclatura: ver sig_tipos_movimiento.
-- Aditivo e idempotente. (Tabla operativa: la columna es nullable y el
-- trigger solo asigna cuando viene en null, no altera la operación.)
-- =====================================================================

alter table public.invtrans add column if not exists cod_movimiento text;

-- Función de clasificación (misma lógica del catálogo sig_tipos_movimiento).
create or replace function public.lipgo_cod_movimiento(p_tipomov text, p_origen text)
returns text language sql immutable as $$
  select case
    when p_tipomov = 'Reproceso' or lower(coalesce(p_origen,'')) like '%reproceso%' then '551'
    when lower(coalesce(p_origen,'')) like '%inicial%' then '561'
    when lower(coalesce(p_origen,'')) like '%traslado entre localizaciones%' then '311'
    when p_tipomov = 'Entrada' and (lower(coalesce(p_origen,'')) like '%producc%' or lower(coalesce(p_origen,'')) like '%aprob%' or lower(coalesce(p_origen,'')) like '%descarg%' or lower(coalesce(p_origen,'')) like '%logo%') then '101'
    when p_tipomov = 'Salida' and lower(coalesce(p_origen,'')) like '%orden de cargue%' then '601'
    when p_tipomov = 'Entrada' then '701'   -- ajuste/entrada manual (sobrante)
    when p_tipomov = 'Salida' then '702'    -- ajuste/salida manual (faltante)
    else null
  end;
$$;

-- Backfill hacia atrás (solo donde está vacío).
update public.invtrans
  set cod_movimiento = public.lipgo_cod_movimiento(tipomov, origen)
  where cod_movimiento is null;

-- Trigger para movimientos nuevos / actualizados (solo si viene en null).
create or replace function public.trg_set_cod_movimiento()
returns trigger language plpgsql as $$
begin
  if NEW.cod_movimiento is null then
    NEW.cod_movimiento := public.lipgo_cod_movimiento(NEW.tipomov, NEW.origen);
  end if;
  return NEW;
end; $$;

drop trigger if exists set_cod_movimiento on public.invtrans;
create trigger set_cod_movimiento before insert or update on public.invtrans
  for each row execute function public.trg_set_cod_movimiento();

-- Verificación (opcional):
-- select cod_movimiento, count(*) from invtrans group by cod_movimiento order by 1;
-- =====================================================================
-- FIN.
-- =====================================================================
