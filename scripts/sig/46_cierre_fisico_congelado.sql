-- =====================================================================
-- 46 — Físico congelado al cierre de mes (conciliación "hasta el mes cerrado")
-- ----------------------------------------------------------------------------
-- Problema: saldoinvdetalle es una VISTA en vivo. Al cerrar junio pero ya con
-- operación de julio, el cuadre lote-vs-físico mostraba ruido de julio.
-- Solución: al generar el acta de cierre de un mes, se CONGELA el stock físico
-- de ese momento (total + por lote). El cuadre del periodo cerrado se compara
-- contra ese físico congelado, no contra el vivo. Aditivo e idempotente.
-- =====================================================================

alter table public.sig_inventario_cierre_mes
  add column if not exists fisico_congelado numeric,          -- total PT+SubProd al cierre
  add column if not exists fisico_snapshot  jsonb;            -- { "idproducto|lote": cantidad }

-- =====================================================================
-- FIN.
-- =====================================================================
