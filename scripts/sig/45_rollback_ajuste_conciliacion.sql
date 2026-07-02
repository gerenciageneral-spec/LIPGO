-- ============================================================================
-- 45 — ROLLBACK del script 44 (ajuste conciliacion)
-- ----------------------------------------------------------------------------
-- El script 44 fue un ERROR: la diferencia libro-vs-físico eran transacciones
-- RECHAZADAS (status='rechazado') que el cálculo de conciliación contaba mal.
-- El físico SIEMPRE estuvo correcto — los meses sí cuadraban.
--
-- IMPORTANTE: 'saldoinvdetalle' es una VISTA (view con GROUP BY) que se calcula
-- en vivo desde 'invtrans'. NO se puede (ni se debe) borrar de la vista.
-- Basta con eliminar las filas de ajuste de 'invtrans': la vista se recalcula
-- sola y las filas fantasma 'AJUSTE-SIG' del físico desaparecen automáticamente.
-- Solo se tocan las filas creadas por el 44; el inventario real no se altera.
-- ============================================================================

-- 1) Elimina SOLO las filas de ajuste del kardex (las que insertó el 44).
--    La vista saldoinvdetalle se limpia sola al recalcular.
delete from invtrans
where location = 'AJUSTE-SIG'
   or origen = 'ajuste conciliacion SIG';

-- 2) VERIFICACIÓN (ambos deben dar 0 tras el rollback):
select 'invtrans AJUSTE-SIG' as origen, count(*) as filas
from invtrans where location = 'AJUSTE-SIG' or origen = 'ajuste conciliacion SIG'
union all
select 'saldoinvdetalle (vista) AJUSTE-SIG', count(*)
from saldoinvdetalle where location = 'AJUSTE-SIG';
