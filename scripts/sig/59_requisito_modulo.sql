-- ============================================================================
-- 59 — NUMERALES CUBIERTOS POR MÓDULOS DE LIPgo
-- ----------------------------------------------------------------------------
-- Hoy la Matriz Integrada solo sabe de DOS clases de evidencia:
--   · un documento subido (sig_documento_cobertura)
--   · el Centro de Evidencia ISO 9001 (iso_clausulas), que calcula el estado
--     contra datos reales del ERP
--
-- Falta la tercera, que es la que el negocio ya tiene funcionando: numerales
-- que NO se sustentan con un archivo sino con un MÓDULO de LIPgo. El análisis
-- de contexto (4.1) no es un PDF: es el módulo DOFA con sus filas. Los
-- objetivos (6.2) no son un archivo: son el módulo Objetivos y Metas.
--
-- Esa relación ya existía, pero solo como COMENTARIO en el código:
--   lib/sig-actions.ts:752  «Análisis de Contexto / DOFA (…, numeral 4.1)»
--   lib/sig-actions.ts:900  «Objetivos y Metas del SIG (sig_objetivos, numeral 6.2)»
--   lib/sig-actions.ts:820  «Matriz Legal (sig_requisitos_legales, numeral 6.1.3)»
--   lib/sig-actions.ts:633  «Aspectos e impactos ambientales (numeral 6.1.2)»
-- Un comentario no se consulta, no navega y no se ve desde la Matriz.
--
-- POR QUÉ NO SE REUSA sig_documento_cobertura
-- Esa tabla responde «¿qué ARCHIVO cubre este numeral?». Un módulo no es un
-- archivo: no tiene versión, no se descarga, y la pregunta del auditor no es
-- «¿existe el documento?» sino «¿esto está vivo y con datos?». Meterlo ahí
-- obligaría a que un módulo finja ser un documento, y el día que alguien liste
-- los documentos del SGI saldrían filas que no son documentos.
--
-- EL PATRÓN NO ES NUEVO: ya funciona para la Resolución 0312.
-- `sst_estandar_items` tiene las columnas `modulo` y `tabla`, y
-- lib/sst-auditoria-actions.ts:262-278 usa `tabla` para contar registros vivos
-- y mostrar «N registros» junto al módulo. Esto lleva ese mismo patrón, ya
-- probado, a la Matriz Integrada.
--
-- Aditivo e idempotente: correrlo dos veces es inofensivo. No modifica ninguna
-- tabla existente ni toca los documentos ya cargados.
-- ============================================================================


-- ----------------------------------------------------------------------------
-- PASO 1 — LA TABLA
-- ----------------------------------------------------------------------------

create table if not exists public.sig_requisito_modulo (
  id serial primary key,
  idempresa int not null,

  requisito_id int not null references public.sig_requisitos(id) on delete cascade,

  -- NULL = el módulo cubre ese numeral en TODAS las normas donde aplica.
  -- Es lo habitual: el módulo DOFA sustenta el 4.1 de las tres normas, no de
  -- una sola. Con un norma_id concreto se restringe a esa norma.
  norma_id int references public.sig_normas(id) on delete cascade,

  -- Identificador del módulo. Es el NOMBRE VISIBLE en español, con tildes y
  -- separadores, tal como aparece en lib/dashboard-data.ts y en las claves de
  -- MODULE_PERMISSION_MAP (p. ej. 'Análisis de Contexto DOFA').
  --
  -- Se guarda el nombre y no un slug porque es el identificador canónico real
  -- del sistema: es lo que compara main-content.tsx, lo que resuelve
  -- navigateToModule y lo que usa PermissionGuard. Traducir a un slug exigiría
  -- una tabla de equivalencias que habría que mantener sincronizada a mano.
  --
  -- RIESGO ASUMIDO: si alguien renombra un módulo, este mapeo queda huérfano.
  -- No falla ruidosamente, simplemente deja de navegar. Por eso el PASO 5 trae
  -- una consulta de verificación que lista los mapeos cuyo módulo ya no existe.
  -- Correrla después de cualquier renombramiento de módulos.
  modulo text not null,

  -- Tabla de respaldo para contar registros vivos. NULL = no se cuenta y la
  -- celda solo enlaza al módulo, sin decir cuántos registros tiene.
  --
  -- El nombre de tabla se usa para construir una consulta, así que NO puede
  -- venir de entrada libre del usuario: este catálogo lo define quien despliega,
  -- mediante este script. La aplicación solo lee de aquí.
  tabla text,

  -- Notas para el auditor: qué parte del módulo sustenta el numeral.
  nota text,

  activo boolean not null default true,
  actualizado_por text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);


-- ----------------------------------------------------------------------------
-- PASO 2 — UNICIDAD
-- ----------------------------------------------------------------------------
-- En Postgres NULL <> NULL, así que un unique que incluya norma_id NO impide
-- dos filas comodín duplicadas (mismo requisito, misma norma NULL, mismo
-- módulo). Ya nos pasó con las políticas de horas extra. Por eso van DOS
-- índices parciales en vez de un unique compuesto.

create unique index if not exists uq_sig_req_modulo_con_norma
  on public.sig_requisito_modulo (idempresa, requisito_id, norma_id, modulo)
  where norma_id is not null;

create unique index if not exists uq_sig_req_modulo_sin_norma
  on public.sig_requisito_modulo (idempresa, requisito_id, modulo)
  where norma_id is null;

create index if not exists idx_sig_req_modulo_req
  on public.sig_requisito_modulo (requisito_id);
create index if not exists idx_sig_req_modulo_emp
  on public.sig_requisito_modulo (idempresa);


-- ----------------------------------------------------------------------------
-- PASO 3 — DOCUMENTACIÓN DE COLUMNAS
-- ----------------------------------------------------------------------------

comment on table public.sig_requisito_modulo is
  'Numerales de la Matriz Integrada que se sustentan con un módulo de LIPgo en vez de un archivo. Ver scripts/sig/59.';
comment on column public.sig_requisito_modulo.norma_id is
  'NULL = aplica a todas las normas donde el requisito aplique.';
comment on column public.sig_requisito_modulo.modulo is
  'Nombre visible del módulo, idéntico a lib/dashboard-data.ts / MODULE_PERMISSION_MAP.';
comment on column public.sig_requisito_modulo.tabla is
  'Tabla de respaldo para contar registros vivos. Catálogo curado: NO aceptar entrada de usuario.';


-- ----------------------------------------------------------------------------
-- PASO 4 — SEMILLA
-- ----------------------------------------------------------------------------
-- Solo los mapeos que ya estaban DECLARADOS en el código como comentario, más
-- los que son inequívocos por el nombre del módulo. No se adivina: un mapeo
-- inventado le diría a un auditor que un numeral está cubierto cuando nadie lo
-- verificó. El resto se agrega desde la interfaz.
--
-- norma_id va en NULL a propósito: estos módulos sustentan el numeral en todas
-- las normas donde aplique, no en una sola.

insert into public.sig_requisito_modulo (idempresa, requisito_id, norma_id, modulo, tabla, nota)
select 100, r.id, null, v.modulo, v.tabla, v.nota
from (values
  -- Declarados en comentarios de lib/sig-actions.ts
  ('4.1',   'Análisis de Contexto DOFA',         'sig_contexto_dofa',       'Cuadrantes DOFA y factores internos/externos.'),
  ('6.1.2', 'Aspectos e Impactos ISO 14001',     'sig_aspectos_ambientales','Matriz de aspectos e impactos ambientales.'),
  ('6.1.3', 'Matriz Legal Ambiental',            'sig_requisitos_legales',  'Requisitos legales aplicables y su evaluación.'),
  ('6.2',   'Objetivos y Metas SIG',             'sig_objetivos',           'Objetivos del SIG con meta e indicador.'),
  -- Inequívocos por correspondencia directa numeral <-> módulo
  ('9.1',   'Indicadores SIG',                   'sig_indicadores',         'Tablero de indicadores del SIG.'),
  ('9.1.2', 'Satisfacción y PQRSF',              'sig_satisfaccion',        'Encuestas de satisfacción del cliente.'),
  ('10.2',  'No Conformidades SIG',              'sig_no_conformidades',    'No conformidades, causa raíz y acciones.')
) as v(numeral, modulo, tabla, nota)
join public.sig_requisitos r on r.numeral = v.numeral
on conflict do nothing;


-- ----------------------------------------------------------------------------
-- PASO 5 — VERIFICACIÓN
-- ----------------------------------------------------------------------------
-- Solo lecturas.

-- 5a) Qué quedó mapeado.
select r.numeral, r.tema, m.modulo, m.tabla, m.activo
from public.sig_requisito_modulo m
join public.sig_requisitos r on r.id = m.requisito_id
order by string_to_array(r.numeral, '.')::int[];

-- 5b) ¿Las tablas de respaldo existen? Si alguna sale 'FALTA', el conteo de esa
--     fila dará 0 y la celda se verá como pendiente.
select distinct m.tabla,
       case when to_regclass('public.' || m.tabla) is null then 'FALTA' else 'ok' end as estado
from public.sig_requisito_modulo m
where m.tabla is not null;

-- 5c) ¿Cuántos registros vivos tiene hoy cada módulo mapeado? Es lo que verá el
--     auditor. Un 0 aquí significa que el numeral quedará en PENDIENTE: el
--     módulo está declarado pero vacío, y un módulo vacío no es evidencia.
--     Correr después de 5b (falla si alguna tabla no existe).
do $$
declare t record; n bigint;
begin
  for t in select distinct tabla from public.sig_requisito_modulo where tabla is not null loop
    if to_regclass('public.' || t.tabla) is null then
      raise notice '% -> tabla inexistente', t.tabla;
    else
      execute format('select count(*) from public.%I', t.tabla) into n;
      raise notice '% -> % registros', t.tabla, n;
    end if;
  end loop;
end $$;

-- 5d) MAPEOS HUÉRFANOS POR RENOMBRAMIENTO.
--     Correr DESPUÉS de renombrar cualquier módulo. La lista de nombres válidos
--     está en lib/dashboard-data.ts; acá se verifica contra los que sembramos.
--     Si aparece un módulo que ya no existe en el menú, hay que corregirlo:
--     el enlace de la Matriz no llevará a ninguna parte.
select distinct m.modulo
from public.sig_requisito_modulo m
where m.activo
order by 1;


-- ----------------------------------------------------------------------------
-- REVERSIÓN
-- ----------------------------------------------------------------------------
-- La tabla es aditiva y nada más la lee: borrarla devuelve la Matriz al estado
-- anterior (las celdas vuelven a mostrar solo documentos).
--
--   drop table if exists public.sig_requisito_modulo;
