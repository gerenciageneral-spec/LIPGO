-- =====================================================================
-- Campo `facturar` en cabeceraoc: decisión de Packing para las órdenes de
-- DISTRIBUCIÓN. Cuando el conductor va solo (sin auxiliares) no hay servicio de
-- distribución que cobrar → en Packing se DESMARCA "Facturar" (facturar=false) y
-- esa distribución NO aparece en Gestión de Facturas (solo se cobra el cargue).
--   · null / true  → SÍ se factura (por defecto encendido)
--   · false        → NO se factura
-- Solo aplica a Distribucion; Cargue/Descargue no se ven afectados.
-- Aditivo e idempotente.
-- =====================================================================

alter table public.cabeceraoc
  add column if not exists facturar boolean;
