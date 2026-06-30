-- =====================================================================
-- SIG - Conecta los indicadores de servicio a su cálculo EN VIVO (SLA).
-- Tras definir los SLA reales (Acuerdos de Servicio Indupan/Avimol), estos
-- indicadores pasan de manuales a automáticos y se amarran a su objetivo.
-- Aditivo e idempotente. Alcance LIP (idempresa = 100).
-- =====================================================================

-- SLA de tiempos de atención → % de despachos dentro del tiempo acordado por
-- tipo de vehículo (cabeceraoc fincargue−iniciocargue vs SLA, citasvehiculos).
update public.sig_indicadores set
  calculo_auto = 'sla_tiempos', fuente = 'cabeceraoc',
  formula = 'Despachos con tiempo de cargue (fincargue−iniciocargue) dentro del SLA por tipo de vehículo / total'
where idempresa = 100 and codigo = 'IND-CD-07';

-- Cobertura de personal → colaboradores activos vs planta acordada (SLA).
update public.sig_indicadores set
  calculo_auto = 'gh_cobertura', fuente = 'headcount',
  formula = 'Colaboradores activos (headcount) / planta acordada en el SLA'
where idempresa = 100 and codigo = 'IND-GH-04';

-- Nivel de servicio global → promedio de los componentes de servicio medibles.
update public.sig_indicadores set
  calculo_auto = 'sla_global', fuente = 'cabeceraoc',
  formula = 'Promedio de cumplimiento de cargues, meta de tonelaje y SLA de tiempos'
where idempresa = 100 and codigo = 'IND-G-06';

-- Amarrar a "Mantener la satisfacción del cliente" los indicadores de servicio
-- que habían quedado sin objetivo.
update public.sig_indicadores i set objetivo_id = o.id
  from public.sig_objetivos o
 where o.objetivo = 'Mantener la satisfacción del cliente'
   and i.idempresa = 100 and i.codigo in ('IND-G-06','IND-CD-06','IND-AI-03')
   and i.objetivo_id is null;

-- =====================================================================
-- FIN. IND-CD-07, IND-GH-04 e IND-G-06 ahora en vivo; 3 indicadores amarrados.
-- =====================================================================
