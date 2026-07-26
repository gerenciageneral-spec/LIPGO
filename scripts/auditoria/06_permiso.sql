-- =====================================================================
-- 06_permiso.sql — permiso del módulo "Bitácora de Auditoría".
-- default FALSE = solo-admin: se otorga explícitamente a administración.
-- =====================================================================

alter table public.permisos_usuarios
  add column if not exists bitacora_auditoria boolean default false;

-- Otorgar a los administradores (ajusta las cédulas/usuarios según corresponda):
--   update public.permisos_usuarios set bitacora_auditoria = true
--    where usuario_id in (
--      select id from public.profiles where usuario ilike '%admin%'
--    );

-- =====================================================================
