-- =====================================================================
-- SIG - Mapa de Procesos + No Conformidades (ISO 9001 8.7 y 10.2)
-- Aditivo e idempotente (ON CONFLICT DO NOTHING).
-- Alcance LIP: idempresa = 100 (el SIG es único de LIP, no de un cliente;
-- ver scripts/sig/11_alcance_lip_multisitio.sql).
--
-- Tres tablas:
--   1) sig_procesos          -> mapa de procesos (backbone del SIG)
--   2) sig_nc_catalogo       -> analisis PREVENTIVO: posibles no conformes
--                               por proceso/etapa (interno vs externo)
--   3) sig_no_conformidades  -> registro REAL de NC (10.2): causa raiz,
--                               correccion, accion correctiva, eficacia
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) MAPA DE PROCESOS
-- ---------------------------------------------------------------------
create table if not exists public.sig_procesos (
  id serial primary key,
  idempresa int,
  codigo text not null,          -- DE, CD, AI, GH, TI, CO, EM
  nombre text not null,
  tipo text not null,            -- estrategico | misional | apoyo | evaluacion
  responsable text,
  objetivo text,
  orden int default 0,
  activo boolean default true,
  created_at timestamptz default now()
);
create unique index if not exists uq_sig_procesos on public.sig_procesos (idempresa, codigo);
create index if not exists idx_sig_procesos_emp on public.sig_procesos (idempresa);

insert into public.sig_procesos (idempresa, codigo, nombre, tipo, responsable, objetivo, orden) values
  (100,'DE','Direccionamiento Estratégico y Gestión del SIG','estrategico','Gerencia General','Planificar, mantener y mejorar el Sistema Integrado de Gestión',1),
  (100,'CD','Cargue y Descargue de Productos','misional','Jefe de Operaciones','Ejecutar el cargue y descargue de productos de forma segura, oportuna y conforme',2),
  (100,'AI','Almacenamiento y Manejo de Inventarios','misional','Líder de Bodega','Custodiar, ubicar y controlar el inventario garantizando exactitud y preservación',3),
  (100,'GH','Gestión Humana y SST','apoyo','Coordinador de Gestión Humana / SST','Vincular, formar y cuidar personal competente y seguro',4),
  (100,'TI','Gestión Tecnológica — LIPgo','apoyo','Líder de Tecnología','Diseñar, desarrollar, operar y mantener la plataforma LIPgo',5),
  (100,'CO','Compras y Proveedores','apoyo','Compras','Proveer bienes/servicios conformes mediante proveedores evaluados',6),
  (100,'EM','Evaluación y Mejora','evaluacion','Coordinador SIG','Auditar, medir y mejorar el sistema (auditorías, NC, acciones)',7)
on conflict (idempresa, codigo) do nothing;

-- ---------------------------------------------------------------------
-- 2) CATALOGO DE NO CONFORMES POTENCIALES POR PROCESO (preventivo)
--    afecta_cliente = false  -> NC interna (afecta a LIP, no al cliente)
--    afecta_cliente = true   -> puede llegar al cliente (8.7 salida no conforme)
-- ---------------------------------------------------------------------
create table if not exists public.sig_nc_catalogo (
  id serial primary key,
  idempresa int,
  proceso_codigo text not null,
  etapa text,
  descripcion text not null,     -- posible no conforme
  tipo text,                     -- interno | externo
  afecta_cliente boolean default false,
  requisito_iso text,            -- norma + numeral
  deteccion text,                -- cómo se detecta
  accion text,                   -- acción típica
  orden int default 0,
  activo boolean default true,
  created_at timestamptz default now()
);
create unique index if not exists uq_sig_nc_catalogo on public.sig_nc_catalogo (idempresa, proceso_codigo, descripcion);
create index if not exists idx_sig_nc_catalogo_emp on public.sig_nc_catalogo (idempresa, proceso_codigo);

insert into public.sig_nc_catalogo
  (idempresa, proceso_codigo, etapa, descripcion, tipo, afecta_cliente, requisito_iso, deteccion, accion, orden) values
  -- Gestión Humana y SST (GH)
  (100,'GH','Selección','Candidato completa la selección pero no aprueba el examen médico ocupacional','interno',false,'ISO 9001 7.1.2 / 7.2','Resultado del examen pre-ocupacional','Detener la contratación; reactivar la terna; documentar el caso',1),
  (100,'GH','Contratación','Documentación de ingreso o afiliación a seguridad social incompleta','interno',false,'ISO 9001 7.1.2 / requisito legal','Checklist de ingreso','No habilitar para operar hasta completar; alertar al responsable',2),
  (100,'GH','Inducción','Colaborador inicia labores sin inducción/reinducción SST','interno',true,'ISO 9001 7.2 / ISO 45001 7.2','Registro de inducción','Bloquear asignación a la operación hasta cerrar la inducción',3),
  (100,'GH','Competencias','Operario de montacargas sin certificación/licencia vigente','interno',true,'ISO 9001 7.2 / ISO 45001 7.2','Matriz de competencias y vencimientos','Retirar de la tarea; reprogramar certificación',4),
  (100,'GH','Formación','Incumplimiento del plan anual de capacitación','interno',false,'ISO 9001 7.2','Seguimiento al cronograma de formación','Reprogramar; analizar causa de inasistencia',5),
  -- Cargue y Descargue (CD)
  (100,'CD','Recepción de la orden','Información del pedido incompleta o errada','interno',false,'ISO 9001 8.2.3','Validación de la orden antes de operar','Devolver a comercial/cliente para corrección',1),
  (100,'CD','Manipulación','Producto del cliente averiado durante el cargue/descargue','interno',true,'ISO 9001 8.5.3 (propiedad del cliente)','Inspección y registro fotográfico','Aislar, reportar al cliente, registrar NC y analizar causa',2),
  (100,'CD','Liberación','Despacho con cantidad o SKU errado, detectado antes de salir','interno',false,'ISO 9001 8.7 / 8.6','Verificación y liberación (FOR-LIP-SIG-102)','Corregir antes de despachar; no liberar hasta OK',3),
  (100,'CD','Despacho','Producto no conforme entregado que llega al cliente','externo',true,'ISO 9001 8.7','Queja/PQRSF o devolución del cliente','Contener, reponer/corregir, causa raíz y acción correctiva',4),
  (100,'CD','Embalaje','Uso de estiba en mal estado o embalaje inadecuado','interno',true,'ISO 9001 8.5.1 / 8.5.4','Inspección previa al cargue','Reemplazar estiba/embalaje; retirar la dañada',5),
  -- Almacenamiento e Inventarios (AI)
  (100,'AI','Recepción/ingreso','Diferencia entre el físico recibido y el documento','interno',false,'ISO 9001 8.5.1','Conteo y cotejo en recepción','Registrar novedad; conciliar con proveedor/cliente',1),
  (100,'AI','Ubicación','Producto mal ubicado o sin registro en LIPgo','interno',false,'ISO 9001 8.5.1','Validación de ubicación en LIPgo','Reubicar y corregir el registro',2),
  (100,'AI','Control de inventario','Descuadre de inventario: exactitud por debajo de la meta','interno',false,'ISO 9001 8.5.1 / 9.1','Conteo cíclico / inventario','Investigar diferencia, ajustar y acción correctiva',3),
  (100,'AI','Preservación','Producto deteriorado por condiciones de almacenamiento','interno',true,'ISO 9001 8.5.4','Inspección de condiciones','Aislar, reportar y corregir condiciones',4),
  (100,'AI','Rotación','No se respeta FIFO/FEFO y se entrega producto vencido/antiguo','externo',true,'ISO 9001 8.5.1','Control de fechas en LIPgo','Contener, notificar y ajustar regla de salida',5),
  -- Tecnología LIPgo (TI)
  (100,'TI','Desarrollo','Requisito del cliente no implementado correctamente en LIPgo','interno',false,'ISO 9001 8.3','Pruebas / validación previa al despliegue','Corregir en desarrollo; revalidar antes de publicar',1),
  (100,'TI','Operación','Indisponibilidad o caída de la plataforma LIPgo','interno',true,'ISO 9001 7.1.3','Monitoreo de disponibilidad','Activar plan de contingencia; restablecer y analizar causa',2),
  (100,'TI','Datos','Pérdida o inconsistencia de datos operativos','interno',true,'ISO 9001 7.1.3 / 7.5','Validaciones y respaldos','Restaurar respaldo; conciliar y reforzar validación',3),
  (100,'TI','Control de cambios','Despliegue a producción sin pruebas o sin aprobación','interno',false,'ISO 9001 8.3.6 / 8.5.6','Control de cambios de LIPgo','Revertir; exigir prueba/aprobación; documentar',4),
  (100,'TI','Seguridad','Acceso no autorizado o incidente de seguridad de la información','interno',true,'ISO 9001 7.1.3','Gestión de accesos / monitoreo','Contener, revocar accesos, analizar y endurecer',5),
  -- Compras y Proveedores (CO)
  (100,'CO','Selección','Proveedor no evaluado o no apto contratado','interno',false,'ISO 9001 8.4.1','Evaluación de proveedores','Suspender; evaluar antes de continuar',1),
  (100,'CO','Recepción','Bien o servicio comprado no conforme (EPP, mantenimiento, insumos)','interno',false,'ISO 9001 8.4.2 / 8.6','Verificación de recepción','Rechazar/devolver; registrar al proveedor',2),
  (100,'CO','Reevaluación','Proveedor con bajo desempeño no reevaluado a tiempo','interno',false,'ISO 9001 8.4.1','Cronograma de reevaluación','Reevaluar; plan de mejora o cambio de proveedor',3),
  -- Direccionamiento / SIG (DE)
  (100,'DE','Planificación','Objetivo del SIG sin seguimiento o sin avance','interno',false,'ISO 9001 6.2 / 9.1','Revisión por la dirección','Replanificar; asignar recursos/responsable',1),
  (100,'DE','Riesgos','Riesgo identificado se materializa sin tratamiento planificado','interno',false,'ISO 9001 6.1','Seguimiento de riesgos','Activar acción; actualizar la matriz de riesgos',2),
  (100,'DE','Revisión por la dirección','No se realiza la revisión por la dirección en la frecuencia definida','interno',false,'ISO 9001 9.3','Cronograma del SIG','Reprogramar y ejecutar; dejar registro',3),
  -- Evaluación y Mejora (EM)
  (100,'EM','Auditoría interna','Hallazgo de auditoría sin acción asociada','interno',false,'ISO 9001 9.2 / 10.2','Seguimiento al plan de auditoría','Abrir NC y definir acción correctiva',1),
  (100,'EM','Acción correctiva','Acción correctiva vencida sin cierre','interno',false,'ISO 9001 10.2','Tablero de NC','Escalar; reprogramar con causa del retraso',2),
  (100,'EM','Eficacia','Acción correctiva cerrada que reincide (no eficaz)','interno',false,'ISO 9001 10.2','Análisis de reincidencia','Reabrir; profundizar causa raíz',3)
on conflict (idempresa, proceso_codigo, descripcion) do nothing;

-- ---------------------------------------------------------------------
-- 3) REGISTRO DE NO CONFORMIDADES (10.2 / 8.7)
-- ---------------------------------------------------------------------
create table if not exists public.sig_no_conformidades (
  id serial primary key,
  idempresa int,
  codigo text,                   -- consecutivo p.ej. NC-2026-001
  proceso_codigo text,
  catalogo_id int,               -- opcional: NC potencial del catálogo
  fecha date default now(),
  origen text,                   -- auditoria|queja|inspeccion|proceso|autorreporte|revision_direccion
  descripcion text not null,
  tipo text,                     -- interno | externo
  afecta_cliente boolean default false,
  requisito_incumplido text,
  correccion text,               -- acción inmediata / contención
  causa_raiz text,
  accion_correctiva text,
  responsable text,
  fecha_compromiso date,
  fecha_cierre date,
  estado text default 'abierta', -- abierta | en_proceso | cerrada | anulada
  eficacia text default 'pendiente', -- pendiente | eficaz | no_eficaz
  activo boolean default true,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create unique index if not exists uq_sig_nc on public.sig_no_conformidades (idempresa, codigo);
create index if not exists idx_sig_nc_emp on public.sig_no_conformidades (idempresa, proceso_codigo);

-- Ejemplo real (caso descrito por LIP): selección sin examen médico aprobado.
insert into public.sig_no_conformidades
  (idempresa, codigo, proceso_codigo, fecha, origen, descripcion, tipo, afecta_cliente,
   requisito_incumplido, correccion, causa_raiz, accion_correctiva, responsable,
   fecha_compromiso, estado, eficacia) values
  (100,'NC-2026-001','GH','2026-06-15','proceso',
   'Candidato finaliza el proceso de selección pero no aprueba el examen médico ocupacional; se detiene la contratación.',
   'interno', false,
   'ISO 9001 7.1.2 (recursos/personas) — requisito médico ocupacional',
   'Se detiene la contratación y se notifica al área solicitante; se reactiva la terna.',
   'Examen médico ocupacional programado al final del proceso, sin filtro temprano de aptitud.',
   'Incorporar verificación de aptitud médica como hito temprano del proceso de selección.',
   'Coordinador de Gestión Humana','2026-07-15','en_proceso','pendiente')
on conflict (idempresa, codigo) do nothing;

-- =====================================================================
-- FIN. Quedan: sig_procesos (7), sig_nc_catalogo (~29), sig_no_conformidades (1 ejemplo)
-- =====================================================================
