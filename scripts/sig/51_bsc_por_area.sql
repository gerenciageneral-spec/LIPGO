-- =====================================================================
-- 51 · BSC por ÁREA — cablear KPIs, re-etiquetar áreas y agregar indicadores
-- ---------------------------------------------------------------------
-- El cuadro de mando pasa a verse POR ÁREA (cada área de LIP con sus KPIs).
-- Se cablean a valor EN VIVO los que ya se pueden calcular, se re-etiquetan
-- áreas (GH/SST separadas) y se agregan los indicadores que faltaban.
-- Aditivo e idempotente. Correr en Supabase SQL Editor. No borra datos.
-- =====================================================================

-- 1) CABLEAR calculo_auto de indicadores que estaban en manual (valor en vivo).
update sig_indicadores set calculo_auto = 'sat_conductor'      where idempresa = 100 and codigo = 'IND-G-02';
update sig_indicadores set calculo_auto = 'sat_cliente'        where idempresa = 100 and codigo = 'IND-G-01';
update sig_indicadores set calculo_auto = 'nc_cerradas'        where idempresa = 100 and codigo = 'IND-EM-01';
update sig_indicadores set calculo_auto = 'gh_formacion'       where idempresa = 100 and codigo = 'IND-GH-03';
update sig_indicadores set calculo_auto = 'sig_implementacion' where idempresa = 100 and codigo = 'IND-G-04';
-- Revisión módulo a módulo: cumplimiento legal en vivo (matriz de requisitos legales).
update sig_indicadores set calculo_auto = 'legal_cumplimiento' where idempresa = 100 and codigo = 'IND-DE-01';
-- ERI físico del almacén: automático por el CRUCE MENSUAL (libro vs stock vivo), no manual.
update sig_indicadores set calculo_auto = 'inv_eri' where idempresa = 100 and codigo = 'IND-AI-03';

-- 2) RE-ETIQUETAR áreas: GH y SST como áreas separadas (como en el menú).
update sig_indicadores set area = 'Gestión Humana'
 where idempresa = 100 and codigo in ('IND-GH-01','IND-GH-02','IND-GH-03','IND-GH-04');
update sig_indicadores set area = 'Seguridad y Salud en el Trabajo (SST)'
 where idempresa = 100 and codigo = 'IND-SST-0312';

-- 3) AGREGAR indicadores que faltaban por área (idempotente por codigo).
insert into sig_indicadores
  (idempresa, codigo, proceso_codigo, nombre, tipo, formula, fuente, calculo_auto,
   unidad, meta, sentido, frecuencia, responsable, perspectiva, area, finalidad, activo, orden)
select * from (values
  (100,'IND-CD-08','CD','Cumplimiento de meta de tonelaje','resultado',
   'Toneladas movilizadas / meta de tonelaje del periodo','cabeceraoc','desp_meta_ton',
   '%',100,'mayor_mejor','mensual','Coordinador de Operaciones','financiera','Cargue y Descargue',
   'Medir el cumplimiento del volumen comprometido con el cliente',true,58),
  (100,'IND-GH-05','GH','Cobertura de planta','resultado',
   'Colaboradores activos / planta acordada','registroasistencia','gh_cobertura',
   '%',100,'mayor_mejor','mensual','Coordinador de Gestión Humana','aprendizaje','Gestión Humana',
   'Asegurar la cobertura de personal frente a la planta acordada',true,45),
  (100,'IND-SST-02','SST','Índice de accidentalidad (AT)','resultado',
   'N° de accidentes de trabajo en el periodo','sst_incidentes','sst_at_count',
   '#',0,'menor_mejor','mensual','Responsable SG-SST','procesos','Seguridad y Salud en el Trabajo (SST)',
   'Reducir la ocurrencia de accidentes de trabajo',true,72),
  (100,'IND-SST-03','SST','Días perdidos por AT (severidad)','resultado',
   'Suma de días de incapacidad por AT','sst_incidentes','sst_at_dias',
   '#',0,'menor_mejor','mensual','Responsable SG-SST','procesos','Seguridad y Salud en el Trabajo (SST)',
   'Reducir la severidad de los accidentes de trabajo',true,73),
  (100,'IND-SST-04','SST','Intervención de peligros (IPEVR)','resultado',
   'Promedio de cumplimiento de los controles de la matriz IPEVR','sst_ipevr','sst_ipevr_cumpl',
   '%',90,'mayor_mejor','trimestral','Responsable SG-SST','procesos','Seguridad y Salud en el Trabajo (SST)',
   'Intervenir los peligros identificados en la matriz de riesgos',true,74),
  (100,'IND-TI-01','TI','Digitalización de la operación en LIPgo','resultado',
   'Operaciones registradas en LIPgo (movimientos + órdenes)','invtrans + cabeceraoc','lipgo_registros',
   '#',null,'mayor_mejor','mensual','Gerencia de Tecnología','procesos','Tecnología (LIPgo)',
   'Evidenciar la trazabilidad digital de la operación (diferencial de LIP)',true,90)
) as x(idempresa,codigo,proceso_codigo,nombre,tipo,formula,fuente,calculo_auto,
       unidad,meta,sentido,frecuencia,responsable,perspectiva,area,finalidad,activo,orden)
 where not exists (select 1 from sig_indicadores e where e.idempresa = 100 and e.codigo = x.codigo);
