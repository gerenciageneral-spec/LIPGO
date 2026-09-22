-- ============================================================================
-- 187 — VERIFICAR QUE LA ENCUESTA DEL CONDUCTOR PUEDE GUARDAR
-- ----------------------------------------------------------------------------
-- Solo lecturas. NO modifica nada.
--
-- Comprueba, sin tener que mandarle un WhatsApp a nadie, que la encuesta
-- pública tiene todo lo que necesita para registrar una respuesta.
--
-- El modo de fallar que se quiere evitar: el conductor abre el enlace,
-- califica, y el guardado falla por una columna o un índice que falta. Del
-- lado de él no hay nada que corregir, y del lado de LIPgo el único síntoma es
-- un indicador que no sube.
-- ============================================================================


-- ----------------------------------------------------------------------------
-- 1 — LAS COLUMNAS QUE ESCRIBE EL FORMULARIO
-- ----------------------------------------------------------------------------
-- Son 14. Si el conteo da menos, falta correr sig/15 o sig/33.

select count(*) as columnas_encontradas,
       14       as columnas_necesarias,
       case when count(*) = 14 then 'COMPLETO' else 'FALTAN COLUMNAS' end as estado
from information_schema.columns
where table_schema = 'public'
  and table_name   = 'sig_satisfaccion'
  and column_name in (
        'proyecto_id', 'tipo', 'fecha', 'encuestado', 'calificacion',
        'oportunidad', 'comunicacion', 'recomendaria', 'comentario',
        'canal', 'responsable', 'activo', 'ref_orden', 'placa'
      );

-- 1b) Cuál falta, si falta alguna.
select c.columna
from (values
        ('proyecto_id'), ('tipo'), ('fecha'), ('encuestado'), ('calificacion'),
        ('oportunidad'), ('comunicacion'), ('recomendaria'), ('comentario'),
        ('canal'), ('responsable'), ('activo'), ('ref_orden'), ('placa')
     ) as c(columna)
where not exists (
  select 1 from information_schema.columns
  where table_schema = 'public'
    and table_name   = 'sig_satisfaccion'
    and column_name  = c.columna
);
-- Lo esperado: VACÍO.


-- ----------------------------------------------------------------------------
-- 2 — EL CANDADO CONTRA LA DOBLE RESPUESTA
-- ----------------------------------------------------------------------------
-- Sin este índice, el mismo enlace respondido veinte veces mueve el indicador
-- veinte veces. Tiene que existir Y ser parcial: las encuestas digitadas a mano
-- no tienen orden y deben poder ser muchas.

select indexname,
       case
         when indexdef ilike '%unique%' and indexdef ilike '%where%' then 'OK — unico y parcial'
         when indexdef ilike '%unique%'                              then 'REVISAR — unico pero NO parcial'
         else 'REVISAR — no es unico'
       end as estado,
       indexdef
from pg_indexes
where schemaname = 'public'
  and tablename  = 'sig_satisfaccion'
  and indexname  = 'uq_sig_satisfaccion_ref_orden';
-- Si sale VACÍO, el índice no existe: correr scripts/183.


-- ----------------------------------------------------------------------------
-- 3 — QUE EL INDICADOR VAYA A CONTAR LA RESPUESTA
-- ----------------------------------------------------------------------------
-- El KPI filtra por `activo = true`, `tipo` y `proyecto_id`. El formulario
-- escribe los tres, pero `proyecto_id` sale de `cabeceraoc.idempresa`: si una
-- orden lo tuviera nulo, la respuesta se guardaría sin contar en ningún lado.

select count(*)                                      as ordenes_cerradas_30d,
       count(*) filter (where idempresa is null)     as sin_empresa,
       count(*) filter (where ordendecargue is null) as sin_codigo_de_orden
from public.cabeceraoc
where fincargue is not null
  and fechacargue >= current_date - 30;
-- Lo esperado: las dos últimas en 0. Una orden sin código no se puede
-- calificar; una sin empresa se calificaría sin entrar al indicador.


-- ----------------------------------------------------------------------------
-- 4 — RESPUESTAS QUE YA HAY
-- ----------------------------------------------------------------------------
-- `canal` dice de dónde vino cada una: encuesta_conductor = el enlace de
-- WhatsApp; kiosko = el dispositivo en sitio; telefonico/presencial = digitada.

select tipo,
       canal,
       count(*)                          as n,
       round(avg(calificacion), 2)       as promedio_1a5,
       round(avg(calificacion) / 5 * 100, 1) as pct,
       max(fecha)                        as ultima
from public.sig_satisfaccion
where activo = true
group by tipo, canal
order by tipo, canal;


-- ----------------------------------------------------------------------------
-- 5 — LA ÚLTIMA ORDEN CERRADA
-- ----------------------------------------------------------------------------
-- Es la que trae el botón "Ver un enlace real" de la pantalla de Notificación
-- conductor. Sirve para reconocer, al probar, que el enlace abrió la correcta.

select id,
       ordendecargue,
       placa,
       conductor,
       fechacargue,
       idempresa
from public.cabeceraoc
where fincargue is not null
order by id desc
limit 1;
