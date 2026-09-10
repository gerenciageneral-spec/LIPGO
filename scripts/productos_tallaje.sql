-- ============================================================================
-- TALLAJE DE PRODUCTOS
-- ----------------------------------------------------------------------------
-- Para los clientes que manejan tallas: un producto normal se puede convertir
-- en un producto TALLADO y repartir su stock entre las tallas.
--
-- CÓMO FUNCIONA EL REPARTO
-- No se inventa un mecanismo nuevo. El sistema ya tiene el código 309
-- («Reclasificación»), que hace salida de un producto y entrada a OTRO
-- producto conservando el lote (lib/transacciones-codigo-actions.ts:339-359).
-- Repartir en tallas es ese mismo movimiento, pero 1-a-N: una salida del padre
-- y una entrada por cada talla.
--
-- El stock NO se escribe aquí. Se insertan filas en `invtrans` y un TRIGGER de
-- la base recalcula `saldoinvdetalle`. La regla del proyecto es explícita:
-- «para cuadrar el físico NUNCA editar invtrans» — siempre filas nuevas.
--
-- POR QUÉ CADA TALLA ES UN PRODUCTO (fila propia en `productos`)
-- Todo el sistema --picking, órdenes de cargue, saldos, báscula, FEFO-- está
-- construido sobre productos. Una talla que es un producto funciona en todos
-- esos flujos el primer día, sin tocarlos. La alternativa (una columna `talla`
-- en invtrans) obligaría a revisar cada pantalla que muestre inventario para
-- que no sume tallas distintas como si fueran lo mismo.
--
-- EL LOTE SE CONSERVA
-- Las tallas heredan el lote del padre. El lote tiene formato AAAAMMDD y el
-- código depende de que el orden alfabético sea el cronológico (FEFO, alertas
-- de vencimiento, `productos.vidautildias`). Generar lotes nuevos al repartir
-- rompería esa cadena y las tallas aparecerían como mercancía recién llegada.
--
-- LO QUE NO CAMBIA: `productos` no tiene precio ni costo --LIP opera bodega de
-- terceros, la mercancía es del cliente y el dinero vive en las tablas de
-- tarifas--, así que no hay ningún valor que preservar al repartir.
--
-- Aditivo e idempotente. No modifica ninguna fila existente.
-- ============================================================================


-- ----------------------------------------------------------------------------
-- PASO 1 — MARCAR UN PRODUCTO COMO TALLADO Y LIGARLO A SU PADRE
-- ----------------------------------------------------------------------------

-- El padre: producto que se maneja por tallas. Sus unidades no viven en él,
-- viven repartidas en sus hijos.
alter table public.productos
  add column if not exists es_tallado boolean not null default false;

-- El hijo: producto que ES una talla de otro.
--
-- Se guarda el id del padre y no su nombre porque el nombre se puede corregir
-- ("Camiseta" -> "Camiseta Polo") y los hijos quedarían huérfanos. El id no
-- cambia. Es el mismo criterio del script 58 con el código de proceso.
alter table public.productos
  add column if not exists producto_padre_id int references public.productos(id);

-- La talla en sí: 'S', 'M', 'L', '38', 'XL'... Texto libre a propósito: el
-- tallaje de ropa, calzado y dotación no comparte escala, y una lista cerrada
-- dejaría por fuera al primer cliente que llegue con otra.
alter table public.productos
  add column if not exists talla text;

-- Orden para mostrar las tallas. Sin esto, 'S/M/L/XL' se listan alfabéticamente
-- como 'L/M/S/XL', que no es el orden en que nadie piensa las tallas.
alter table public.productos
  add column if not exists talla_orden int;

comment on column public.productos.es_tallado is
  'true = producto padre que se maneja por tallas. Su stock vive en los hijos.';
comment on column public.productos.producto_padre_id is
  'Producto del que esta fila es una talla. NULL = no es una talla.';
comment on column public.productos.talla is
  'Etiqueta de la talla (S, M, L, 38...). Libre: cada cliente usa su escala.';


-- ----------------------------------------------------------------------------
-- PASO 2 — ÍNDICES Y COHERENCIA
-- ----------------------------------------------------------------------------

create index if not exists idx_productos_padre
  on public.productos (producto_padre_id)
  where producto_padre_id is not null;

-- Una talla no se puede repetir dentro del mismo padre: dos filas "Camiseta M"
-- harían que el stock de esa talla quedara partido en dos y ninguna pantalla
-- mostraría el total real.
create unique index if not exists uq_productos_padre_talla
  on public.productos (producto_padre_id, talla)
  where producto_padre_id is not null;

-- Un producto no puede ser su propio padre.
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.productos'::regclass and conname = 'chk_productos_padre_no_self'
  ) then
    alter table public.productos
      add constraint chk_productos_padre_no_self
      check (producto_padre_id is null or producto_padre_id <> id) not valid;
  end if;
end $$;

-- Si es hijo, debe tener talla; si tiene talla, debe tener padre. Se agrega
-- NOT VALID para que no falle por filas viejas (no hay: las columnas son
-- nuevas), pero valida todo lo que entre desde ahora.
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.productos'::regclass and conname = 'chk_productos_talla_coherente'
  ) then
    alter table public.productos
      add constraint chk_productos_talla_coherente
      check (
        (producto_padre_id is null and talla is null)
        or (producto_padre_id is not null and talla is not null and length(trim(talla)) > 0)
      ) not valid;
  end if;
end $$;


-- ----------------------------------------------------------------------------
-- PASO 3 — QUÉ CLIENTES TRABAJAN CON TALLAJE
-- ----------------------------------------------------------------------------
-- No existe una tabla general de configuración por cliente. El patrón
-- establecido en el proyecto es una tabla pequeña con `idempresa`, como
-- `muelles_empresa`. Se sigue ese patrón.
--
-- Sin una fila activa aquí, el módulo de Productos no muestra nada de tallaje
-- para ese cliente: los que no manejan tallas no ven una función que no usan.

create table if not exists public.tallaje_empresa (
  id serial primary key,
  idempresa int not null unique,
  activo boolean not null default true,
  -- Tallas sugeridas al repartir, en orden. Solo es una ayuda para no
  -- escribirlas a mano cada vez; se puede usar cualquier otra.
  tallas_sugeridas text[],
  observacion text,
  created_at timestamptz default now()
);

comment on table public.tallaje_empresa is
  'Clientes que manejan productos por talla. Sin fila activa, el tallaje no aparece.';


-- ----------------------------------------------------------------------------
-- PASO 4 — RASTRO DE CADA REPARTO
-- ----------------------------------------------------------------------------
-- El reparto ya queda en `invtrans` (la salida y las entradas) y en
-- `inv_correcciones_log`. Esta tabla guarda el reparto como UNA operación, para
-- poder responder «¿quién repartió estas 2 unidades y en qué tallas?» sin
-- reconstruirlo a partir de movimientos sueltos.

create table if not exists public.producto_tallaje_reparto (
  id serial primary key,
  idempresa int not null,
  producto_padre_id int not null references public.productos(id),
  codproducto_padre text,
  lote text not null,
  location text not null,
  cantidad_origen numeric not null,
  -- [{talla, producto_id, codproducto, cantidad}]
  detalle jsonb not null,
  -- ids de las filas de invtrans generadas (1 salida + N entradas).
  invtrans_ids bigint[],
  motivo text,
  realizado_por text,
  created_at timestamptz default now()
);

create index if not exists idx_tallaje_reparto_emp
  on public.producto_tallaje_reparto (idempresa, created_at desc);
create index if not exists idx_tallaje_reparto_padre
  on public.producto_tallaje_reparto (producto_padre_id);


-- ----------------------------------------------------------------------------
-- PASO 5 — PERMISO: NO SE CREA UNO NUEVO
-- ----------------------------------------------------------------------------
-- Repartir tallas MUEVE STOCK REAL, así que la primera idea fue un permiso
-- propio. No se hizo, y vale la pena explicar por qué.
--
-- La pantalla de Gestión de Usuarios arma sus casillas a partir de
-- MODULE_PERMISSION_MAP, que mapea MÓDULOS DEL MENÚ a permisos. El tallaje no
-- es un módulo: es un botón dentro de Productos. Un permiso nuevo no tendría
-- casilla, quedaría en false para todo el mundo y nadie podría otorgarlo sin
-- entrar a la base a mano.
--
-- Por eso el botón se controla con `transacciones_inventario`, que es el
-- permiso de quien YA puede mover stock con el código 309 --exactamente el
-- mismo movimiento que hace el reparto-- y que sí se puede otorgar desde la
-- pantalla. Si más adelante se quiere separar, hay que agregar también la
-- entrada correspondiente en la interfaz de usuarios.
--
-- (No hay nada que ejecutar en este paso.)


-- ----------------------------------------------------------------------------
-- PASO 6 — VERIFICACIÓN (solo lecturas)
-- ----------------------------------------------------------------------------

-- 6a) Las columnas nuevas.
select column_name, data_type, is_nullable
from information_schema.columns
where table_schema = 'public' and table_name = 'productos'
  and column_name in ('es_tallado','producto_padre_id','talla','talla_orden')
order by column_name;

-- 6b) Nada cambió para los productos existentes: todos deben salir con
--     es_tallado = false y sin padre.
select count(*) as total_productos,
       count(*) filter (where es_tallado) as marcados_tallados,
       count(producto_padre_id) as son_talla
from public.productos;

-- 6c) Quién puede repartir (usa el permiso de transacciones de inventario).
select count(*) filter (where transacciones_inventario) as pueden_repartir
from public.permisos_usuarios;

-- 6d) HABILITAR UN CLIENTE. Cambiar el id por el del cliente que trabaja con
--     tallas (1=Harinera Indupan · 2=Avimol · 3=Cedi Funza · 4=Cedi Medellín).
--     Mientras no se corra esto, el tallaje no aparece para nadie.
--
--   insert into public.tallaje_empresa (idempresa, tallas_sugeridas, observacion)
--   values (2, array['S','M','L','XL'], 'Habilitado para pruebas')
--   on conflict (idempresa) do update
--     set activo = true, tallas_sugeridas = excluded.tallas_sugeridas;

-- 6e) Clientes habilitados hoy.
select e.id, e.nombre, t.activo, t.tallas_sugeridas
from public.tallaje_empresa t
join public.empresas e on e.id = t.idempresa
order by e.id;


-- ----------------------------------------------------------------------------
-- REVERSIÓN
-- ----------------------------------------------------------------------------
-- Las columnas son aditivas y los repartos ya hechos son movimientos reales de
-- invtrans: quitar las columnas NO devuelve el stock al producto padre. Para
-- deshacer un reparto hay que hacer el movimiento contrario, nunca borrar
-- filas de invtrans.
--
--   drop table if exists public.producto_tallaje_reparto;
--   drop table if exists public.tallaje_empresa;
--   alter table public.productos drop column if exists talla_orden;
--   alter table public.productos drop column if exists talla;
--   alter table public.productos drop column if exists producto_padre_id;
--   alter table public.productos drop column if exists es_tallado;
