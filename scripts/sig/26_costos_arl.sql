-- =====================================================================
-- Costo ARL en ausentismos (incapacidades por Accidente de Trabajo).
-- Agrega la columna costos_arl a ausentismosst y calcula el valor que asume la
-- ARL (100% del salario) para los AT ya registrados. Aditivo e idempotente.
-- (Se separó del SQL 25 porque la columna no se había creado.)
-- =====================================================================

-- 1) Crear la columna (si no existe).
alter table public.ausentismosst add column if not exists costos_arl numeric default 0;

-- 2) Calcular el costo ARL de los AT existentes: días × salario_día (100%).
--    Solo donde aún está en 0, para no pisar valores ya ajustados.
update public.ausentismosst
   set costos_arl = round(coalesce(dias_incapacidad, 0) * coalesce(salario_base, 0) / 30)
 where tipo_evento = 'AT' and coalesce(costos_arl, 0) = 0;

-- Verificación (opcional):
-- select tipo_evento, count(*), sum(costos_arl) from ausentismosst group by tipo_evento;

-- =====================================================================
-- FIN. El dashboard de Costos ya suma empresa + EPS + ARL.
-- =====================================================================
