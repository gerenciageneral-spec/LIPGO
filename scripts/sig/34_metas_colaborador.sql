-- =====================================================================
-- Metas individuales del colaborador (alineación SIG con el trabajador).
-- Permite asignar a CADA trabajador metas/indicadores ligados (opcionalmente)
-- a los objetivos del SIG (sig_objetivos), para que en su PORTAL vea cómo
-- contribuye y cuándo incumple. El aporte se calcula EN VIVO desde LIPgo
-- (asistencia, incapacidades, capacitaciones, toneladas, SLA por auxiliar,
-- desempeño); esta tabla guarda las metas FORMALES por persona.
-- Aditivo e idempotente.
-- =====================================================================

create table if not exists public.sig_metas_colaborador (
  id serial primary key,
  colaborador_id bigint,          -- headcount.id
  identificacion text,            -- cédula (para join directo con registroasistencia)
  idempresa int,                  -- proyecto/cliente del colaborador
  sig_objetivo_id int,            -- opcional: liga a sig_objetivos (6.2)
  area text,                      -- SST | Formación | Operación | Desempeño
  indicador text not null,        -- nombre del indicador individual
  meta numeric,                   -- valor meta
  unidad text default '%',        -- % | ton | # | días
  sentido text default 'mayor_mejor', -- mayor_mejor | menor_mejor
  periodo text,                   -- p.ej. 2026-S1 / 2026-06
  valor_actual numeric,           -- opcional (si se diligencia manual)
  estado text default 'en_curso', -- en_curso | cumplido | atrasado
  activo boolean default true,
  created_at timestamptz default now()
);
create index if not exists idx_metas_colab_id on public.sig_metas_colaborador (colaborador_id);
create index if not exists idx_metas_colab_ident on public.sig_metas_colaborador (identificacion);

-- =====================================================================
-- FIN. El portal del trabajador lee estas metas + calcula su aporte en vivo.
-- =====================================================================
