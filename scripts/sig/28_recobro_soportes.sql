-- =====================================================================
-- Soportes del recobro de incapacidades (evidencia de gestión).
-- Para demostrar la gestión de cobro se adjuntan dos archivos al caso:
--   * soporte_radicado_url: correo enviado a la EPS/ARL (radicación) ->
--     requisito para marcar el recobro como RADICADO.
--   * soporte_pago_url: comprobante de pago de la incapacidad ->
--     requisito para CERRAR el recobro como RECOBRADO.
-- Los archivos se guardan en el bucket "archivos" (carpeta recobro/{id}/...).
-- Aditivo e idempotente.
-- =====================================================================

alter table public.ausentismosst
  add column if not exists soporte_radicado_url text;

alter table public.ausentismosst
  add column if not exists soporte_pago_url text;

-- Verificacion (opcional):
-- select id, estado_recobro, soporte_radicado_url, soporte_pago_url
--   from ausentismosst where soporte_radicado_url is not null;
-- =====================================================================
