-- =====================================================================
-- SIG - ISO 14001: Matriz de Aspectos e Impactos Ambientales (numeral 6.1.2).
-- Catalogo base para LOGISTICA con MONTACARGAS ELECTRICOS (sin combustion:
-- el foco ambiental es energia + baterias/RESPEL + residuos de embalaje).
-- Aditivo e idempotente. Seed para empresa 1; ajustable luego con datos reales.
-- =====================================================================

create table if not exists public.sig_aspectos_ambientales (
  id serial primary key,
  idempresa int,
  actividad text not null,
  aspecto text not null,
  impacto text,
  tipo_recurso text,                 -- energia | agua | residuos | respel | aire | suelo | papel
  condicion text default 'normal',   -- normal | anormal | emergencia
  cumplimiento_legal boolean default true,
  frecuencia int default 3,          -- 1..5
  severidad int default 3,           -- 1..5
  alcance int default 3,             -- 1..5
  significancia text default 'no_significativo', -- significativo | no_significativo
  control text,
  responsable text,
  activo boolean default true,
  created_at timestamptz default now(),
  unique (idempresa, actividad, aspecto)
);

create index if not exists idx_sig_aspamb_emp on public.sig_aspectos_ambientales (idempresa);

-- Permiso: se reutiliza el de la norma (sig_iso14001), ya existente.

-- ------------------------- SEED (empresa 1) -------------------------
insert into public.sig_aspectos_ambientales
  (idempresa, actividad, aspecto, impacto, tipo_recurso, condicion, frecuencia, severidad, alcance, significancia, control, responsable)
values
  (1, 'Operación de montacargas eléctricos', 'Consumo de energía eléctrica', 'Agotamiento de recursos / emisiones GEI indirectas', 'energia', 'normal', 5, 3, 3, 'significativo', 'Medición de kWh, equipos eficientes, apagado programado', 'Coordinador SST/Operaciones'),
  (1, 'Carga de baterías de montacargas', 'Consumo energético y posible derrame de electrolito', 'Contaminación de suelo y agua', 'respel', 'anormal', 4, 4, 3, 'significativo', 'Zona de carga con contención, ventilación y kit antiderrames', 'Coordinador Operaciones'),
  (1, 'Cambio/disposición de baterías', 'Generación de residuo peligroso (RESPEL)', 'Contaminación y riesgo a la salud', 'respel', 'normal', 2, 5, 4, 'significativo', 'Gestor autorizado, manifiesto de RESPEL, registro de entrega', 'Coordinador SST'),
  (1, 'Almacenamiento y embalaje', 'Uso de estibas de plástico reciclado (80%) reutilizables y embalaje (film/cartón)', 'Evita uso de madera (deforestación); reúso y economía circular; menor generación de residuos', 'residuos', 'normal', 5, 2, 3, 'significativo', 'Estibas 80% plástico reciclado y reutilizables; separación y reciclaje de film y cartón', 'Líder de bodega'),
  (1, 'Iluminación de bodega', 'Consumo de energía y residuo de luminarias', 'GEI indirecto / RESPEL (luminarias)', 'energia', 'normal', 4, 2, 2, 'no_significativo', 'Luminarias LED, gestión de luminarias usadas', 'Coordinador Operaciones'),
  (1, 'Aseo y limpieza de áreas', 'Consumo de agua y vertimientos', 'Presión sobre el recurso hídrico', 'agua', 'normal', 3, 2, 2, 'no_significativo', 'Uso racional del agua, trampa de grasas', 'Servicios generales'),
  (1, 'Actividad administrativa', 'Consumo de papel y residuos de aparatos eléctricos (RAEE)', 'Generación de residuos', 'papel', 'normal', 3, 1, 2, 'no_significativo', 'Digitalización en LIPgo, reciclaje de papel y RAEE', 'Administración')
on conflict (idempresa, actividad, aspecto) do update set
  impacto = excluded.impacto,
  tipo_recurso = excluded.tipo_recurso,
  condicion = excluded.condicion,
  frecuencia = excluded.frecuencia,
  severidad = excluded.severidad,
  alcance = excluded.alcance,
  significancia = excluded.significancia,
  control = excluded.control,
  responsable = excluded.responsable;
