-- =====================================================================
-- SIG - Indicadores de gestión (ISO 9001 numeral 9.1) + tablero del sistema
-- Aditivo e idempotente. Alcance LIP (idempresa = 100).
--
-- Catálogo de indicadores: gerenciales (estratégicos) y de resultado por
-- proceso/área. Cada indicador puede ser:
--   - AUTOMÁTICO: calculo_auto = clave que el tablero calcula EN VIVO desde
--     datos reales de LIPgo (cabeceraoc, citasvehiculos, invtrans, headcount),
--     filtrable por cliente/sitio (proyecto) -> resultados por sitio (9.1).
--   - MANUAL: valor_manual lo diligencia el responsable (p. ej. satisfacción,
--     hasta que el módulo de Satisfacción/PQRSF lo alimente).
-- sentido: mayor_mejor | menor_mejor (para el semáforo vs meta).
-- =====================================================================

create table if not exists public.sig_indicadores (
  id serial primary key,
  idempresa int,                 -- alcance LIP (100)
  codigo text not null,
  proceso_codigo text,           -- DE | CD | AI | GH | TI | CO | EM
  nombre text not null,
  tipo text,                     -- gerencial | resultado
  parte_interesada text,         -- cliente | conductor | proveedor | colaborador | direccion | legal
  formula text,
  fuente text,                   -- tabla/origen o 'manual'
  calculo_auto text,             -- clave de cálculo en vivo (null = manual)
  unidad text,                   -- % | ton | # | días
  meta numeric,                  -- null = informativo (sin semáforo)
  sentido text,                  -- mayor_mejor | menor_mejor
  frecuencia text,               -- diaria | semanal | mensual | trimestral | semestral | anual
  responsable text,
  valor_manual numeric,          -- valor para indicadores manuales
  orden int default 0,
  activo boolean default true,
  created_at timestamptz default now()
);
create unique index if not exists uq_sig_indicadores on public.sig_indicadores (idempresa, codigo);
create index if not exists idx_sig_indicadores_emp on public.sig_indicadores (idempresa);

insert into public.sig_indicadores
  (idempresa, codigo, proceso_codigo, nombre, tipo, parte_interesada, formula, fuente, calculo_auto, unidad, meta, sentido, frecuencia, responsable, valor_manual, orden) values
  -- ============ GERENCIALES (estratégicos) ============
  (100,'IND-G-01','DE','Satisfacción del cliente','gerencial','cliente','Promedio de la encuesta de satisfacción a clientes (1-5 → %)','sig_satisfaccion','sat_cliente','%',90,'mayor_mejor','semestral','Gerencia General',null,1),
  (100,'IND-G-02','CD','Satisfacción de conductores / transportistas','gerencial','conductor','Promedio de la encuesta corta a conductores atendidos (1-5 → %)','sig_satisfaccion','sat_conductor','%',85,'mayor_mejor','semestral','Jefe de Operaciones',null,2),
  (100,'IND-G-03','CD','Cumplimiento de cargues (LIP)','gerencial','cliente','Cargues finalizados por LIP (fincargue) / total de órdenes — tramo de LIP, no depende del pesaje final del cliente','cabeceraoc','desp_cumplimiento','%',98,'mayor_mejor','mensual','Jefe de Operaciones',null,3),
  (100,'IND-G-04','DE','Implementación del SIG','gerencial','direccion','Avance documental del SIG (cobertura de requisitos)','manual',null,'%',100,'mayor_mejor','trimestral','Coordinador SIG',null,4),
  (100,'IND-G-05','CD','Trazabilidad del ciclo en LIPgo (valor agregado)','gerencial','cliente','Órdenes con ciclo completo registrado en LIPgo / total — valor agregado de LIP: la plataforma le da al cliente trazabilidad total del despacho para cualquier reclamación','cabeceraoc','desp_ciclo_cerrado','%',null,null,'mensual','Jefe de Operaciones',null,5),
  -- ============ RESULTADO POR PROCESO ============
  -- Cargue y Descargue (CD)
  (100,'IND-CD-01','CD','Órdenes procesadas','resultado','cliente','Conteo de órdenes de cargue/descargue','cabeceraoc','desp_ordenes','#',null,null,'mensual','Jefe de Operaciones',null,10),
  (100,'IND-CD-02','CD','Toneladas movilizadas','resultado','direccion','Suma de peso (báscula) de las órdenes','cabeceraoc','desp_toneladas','ton',null,null,'mensual','Jefe de Operaciones',null,11),
  (100,'IND-CD-03','CD','Vehículos / conductores atendidos','resultado','conductor','Conteo de citas de vehículos atendidas','citasvehiculos','vehiculos_atendidos','#',null,null,'mensual','Jefe de Operaciones',null,12),
  (100,'IND-CD-04','CD','Evidencia fotográfica de cargue','resultado','cliente','Órdenes con registro fotográfico / total — trazabilidad del servicio LIP','cabeceraoc','lip_evidencia','%',95,'mayor_mejor','mensual','Coordinador de Operación',null,13),
  (100,'IND-CD-05','CD','Tiempo de cargue LIP','resultado','direccion','Promedio iniciocargue→fincargue (minutos) — tramo controlado por LIP','cabeceraoc','lip_tiempo_cargue','min',60,'menor_mejor','mensual','Jefe de Operaciones',null,14),
  -- Almacenamiento e Inventarios (AI)
  (100,'IND-AI-01','AI','Exactitud de movimientos de inventario','resultado','cliente','Movimientos aprobados / total de movimientos','invtrans','inv_exactitud','%',98,'mayor_mejor','mensual','Líder de Bodega',null,20),
  (100,'IND-AI-02','AI','Movimientos rechazados','resultado','cliente','Conteo de movimientos en estado rechazado','invtrans','inv_rechazos','#',0,'menor_mejor','mensual','Líder de Bodega',null,21),
  -- Gestión Humana y SST (GH)
  (100,'IND-GH-01','GH','Colaboradores activos','resultado','colaborador','Conteo de colaboradores activos','headcount','gh_activos','#',null,null,'mensual','Coordinador de Gestión Humana',null,30),
  (100,'IND-GH-02','GH','Ausentismo','resultado','colaborador','Días de incapacidad / días programados','ausentismosst',null,'%',3,'menor_mejor','mensual','Coordinador de Gestión Humana',null,31),
  (100,'IND-GH-03','GH','Formación aprobada','resultado','colaborador','Colaboradores con evaluación aprobada / total','capacitaciones',null,'%',90,'mayor_mejor','trimestral','Coordinador de Gestión Humana',null,32),
  -- Compras y Proveedores (CO)
  (100,'IND-CO-01','CO','Evaluación de proveedores','resultado','proveedor','Proveedores evaluados conformes / total','manual',null,'%',90,'mayor_mejor','anual','Compras',null,40),
  -- Evaluación y Mejora (EM)
  (100,'IND-EM-01','EM','No conformidades cerradas a tiempo','resultado','direccion','NC cerradas dentro del plazo / total NC','sig_no_conformidades',null,'%',90,'mayor_mejor','mensual','Coordinador SIG',null,50),
  -- Legal
  (100,'IND-DE-01','DE','Cumplimiento legal','resultado','legal','Requisitos legales cumplidos / aplicables','sig_requisitos_legales',null,'%',100,'mayor_mejor','anual','Coordinador SIG',null,60)
on conflict (idempresa, codigo) do nothing;

-- =====================================================================
-- FIN. 15 indicadores (4 gerenciales + 11 por proceso). 7 se calculan en vivo
-- (cabeceraoc, citasvehiculos, invtrans, headcount); el resto son manuales /
-- se alimentarán del módulo de Satisfacción/PQRSF y otros bloques.
-- =====================================================================
