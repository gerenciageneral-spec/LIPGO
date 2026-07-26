-- =====================================================================
-- 02_modulos.sql — catálogo tabla → módulo legible ("Grupo · Submódulo").
-- El trigger hace lookup aquí; si la tabla no está, usa un fallback prettify.
-- Extensible: agrega filas para dar nombres bonitos a más tablas.
-- =====================================================================

create table if not exists public.auditoria_modulos (
  tabla  text primary key,
  modulo text not null
);

insert into public.auditoria_modulos (tabla, modulo) values
  -- Configuración / maestros
  ('productos','Configuración · Productos'),
  ('clientes','Configuración · Clientes'),
  ('empresas','Configuración · Empresas'),
  ('bodegas','Configuración · Bodegas'),
  ('almacenes','Configuración · Almacenes'),
  ('destinos','Configuración · Destinos'),
  ('transportes','Configuración · Transportes'),
  ('tiposvehiculos','Configuración · Tipos de vehículo'),
  ('tipodespacho','Configuración · Tipos de despacho'),
  ('categorias','Configuración · Categorías'),
  ('subcategorias','Configuración · Subcategorías'),
  -- Seguridad / accesos
  ('profiles','Seguridad · Usuarios'),
  ('permisos_usuarios','Seguridad · Permisos'),
  ('perfil_acceso_empresas','Seguridad · Accesos empresa'),
  ('perfil_acceso_owners','Seguridad · Accesos owner'),
  -- Recepción y despacho / compras / pedidos
  ('cabeceraoc','Operación · Órdenes de cargue'),
  ('detalleoc','Operación · Órdenes de cargue'),
  ('pedidoscabecera','Pedidos'),
  ('pedidosdetalle','Pedidos'),
  ('citasvehiculos','Logística · Vehículos'),
  -- Inventario
  ('saldoinvdetalle','Inventario · Saldos'),
  ('invtrans','Inventario · Transacciones'),
  ('historicolotes','Inventario · Lotes'),
  -- Gestión Humana / nómina
  ('headcount','Personal · Head Count'),
  ('contratos','Personal · Contratos'),
  ('registroasistencia','Personal · Asistencia'),
  ('vacaciones_solicitudes','Personal · Vacaciones'),
  ('vacaciones_liquidaciones','Personal · Vacaciones'),
  ('hojas_de_vida','RRHH · Hojas de vida'),
  ('capacitaciones','RRHH · Capacitaciones'),
  ('solicitudes_trabajadores','RRHH · Solicitudes'),
  ('liquidaciones_retiro','Nómina · Liquidaciones'),
  -- SST
  ('ausentismosst','SST · Ausentismos'),
  ('examenes_medicos','SST · Exámenes médicos'),
  ('sst_incidentes','SST · Investigación AT'),
  ('sst_ipevr','SST · IPEVR'),
  -- Comercial / finanzas
  ('tarifasoperacion','Comercial · Tarifas'),
  ('tarifaspersonal','Comercial · Tarifas'),
  ('tarifasturnos','Comercial · Tarifas'),
  ('parametros_legales_anio','Comercial · Parámetros legales'),
  ('facturacion','Finanzas · Facturación')
on conflict (tabla) do update set modulo = excluded.modulo;

-- =====================================================================
