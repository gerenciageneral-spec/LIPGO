-- =====================================================================
-- SIG - Cuadre / Conteo Físico de Inventario + Ajustes (estilo SAP Business One)
-- Persiste y documenta lo que el módulo "Auditoría de Inventario" hoy calcula
-- en memoria (conteo físico vs sistema). Flujo tipo SAP B1:
--   Documento de conteo (sig_inventario_cuadre + detalle)
--      -> diferencias (conteo − sistema)
--      -> ajuste contabilizado (sig_inventario_ajuste)  [Inventory Posting]
-- Por cliente/sitio (proyecto_id = empresas.id). Registros operativos: sin seed.
--
-- Nota: la MERMA DE PROCESO se controla aparte (reprocesos / transacciones).
-- Aquí se gestiona la DIFERENCIA de inventario (faltante/sobrante) y su ajuste.
-- Aditivo e idempotente.
-- =====================================================================

-- 1) Documento de cuadre / conteo (cabecera)
create table if not exists public.sig_inventario_cuadre (
  id serial primary key,
  proyecto_id int,                 -- cliente/sitio (empresas.id)
  fecha date default now(),
  tipo text default 'total',       -- total | ciclico
  almacen text,                    -- opcional: bodega
  responsable text,
  estado text default 'borrador',  -- borrador | contado | cerrado | aprobado
  total_sistema numeric default 0, -- stock en sistema (saldoinvdetalle)
  total_conteo numeric default 0,  -- conteo físico
  total_diferencia numeric default 0, -- conteo − sistema
  items int default 0,
  items_con_diferencia int default 0,
  observaciones text,
  creado_por text,
  activo boolean default true,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create index if not exists idx_sig_cuadre_proy on public.sig_inventario_cuadre (proyecto_id);

-- 2) Detalle por producto/lote/localización
create table if not exists public.sig_inventario_cuadre_detalle (
  id serial primary key,
  cuadre_id int not null,
  codproducto text,
  producto text,
  lote text,
  location text,
  sistema numeric default 0,       -- lo que está en sistema (saldoinvdetalle.stock_actual)
  conteo numeric default 0,        -- conteo físico capturado
  diferencia numeric default 0,    -- conteo − sistema (− faltante / + sobrante)
  observacion text
);
create index if not exists idx_sig_cuadre_det on public.sig_inventario_cuadre_detalle (cuadre_id);

-- 3) Ajuste contabilizado (faltante/sobrante/avería/devolución/corrección)
create table if not exists public.sig_inventario_ajuste (
  id serial primary key,
  proyecto_id int,
  cuadre_id int,                   -- opcional: ajuste derivado de un cuadre
  fecha date default now(),
  codproducto text,
  producto text,
  lote text,
  cantidad numeric default 0,      -- + sobrante / − faltante
  tipo text,                       -- faltante | sobrante | averia | devolucion | correccion
  motivo text,
  responsable text,
  soporte text,
  estado text default 'registrado',-- registrado | aprobado
  activo boolean default true,
  created_at timestamptz default now()
);
create index if not exists idx_sig_ajuste_proy on public.sig_inventario_ajuste (proyecto_id);

-- =====================================================================
-- FIN. 3 tablas (sin seed). Módulo "Cuadre de Inventario".
-- =====================================================================
