-- =====================================================================
-- 62 — Aprobación de Gerencia para ajustes de inventario 601/702
-- ----------------------------------------------------------------------------
-- Incidente (2026-09-23, Cedi Funza): un coordinador generó un Descargue
-- manual duplicado (el clon automático desde Avimol ya existía), la nómina
-- pagó doble a los mismos auxiliares, y para "cuadrar" el inventario generó
-- una salida manual por código (702) -- sin resolver ni el duplicado ni el
-- doble pago, e invisible para Facturación en Cedis.
--
-- Blindaje pedido por el cliente: los códigos 601 ("Despacho manual", salida
-- sin orden de cargue) y 702 ("Faltante", ajuste de salida) SON los únicos
-- códigos de "Transacciones de Inventario" que sacan producto SIN estar
-- ligados a una orden real NI a una categoría reconocida (551 Merma/Reproceso
-- sí lo es, y queda exactamente igual, sin cambios). A partir de esta
-- migración, 601 y 702 NO se aplican de inmediato: quedan "Pendiente de
-- aprobación" hasta que alguien de Gerencia los apruebe con una clave nueva
-- y específica para esto (distinta de la clave general de responsable de
-- movimiento, `inv_clave_movimiento`, que es para OTRO propósito: identificar
-- quién ejecuta una corrección, no para aprobar la solicitud de otra persona).
-- Aplica a los 4 proyectos (decisión del cliente: el riesgo es el mismo en
-- Indupan/Avimol que en los Cedis).
--
-- Aditivo e idempotente.
-- =====================================================================

-- (a) Solicitudes pendientes -------------------------------------------------
-- El `payload` guarda EXACTAMENTE lo que el coordinador digitó (mismo shape
-- que `EjecutarPayload` en lib/transacciones-codigo.ts) para poder ejecutarlo
-- tal cual, sin reinterpretar nada, en el momento de aprobar.

create table if not exists public.inv_ajustes_pendientes (
  id serial primary key,
  idempresa int not null,
  codigo text not null check (codigo in ('601', '702')),
  payload jsonb not null,
  producto text,
  lote text,
  location text,
  cantidad numeric not null,
  motivo text,
  solicitado_por text not null,
  estado text not null default 'pendiente' check (estado in ('pendiente', 'aprobado', 'rechazado')),
  aprobado_por text,
  aprobado_en timestamptz,
  motivo_rechazo text,
  invtrans_ids jsonb,
  log_id bigint,
  created_at timestamptz default now()
);

create index if not exists idx_inv_ajustes_pend_estado on public.inv_ajustes_pendientes (estado);
create index if not exists idx_inv_ajustes_pend_emp on public.inv_ajustes_pendientes (idempresa);

alter table public.inv_ajustes_pendientes disable row level security;

-- (b) Clave de aprobación gerencial (tabla DEDICADA, separada a propósito de
--     `inv_clave_movimiento` -- esa es para "quién ejecuta" una corrección
--     cualquiera; esta es "quién autoriza" una solicitud de otro, un control
--     más guardado, con su propia clave). ------------------------------------

create table if not exists public.inv_clave_aprobacion_ajustes (
  id serial primary key,
  responsable text not null,
  clave text not null,
  activo boolean default true,
  created_at timestamptz default now()
);

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'uq_inv_clave_aprobacion_ajustes') then
    alter table public.inv_clave_aprobacion_ajustes add constraint uq_inv_clave_aprobacion_ajustes unique (clave);
  end if;
end $$;

alter table public.inv_clave_aprobacion_ajustes disable row level security;

insert into public.inv_clave_aprobacion_ajustes (responsable, clave, activo)
  values ('Gerencia General', 'LIPMJJ', true)
  on conflict (clave) do nothing;

-- =====================================================================
-- FIN. Módulo Transacciones de Inventario → 601/702 ahora piden aprobación.
-- =====================================================================
