-- =====================================================================
-- 48 — Firma digital en el acta de cierre mensual de inventario
-- ----------------------------------------------------------------------------
-- Agrega el soporte de firma digital al cierre: la imagen de la firma (PNG en
-- el bucket archivos/firmas/) y el cargo del firmante. El nombre del firmante y
-- la fecha de firma ya existen (firmante, fecha_firma, cerrado_por, SQL 37).
-- Aditivo e idempotente.
-- =====================================================================

alter table public.sig_inventario_cierre_mes
  add column if not exists firma_url       text,   -- PNG de la firma (archivos/firmas/)
  add column if not exists firmante_cargo  text;   -- cargo de quien firma

-- =====================================================================
-- FIN.
-- =====================================================================
