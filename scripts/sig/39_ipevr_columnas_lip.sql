-- =====================================================================
-- 39 · IPEVR — columnas ricas del formato original LIP (SST-MA-002 / GTC-45)
-- Separa tarea/especificación, las 5 medidas de intervención por jerarquía y
-- la gestión del cambio (plan de acción + % de cumplimiento).
-- Aditivo e idempotente. Correr en Supabase.
-- =====================================================================

-- Contexto
alter table public.sst_ipevr add column if not exists tarea         text;
alter table public.sst_ipevr add column if not exists especificacion text;

-- Medidas de intervención propuestas (jerarquía de controles)
alter table public.sst_ipevr add column if not exists medida_eliminacion     text;
alter table public.sst_ipevr add column if not exists medida_sustitucion     text;
alter table public.sst_ipevr add column if not exists control_ingenieria     text;
alter table public.sst_ipevr add column if not exists control_administrativo text;
alter table public.sst_ipevr add column if not exists medida_epp             text;

-- Gestión del cambio (seguimiento del plan de acción)
alter table public.sst_ipevr add column if not exists gc_plan_accion            text;
alter table public.sst_ipevr add column if not exists gc_fecha_implementacion   text;
alter table public.sst_ipevr add column if not exists gc_tipo_plan              text;   -- jerarquización del control
alter table public.sst_ipevr add column if not exists gc_controles_propuestos   text;
alter table public.sst_ipevr add column if not exists gc_controles_implementados text;
alter table public.sst_ipevr add column if not exists gc_pct_cumplimiento       numeric;

-- =====================================================================
-- FIN. Módulo Certificaciones → IPEVR (formato LIP SST-MA-002).
-- =====================================================================
