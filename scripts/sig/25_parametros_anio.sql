-- =====================================================================
-- Parámetros legales por AÑO (base del cálculo de costos de ausentismo).
-- El SMLV (salario mínimo legal vigente) y el auxilio de transporte cambian
-- cada año; aquí se mantienen para que el costo de las incapacidades se calcule
-- con el valor del año correspondiente. Editable por año. Aditivo e idempotente.
-- =====================================================================

create table if not exists public.parametros_legales_anio (
  anio int primary key,
  smlv numeric not null,                  -- salario mínimo legal mensual vigente
  auxilio_transporte numeric default 0,   -- auxilio de transporte mensual
  dias_cargo_empleador int default 2,     -- incapacidad EG: días a cargo del empleador
  pct_pago_incapacidad numeric default 66.67, -- % de pago de la incapacidad (EG)
  activo boolean default true,
  actualizado_at timestamptz default now()
);

-- Seed con valores REALES. NOTA: en una incapacidad NO se paga auxilio de
-- transporte (el trabajador no asiste), por eso el costo se calcula sobre el
-- SMLV (salario), y el auxilio se guarda aparte solo como referencia.
insert into public.parametros_legales_anio (anio, smlv, auxilio_transporte) values
  (2025, 1423500, 200000),   -- ingreso total con auxilio: 1.623.500
  (2026, 1750905, 249095)    -- ingreso total con auxilio: 2.000.000
on conflict (anio) do update set
  smlv = excluded.smlv, auxilio_transporte = excluded.auxilio_transporte, actualizado_at = now();

-- Columna para el costo que asume la ARL (incapacidades AT, 100% del salario).
-- Permite el análisis de costos SST completo (empresa + EPS + ARL).
alter table public.ausentismosst add column if not exists costos_arl numeric default 0;

-- Recalcula el costo ARL de los AT ya registrados (días × salario_día al 100%).
update public.ausentismosst
   set costos_arl = round(coalesce(dias_incapacidad, 0) * coalesce(salario_base, 0) / 30)
 where tipo_evento = 'AT' and coalesce(costos_arl, 0) = 0;

-- =====================================================================
-- FÓRMULA DEL COSTO DE LA INCAPACIDAD (regla aplicada en el puente):
--   base_salarial = MAX(salario real del colaborador [headcount.salario], SMLV del año)
--   salario_día   = base_salarial / 30
--   (NO se incluye auxilio de transporte: en incapacidad no se paga)
--   EG (enfermedad general):
--       días 1–2  → a cargo del EMPLEADOR  = días_emp × salario_día × 66.67%
--       días 3+   → a cargo de la EPS       = días_eps × salario_día × 66.67%
--   AT (accidente de trabajo): a cargo de la ARL al 100% (costo empresa = 0;
--       se registran los días para la estadística SST, no como costo de la empresa)
-- El SMLV usado es el del AÑO de la fecha de la incapacidad (esta tabla).
-- =====================================================================
