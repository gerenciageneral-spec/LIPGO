-- =====================================================================
-- SIG - Mapa de Interacción del Proceso (LIPgo) — guía para el auditor
-- Documenta la intervención ARMÓNICA de LIP y sus clientes dentro del
-- proceso que se lleva en LIPgo: quién hace cada paso, qué soporte/PDF
-- queda, en qué campo y bajo qué requisito ISO.
-- Los pasos del CLIENTE son VALOR AGREGADO de LIP (herramienta que LIP
-- brinda para control y trazabilidad), NO parte del alcance del servicio.
-- Aditivo e idempotente. Alcance LIP (idempresa = 100).
-- =====================================================================

create table if not exists public.sig_proceso_interaccion (
  id serial primary key,
  idempresa int,
  orden int not null,
  fase text not null,
  paso text not null,
  responsable text,            -- cliente | lip | ambos
  es_valor_agregado boolean default false, -- true = paso del cliente (valor agregado LIPgo)
  accion_lipgo text,           -- qué se hace en LIPgo
  modulo_lipgo text,           -- módulo/pantalla de LIPgo
  evidencia text,              -- soporte/PDF/registro que queda
  campo_dato text,             -- campo/timestamp en la base
  norma_iso text,              -- requisito ISO
  activo boolean default true,
  created_at timestamptz default now()
);
create unique index if not exists uq_sig_proc_inter on public.sig_proceso_interaccion (idempresa, orden);
create index if not exists idx_sig_proc_inter_emp on public.sig_proceso_interaccion (idempresa);

insert into public.sig_proceso_interaccion
  (idempresa, orden, fase, paso, responsable, es_valor_agregado, accion_lipgo, modulo_lipgo, evidencia, campo_dato, norma_iso) values
  (100,1,'Planeación del despacho','Recepción, montaje y aprobación del pedido','cliente',true,'El cliente carga y aprueba el pedido en LIPgo','Pedidos / Recepción','PDF de orden','pdfoc · horaorden','ISO 9001 8.2 (requisitos para productos y servicios)'),
  (100,2,'Planeación del despacho','Registro del vehículo y de la cita','cliente',true,'El cliente registra el vehículo y la hora de llegada','Vehículos / Citas','Registro de cita','citasvehiculos.horallegada · horavehiculo','ISO 9001 8.5'),
  (100,3,'Planeación del despacho','Pesaje inicial en báscula','cliente',true,'El cliente registra el peso de entrada','Báscula','Tiquete báscula','pesajeinicial','ISO 9001 8.5.1'),
  (100,4,'Planeación del despacho','Generación de la orden de cargue','cliente',true,'El cliente genera la orden de cargue','Órdenes de Cargue','PDF de orden de cargue','pdfoc','ISO 9001 8.5'),
  (100,5,'Planeación del despacho','Asignación de lotes a cargar','cliente',true,'El cliente asigna los lotes (trazabilidad de lo despachado ante reclamaciones)','Asignación de Lotes','Histórico de lotes','historicolotes · horalote','ISO 9001 8.5.1 (identificación y trazabilidad)'),
  (100,6,'Ejecución del servicio (LIP)','Escaneo QR de ubicación y lote','lip',false,'LIP escanea la estiba/ubicación indicada','Picking','Registro QR de estiba','qrestiba','ISO 9001 8.5.1'),
  (100,7,'Ejecución del servicio (LIP)','Picking (en línea o por adelantado)','lip',false,'LIP verifica producto, lote y cantidad','Picking','PDF de picking','doccargue · horapicking','ISO 9001 8.5 / 8.5.2'),
  (100,8,'Ejecución del servicio (LIP)','Cargue del vehículo','lip',false,'LIP ejecuta el cargue físico','Cargue','Inicio de cargue','iniciocargue','ISO 9001 8.5'),
  (100,9,'Ejecución del servicio (LIP)','Evidencia fotográfica del cargue','lip',false,'LIP toma y sube el registro fotográfico','Cargue','Fotos del cargue','fotospicking','ISO 9001 8.5.1 (trazabilidad)'),
  (100,10,'Ejecución del servicio (LIP)','Finalización del cargue','lip',false,'LIP cierra la operación (Finalizado LIP)','Cargue','Cierre de orden','fincargue · estado=Finalizado LIP','ISO 9001 8.6 (liberación de productos y servicios)'),
  (100,11,'Ejecución del servicio (LIP)','Validación de inventario','lip',false,'LIP concilia el movimiento de inventario','Inventario','Movimiento de inventario','invtrans','ISO 9001 8.5.1'),
  (100,12,'Cierre del despacho','Pesaje final y peso a facturar','cliente',true,'El cliente registra el pesaje final y libera el peso a facturar','Báscula','Tiquete báscula final','pesajefinal · pesovascula · tiquetebascula · status=finalizado','ISO 9001 8.5 (cierre y trazabilidad)')
on conflict (idempresa, orden) do nothing;

-- =====================================================================
-- FIN. 12 pasos: 6 valor agregado (cliente) + 6 servicio LIP.
-- =====================================================================
