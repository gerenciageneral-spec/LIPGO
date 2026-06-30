-- =====================================================================
-- SIG - Ausentismo en vivo desde LIPgo (registroasistencia = control diario).
-- Conecta IND-GH-02 al cálculo gh_ausentismo: turnos con incapacidad o
-- licencia no remunerada / turnos programados. Fuente de verdad: el control
-- de asistencia diario (Visor / Tabla de asistencia / Programación de turnos),
-- que cubre los 4 proyectos. Aditivo e idempotente.
-- =====================================================================

update public.sig_indicadores set
  nombre = 'Ausentismo médico (incapacidad)',
  calculo_auto = 'gh_ausentismo', fuente = 'registroasistencia',
  formula = 'Turnos con incapacidad médica / turnos programados (control diario: programación + asistencia + novedades)',
  meta = 3, sentido = 'menor_mejor'
where idempresa = 100 and codigo = 'IND-GH-02';

-- =====================================================================
-- FIN.
-- =====================================================================
