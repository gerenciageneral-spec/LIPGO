-- ============================================================================
-- 193 — PLANTILLA PROPIA DEL CONDUCTOR, CATEGORÍA UTILITY
-- ----------------------------------------------------------------------------
-- POR QUÉ NO SIRVE `plantilla_estandar` PARA ESTE FLUJO
--
-- El aviso al conductor falló con el error 131049: el tope por destinatario de
-- mensajes de MARKETING, que Meta aplica sumando todos los negocios. Las
-- plantillas UTILITY no tienen ese tope, y además cuestan menos.
--
-- Al intentar recategorizar `plantilla_estandar` como UTILITY, Meta advirtió
-- que la rechazaría. Tiene razón: su cuerpo entero es «Hola {{usuario}},
-- {{contenido}}». Meta clasifica por el TEXTO VISIBLE, y ahí no hay nada que
-- ate el mensaje a un pedido o a una cuenta --que es la definición de UTILITY--.
-- Una plantilla que puede decir cualquier cosa se lee, con razón, como
-- promocional.
--
-- Esa plantilla genérica sigue sirviendo para los avisos internos al personal,
-- donde la flexibilidad es lo que se quiere. Lo que no puede es pasar por
-- transaccional.
--
-- QUÉ HACE ESTA PLANTILLA DISTINTO
-- El texto fijo nombra el cargue: «Su vehículo de placa X, orden Y». Las
-- variables solo rellenan datos concretos, no el mensaje entero. Meta puede
-- verificar que es un aviso sobre un servicio en curso.
--
-- EL TEXTO QUE HAY QUE CREAR EN WHATSAPP MANAGER
-- LIPgo no puede crear plantillas: las crea una persona en Meta y las aprueba
-- Meta. Este script solo las REGISTRA para que el código sepa qué variables
-- llevan. El texto exacto está en el PASO 1.
--
-- Aditivo e idempotente.
-- ============================================================================


-- ----------------------------------------------------------------------------
-- PASO 1 — LA PLANTILLA EN WHATSAPP MANAGER
-- ----------------------------------------------------------------------------
-- YA CREADA Y APROBADA (22/09/2026). Esto queda como referencia de su
-- estructura: si alguna vez hay que recrearla, este es el contenido.
--
-- Nombre:    plantilla_conductor
-- Categoría: UTILITY  (Utilidad)
-- Idioma:    Español (COL)   -> es_CO
--
-- ENCABEZADO (texto):
--     {{nombre_reporte}}
--   Recibe el título configurado en la pantalla ("LIP Logística"). El código
--   lee de Meta si el encabezado lleva variable y manda el parámetro solo
--   cuando toca: un encabezado con variable enviado sin su parámetro falla.
--
-- CUERPO:
--     Hola {{conductor}}, le informamos sobre su vehículo de placa {{placa}}
--     en la orden de cargue {{orden}}.
--
--     {{detalle}}
--
--     LIP Progressive Integral Logistics.
--
--   Las tres primeras variables son datos verificables del servicio: nombre,
--   placa y número de orden. Eso es lo que sostiene la categoría UTILITY.
--   `detalle` lleva el texto configurable ("fue asignado al muelle 3", "ha
--   finalizado su cargue...").
--
-- PIE DE PÁGINA (opcional, pero conviene):
--     Este es un mensaje automático sobre su servicio.
--
-- EJEMPLOS que pide Meta al crearla (los usa para revisar):
--     nombre_reporte -> LIP Logística
--     conductor -> Jorge Ramírez
--     placa     -> ABC123
--     orden     -> OC-4451
--     detalle   -> fue asignado al muelle 3 y puede dirigirse a la zona de cargue
--
-- OJO CON LOS SALTOS DE LÍNEA: van en el TEXTO FIJO de la plantilla, nunca
-- dentro de una variable. WhatsApp rechaza una variable que traiga saltos.


-- ----------------------------------------------------------------------------
-- PASO 2 — REGISTRARLA EN LIPgo
-- ----------------------------------------------------------------------------

-- La columna de "para qué sirve" se llama `uso` (script 180), no `cuando_usar`.

insert into public.whatsapp_plantillas
  (nombre, idioma, descripcion, uso, variables)
values (
  'plantilla_conductor',
  'es_CO',
  'Aviso al conductor sobre su cargue: asignación de muelle y fin de cargue.',
  'Los avisos automáticos al conductor. Es UTILITY, así que no tiene el tope por destinatario que sí tienen las de MARKETING.',
  '{"header": ["nombre_reporte"], "body": ["conductor", "placa", "orden", "detalle"]}'::jsonb
)
on conflict (nombre) do update
  set idioma      = excluded.idioma,
      descripcion = excluded.descripcion,
      uso         = excluded.uso,
      variables   = excluded.variables;


-- ----------------------------------------------------------------------------
-- PASO 3 — QUITAR LA PLACA REPETIDA DE LOS MENSAJES
-- ----------------------------------------------------------------------------
-- Los textos sembrados por el 182 empiezan con «su vehículo de placa {placa}»,
-- porque la plantilla genérica no decía nada por sí misma. La nueva plantilla
-- YA nombra la placa y la orden en su texto fijo, así que dejarlos igual
-- diría la placa dos veces en el mismo mensaje.
--
-- Solo se corrigen los textos que siguen siendo los originales: si alguien ya
-- los redactó a su manera, se respetan.

update public.notificaciones_conductor_config
   set mensaje = 'fue asignado al muelle {muelle}.',
       updated_at = now()
 where evento = 'muelle_asignado'
   and mensaje = 'su vehículo de placa {placa} fue asignado al muelle {muelle}.';

update public.notificaciones_conductor_config
   set mensaje = 'ha finalizado su cargue y puede pasar a recogerlo. Cuéntenos cómo le fue: {encuesta}',
       updated_at = now()
 where evento = 'cargue_finalizado'
   and mensaje = 'su vehículo de placa {placa} ha finalizado su cargue y puede pasar a recogerlo. Cuéntenos cómo le fue: {encuesta}';


-- ----------------------------------------------------------------------------
-- PASO 4 — VERIFICACIÓN (solo lecturas)
-- ----------------------------------------------------------------------------

select nombre, idioma, variables, activa
from public.whatsapp_plantillas
where nombre in ('plantilla_conductor', 'plantilla_estandar')
order by nombre;

-- 4b) Las dos conviven: la genérica sigue sirviendo para los avisos al
--     personal, donde la flexibilidad es lo que se busca.

-- 4c) Cómo quedaron los mensajes. Leídos junto al texto fijo de la plantilla,
--     no deberían repetir la placa.
select evento, mensaje from public.notificaciones_conductor_config order by evento;


-- ----------------------------------------------------------------------------
-- REVERSIÓN
-- ----------------------------------------------------------------------------
-- El aviso vuelve a usar `plantilla_estandar` --y con ella el tope de
-- MARKETING-- si se borra el registro:
--
--   delete from public.whatsapp_plantillas where nombre = 'plantilla_conductor';
