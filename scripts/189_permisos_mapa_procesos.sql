-- ============================================================================
-- 189 — PERMISOS POR PROCESO DEL MAPA DE PROCESOS
-- ----------------------------------------------------------------------------
-- Hoy el Mapa de Procesos es todo o nada: quien tiene `sig_matriz` ve los once
-- botones y puede abrir los documentos de cualquier proceso --incluidos los de
-- Talento Humano o los Financieros--. Este script permite decidir, por usuario,
-- a qué procesos puede entrar.
--
-- POR QUÉ UNA TABLA Y NO COLUMNAS EN `permisos_usuarios`
-- El resto del sistema usa una columna booleana por módulo, y `permisos_usuarios`
-- ya tiene más de 150. Aquí no encaja, por dos razones:
--
--   1. Los procesos del mapa NO son módulos del menú. La pantalla de permisos
--      deriva sus casillas recorriendo la navegación, así que una columna nueva
--      no aparecería sola de todos modos.
--
--   2. Agregar un proceso al mapa exigiría un script SQL y un despliegue. Con
--      filas, agregar un proceso al mapa hace que su permiso aparezca solo.
--
-- QUÉ NO CAMBIA
-- El permiso de módulo (`sig_matriz`) sigue mandando: sin él no se ve el mapa.
-- Esto es una capa DENTRO del módulo, no un reemplazo.
--
-- Aditivo e idempotente.
-- ============================================================================


-- ----------------------------------------------------------------------------
-- PASO 1 — LA TABLA
-- ----------------------------------------------------------------------------

create table if not exists public.permisos_mapa_procesos (
  id serial primary key,

  usuario_id uuid not null references public.profiles(id) on delete cascade,

  /*
   * El código del proceso en el mapa: 'E-01', 'M-02', 'A-03', 'IN-01', 'OUT-01'.
   *
   * Es el MISMO valor que `sig_documentos.proceso_id`, a propósito: así el
   * permiso y los documentos hablan del mismo proceso sin una tabla de
   * equivalencias en medio.
   *
   * No lleva llave foránea porque los procesos del mapa viven en el código
   * (components/sig/mapa-procesos.tsx), no en una tabla. Hay una tabla
   * `sig_procesos`, pero tiene otra taxonomía (DE, CD, GH...) y la usa
   * No Conformidades: apuntar ahí ataría el permiso al proceso equivocado.
   */
  proceso_id text not null,

  -- Quién lo otorgó y cuándo. Un permiso sin rastro no se puede auditar.
  otorgado_por text,
  created_at timestamptz default now()
);

-- Una fila por usuario y proceso. Sin esto, guardar dos veces acumularía
-- duplicados y revocar tendría que borrar en bucle.
create unique index if not exists uq_permiso_mapa_usuario_proceso
  on public.permisos_mapa_procesos (usuario_id, proceso_id);

-- La consulta que hace el mapa al abrirse: todos los procesos de un usuario.
create index if not exists ix_permiso_mapa_usuario
  on public.permisos_mapa_procesos (usuario_id);

comment on table public.permisos_mapa_procesos is
  'Procesos del Mapa de Procesos que cada usuario puede abrir. La ausencia de fila es la negación: sin fila, el botón se ve pero no abre. Ver scripts/189.';
comment on column public.permisos_mapa_procesos.proceso_id is
  'Codigo del proceso en el mapa (E-01, M-02, IN-01...), el mismo de sig_documentos.proceso_id.';


-- ----------------------------------------------------------------------------
-- PASO 2 — QUIÉN ARRANCA CON ACCESO
-- ----------------------------------------------------------------------------
-- La ausencia de fila es la negación, así que sin este paso NADIE podría abrir
-- ningún proceso el día que esto se despliegue --incluidos quienes hoy los usan
-- a diario--. Sería un corte de acceso silencioso, no una mejora de seguridad.
--
-- Se le dan los once procesos a quien HOY ya podía abrirlos todos: los usuarios
-- con `sig_matriz`. Es exactamente el acceso que ya tenían; a partir de ahí se
-- recorta desde la pantalla de permisos, que es donde esa decisión se ve.

insert into public.permisos_mapa_procesos (usuario_id, proceso_id, otorgado_por)
select p.usuario_id, proc.codigo, 'script 189 (acceso que ya tenia)'
from public.permisos_usuarios p
cross join (values
  ('E-01'), ('E-02'), ('E-03'),
  ('M-01'), ('M-02'),
  ('A-01'), ('A-02'), ('A-03'), ('A-04'),
  ('IN-01'), ('OUT-01')
) as proc(codigo)
where p.sig_matriz = true
on conflict (usuario_id, proceso_id) do nothing;


-- ----------------------------------------------------------------------------
-- PASO 3 — VERIFICACIÓN (solo lecturas)
-- ----------------------------------------------------------------------------

-- 3a) La tabla quedó con su índice único.
select indexname, indexdef
from pg_indexes
where schemaname = 'public'
  and tablename  = 'permisos_mapa_procesos'
order by indexname;

-- 3b) Cuántos usuarios y cuántos permisos se otorgaron.
select count(distinct usuario_id) as usuarios_con_acceso,
       count(*)                   as permisos_otorgados
from public.permisos_mapa_procesos;

-- 3c) Nadie que tuviera acceso al mapa debe haberlo perdido: los dos números
--     tienen que coincidir.
select (select count(*) from public.permisos_usuarios where sig_matriz = true)
         as usuarios_con_el_modulo,
       (select count(distinct usuario_id) from public.permisos_mapa_procesos)
         as usuarios_con_algun_proceso;

-- 3d) Reparto por proceso. Al arrancar, todos deben tener el mismo número.
select proceso_id, count(*) as usuarios
from public.permisos_mapa_procesos
group by proceso_id
order by proceso_id;


-- ----------------------------------------------------------------------------
-- REVERSIÓN
-- ----------------------------------------------------------------------------
-- Borra los permisos otorgados. El mapa vuelve a ser todo o nada.
--
--   drop table if exists public.permisos_mapa_procesos;
