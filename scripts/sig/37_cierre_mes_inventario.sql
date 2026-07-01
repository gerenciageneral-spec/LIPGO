-- =====================================================================
-- SIG - Cierre mensual de inventario (conciliación + soporte PDF)
-- Un registro por proyecto/sitio y mes (YYYY-MM). El PDF vive en Storage:
--   archivos/inventario/cierres/{proyecto_id}/{mes}/acta-conciliacion.pdf
-- Aditivo e idempotente.
-- =====================================================================

create table if not exists public.sig_inventario_cierre_mes (
  id serial primary key,
  proyecto_id int not null,
  mes text not null,                    -- '2026-01'
  estado text default 'pendiente',    -- pendiente | conciliado
  saldo_inicial numeric default 0,
  ingresos numeric default 0,
  cargue numeric default 0,
  merma numeric default 0,
  salidas numeric default 0,            -- cargue + merma
  saldo_final numeric default 0,
  faltante numeric default 0,
  ajuste numeric default 0,
  produccion numeric default 0,
  devolucion numeric default 0,
  documento_url text,
  firmante text,
  fecha_firma date,
  observaciones text,
  cerrado_por text,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique (proyecto_id, mes)
);

create index if not exists idx_sig_cierre_mes_proy on public.sig_inventario_cierre_mes (proyecto_id);
create index if not exists idx_sig_cierre_mes_mes on public.sig_inventario_cierre_mes (mes);

-- =====================================================================
-- FIN. Módulo Panel LIP · Inventario → pestaña Conciliación mensual.
-- =====================================================================
