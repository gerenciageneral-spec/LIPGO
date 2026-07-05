-- =====================================================================
-- 50 · SG-SST 0312 a nivel LIP (100) + integración con BSC + evidencia real
-- ---------------------------------------------------------------------
-- LIP es la ÚNICA empresa que se certifica. Los ID de empresa 1-4 son
-- PROYECTOS / CLIENTES donde LIP presta el servicio con su software LIPgo.
-- Por eso el SG-SST (Resolución 0312) es UNO SOLO, de LIP (idempresa 100),
-- y su evidencia son TODOS los registros SST de LIP (across proyectos).
--
-- Aditivo e idempotente. Correr en Supabase SQL Editor. No borra datos.
-- =====================================================================

-- 1) ALCANCE: la autoevaluación 0312 y su plan de mejora pasan a LIP (100).
--    (Estaban bajo "empresa 1" por un arranque conceptual equivocado.)
update sst_autoevaluaciones
   set idempresa = 100,
       sede = coalesce(sede, 'LIP')
 where idempresa <> 100;

update sst_plan_mejora
   set idempresa = 100
 where idempresa <> 100;

-- 2) WIRINGS DE EVIDENCIA → tablas REALES de LIPgo (fuente de verdad).
-- 2a) Corregir amarres que apuntaban a tablas VACÍAS.
--     EPP: sst_entrega_epp (0 filas) → dotacion_epp (entregas reales).
update sst_estandar_evidencia
   set modulo = 'Entrega de EPP', tabla = 'dotacion_epp'
 where numeral = '4.2.6';
--     Indicadores 6.1.1: sst_indicadores (0 filas) → BSC sig_indicadores.
update sst_estandar_evidencia
   set modulo = 'BSC · Indicadores SIG', tabla = 'sig_indicadores'
 where numeral = '6.1.1';

-- 2b) NUEVOS amarres para estándares que SÍ tienen módulo operativo real en
--     LIPgo (solo si el numeral aún no está mapeado).
insert into sst_estandar_evidencia (numeral, modulo, tabla, documento, descripcion)
select x.numeral, x.modulo, x.tabla, x.documento, x.descripcion
  from (values
    ('2.2.1', 'Objetivos y Metas SIG (BSC)',        'sig_objetivos',              null::text, 'Objetivos SG-SST medibles (6.2), en el BSC'),
    ('3.1.1', 'Perfil Sociodemográfico',            'sst_perfil_sociodemografico', null,      'Descripción sociodemográfica y condiciones de salud'),
    ('1.2.2', 'Capacitaciones',                     'capacitaciones',              null,      'Capacitación, inducción y reinducción en SST'),
    ('3.3.1', 'Reporte e Investigación AT/EL',      'sst_incidentes',              null,      'Medición de la severidad de los AT/EL'),
    ('3.3.2', 'Reporte e Investigación AT/EL',      'sst_incidentes',              null,      'Medición de la frecuencia de los AT/EL'),
    ('3.3.3', 'Reporte e Investigación AT/EL',      'sst_incidentes',              null,      'Medición de la mortalidad por AT/EL'),
    ('3.3.6', 'Ausentismo médico (control diario)', 'registroasistencia',          null,      'Ausentismo por causa médica'),
    ('7.1.1', 'Plan de Mejoramiento',               'sst_plan_mejora',             null,      'Acciones preventivas y correctivas'),
    ('7.1.2', 'Plan de Mejoramiento',               'sst_plan_mejora',             null,      'Medidas correctivas, preventivas y de mejora'),
    ('7.1.3', 'Plan de Mejoramiento',               'sst_plan_mejora',             null,      'Acciones de mejora de investigaciones AT/EL')
  ) as x(numeral, modulo, tabla, documento, descripcion)
 where not exists (
   select 1 from sst_estandar_evidencia e where e.numeral = x.numeral
 );

-- 3) INTEGRACIÓN CON EL BSC: objetivo + indicador gerencial del SG-SST 0312.
-- 3a) Objetivo (6.2) del SG-SST en el cuadro de mando (LIP=100).
insert into sig_objetivos
  (idempresa, norma_codigo, objetivo, meta, indicador, unidad, linea_base, valor_actual, responsable, estado, activo)
select 100, 'ISO45001',
       'Mantener y mejorar el SG-SST conforme a la Resolución 0312/2019',
       '>= 86% (Aceptable)',
       'Cumplimiento de estándares mínimos SG-SST (Art. 27)',
       '%', '46.25', 'En medición (en vivo)', 'Responsable SG-SST', 'en_curso', true
 where not exists (
   select 1 from sig_objetivos
    where idempresa = 100 and norma_codigo = 'ISO45001'
      and objetivo like 'Mantener y mejorar el SG-SST%'
 );

-- 3b) Indicador BSC del SG-SST 0312 (valor en vivo por calculo_auto='sgsst_0312').
insert into sig_indicadores
  (idempresa, codigo, proceso_codigo, nombre, tipo, formula, fuente, calculo_auto,
   unidad, meta, sentido, frecuencia, responsable, perspectiva, area, finalidad, activo, orden)
select 100, 'IND-SST-0312', 'SST',
       'Cumplimiento SG-SST (Resolución 0312)', 'gerencial',
       'Puntaje ponderado de los 60 estándares mínimos (Art. 27)',
       'Autoevaluación 0312 (LIPgo)', 'sgsst_0312',
       '%', 86, 'mayor_mejor', 'anual', 'Responsable SG-SST',
       'procesos', 'SST',
       'Evidenciar el avance real del Sistema de Gestión de SST de LIP', true, 99
 where not exists (
   select 1 from sig_indicadores where idempresa = 100 and codigo = 'IND-SST-0312'
 );

-- (opcional) Amarrar el indicador a su objetivo.
update sig_indicadores i
   set objetivo_id = o.id
  from sig_objetivos o
 where i.idempresa = 100 and i.codigo = 'IND-SST-0312'
   and o.idempresa = 100 and o.norma_codigo = 'ISO45001'
   and o.objetivo like 'Mantener y mejorar el SG-SST%'
   and i.objetivo_id is null;
