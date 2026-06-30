-- =====================================================================
-- Indicador de gestión: Gestión de facturación (operaciones).
-- Mide el % de operaciones cuya SOLICITUD de factura ya gestionó el
-- coordinador (estadofactura != null) sobre el total facturable. Las
-- pendientes (estadofactura null) son las que el coordinador AÚN no solicita;
-- la facturación en firme la realiza la parte financiera.
--
-- Encaje en las normas: ISO 9001 (9.1) eficiencia del proceso y cuidado de los
-- recursos / flujo de caja de la empresa. Proceso = Cargue y Descargue (CD).
-- Se calcula EN VIVO (calculo_auto = 'lip_facturacion') desde cabeceraoc.
-- Aditivo e idempotente.
-- =====================================================================

insert into public.sig_indicadores
  (idempresa, codigo, proceso_codigo, nombre, tipo, parte_interesada, formula, fuente, calculo_auto, unidad, meta, sentido, frecuencia, responsable, valor_manual, orden) values
  (100,'IND-CD-06','CD','Gestión de facturación (operaciones)','resultado','direccion',
   'Operaciones con solicitud de factura gestionada / total facturable (excluye proyección y tolva). Lo pendiente lo solicita el coordinador; la factura en firme la hace finanzas.',
   'cabeceraoc','lip_facturacion','%',95,'mayor_mejor','mensual','Coordinador de Operaciones',null,15)
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
-- select codigo, nombre, calculo_auto, meta from sig_indicadores where codigo='IND-CD-06';
-- =====================================================================
