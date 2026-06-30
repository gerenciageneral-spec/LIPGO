-- =====================================================================
-- SIG - Control de Cambios Documentales (ISO 7.5.3 / FOR-LIP-SIG-016/017).
-- Bitacora de versiones por documento: creacion, modificacion, anulacion.
-- Aditivo e idempotente. Tabla NUEVA (CREATE TABLE IF NOT EXISTS).
-- =====================================================================

create table if not exists public.sig_documento_versiones (
  id serial primary key,
  idempresa int,
  documento_id uuid,               -- referencia logica a sig_documentos.id
  documento_codigo text,           -- copia legible para trazabilidad
  version text,                    -- version resultante (ej. "02")
  version_anterior text,           -- version previa (null en creacion)
  tipo text not null default 'modificacion', -- creacion | modificacion | anulacion
  motivo text,                     -- por que cambio
  descripcion_cambio text,         -- que cambio
  responsable text,
  fecha date default now(),
  created_at timestamptz default now()
);

create index if not exists idx_sig_docver_doc on public.sig_documento_versiones (documento_id);
create index if not exists idx_sig_docver_emp on public.sig_documento_versiones (idempresa);

-- Permiso del modulo de control de cambios (columna aditiva).
alter table public.permisos_usuarios add column if not exists sig_control_cambios boolean default false;
