-- =====================================================================
-- LIPgo - Claves de responsable para mover inventario (control de acceso).
-- Cada movimiento de inventario (Transacciones de Inventario) pide una clave
-- que se entrega a cada responsable. El backend valida la clave contra esta
-- tabla antes de registrar el movimiento.
-- Aditivo e idempotente.
-- =====================================================================

create table if not exists public.inv_clave_movimiento (
  id serial primary key,
  usuario_id uuid,              -- opcional: enlazar a profiles.id
  responsable text not null,    -- nombre del responsable
  clave text not null,          -- clave/PIN que autoriza el movimiento
  activo boolean default true,
  created_at timestamptz default now()
);
create index if not exists idx_inv_clave_activo on public.inv_clave_movimiento (activo);

-- Clave única (evita duplicados y permite el seed idempotente).
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'uq_inv_clave_movimiento') then
    alter table public.inv_clave_movimiento add constraint uq_inv_clave_movimiento unique (clave);
  end if;
end $$;

-- Seed: clave de Gerencia General.
insert into public.inv_clave_movimiento (responsable, clave, activo)
  values ('Gerencia General', '2323', true)
  on conflict (clave) do nothing;

-- Para agregar más responsables (ejemplo):
-- insert into public.inv_clave_movimiento (responsable, clave) values ('Líder de Bodega', '1010') on conflict (clave) do nothing;

-- =====================================================================
-- FIN. Mientras no exista ninguna clave activa, el sistema deja el
-- movimiento LIBRE; en cuanto haya al menos una clave, la EXIGE.
-- =====================================================================
