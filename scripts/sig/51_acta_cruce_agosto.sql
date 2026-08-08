-- =====================================================================
-- 51 — Acta de Cruce de Inventario (apertura de mes, congelado real)
-- ----------------------------------------------------------------------------
-- Tabla dedicada y separada del Cuadre mensual (decisión del cliente,
-- 2026-08-08): registra, POR LOTE Y UBICACIÓN (el nivel más relevante para
-- ajustar), el inventario con el que ABRE un mes (hoy: agosto/2026,
-- congelado desde el stock vivo retrocedido por los movimientos del mes en
-- curso — archivo físico real para ID3 anclando el total por producto,
-- cálculo desde kardex para ID1/ID2/ID4, ver memoria del proyecto).
--
-- Esta tabla ALIMENTA y puede AJUSTAR invtrans (y por lo tanto todas las
-- tablas de inventario que dependen de él): si se necesita corregir un
-- valor, la corrección NO se edita aquí directo — pasa por el ÚNICO
-- formulario sancionado para mover inventario (sig_inventario_ajuste →
-- aprobarAjusteInventario → invtrans, mismo mecanismo que "Cuadre y
-- Correcciones"). Esta tabla queda enlazada (invtrans_id) como evidencia.
-- Aditivo e idempotente.
-- =====================================================================

create table if not exists public.sig_inventario_acta_cruce (
  id serial primary key,
  proyecto_id int not null,
  mes text not null,                    -- '2026-08' (mes que ABRE con este cruce)
  fecha_corte date not null,            -- '2026-08-01'
  origen text default 'calculado',      -- 'archivo_fisico' | 'calculado'
  estado text default 'borrador',       -- borrador | firmado
  firmante text,
  firmante_cargo text,
  firma_url text,
  fecha_firma date,
  observaciones text,
  creado_por text,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique (proyecto_id, mes)
);

create table if not exists public.sig_inventario_acta_cruce_detalle (
  id serial primary key,
  acta_id int not null references public.sig_inventario_acta_cruce(id) on delete cascade,
  codproducto text not null,
  producto text,
  lote text not null default '',
  location text not null default '',
  sistema_original numeric not null default 0,  -- valor con el que se creó el cruce (congelado)
  fisico_actual numeric not null default 0,     -- valor vigente (editable vía corrección sancionada)
  diferencia numeric not null default 0,        -- fisico_actual - sistema_original
  corregido boolean default false,
  motivo_correccion text,
  invtrans_id int,                              -- movimiento real generado al aprobar la corrección
  corregido_por text,
  corregido_fecha timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique (acta_id, codproducto, lote, location)
);

create index if not exists idx_acta_cruce_proy on public.sig_inventario_acta_cruce (proyecto_id);
create index if not exists idx_acta_cruce_det_acta on public.sig_inventario_acta_cruce_detalle (acta_id);
create index if not exists idx_acta_cruce_det_cod on public.sig_inventario_acta_cruce_detalle (codproducto);

-- =====================================================================
-- FIN. Módulo Panel LIP · Inventario → pestaña Acta de Cruce.
-- =====================================================================
