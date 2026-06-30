-- =====================================================================
-- Recobro de incapacidades (seguimiento de costos recuperables).
-- Agrega a ausentismosst las columnas para gestionar el ciclo de recobro
-- ante la EPS (EG > 2 dias) y la ARL (AT al 100%). Aditivo e idempotente.
--
-- Regla de negocio:
--   * EG (EPS): dias 1-2 los asume la EMPRESA (NO recobrable);
--     a partir del dia 3 la EPS reconoce el valor -> RECOBRABLE.
--     Por eso una incapacidad EG < 3 dias NO genera recobro.
--   * AT (ARL): la ARL reconoce el 100% desde el dia 1 -> RECOBRABLE total.
--   El "valor recobrable" = costos_eps (EG dia 3+) + costos_arl (AT 100%).
--   El "costo que asume la empresa" (perdida segura) = costos_empresa.
--   La PERDIDA por gestion = recobrable GLOSADO / PERDIDO / no radicado a tiempo.
-- =====================================================================

-- 1) Estado del recobro: PENDIENTE | RADICADO | RECOBRADO | GLOSADO | PERDIDO
alter table public.ausentismosst
  add column if not exists estado_recobro text default 'PENDIENTE';

-- 2) Valor efectivamente recuperado (lo que la EPS/ARL ya devolvio).
alter table public.ausentismosst
  add column if not exists valor_recobrado numeric default 0;

-- 3) Fecha en que se radico la cuenta de cobro ante la EPS/ARL.
alter table public.ausentismosst
  add column if not exists fecha_radicado_recobro date;

-- 4) Observacion de la gestion de recobro (glosa, soporte, etc.).
alter table public.ausentismosst
  add column if not exists obs_recobro text;

-- Verificacion (opcional):
-- select estado_recobro, count(*) from ausentismosst group by estado_recobro;

-- =====================================================================
-- FIN. El submodulo "Recobro de Incapacidades" calcula el valor recobrable
-- desde dias + salario_dia + tipo de evento (con piso en SMLV del anio) y
-- usa estas columnas para el seguimiento del ciclo de recobro.
-- =====================================================================
