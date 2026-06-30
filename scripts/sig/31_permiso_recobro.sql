-- =====================================================================
-- Permiso propio para "Recobro de Incapacidades".
-- Antes compartía la clave 'ausentismos', por lo que el dedupe del árbol de
-- Gestión de Usuarios lo ocultaba (no aparecía como checkbox propio). Con
-- columna propia se vuelve gestionable por separado.
--
-- Backfill: hereda el valor actual de 'ausentismos' para que NINGÚN usuario
-- pierda el acceso que ya tenía. A partir de aquí se gestiona por separado.
-- Aditivo e idempotente.
-- =====================================================================

alter table public.permisos_usuarios
  add column if not exists recobro_incapacidades boolean default false;

-- Hereda el acceso actual (quien veía Ausentismos sigue viendo Recobro).
update public.permisos_usuarios
   set recobro_incapacidades = coalesce(ausentismos, false)
 where recobro_incapacidades is distinct from coalesce(ausentismos, false);

-- Verificacion (opcional):
-- select usuario_id, ausentismos, recobro_incapacidades from permisos_usuarios;
-- =====================================================================
