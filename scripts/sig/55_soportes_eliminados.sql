-- ============================================================================
-- QUITAR SOPORTES DOCUMENTALES sin perder la trazabilidad
--
-- Hasta ahora un archivo subido por error se quedaba ahí para siempre: lo único
-- que existía era `vigente = false`, que NO sirve para esto. "Histórico"
-- significa "esto valió en su momento y fue reemplazado", y se sigue mostrando
-- como evidencia en el Repositorio de Soportes y en el Repositorio Universal.
-- Un PDF que alguien colgó en el estándar equivocado no es un histórico: no
-- debería figurar en ninguna de las dos vistas.
--
-- POR QUÉ NO SE BORRA LA FILA. Estos documentos son evidencia de un SG-SST que
-- se audita. Borrar de verdad dejaría un hueco imposible de explicar: nadie
-- podría decir qué había ahí ni quién lo quitó. Se marca como eliminado, se
-- guarda cuándo, quién y por qué, y las vistas dejan de mostrarlo.
--
-- El archivo en el bucket TAMPOCO se borra: si la eliminación fue un error, se
-- puede revertir con un UPDATE (ver el final) y el documento vuelve intacto.
--
-- NO BORRA NI MODIFICA NADA. Solo agrega tres columnas, y `if not exists` hace
-- que correrlo dos veces sea inofensivo.
-- ============================================================================

alter table public.soportes_documentales
  add column if not exists eliminado boolean not null default false;

alter table public.soportes_documentales
  add column if not exists eliminado_en timestamptz;

alter table public.soportes_documentales
  add column if not exists eliminado_motivo text;

comment on column public.soportes_documentales.eliminado is
  'Soporte retirado (subido por error, archivo equivocado). Distinto de vigente=false, que es un histórico legítimo y sí se muestra como evidencia.';
comment on column public.soportes_documentales.eliminado_en is
  'Cuándo se retiró. Se conserva junto con el motivo para poder explicar el retiro en una auditoría.';
comment on column public.soportes_documentales.eliminado_motivo is
  'Por qué se retiró. Se exige al quitarlo: sin motivo, dentro de un año nadie sabe si fue un error o una maniobra.';

-- Índice parcial: las consultas normales piden "los NO eliminados", que son
-- la enorme mayoría de las filas.
create index if not exists idx_soportes_documentales_eliminado
  on public.soportes_documentales (referencia_tipo, referencia_id)
  where eliminado = false;


-- ----------------------------------------------------------------------------
-- VERIFICACIÓN. Las tres columnas deben aparecer.
-- ----------------------------------------------------------------------------
select column_name, data_type, column_default, is_nullable
  from information_schema.columns
 where table_schema = 'public'
   and table_name = 'soportes_documentales'
   and column_name in ('eliminado', 'eliminado_en', 'eliminado_motivo')
 order by column_name;

-- Estado del repositorio. Al correr esto por primera vez `eliminados` da 0.
select count(*)                                   as total,
       count(*) filter (where vigente)            as vigentes,
       count(*) filter (where not vigente)        as historicos,
       count(*) filter (where eliminado)          as eliminados
  from public.soportes_documentales;


-- ============================================================================
-- PARA DESHACER UNA ELIMINACIÓN
--
-- El archivo nunca se borró del bucket, así que revertir lo devuelve completo.
-- Reemplazar <id> por el de la fila (se ve en la consulta de abajo).
--
--   select id, modulo, referencia_tipo, referencia_id, archivo_nombre,
--          eliminado_en, eliminado_motivo
--     from public.soportes_documentales
--    where eliminado
--    order by eliminado_en desc;
--
--   update public.soportes_documentales
--      set eliminado = false, eliminado_en = null, eliminado_motivo = null
--    where id = <id>;
--
-- OJO: revertir NO lo vuelve vigente. Si además tiene que volver a ser la
-- versión válida, hay que poner `vigente = true` y bajar la que esté vigente
-- hoy en esa misma referencia.
-- ============================================================================
