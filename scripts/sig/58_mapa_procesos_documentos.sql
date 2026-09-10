-- ============================================================================
-- 58 — DOCUMENTOS DEL MAPA DE PROCESOS
-- ----------------------------------------------------------------------------
-- El Mapa de Procesos (Certificaciones › SIG) deja abrir cada proceso y cargarle
-- sus documentos en tres listas: FORMATOS, INFORMACIÓN DOCUMENTADA y REGISTROS.
-- Cada documento lleva código, nombre, versión y el archivo adjunto.
--
-- POR QUÉ NO SE CREA UNA TABLA NUEVA
-- `sig_documentos` ya existe, ya tiene esos campos --codigo, nombre, tipo,
-- proceso, version, soporte-- y es lo que alimenta el Listado Maestro de
-- Documentos del Dashboard SIG. Una tabla aparte para el mapa daría DOS
-- listados de documentos que con el tiempo se contradicen, y en una auditoría
-- la pregunta "¿cuáles son los documentos del SGI?" tendría dos respuestas.
--
-- Lo que se agrega es lo que faltaba para que el mapa pueda escribir ahí:
--   · `categoria`   — cuál de las tres listas (formato / informacion / registro)
--   · `archivo_url` — el adjunto, que hoy no se guardaba en la tabla
--   · `proceso_id`  — a qué proceso del mapa pertenece (E-01, M-02, A-03…)
--   · trazabilidad de quién lo subió y cuándo
--
-- LOS 94 DOCUMENTOS QUE YA EXISTEN NO SE TOCAN. Se quedan tal cual, con su
-- `categoria` y `proceso_id` en null: siguen saliendo en el Listado Maestro
-- como hasta ahora, y aparecerán en el mapa cuando se les asigne un proceso.
-- El script NO adivina a qué proceso pertenece cada uno: eso lo decide una
-- persona, y hacerlo por coincidencia de texto sería inventar clasificación
-- documental.
--
-- Aditivo e idempotente: correrlo dos veces es inofensivo.
-- ============================================================================


-- ----------------------------------------------------------------------------
-- PASO 1 — LAS COLUMNAS NUEVAS
-- ----------------------------------------------------------------------------

-- Cuál de las tres listas del mapa. NULL = documento que ya existía y todavía
-- no se clasificó; sigue visible en el Listado Maestro, no en el mapa.
alter table public.sig_documentos
  add column if not exists categoria text;

-- Proceso del mapa al que pertenece: 'E-01'..'E-03', 'M-01'..'M-02',
-- 'A-01'..'A-04', 'IN-01', 'OUT-01'. NULL = sin asignar.
--
-- Se guarda el CÓDIGO y no el nombre a propósito: el nombre de un proceso se
-- puede corregir ("Gestión de Compras" → "Gestión de Compras y Proveedores") y
-- todos los documentos quedarían huérfanos. El código no cambia.
alter table public.sig_documentos
  add column if not exists proceso_id text;

-- El adjunto. Vive en el bucket "archivos", igual que el resto de soportes.
alter table public.sig_documentos
  add column if not exists archivo_url text;
alter table public.sig_documentos
  add column if not exists archivo_nombre text;

-- Trazabilidad mínima: en una auditoría de control de documentos (ISO 7.5) hay
-- que poder decir quién subió cada versión y cuándo.
alter table public.sig_documentos
  add column if not exists subido_por text;
alter table public.sig_documentos
  add column if not exists actualizado_at timestamptz default now();

-- Retirado del listado sin borrarlo. Mismo criterio que
-- `soportes_documentales.eliminado` (script 55): un documento subido por error
-- no se borra --dejaría un hueco imposible de explicar-- se marca y deja de
-- mostrarse.
alter table public.sig_documentos
  add column if not exists eliminado boolean not null default false;
alter table public.sig_documentos
  add column if not exists eliminado_motivo text;
alter table public.sig_documentos
  add column if not exists eliminado_en timestamptz;

-- Solo las tres categorías del mapa, o null. Sin esto, un typo en el código
-- crearía una cuarta lista invisible que nadie encontraría.
--
-- Se agrega con NOT VALID: la restricción rige para lo NUEVO sin exigir que las
-- 94 filas existentes la cumplan (todas tienen categoria en null, así que la
-- cumplen, pero NOT VALID evita que el script falle si alguna trae basura).
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'sig_documentos_categoria_valida'
  ) then
    alter table public.sig_documentos
      add constraint sig_documentos_categoria_valida
      check (categoria is null or categoria in ('formato', 'informacion', 'registro'))
      not valid;
  end if;
end $$;

-- Búsqueda del mapa: "dame los documentos de ESTE proceso en ESTA lista".
create index if not exists ix_sig_documentos_mapa
  on public.sig_documentos (proceso_id, categoria)
  where eliminado = false;

comment on column public.sig_documentos.categoria is
  'Lista del Mapa de Procesos: formato | informacion | registro. NULL = documento previo sin clasificar, visible solo en el Listado Maestro.';
comment on column public.sig_documentos.proceso_id is
  'Código del proceso del mapa (E-01, M-02, A-03, IN-01, OUT-01). Se guarda el código y no el nombre para que renombrar un proceso no deje huérfanos sus documentos.';
comment on column public.sig_documentos.archivo_url is
  'Adjunto en el bucket "archivos". El mismo bucket que usa soportes_documentales.';
comment on column public.sig_documentos.eliminado is
  'Retirado del listado sin borrarlo, con su motivo. Mismo criterio que soportes_documentales.eliminado.';


-- ----------------------------------------------------------------------------
-- PASO 2 — VERIFICACIÓN
-- ----------------------------------------------------------------------------

-- 2a) Las columnas nuevas deben aparecer.
select column_name, data_type, column_default, is_nullable
  from information_schema.columns
 where table_schema = 'public'
   and table_name = 'sig_documentos'
   and column_name in (
     'categoria', 'proceso_id', 'archivo_url', 'archivo_nombre',
     'subido_por', 'actualizado_at', 'eliminado', 'eliminado_motivo', 'eliminado_en'
   )
 order by column_name;

-- 2b) Estado del maestro. En la primera corrida, `en_el_mapa` da 0: los 94
--     documentos existentes siguen sin proceso asignado, que es lo esperado.
select count(*)                                        as documentos_totales,
       count(*) filter (where proceso_id is not null)   as en_el_mapa,
       count(*) filter (where proceso_id is null)       as sin_proceso,
       count(*) filter (where eliminado)                as eliminados
  from public.sig_documentos;

-- 2c) Qué valores trae hoy el campo `proceso` de los documentos existentes.
--     Sirve para decidir a qué proceso del mapa corresponde cada grupo antes de
--     asignarlos. NO se asignan solos: clasificar un documento es una decisión
--     del SIG, no una coincidencia de texto.
select coalesce(nullif(trim(proceso), ''), '(sin proceso)') as proceso_actual,
       count(*)                                             as documentos
  from public.sig_documentos
 group by 1
 order by 2 desc;


-- ============================================================================
-- PARA ASIGNAR DOCUMENTOS EXISTENTES A UN PROCESO DEL MAPA
--
-- Una vez revisada la consulta 2c, se asignan por grupo. Ejemplo --revisar
-- SIEMPRE el `proceso_actual` real antes de correrlo--:
--
--   update public.sig_documentos
--      set proceso_id = 'A-01',            -- Gestión de Talento Humano
--          categoria  = 'formato'
--    where trim(proceso) = 'Talento Humano'
--      and proceso_id is null;
--
-- Los códigos del mapa:
--   E-01 Proceso Estratégico          M-01 Gestión Proceso Comercial
--   E-02 Proceso SGI                  M-02 Gestión de Operaciones y Prestación de Servicio
--   E-03 Proceso Gestión IT
--   A-01 Gestión de Talento Humano    A-03 Gestión de Compras
--   A-02 Gestión de Mantenimiento     A-04 Gestión Financiera y Contable
--   IN-01 Requerimientos              OUT-01 Satisfacción
--
-- PARA REVERTIR el script (las columnas quedan, sin efecto):
--   update public.sig_documentos set proceso_id = null, categoria = null;
-- ============================================================================
