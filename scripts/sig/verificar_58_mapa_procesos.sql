-- ============================================================
-- VERIFICACION DEL SCRIPT 58 + enlace Mapa <-> Matriz
-- Solo lecturas. No modifica nada.
-- ============================================================

-- 1) Las 8 columnas nuevas deben aparecer todas.
select column_name, data_type
from information_schema.columns
where table_schema = 'public'
  and table_name   = 'sig_documentos'
  and column_name in ('categoria','proceso_id','archivo_url','archivo_nombre',
                      'subido_por','actualizado_at','eliminado','eliminado_motivo','eliminado_en')
order by column_name;

-- 2) El CHECK de categoria quedo creado (se agrego NOT VALID).
select conname, convalidated, pg_get_constraintdef(oid) as definicion
from pg_constraint
where conrelid = 'public.sig_documentos'::regclass
  and contype = 'c';

-- 3) Los 94 documentos existentes deben seguir intactos y sin clasificar.
select count(*) as total_documentos,
       count(proceso_id) as con_proceso,
       count(categoria)  as con_categoria
from public.sig_documentos;

-- 4) La columna documento_id de la cobertura existe (script 04).
select column_name, data_type
from information_schema.columns
where table_schema='public' and table_name='sig_documento_cobertura'
  and column_name in ('documento_id','observacion','idempresa');

-- 5) Cuantos requisitos hay para asociar. Si da 0, el dialogo
--    saldra vacio y no es culpa del 58.
select (select count(*) from public.sig_requisitos where activo) as requisitos_activos,
       (select count(*) from public.sig_normas    where activo) as normas_activas,
       (select count(*) from public.sig_requisito_norma where aplica is not false) as pares_disponibles;
