-- =====================================================================
-- 52 — Transacciones por Código (estilo SAP) + registro de correcciones
-- ----------------------------------------------------------------------------
-- (a) Amplía el catálogo `sig_tipos_movimiento` con los códigos de
--     corrección/reverso/bloqueo (los arreglos que hoy se hacen directo en
--     Supabase sin trazabilidad). La columna real del catálogo es
--     `codigo_sap` (verificado 2026-08-08 — el rename a `codigo` del SQL 17
--     nunca aplicó).
-- (b) Crea `inv_correcciones_log`: el registro revisable de TODO movimiento
--     ejecutado desde la pantalla "Movimiento por código" (quién, cuándo,
--     qué, por qué, y los ids de invtrans generados) — se consulta sin
--     tocar invtrans. El event-trigger de auditoría (04b) le adjunta
--     trg_auditoria automáticamente.
-- Aditivo e idempotente.
-- =====================================================================

-- (a) Códigos nuevos del catálogo -------------------------------------------

insert into public.sig_tipos_movimiento (codigo_sap, nombre, clase, origen_lipgo, descripcion, afecta_stock, orden, activo)
select '102', 'Reverso de ingreso (anulación)', 'correccion',
       'tipomov=Salida · origen: transaccion manual · marcador [rev#id]',
       'Anula total o parcialmente un INGRESO digitado mal (malos ingresos). Genera una salida que referencia el movimiento original; no se puede reversar más de lo ingresado.',
       true, 8, true
where not exists (select 1 from public.sig_tipos_movimiento where codigo_sap = '102');

insert into public.sig_tipos_movimiento (codigo_sap, nombre, clase, origen_lipgo, descripcion, afecta_stock, orden, activo)
select '602', 'Reverso de salida (anulación)', 'correccion',
       'tipomov=Entrada · origen: transaccion manual · marcador [rev#id]',
       'Anula total o parcialmente una SALIDA digitada mal (ej. despacho doble). Genera una entrada que referencia el movimiento original.',
       true, 9, true
where not exists (select 1 from public.sig_tipos_movimiento where codigo_sap = '602');

insert into public.sig_tipos_movimiento (codigo_sap, nombre, clase, origen_lipgo, descripcion, afecta_stock, orden, activo)
select '552', 'Reverso de merma / reproceso', 'correccion',
       'tipomov=Entrada · origen: transaccion manual · marcador [rev#id]',
       'Anula una merma/reproceso registrado por error. Genera una entrada que referencia el movimiento original y compensa la tabla de reprocesos.',
       true, 10, true
where not exists (select 1 from public.sig_tipos_movimiento where codigo_sap = '552');

insert into public.sig_tipos_movimiento (codigo_sap, nombre, clase, origen_lipgo, descripcion, afecta_stock, orden, activo)
select '309', 'Corrección de lote / reclasificación', 'correccion',
       'par Salida+Entrada · origen: transaccion manual · neto 0',
       'Mueve una cantidad del lote/producto/ubicación EQUIVOCADO al correcto (corrección de lote, de código de producto o de ubicación mal digitada). No cambia el total del inventario.',
       false, 11, true
where not exists (select 1 from public.sig_tipos_movimiento where codigo_sap = '309');

insert into public.sig_tipos_movimiento (codigo_sap, nombre, clase, origen_lipgo, descripcion, afecta_stock, orden, activo)
select '312', 'Reverso de traslado', 'correccion',
       'par Salida+Entrada · origen: transaccion manual · neto 0',
       'Devuelve un traslado de ubicación (311) hecho por error: la cantidad regresa de la ubicación destino a la de origen.',
       false, 12, true
where not exists (select 1 from public.sig_tipos_movimiento where codigo_sap = '312');

insert into public.sig_tipos_movimiento (codigo_sap, nombre, clase, origen_lipgo, descripcion, afecta_stock, orden, activo)
select '653', 'Devolución de cliente', 'entrada',
       'tipomov=Entrada · origen: transaccion manual',
       'Reingreso de producto devuelto por el cliente (distinto de la recepción 101). Puede referenciar la orden de cargue con la que salió.',
       true, 13, true
where not exists (select 1 from public.sig_tipos_movimiento where codigo_sap = '653');

insert into public.sig_tipos_movimiento (codigo_sap, nombre, clase, origen_lipgo, descripcion, afecta_stock, orden, activo)
select '344', 'Bloqueo / cuarentena de stock', 'bloqueo',
       'par Salida+Entrada hacia ubicación CUARENTENA · neto 0',
       'Retiene producto (calidad, vencimiento, revisión) moviéndolo a la ubicación CUARENTENA sin sacarlo del inventario. Requiere que exista una ubicación CUARENTENA en Configuración.',
       false, 14, true
where not exists (select 1 from public.sig_tipos_movimiento where codigo_sap = '344');

insert into public.sig_tipos_movimiento (codigo_sap, nombre, clase, origen_lipgo, descripcion, afecta_stock, orden, activo)
select '343', 'Desbloqueo de stock', 'bloqueo',
       'par Salida+Entrada desde ubicación CUARENTENA · neto 0',
       'Libera producto retenido: lo devuelve de CUARENTENA a una ubicación normal.',
       false, 15, true
where not exists (select 1 from public.sig_tipos_movimiento where codigo_sap = '343');

-- (b) Registro de correcciones ----------------------------------------------

create table if not exists public.inv_correcciones_log (
  id serial primary key,
  idempresa int not null,
  codigo text not null,                 -- 101/601/…/309/102/602/552/312/653/344/343
  ref_invtrans_id bigint,               -- movimiento original (reversos)
  codproducto text,
  producto text,
  lote_origen text,
  location_origen text,
  codproducto_destino text,             -- solo 309 si cambia el producto
  producto_destino text,
  lote_destino text,                    -- 309/311/312/344/343
  location_destino text,
  cantidad numeric not null,
  motivo text,
  realizado_por text not null,          -- usuario de la sesión
  autorizado_por text,                  -- responsable de la clave (solo códigos de corrección)
  invtrans_ids jsonb,                   -- ids generados en invtrans (evidencia)
  created_at timestamptz default now()
);

create index if not exists idx_inv_corr_log_emp on public.inv_correcciones_log (idempresa);
create index if not exists idx_inv_corr_log_cod on public.inv_correcciones_log (codigo);
create index if not exists idx_inv_corr_log_fecha on public.inv_correcciones_log (created_at);

alter table public.inv_correcciones_log disable row level security;

-- =====================================================================
-- FIN. Módulo Transacciones de Inventario → pestaña "Movimiento por código".
-- =====================================================================
