-- ============================================================================
-- 181: demanda_puesto pasa de "turno_codigo" fijo a "hora_inicio" real
-- ----------------------------------------------------------------------------
-- Vista de quincena dejó de depender de la tabla `turnos_definicion` (un
-- catálogo fijo T1/T2/T3/AD que nadie mantenía y que el coordinador
-- programaba distinto en la práctica -- ver Programar el día). Ahora la
-- Cobertura declara demanda por PUESTO + HORA DE ENTRADA REAL, la misma
-- que ya se usa en "Horarios reales en uso" de la pantalla.
--
-- `turno_codigo` se deja intacto (histórico, no se borra nada) pero deja de
-- ser obligatorio: las filas NUEVAS que guarde la pantalla ya no lo escriben,
-- usan `hora_inicio` en su lugar. Las filas viejas con `turno_codigo` y sin
-- `hora_inicio` simplemente se ignoran en el código nuevo (no se adivina un
-- horario a partir de un código) -- si hace falta, se pueden migrar a mano
-- después de correr esto, comparando contra `turnos_definicion`.
-- ============================================================================

alter table public.demanda_puesto
  alter column turno_codigo drop not null;

alter table public.demanda_puesto
  add column if not exists hora_inicio text;

comment on column public.demanda_puesto.hora_inicio is
  'Hora de entrada real ("HH:MM") del horario para el que se declara la demanda. Reemplaza a turno_codigo (que queda solo como histórico).';

-- Mismos DOS índices parciales que ya existían para turno_codigo (NULL <> NULL
-- en Postgres, así que hacen falta separados para fecha con valor vs NULL),
-- ahora sobre hora_inicio.
create unique index if not exists uq_demanda_hora_con_fecha
  on public.demanda_puesto (idempresa, puesto, hora_inicio, fecha)
  where fecha is not null and hora_inicio is not null;

create unique index if not exists uq_demanda_hora_base
  on public.demanda_puesto (idempresa, puesto, hora_inicio)
  where fecha is null and hora_inicio is not null;

notify pgrst, 'reload schema';

-- ============================================================================
-- VERIFICACIÓN (correr después, opcional)
-- ============================================================================
-- select column_name, is_nullable from information_schema.columns
--  where table_name = 'demanda_puesto' order by ordinal_position;
