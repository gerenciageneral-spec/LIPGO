-- =====================================================================
-- 42 · Investigación AT — repositorio de ORIGINALES EDITABLES
-- documento_editable_url = archivo editable (Excel/Word) para corregir, aparte
-- del "Ver" que muestra un PDF NO editable. Migra lo ya cargado en documento_url
-- (los originales del ZIP) a la columna editable.
-- Aditivo e idempotente. Correr en Supabase.
-- =====================================================================

alter table public.sst_incidentes add column if not exists documento_editable_url text;

-- Los originales del ZIP (xlsx) se subieron a documento_url; son EDITABLES → moverlos.
update public.sst_incidentes
   set documento_editable_url = documento_url
 where documento_url is not null
   and documento_editable_url is null
   and documento_url ilike '%.xlsx%';

-- documento_url se reserva para un PDF firmado si se quisiera adjuntar; el "Ver"
-- del repositorio genera el PDF no editable desde los datos.
update public.sst_incidentes
   set documento_url = null
 where documento_url ilike '%.xlsx%';

-- =====================================================================
-- FIN. Repositorio de investigaciones: PDF no editable (Ver) + Excel (editar).
-- =====================================================================
