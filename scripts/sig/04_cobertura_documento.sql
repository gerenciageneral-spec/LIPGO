-- =====================================================================
-- SIG - Enlazar documentos reales (sig_documentos) a la cobertura.
-- Permite que un documento del maestro sig_documentos cubra un numeral
-- en una o varias normas (documento compartido). Aditivo e idempotente.
-- =====================================================================

-- Referencia logica a sig_documentos.id (que es UUID). Sin FK dura.
-- 1) Crea la columna si no existe (en instalaciones nuevas).
alter table public.sig_documento_cobertura add column if not exists documento_id uuid;
-- 2) Si en un intento previo quedo como bigint, conviertela in situ a uuid
--    (la tabla esta vacia de documento_id, por eso using null::uuid es seguro).
alter table public.sig_documento_cobertura
  alter column documento_id type uuid using (null::uuid);

create index if not exists idx_sig_cobertura_doc
  on public.sig_documento_cobertura (documento_id);

-- (Opcional) si corriste el 03 para quitar RLS, los grants ya cubren esta tabla.
