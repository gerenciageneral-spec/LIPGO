-- =====================================================================
-- Estado de la liquidación de cada persona retirada (submódulo Liquidaciones).
-- Guarda si la liquidación está 'pendiente' o 'liquidada' y el soporte adjunto.
-- El detalle de novedades se calcula en vivo desde pagonomina; aquí solo vive
-- el ESTADO y el SOPORTE (una fila por persona/empresa). Aditivo e idempotente.
-- =====================================================================

create table if not exists public.liquidaciones_retiro (
  id uuid primary key default gen_random_uuid(),
  idempresa int,
  identificacion text,
  persona text,
  fecha_retiro date,
  estado text not null default 'pendiente',   -- 'pendiente' | 'liquidada'
  soporte_url text,
  soporte_nombre text,
  total_liquidado numeric,
  fecha_liquidacion timestamptz,
  updated_at timestamptz default now(),
  unique (idempresa, identificacion)
);

alter table public.liquidaciones_retiro replica identity full;
