-- ============================================================================
-- 181 — PLANTILLA ESTÁNDAR DE WHATSAPP
-- ----------------------------------------------------------------------------
-- Registra `plantilla_estandar`: un formato genérico con tres variables que
-- sirve para cualquier aviso, en vez de crear y hacer aprobar una plantilla
-- distinta por cada flujo.
--
--   Encabezado: {{nombre_reporte}}
--   Cuerpo:     {{usuario}} y {{contenido}}
--
-- POR QUÉ CONVIENE UNA PLANTILLA GENÉRICA
-- Cada plantilla nueva la revisa Meta y puede tardar horas. Con una estándar,
-- un flujo nuevo se conecta el mismo día: solo cambia lo que se manda en
-- `contenido`. Las plantillas específicas quedan para los avisos que necesiten
-- botones o un formato propio.
--
-- OJO: `contenido` es una variable de texto. WhatsApp NO permite saltos de
-- línea dentro de una variable, así que el texto que se arme para ese campo
-- debe ir en una sola línea.
--
-- Aditivo e idempotente. El registro en LIPgo NO crea la plantilla en Meta:
-- eso se hace en WhatsApp Manager y requiere su aprobación.
-- ============================================================================

insert into public.whatsapp_plantillas (nombre, idioma, descripcion, uso, variables)
values (
  'plantilla_estandar',
  'es_CO',
  'Formato genérico de aviso: título, destinatario y contenido libre.',
  'Sirve para cualquier notificación operativa sin tener que crear y hacer aprobar una plantilla por flujo.',
  '{"header": ["nombre_reporte"], "body": ["usuario", "contenido"]}'::jsonb
)
on conflict (nombre) do update
  set idioma      = excluded.idioma,
      descripcion = excluded.descripcion,
      uso         = excluded.uso,
      variables   = excluded.variables;


-- ----------------------------------------------------------------------------
-- VERIFICACIÓN (solo lecturas)
-- ----------------------------------------------------------------------------

-- 1) Las dos plantillas registradas, con sus variables EN ORDEN.
--    El orden importa: WhatsApp las traduce a {{1}}, {{2}} por posición.
select nombre, idioma, variables, activa
from public.whatsapp_plantillas
order by nombre;

-- 2) El idioma se sembró como 'es_CO' porque es el que quedó aprobado en la
--    primera plantilla. Si en Meta esta quedó en otro, se corrige acá o desde
--    la pantalla: un idioma distinto hace fallar el envío con un error que
--    dice que la plantilla "no existe".
--
--   update public.whatsapp_plantillas
--      set idioma = 'es'
--    where nombre = 'plantilla_estandar';


-- ----------------------------------------------------------------------------
-- REVERSIÓN
-- ----------------------------------------------------------------------------
--   delete from public.whatsapp_plantillas where nombre = 'plantilla_estandar';
