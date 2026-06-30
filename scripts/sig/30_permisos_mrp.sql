-- =====================================================================
-- Barrido de permisos: módulos del grupo MRP que estaban "no protegidos"
-- (visibles para todos y NO gestionables desde Gestión de Usuarios).
-- Se agregan como columnas de permiso para que se rijan por las mismas
-- reglas que el resto de LIPgo (habilitar/deshabilitar/permisos por usuario).
--
-- Afecta a: Ingresos MP, Saldos de empaque, Saldos de materia prima.
-- Por defecto FALSE: dejan de verse para todos y el admin los habilita por
-- usuario desde Configuración → General → Gestión de Usuarios → grupo MRP.
-- Aditivo e idempotente.
-- =====================================================================

alter table public.permisos_usuarios
  add column if not exists ingresos_mp boolean default false;

alter table public.permisos_usuarios
  add column if not exists saldos_empaque boolean default false;

alter table public.permisos_usuarios
  add column if not exists saldos_materia_prima boolean default false;

-- Verificacion (opcional):
-- select column_name from information_schema.columns
--  where table_name='permisos_usuarios'
--    and column_name in ('ingresos_mp','saldos_empaque','saldos_materia_prima');
-- =====================================================================
