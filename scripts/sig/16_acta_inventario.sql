-- =====================================================================
-- SIG - Acta de Revisión de Inventario (firma del cliente)
-- Para auditoría: cada 1 de mes el cliente firma que se realizó el inventario.
-- Se agregan columnas de firma al documento de cuadre. Idempotente.
-- =====================================================================

alter table public.sig_inventario_cuadre
  add column if not exists cliente_firmante text,     -- quién firma por el cliente
  add column if not exists cliente_cargo text,
  add column if not exists fecha_firma date,          -- fecha de la firma (1 de mes)
  add column if not exists firmado boolean default false,
  add column if not exists acta_observaciones text;

-- =====================================================================
-- FIN.
-- =====================================================================
