-- =====================================================================
-- LIPgo · Sistema de Auditoría / Trazabilidad
-- 01_tabla.sql — tabla central de la bitácora. Aditivo e idempotente.
-- Correr en el SQL Editor de Supabase (orden: 01 → 02 → 03 → 04 → 04b → 06).
-- =====================================================================

create table if not exists public.auditoria (
  id               bigint generated always as identity primary key,
  ts               timestamptz  not null default now(),
  actor_id         uuid,                      -- profiles.id / auth.users.id; NULL = sistema
  actor_nombre     text         not null default 'sistema',
  idempresa        integer,                   -- multiempresa (si la fila la trae)
  modulo           text,                      -- derivado del nombre de tabla (02_modulos)
  tabla            text         not null,
  operacion        text         not null check (operacion in ('INSERT','UPDATE','DELETE')),
  registro_id      text,                      -- PK del registro afectado (as text)
  descripcion      text,                      -- resumen legible (generado en el trigger)
  antes            jsonb,                     -- to_jsonb(OLD)  (NULL en INSERT)
  despues          jsonb,                     -- to_jsonb(NEW)  (NULL en DELETE)
  campos_cambiados text[]                     -- solo UPDATE: claves que cambiaron
);

create index if not exists idx_auditoria_ts        on public.auditoria (ts desc);
create index if not exists idx_auditoria_actor      on public.auditoria (actor_id);
create index if not exists idx_auditoria_tabla      on public.auditoria (tabla);
create index if not exists idx_auditoria_modulo     on public.auditoria (modulo);
create index if not exists idx_auditoria_idempresa  on public.auditoria (idempresa);
create index if not exists idx_auditoria_registro   on public.auditoria (tabla, registro_id);

-- Deny-by-default para anon/authenticated (la app lee con service-role, bypassa RLS).
alter table public.auditoria enable row level security;

-- =====================================================================
