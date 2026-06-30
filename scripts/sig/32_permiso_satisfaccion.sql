-- =====================================================================
-- Permiso propio para "Satisfacción y PQRSF".
-- Antes compartía la clave 'sig_matriz' (todo el SIG). Se separa para que el
-- COORDINADOR (módulo Gestión LIP) lo gestione sin abrir todo el SIG, ya que
-- es responsable de las partes interesadas (conductores y cliente).
-- El módulo aparece en dos lugares (SIG y Gestión LIP) y ambos usan esta clave.
--
-- Backfill: hereda el valor actual de 'sig_matriz' para que NADIE pierda el
-- acceso que ya tenía. Aditivo e idempotente.
-- =====================================================================

alter table public.permisos_usuarios
  add column if not exists satisfaccion_pqrsf boolean default false;

update public.permisos_usuarios
   set satisfaccion_pqrsf = coalesce(sig_matriz, false)
 where satisfaccion_pqrsf is distinct from coalesce(sig_matriz, false);

-- Verificacion (opcional):
-- select usuario_id, sig_matriz, satisfaccion_pqrsf from permisos_usuarios;
-- =====================================================================
