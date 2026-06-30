-- =====================================================================
-- Calificación del servicio por el CONDUCTOR (en caliente, al fin de cargue).
-- Captura didáctica 🟢/🟡/🔴 desde un kiosko en el dispositivo de LIP.
-- Se guarda en sig_satisfaccion (tipo='conductor') para que alimente DIRECTO
-- el indicador del BSC (IND-G-02 Satisfacción de conductores), por proyecto
-- (proyecto_id) y gerencial (consolidado). LIPgo = fuente de verdad.
--
-- Escala didáctica -> calificacion 1-5 (compatible con el cálculo del BSC):
--   🟢 Feliz = 5  ·  🟡 Regular = 3  ·  🔴 Mala = 1
--
-- Se agregan dos columnas de trazabilidad para vincular la calificación a su
-- orden de cargue y evitar duplicados (una calificación por orden).
-- Aditivo e idempotente.
-- =====================================================================

-- 1) Trazabilidad de la calificación con la orden de cargue.
alter table public.sig_satisfaccion
  add column if not exists ref_orden text;   -- cabeceraoc.ordendecargue
alter table public.sig_satisfaccion
  add column if not exists placa text;        -- placa del vehículo/conductor

-- Una sola calificación por orden (cuando viene de kiosko).
create unique index if not exists uq_sig_satisfaccion_ref_orden
  on public.sig_satisfaccion (ref_orden) where ref_orden is not null;

-- 2) Permiso propio del coordinador para el módulo de calificación.
alter table public.permisos_usuarios
  add column if not exists calificacion_conductor boolean default false;

-- Hereda el acceso de quien ya gestiona satisfacción (para no quitar acceso).
update public.permisos_usuarios
   set calificacion_conductor = coalesce(satisfaccion_pqrsf, false)
 where calificacion_conductor is distinct from coalesce(satisfaccion_pqrsf, false);

-- Verificacion (opcional):
-- select tipo, canal, count(*) from sig_satisfaccion group by tipo, canal;
-- =====================================================================
