-- =====================================================================
-- SIG - Satisfacción del cliente y partes interesadas + PQRSF (ISO 9001 9.1.2)
-- Encuestas a CLIENTES y CONDUCTORES + registro de Peticiones/Quejas/Reclamos/
-- Sugerencias/Felicitaciones. Alimenta los indicadores IND-G-01 (satisfacción
-- cliente) e IND-G-02 (satisfacción conductores). Por cliente/sitio.
-- Aditivo e idempotente. Sin seed (se captura en la app).
-- =====================================================================

-- 1) Encuestas de satisfacción (escala 1-5)
create table if not exists public.sig_satisfaccion (
  id serial primary key,
  proyecto_id int,                 -- cliente/sitio (empresas.id)
  tipo text default 'cliente',     -- cliente | conductor
  fecha date default now(),
  periodo text,                    -- p.ej. 2026-S1
  encuestado text,                 -- nombre / empresa / placa
  calificacion numeric,            -- general 1-5
  oportunidad numeric,             -- aspecto 1-5 (opcional)
  calidad numeric,                 -- aspecto 1-5 (opcional)
  comunicacion numeric,            -- aspecto 1-5 (opcional)
  recomendaria boolean,            -- NPS simple
  comentario text,
  canal text,                      -- correo | formulario | telefónico | presencial
  responsable text,
  activo boolean default true,
  created_at timestamptz default now()
);
create index if not exists idx_sig_satisf_proy on public.sig_satisfaccion (proyecto_id, tipo);

-- 2) PQRSF (Peticiones, Quejas, Reclamos, Sugerencias, Felicitaciones)
create table if not exists public.sig_pqrsf (
  id serial primary key,
  proyecto_id int,
  fecha date default now(),
  tipo text default 'queja',       -- peticion | queja | reclamo | sugerencia | felicitacion
  parte_interesada text,           -- cliente | conductor | proveedor | colaborador
  canal text,
  descripcion text not null,
  responsable text,
  estado text default 'abierta',   -- abierta | en_proceso | cerrada
  respuesta text,
  fecha_compromiso date,
  fecha_cierre date,
  dias_respuesta int,              -- días entre fecha y cierre
  genera_nc boolean default false, -- si escaló a no conformidad (10.2)
  activo boolean default true,
  created_at timestamptz default now()
);
create index if not exists idx_sig_pqrsf_proy on public.sig_pqrsf (proyecto_id);

-- =====================================================================
-- FIN. 2 tablas (sin seed). Módulo "Satisfacción y PQRSF".
-- =====================================================================
