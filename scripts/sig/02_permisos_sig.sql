-- =====================================================================
-- SIG - Otorgar permisos del modulo (correr DESPUES de 01_matriz_integrada.sql).
-- Aditivo e idempotente. Activa el modulo "Matriz Integrada SIG" y sus
-- pestanas por norma para los usuarios que deban verlo.
-- =====================================================================

-- Opcion A: activar SOLO para un usuario por correo (recomendado).
update public.permisos_usuarios
   set sig_matriz   = true,
       sig_iso9001  = true,
       sig_iso14001 = true,
       sig_iso45001 = true
 where usuario_id in (
   select id from auth.users where email = 'gerenciageneral@lip-sas.com'
 );

-- Si lo anterior devuelve "0 rows", ese usuario no tiene fila en
-- permisos_usuarios todavia. En ese caso usa la Opcion B o crea la fila
-- desde "Gestion de Usuarios" en la app.

-- Opcion B: activar para TODOS los usuarios (util en pruebas). Descomenta:
-- update public.permisos_usuarios
--    set sig_matriz = true, sig_iso9001 = true, sig_iso14001 = true, sig_iso45001 = true;

-- Verificacion: cuantos usuarios tienen acceso al modulo.
-- select count(*) as usuarios_con_sig from public.permisos_usuarios where sig_matriz = true;
