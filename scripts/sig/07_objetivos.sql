-- =====================================================================
-- SIG - Objetivos y Metas del SIG (numeral 6.2, las 3 normas).
-- Aditivo e idempotente. Seed para empresa 1; editable luego desde la app.
-- =====================================================================

create table if not exists public.sig_objetivos (
  id serial primary key,
  idempresa int,
  norma_codigo text,                 -- ISO9001 | ISO14001 | ISO45001 | SIG
  objetivo text not null,
  meta text,
  indicador text,
  unidad text,
  linea_base text,
  valor_actual text,
  fecha_meta date,
  responsable text,
  estado text default 'en_curso',    -- en_curso | cumplido | atrasado
  activo boolean default true,
  created_at timestamptz default now(),
  unique (idempresa, objetivo)
);
create index if not exists idx_sig_objetivos_emp on public.sig_objetivos (idempresa);

insert into public.sig_objetivos (idempresa, norma_codigo, objetivo, meta, indicador, unidad, linea_base, valor_actual, responsable, estado) values
  (1, 'ISO14001', 'Reducir el consumo de papel mediante digitalización en LIPgo', 'Gestionar >= 10.000 registros digitales al año', 'Registros digitales en LIPgo', 'registros', '0', 'En medición (en vivo)', 'Gerencia de Tecnología', 'en_curso'),
  (1, 'ISO14001', 'Maximizar el reúso de estibas de plástico reciclado', '100% de estibas en plástico reciclado reutilizable', '% de estibas reutilizables', '%', 'Estibas de madera', '80% plástico reciclado', 'Líder de Bodega', 'en_curso'),
  (1, 'ISO9001', 'Mantener la satisfacción del cliente', 'Satisfacción >= 90%', 'Encuesta de satisfacción (FOR-LIP-SIG-015)', '%', 'N/D', 'N/D', 'Gerencia Comercial', 'en_curso'),
  (1, 'ISO45001', 'Cumplir los Estándares Mínimos SG-SST (Res. 0312)', 'Valoración >= 85% (Aceptable, Art. 28)', 'Autoevaluación 0312 (Art. 27)', '%', '52%', '52% (Crítico)', 'Coordinador SST', 'en_curso'),
  (1, 'SIG', 'Lograr la certificación integrada ISO 9001/14001/45001', 'Certificación ICONTEC obtenida', '% de implementación del SIG', '%', '0%', 'En implementación', 'Gerencia de Certificaciones', 'en_curso')
on conflict (idempresa, objetivo) do update set
  norma_codigo = excluded.norma_codigo, meta = excluded.meta, indicador = excluded.indicador,
  unidad = excluded.unidad, linea_base = excluded.linea_base, valor_actual = excluded.valor_actual,
  responsable = excluded.responsable, estado = excluded.estado;
