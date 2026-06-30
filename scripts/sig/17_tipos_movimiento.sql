-- =====================================================================
-- LIPgo - Catálogo de Tipos de Movimiento de Inventario (nomenclatura LIPgo)
-- Documenta y hace auditable la nomenclatura de movimientos de inventario.
-- Los códigos (101/601/311/701/702/561/551) son la referencia de organización
-- adoptada por LIPgo; se mapean con el origen/tipomov real de invtrans.
-- Catálogo de referencia (sin idempresa). Aditivo e idempotente.
-- =====================================================================

create table if not exists public.sig_tipos_movimiento (
  id serial primary key,
  codigo text,               -- 101, 601, 311, 701, 702, 561, 551
  nombre text not null,
  clase text not null,       -- entrada | salida | traslado | ajuste | merma | inicial
  origen_lipgo text,         -- cómo se reconoce en invtrans (tipomov + origen)
  descripcion text,
  afecta_stock boolean default true,
  orden int default 0,
  activo boolean default true
);
create unique index if not exists uq_sig_tipomov on public.sig_tipos_movimiento (codigo);

insert into public.sig_tipos_movimiento (codigo, nombre, clase, origen_lipgo, descripcion, afecta_stock, orden) values
  ('101','Recepción / Entrada de mercancía','entrada','tipomov=Entrada · origen: ingreso producción / aprobación / descargue','Ingreso de producto: producción propia (plantas) o recepción/descargue (CEDIs desde otras sedes/proveedores).',true,1),
  ('601','Despacho / Salida','salida','tipomov=Salida · origen: orden de cargue','Salida de producto por orden de cargue (incluye traslados ENTRE SEDES en el cliente de origen).',true,2),
  ('311','Traslado entre localizaciones','traslado','origen: traslado entre localizaciones','Movimiento interno ubicación↔ubicación dentro del mismo sitio. NO afecta el stock total del sitio.',false,3),
  ('701','Ajuste de inventario — sobrante','ajuste','origen: ajuste inventario / transacción manual (entrada)','Diferencia POSITIVA detectada en conteo físico (sobrante).',true,4),
  ('702','Ajuste de inventario — faltante','ajuste','origen: ajuste inventario / transacción manual (salida)','Diferencia NEGATIVA detectada en conteo físico (faltante). Es lo que se cobra a LIP.',true,5),
  ('561','Carga de inventario inicial','inicial','origen: inventario inicial','Saldo de apertura al iniciar la operación / corte.',true,6),
  ('551','Merma / Reproceso','merma','tipomov=Reproceso · origen: reproceso','Merma de proceso (producto enviado a reproceso). NO se cobra a LIP; se controla en el módulo de transacciones.',true,7)
on conflict (codigo) do nothing;

-- Si ya existía con la columna 'codigo_sap', renómbrala (compatibilidad).
do $$
begin
  if exists (select 1 from information_schema.columns where table_name='sig_tipos_movimiento' and column_name='codigo_sap')
     and not exists (select 1 from information_schema.columns where table_name='sig_tipos_movimiento' and column_name='codigo') then
    alter table public.sig_tipos_movimiento rename column codigo_sap to codigo;
  end if;
end $$;

-- =====================================================================
-- FIN. 7 tipos de movimiento (nomenclatura LIPgo).
-- =====================================================================
