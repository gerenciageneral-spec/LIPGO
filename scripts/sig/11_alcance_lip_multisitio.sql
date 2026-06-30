-- =====================================================================
-- SIG - Re-anclaje a ALCANCE LIP (operador) + etiquetado multisitio
--
-- CONTEXTO: las filas de `empresas` (id 1..6) son los CLIENTES/PROYECTOS de
-- LIP (Harinera Indupan, Avimol, Cedi Funza, Cedi Medellín, Demogistics,
-- Precocidos). NO hay fila "LIP". Todo el SIG se había sembrado bajo
-- idempresa=1 (= Harinera Indupan), lo cual es incorrecto: la certificación
-- ISO es del Sistema de Gestión de LIP, no de un cliente.
--
-- SOLUCIÓN (decisión del cliente):
--   1) El SIG es ÚNICO de LIP -> vive bajo un alcance dedicado: idempresa = 100
--      (constante "LIP / operador", fuera del rango de clientes; el módulo SIG
--      es independiente del selector de cliente de la app).
--   2) Las No Conformidades (y luego indicadores) se etiquetan por
--      cliente/sitio con `proyecto_id` (referencia opcional a empresas 1..6)
--      para evidencia multisitio.
--
-- Idempotente: re-ejecutar no duplica (UPDATE por idempresa; ADD COLUMN IF NOT EXISTS).
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) Re-anclar las 8 tablas SIG por-empresa: idempresa 1 -> 100 (LIP)
--    (sig_normas / sig_requisitos / sig_requisito_norma / sig_documentos
--     son globales, sin idempresa: no se tocan)
-- ---------------------------------------------------------------------
update public.sig_documento_cobertura   set idempresa = 100 where idempresa = 1;
update public.sig_aspectos_ambientales   set idempresa = 100 where idempresa = 1;
update public.sig_objetivos              set idempresa = 100 where idempresa = 1;
update public.sig_requisitos_legales     set idempresa = 100 where idempresa = 1;
update public.sig_contexto_dofa          set idempresa = 100 where idempresa = 1;
update public.sig_procesos               set idempresa = 100 where idempresa = 1;
update public.sig_nc_catalogo            set idempresa = 100 where idempresa = 1;
update public.sig_no_conformidades       set idempresa = 100 where idempresa = 1;

-- ---------------------------------------------------------------------
-- 2) Etiquetado por cliente/sitio en el registro de NC
-- ---------------------------------------------------------------------
alter table public.sig_no_conformidades
  add column if not exists proyecto_id int;   -- cliente/sitio (empresas.id 1..6), opcional

-- ---------------------------------------------------------------------
-- Verificación (opcional)
-- ---------------------------------------------------------------------
-- select 'cobertura' t, count(*) n from sig_documento_cobertura where idempresa = 100
-- union all select 'procesos', count(*) from sig_procesos where idempresa = 100
-- union all select 'nc_catalogo', count(*) from sig_nc_catalogo where idempresa = 100
-- union all select 'no_conformidades', count(*) from sig_no_conformidades where idempresa = 100;
-- =====================================================================
-- FIN. Tras correrlo, el SIG completo queda bajo el alcance LIP (100).
-- =====================================================================
