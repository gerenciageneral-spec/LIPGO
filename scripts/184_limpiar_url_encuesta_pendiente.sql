-- ============================================================================
-- 184 — QUITAR EL 'forms.gle/PENDIENTE' DE LA NOTIFICACIÓN AL CONDUCTOR
-- ----------------------------------------------------------------------------
-- La primera versión del script 182 sembró `url_encuesta` con el marcador
-- 'https://forms.gle/PENDIENTE'. Era un recordatorio de "aquí va un formulario",
-- escrito antes de que LIPgo tuviera encuesta propia.
--
-- POR QUÉ HACE FALTA UN SCRIPT APARTE
-- El 182 termina en `on conflict (evento) do nothing`, que protege la
-- configuración que alguien ya ajustó a mano --y hace bien: no debe pisar el
-- texto del mensaje ni las empresas habilitadas cada vez que se corre. El
-- efecto secundario es que corregir la semilla en el archivo no arregla las
-- bases donde el 182 ya se corrió. Eso solo se cambia con un UPDATE explícito.
--
-- POR QUÉ IMPORTA
-- El aviso de fin de cargue arma el enlace a la encuesta PROPIA cuando
-- `url_encuesta` está vacío. Con una URL externa ahí, esa gana --así fue
-- pensado, para poder usar un formulario de terceros. Pero 'forms.gle/PENDIENTE'
-- no es un formulario: es un enlace muerto. Al conductor le llegaría un WhatsApp
-- con un enlace que no abre nada, y el KPI de Satisfacción conductor se quedaría
-- en cero sin que nada avisara por qué.
--
-- QUÉ NO HACE
-- Solo toca la fila que todavía tiene ESE marcador exacto. Si alguien configuró
-- un formulario real a propósito, se queda como está.
--
-- Idempotente: correrlo dos veces no cambia nada la segunda.
-- ============================================================================


-- ----------------------------------------------------------------------------
-- PASO 1 — CÓMO ESTÁ HOY
-- ----------------------------------------------------------------------------

select evento,
       url_encuesta,
       case
         when url_encuesta is null then 'usa la encuesta de LIPgo'
         when url_encuesta = 'https://forms.gle/PENDIENTE' then 'MARCADOR MUERTO -- lo corrige el paso 2'
         else 'formulario externo configurado a proposito'
       end as diagnostico
from public.notificaciones_conductor_config
order by evento;


-- ----------------------------------------------------------------------------
-- PASO 2 — LA CORRECCIÓN
-- ----------------------------------------------------------------------------
-- Queda en NULL, que es lo que hace que el aviso arme el enlace propio por orden.

update public.notificaciones_conductor_config
   set url_encuesta = null,
       updated_at   = now()
 where url_encuesta = 'https://forms.gle/PENDIENTE';


-- ----------------------------------------------------------------------------
-- PASO 3 — VERIFICACIÓN
-- ----------------------------------------------------------------------------

-- 3a) Ya no debe quedar ninguna fila con el marcador.
select count(*) as filas_con_marcador_muerto
from public.notificaciones_conductor_config
where url_encuesta = 'https://forms.gle/PENDIENTE';
-- Esperado: 0

-- 3b) Estado final de los dos eventos.
select evento, activo, url_encuesta, empresas, telefono_prueba
from public.notificaciones_conductor_config
order by evento;
-- Esperado en 'cargue_finalizado': url_encuesta en NULL.


-- ----------------------------------------------------------------------------
-- REVERSIÓN
-- ----------------------------------------------------------------------------
-- No hay nada que revertir: el valor que se quitó era un marcador muerto, no
-- una configuración. Si se quisiera usar un formulario externo, se escribe su
-- URL real desde la pantalla de Notificación conductor.
