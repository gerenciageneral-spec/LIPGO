-- ============================================================================
-- CIERRE DEL EXPEDIENTE ARL en las investigaciones de accidentes / incidentes
--
-- La tabla ya guarda si el evento se REPORTÓ a la ARL (`reportado_arl`,
-- `fecha_reporte_arl`, `furat_radicado`), pero no si la ARL ya CERRÓ el
-- expediente. Son dos momentos distintos y bien separados en el tiempo: uno
-- abre el caso, el otro lo termina, y en una auditoría los piden por aparte.
--
-- `fecha_cierre` tampoco sirve para esto: ese es el cierre de la investigación
-- interna de LIP, que puede estar cerrada mientras la ARL sigue con el
-- expediente abierto.
--
-- NO BORRA NI MODIFICA NADA. Solo agrega dos columnas, y `if not exists` hace
-- que correrlo dos veces sea inofensivo.
-- ============================================================================

alter table public.sst_incidentes
  add column if not exists cierre_arl boolean not null default false;

alter table public.sst_incidentes
  add column if not exists fecha_cierre_arl date;

comment on column public.sst_incidentes.cierre_arl is
  'La ARL ya cerró el expediente del evento. Distinto de `fecha_cierre`, que es el cierre de la investigación interna.';
comment on column public.sst_incidentes.fecha_cierre_arl is
  'Fecha en que se marcó el cierre del expediente ARL. Se pone sola al marcar el check y se limpia al desmarcarlo.';

-- Los registros que ya existían quedan en false, que es lo correcto: mientras
-- nadie marque el cierre, el expediente se asume abierto.
update public.sst_incidentes
   set cierre_arl = false
 where cierre_arl is null;


-- ----------------------------------------------------------------------------
-- VERIFICACIÓN. Las dos columnas deben aparecer.
-- ----------------------------------------------------------------------------
select column_name, data_type, column_default, is_nullable
  from information_schema.columns
 where table_schema = 'public'
   and table_name = 'sst_incidentes'
   and column_name in ('cierre_arl', 'fecha_cierre_arl')
 order by column_name;

-- Cuántos expedientes quedan abiertos frente a la ARL. Al correr esto por
-- primera vez, `cerrados` da 0: todavía nadie ha marcado ninguno.
select count(*)                                        as total,
       count(*) filter (where cierre_arl)              as cerrados,
       count(*) filter (where not cierre_arl)          as abiertos,
       count(*) filter (where reportado_arl)           as reportados_a_arl
  from public.sst_incidentes;
