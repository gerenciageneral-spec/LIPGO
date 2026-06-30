-- =====================================================================
-- SIG - Análisis de Contexto / Matriz DOFA (numeral 4.1, las 3 normas).
-- Aditivo e idempotente. Seed para empresa 1; editable luego desde la app.
-- =====================================================================

create table if not exists public.sig_contexto_dofa (
  id serial primary key,
  idempresa int,
  cuadrante text not null,   -- fortaleza | debilidad | oportunidad | amenaza
  origen text,               -- interno | externo
  descripcion text not null,
  orden int default 0,
  activo boolean default true,
  created_at timestamptz default now()
);
create index if not exists idx_sig_dofa_emp on public.sig_contexto_dofa (idempresa);

insert into public.sig_contexto_dofa (idempresa, cuadrante, origen, descripcion, orden) values
  (1,'fortaleza','interno','Plataforma propia LIPgo: digitalización integral, trazabilidad y reducción de papel',1),
  (1,'fortaleza','interno','Montacargas 100% eléctricos: sin emisiones de combustión y eficiencia energética',2),
  (1,'fortaleza','interno','Estibas de plástico reciclado (80%) reutilizables: economía circular, no usa madera',3),
  (1,'fortaleza','interno','Operación logística multiempresa centralizada y estandarizada',4),
  (1,'fortaleza','interno','Procesos y roles definidos (manuales de funciones, caracterizaciones)',5),
  (1,'debilidad','interno','SG-SST en valoración crítica (52% en estándares mínimos Res. 0312)',1),
  (1,'debilidad','interno','Sistema Integrado de Gestión en implementación (primera certificación)',2),
  (1,'debilidad','interno','Dependencia de equipos del cliente (báscula) para mediciones',3),
  (1,'debilidad','interno','Cultura de calidad y SST aún en consolidación',4),
  (1,'oportunidad','externo','Certificación ISO 9001/14001/45001 como diferenciador comercial',1),
  (1,'oportunidad','externo','Clientes que exigen proveedores certificados y sostenibles',2),
  (1,'oportunidad','externo','Sostenibilidad y economía circular como ventaja (estibas, digitalización)',3),
  (1,'oportunidad','externo','Crecimiento del e-commerce y la tercerización logística',4),
  (1,'amenaza','externo','Cambios normativos (laboral Ley 2466/2025, ambiental y SST)',1),
  (1,'amenaza','externo','Competencia con operadores logísticos ya certificados',2),
  (1,'amenaza','externo','Riesgos de seguridad vial y accidentalidad (PESV)',3),
  (1,'amenaza','externo','Volatilidad de costos (energía, transporte) y dependencia tecnológica/ciberseguridad',4);
