-- =====================================================================
-- SIG - Matriz Legal Ambiental (ISO 14001, numeral 6.1.3).
-- Normatividad ambiental colombiana aplicable a LIP (logística, montacargas
-- eléctricos, baterías RESPEL, embalaje, energía). Aditivo e idempotente.
-- =====================================================================

create table if not exists public.sig_requisitos_legales (
  id serial primary key,
  idempresa int,
  norma_codigo text default 'ISO14001',
  tipo_norma text,                  -- Ley | Decreto | Resolución
  identificacion text,              -- "Decreto 1076 de 2015"
  titulo text,
  requisito text,                   -- qué exige
  como_cumple text,                 -- evidencia/control en LIP
  cumple text default 'cumple',     -- cumple | parcial | no_cumple | no_aplica
  responsable text,
  activo boolean default true,
  created_at timestamptz default now(),
  unique (idempresa, identificacion)
);
create index if not exists idx_sig_legal_emp on public.sig_requisitos_legales (idempresa);

insert into public.sig_requisitos_legales (idempresa, norma_codigo, tipo_norma, identificacion, titulo, requisito, como_cumple, cumple, responsable) values
  (1, 'ISO14001', 'Decreto', 'Decreto 1076 de 2015', 'Decreto Único Reglamentario del Sector Ambiente', 'Cumplir la normatividad ambiental aplicable a las actividades', 'Matriz legal ambiental con evaluación periódica de cumplimiento', 'cumple', 'Coordinador SST/Ambiental'),
  (1, 'ISO14001', 'Decreto', 'Decreto 4741 de 2005', 'Gestión integral de residuos peligrosos (RESPEL)', 'Manejo y disposición de RESPEL (baterías, RAEE, luminarias)', 'Entrega a gestor autorizado con manifiestos; registro de generador', 'cumple', 'Coordinador SST'),
  (1, 'ISO14001', 'Resolución', 'Resolución 1297 de 2010', 'Recolección selectiva de pilas y baterías usadas', 'Devolución posconsumo de baterías', 'Baterías de montacargas a programa posconsumo / gestor autorizado', 'parcial', 'Líder de Bodega'),
  (1, 'ISO14001', 'Resolución', 'Resolución 1512 de 2010', 'Recolección selectiva de RAEE', 'Gestión de residuos de aparatos eléctricos y electrónicos', 'Disposición de equipos y luminarias con gestor autorizado', 'parcial', 'Gerencia de Tecnología'),
  (1, 'ISO14001', 'Resolución', 'Resolución 1407 de 2018', 'Gestión ambiental de residuos de envases y empaques', 'Plan de gestión de envases y empaques', 'Separación y reciclaje de film y cartón; estibas en plástico reciclado reutilizable', 'cumple', 'Líder de Bodega'),
  (1, 'ISO14001', 'Ley', 'Ley 697 de 2001', 'Uso Racional y Eficiente de Energía (URE)', 'Uso eficiente de la energía', 'Montacargas eléctricos, iluminación LED y medición de consumo (kWh)', 'cumple', 'Coordinador Operaciones'),
  (1, 'ISO14001', 'Resolución', 'Resolución 631 de 2015', 'Parámetros y límites de vertimientos', 'Control de vertimientos', 'Vertimientos domésticos a alcantarillado; trampa de grasas', 'no_aplica', 'Servicios Generales'),
  (1, 'ISO14001', 'Ley', 'Ley 1259 de 2008', 'Comparendo ambiental', 'Manejo adecuado de residuos sólidos', 'Separación en la fuente y puntos ecológicos', 'cumple', 'Coordinador SST')
on conflict (idempresa, identificacion) do update set
  tipo_norma = excluded.tipo_norma, titulo = excluded.titulo, requisito = excluded.requisito,
  como_cumple = excluded.como_cumple, cumple = excluded.cumple, responsable = excluded.responsable;
