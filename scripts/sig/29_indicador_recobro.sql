-- =====================================================================
-- Indicador de gestión: Recuperación de recobros de incapacidades.
-- Lo agrega al catálogo del Tablero Gerencial (BSC) como indicador del
-- proceso de Gestión Humana (GH), perspectiva financiera/dirección.
--
-- Encaje en las 3 normas:
--   * ISO 9001 (9.1): eficiencia del proceso y cuidado de los recursos.
--   * ISO 45001: dimensión económica de los eventos de SST (EG/AT).
-- Se calcula EN VIVO (calculo_auto = 'gh_recobro') desde ausentismosst:
--   valor recobrado / valor recobrable (EPS día 3+ y ARL 100%).
-- Aditivo e idempotente.
-- =====================================================================

insert into public.sig_indicadores
  (idempresa, codigo, proceso_codigo, nombre, tipo, parte_interesada, formula, fuente, calculo_auto, unidad, meta, sentido, frecuencia, responsable, valor_manual, orden) values
  (100,'IND-GH-04','GH','Recuperación de recobros (incapacidades)','resultado','direccion',
   'Valor recobrado / valor recobrable (EPS días 3+ al 66.67% y ARL 100%) — eficiencia de la gestión de cobro ante EPS/ARL',
   'ausentismosst','gh_recobro','%',90,'mayor_mejor','mensual','Coordinador de Gestión Humana',null,33)
on conflict (idempresa, codigo) do update
  set nombre = excluded.nombre,
      formula = excluded.formula,
      fuente = excluded.fuente,
      calculo_auto = excluded.calculo_auto,
      unidad = excluded.unidad,
      meta = excluded.meta,
      sentido = excluded.sentido,
      parte_interesada = excluded.parte_interesada,
      responsable = excluded.responsable,
      orden = excluded.orden,
      activo = true;

-- Verificacion (opcional):
-- select codigo, nombre, calculo_auto, meta from sig_indicadores where codigo='IND-GH-04';
-- =====================================================================
