-- ============================================================================
-- 195 — ¿QUÉ COLUMNAS ESPERA EL CÓDIGO Y NO ESTÁN EN LA BASE?
-- ----------------------------------------------------------------------------
-- Diagnóstico. NO modifica nada: solo lecturas.
--
-- POR QUÉ
-- El Centro de Evidencias falló porque `iso_clausulas` no tenía las columnas
-- que el código escribe desde hace tiempo: el script que las crea (el 013)
-- quedó sin correr. El fallo no apareció hasta que alguien intentó subir un
-- archivo --meses después.
--
-- Ese modo de fallar se repite: un script viejo sin correr no avisa; espera a
-- que alguien use esa función. Esto busca los demás casos ANTES de que los
-- encuentre un usuario.
--
-- Cubre lo que agregan los scripts más antiguos (001-020), que son los que
-- llevan más tiempo y más probabilidad de haberse saltado.
-- ============================================================================


-- ----------------------------------------------------------------------------
-- 1 — COLUMNAS QUE EL CÓDIGO USA Y PODRÍAN FALTAR
-- ----------------------------------------------------------------------------

with esperadas(tabla, columna, script) as (values
  -- 013 — Centro de Evidencias ISO (el que falló)
  ('iso_clausulas',       'evidencia_url',      '013 / 194'),
  ('iso_clausulas',       'evidencia_path',     '013 / 194'),
  ('iso_clausulas',       'evidencia_nombre',   '013 / 194'),
  ('iso_clausulas',       'evidencia_fecha',    '013 / 194'),
  ('iso_clausulas',       'estado_manual',      '013 / 194'),
  ('iso_clausulas',       'nota',               '013 / 194'),
  ('iso_clausulas',       'actualizado_en',     '013 / 194'),
  -- 001
  ('cabeceraoc',          'tipo_factura',       '001'),
  -- 006
  ('citasvehiculos',      'estatus',            '006'),
  ('citasvehiculos',      'idempresa',          '006'),
  -- 007
  ('solicitudesturnos',   'pdfaprobacion',      '007'),
  -- 008
  ('solicitudesturnos',   'tipo',               '008'),
  -- 012
  ('hojas_de_vida',       'estado',             '012'),
  -- 018 / 019
  ('sst_incidentes',      'ausentismo_id',      '018'),
  ('headcount',           'sst_induccion',      '019')
)
select e.script,
       e.tabla,
       e.columna,
       case
         when to_regclass('public.' || e.tabla) is null then 'LA TABLA NO EXISTE'
         when c.column_name is null                     then 'FALTA LA COLUMNA'
         else 'ok'
       end as estado
from esperadas e
left join information_schema.columns c
       on c.table_schema = 'public'
      and c.table_name   = e.tabla
      and c.column_name  = e.columna
where c.column_name is null
   or to_regclass('public.' || e.tabla) is null
order by e.script, e.tabla, e.columna;
-- Lo esperado después de correr el 194: VACÍO.
-- Lo que salga aquí es una función de LIPgo que falla al usarse.


-- ----------------------------------------------------------------------------
-- 2 — RESUMEN
-- ----------------------------------------------------------------------------

with esperadas(tabla, columna) as (values
  ('iso_clausulas','evidencia_url'), ('iso_clausulas','evidencia_path'),
  ('iso_clausulas','evidencia_nombre'), ('iso_clausulas','evidencia_fecha'),
  ('iso_clausulas','estado_manual'), ('iso_clausulas','nota'),
  ('iso_clausulas','actualizado_en'),
  ('cabeceraoc','tipo_factura'),
  ('citasvehiculos','estatus'), ('citasvehiculos','idempresa'),
  ('solicitudesturnos','pdfaprobacion'), ('solicitudesturnos','tipo'),
  ('hojas_de_vida','estado'),
  ('sst_incidentes','ausentismo_id'),
  ('headcount','sst_induccion')
)
select count(*) as revisadas,
       count(*) filter (where c.column_name is not null) as presentes,
       count(*) filter (where c.column_name is null)     as faltantes
from esperadas e
left join information_schema.columns c
       on c.table_schema = 'public'
      and c.table_name   = e.tabla
      and c.column_name  = e.columna;


-- ----------------------------------------------------------------------------
-- 3 — ARCHIVOS HUÉRFANOS DE ESTE FALLO
-- ----------------------------------------------------------------------------
-- Cada intento de subir evidencia dejó el archivo en Storage sin fila que lo
-- referenciara: el código subía primero y registraba después, y al fallar el
-- registro no borraba nada. Ya se corrigió, pero los de antes siguen ahí.
--
-- Esta consulta los lista. Borrarlos es manual, desde Storage > archivos >
-- carpeta iso9001, comparando con lo que sí está registrado.

select name,
       created_at,
       round((metadata->>'size')::numeric / 1024, 1) as kb
from storage.objects
where bucket_id = 'archivos'
  and name like 'iso9001/%'
  and name not in (
    select evidencia_path
    from public.iso_clausulas
    where evidencia_path is not null
  )
order by created_at desc;
-- Si el paso 1 mostró que falta `evidencia_path`, esta consulta fallará:
-- correr primero el 194.
