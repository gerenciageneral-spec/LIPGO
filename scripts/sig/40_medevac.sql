-- =====================================================================
-- 40 · MEDEVAC — Plan de Emergencias Médicas (SST-FOR-33)
-- Directorio de emergencias médicas por colaborador (ISO 45001 / Res. 0312).
-- Aditivo e idempotente. Correr en Supabase.
-- =====================================================================

create table if not exists public.sst_medevac (
  id serial primary key,
  idempresa int not null,
  centro_trabajo       text,          -- texto original del formulario
  nombres              text,
  documento_tipo       text,
  documento            text,
  cargo                text,
  celular              text,
  alergias             text,
  rh                   text,          -- grupo sanguíneo (O+, A-, etc.)
  arl                  text,
  eps                  text,
  contacto_nombre      text,          -- en caso de emergencia avisar a
  contacto_telefono    text,
  contacto_parentesco  text,
  email                text,
  mes_cumple           text,
  marca_temporal       text,
  created_at timestamptz default now()
);
create index if not exists idx_sst_medevac_empresa on public.sst_medevac (idempresa);

-- La app lee con la llave anon/auth (el control de acceso lo da permisos_usuarios +
-- PermissionGuard, como en las demás tablas SST). Sin esto, RLS deja la tabla vacía
-- para el cliente aunque tenga datos. Se iguala a sst_ipevr / sst_incidentes.
alter table public.sst_medevac disable row level security;

-- Permiso propio (patrón columna-por-permiso en permisos_usuarios)
alter table public.permisos_usuarios add column if not exists sst_medevac boolean default false;
-- Backfill: quien ya gestiona SST (incidentes) o el SIG lo ve
update public.permisos_usuarios
   set sst_medevac = true
 where coalesce(sst_incidentes, false) or coalesce(sig_matriz, false);

-- =====================================================================
-- FIN. Módulo Certificaciones → ISO 45001 / 0312 → MEDEVAC (SST-FOR-33).
-- =====================================================================
