-- =====================================================================
-- 53 — Conteo físico de cierre de mes: varias personas contando sin pisarse
-- ----------------------------------------------------------------------------
-- Hasta hoy, "Cuadre y Correcciones" (guardarConteoCuadre) BORRABA todo el
-- detalle y lo volvía a insertar completo en cada guardado — si dos personas
-- tenían el mismo cuadre abierto, la última en guardar pisaba el trabajo de
-- la otra, sin aviso. Este script agrega lo necesario para guardar por
-- LÍNEA (upsert), con trazabilidad de quién contó qué y cuándo, y una firma
-- con imagen real (igual que ya tienen Acta de Cruce y Acta de Cierre
-- Mensual) en vez de solo texto. No cambia el motor de correcciones
-- (sig_inventario_ajuste → invtrans) ni el "único formulario sancionado
-- para mover inventario" — solo mejora CÓMO se captura el conteo.
-- Aditivo e idempotente.
-- =====================================================================

alter table public.sig_inventario_cuadre_detalle
  add column if not exists contado_por text,
  add column if not exists contado_en timestamptz;

-- Necesaria para poder hacer UPSERT por línea en vez de borrar-todo-e-insertar.
-- NULL se trata como valor distinto en un UNIQUE de Postgres por defecto, así
-- que se normalizan lote/location a '' (ya es la convención de esta pantalla:
-- guardarConteoCuadre nunca los deja NULL en la práctica) antes de crear el
-- índice, para que el upsert funcione también en los productos sin lote.
update public.sig_inventario_cuadre_detalle set lote = '' where lote is null;
update public.sig_inventario_cuadre_detalle set location = '' where location is null;
alter table public.sig_inventario_cuadre_detalle
  alter column lote set default '',
  alter column location set default '';

create unique index if not exists uq_cuadre_detalle_linea
  on public.sig_inventario_cuadre_detalle (cuadre_id, codproducto, lote, location);

-- Firma con imagen (igual patrón que sig_inventario_acta_cruce / sig_inventario_cierre_mes).
alter table public.sig_inventario_cuadre
  add column if not exists firma_url text;

-- =====================================================================
-- FIN.
-- =====================================================================
