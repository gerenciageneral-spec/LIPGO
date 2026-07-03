-- =====================================================================
-- 49 — Confirmación de lectura del Reglamento Interno de Trabajo
-- ----------------------------------------------------------------------------
-- El módulo "Reglamento Interno" del Portal del Trabajador (inicio del portal)
-- permite al colaborador leer el reglamento (PDF) y confirmar que lo leyó y
-- comprendió. Esa confirmación se guarda en `headcount.reglamentocheck`
-- (boolean). Se empareja por `identificacion`.
--   * getReglamentoCheck      -> SELECT reglamentocheck
--   * confirmarReglamentoLeido-> UPDATE reglamentocheck = true
-- (lib/portal-actions.ts, vía cliente admin / service_role).
-- Aditivo e idempotente.
-- =====================================================================

alter table public.headcount
  add column if not exists reglamentocheck boolean not null default false;

-- =====================================================================
-- FIN.
-- =====================================================================
