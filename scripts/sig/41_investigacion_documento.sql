-- =====================================================================
-- 41 · Investigación AT — documento oficial adjunto (ver/descargar)
-- Guarda el enlace al soporte de cada investigación (SST-FOR-21 firmado /
-- original). Se muestra con el "ojito" en Repositorio e Investigación AT.
-- Aditivo e idempotente. Correr en Supabase.
-- =====================================================================

alter table public.sst_incidentes add column if not exists documento_url text;

-- =====================================================================
-- FIN. Módulo Certificaciones → Investigación AT / Investigaciones Realizadas.
-- =====================================================================
