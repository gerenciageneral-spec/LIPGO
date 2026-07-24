-- =====================================================================
-- 52. Puente automático de incapacidades: borrador SST + soporte clínico.
--
-- Cierra el círculo Visor de asistencia -> tabla de Ausentismos. Cuando en el
-- Visor se marca una novedad de INCAPACIDAD/AT, el sistema crea un BORRADOR en
-- ausentismosst (misma tabla que comparte el módulo de Recobro) para que el
-- analista SST lo complete (diagnóstico, días, costos) y suba el soporte clínico.
--
-- Dos ejes de estado INDEPENDIENTES sobre la MISMA fila:
--   * estado_registro: gestión SST / calidad del dato.
--       BORRADOR = creado por el puente, falta completar/validar.
--       COMPLETO = validado por el analista (entra al recobro).
--   * estado_recobro (ya existe): ciclo del dinero ante EPS/ARL
--       (PENDIENTE|RADICADO|RECOBRADO|GLOSADO|PERDIDO). NO se toca su semántica.
--
--   * origen: de dónde salió la fila.
--       CONTROL_DIARIO = puente/backfill desde registroasistencia (el único que
--                        el puente puede tocar/actualizar/borrar).
--       MANUAL         = formulario "Nuevo ausentismo".
--       IMPORT         = cargue del Excel SST-MAT-06.
--   * soporte_incapacidad_url: documento clínico escaneado = PRIMER eslabón de la
--       cadena de recobro (incapacidad -> radicado EPS/ARL -> comprobante de pago).
--
-- Aditivo e idempotente.
-- =====================================================================

-- OJO: default 'COMPLETO' a propósito. ADD COLUMN ... DEFAULT aplica el valor a
-- TODAS las filas existentes; con 'COMPLETO' el histórico (manual/Excel) NO se
-- marca como borrador ámbar. Solo el puente inserta 'BORRADOR' explícito.
alter table public.ausentismosst
  add column if not exists estado_registro text default 'COMPLETO';

alter table public.ausentismosst
  add column if not exists origen text default 'MANUAL';

alter table public.ausentismosst
  add column if not exists soporte_incapacidad_url text;

-- categoria: clasifica la fila de ausentismo.
--   ENFERMEDAD_GENERAL | ACCIDENTE_LABORAL   (médicas, tipo_evento EG/AT; recobrables)
--   NO_REMUNERADA                            (ausencia sin soporte médico; tipo_evento NULL,
--                                             no recobrable — nómina la rotula así)
-- NOTA: otras licencias (maternidad/luto/remunerada), vacaciones, descanso y retiro
--       NO son ausentismo → el puente NO los envía. Las vacaciones van a su propio
--       submódulo (tabla `vacaciones`).
alter table public.ausentismosst
  add column if not exists categoria text;

-- tipo_evento deja de ser obligatorio: las ausencias NO médicas no son EG ni AT.
-- Toda la lógica de EG/AT/recobro/indicadores se basa en `categoria` (o en costos),
-- así que una fila no médica con tipo_evento NULL nunca se cuenta como enfermedad.
alter table public.ausentismosst alter column tipo_evento drop not null;

-- Backfill defensivo (por si la columna ya existía en NULL).
update public.ausentismosst set estado_registro = 'COMPLETO' where estado_registro is null;
update public.ausentismosst set origen = 'MANUAL' where origen is null;
-- Backfill de categoria para el histórico (todo lo previo es médico EG/AT).
update public.ausentismosst
   set categoria = case when tipo_evento = 'AT' then 'ACCIDENTE_LABORAL' else 'ENFERMEDAD_GENERAL' end
 where categoria is null;

-- Reclasificar el histórico según la marca que ya dejaban los procesos previos:
--   * Borradores del backfill (generarBorradoresAusentismoDesdeControl).
update public.ausentismosst
   set origen = 'CONTROL_DIARIO', estado_registro = 'BORRADOR'
 where origen = 'MANUAL'
   and coalesce(observaciones, '') like '[Borrador desde control diario%';
--   * Importados del Excel SST-MAT-06.
update public.ausentismosst
   set origen = 'IMPORT'
 where coalesce(observaciones, '') = 'Importado de SST-MAT-06';

-- Índices para el filtro de la UI y para la reconciliación del puente.
create index if not exists idx_ausentismosst_estado_registro
  on public.ausentismosst (estado_registro);
create index if not exists idx_ausentismosst_puente
  on public.ausentismosst (idempresa, origen, cedula);

-- Guarda anti-duplicado en carrera (dos guardados simultáneos del mismo
-- episodio): una sola fila-borrador del puente por (empresa, cédula, fecha_inicial).
-- Episodios legítimos con distinta fecha_inicial no colisionan.
create unique index if not exists ux_ausentismosst_borrador_episodio
  on public.ausentismosst (idempresa, cedula, fecha_inicial)
  where origen = 'CONTROL_DIARIO';

-- Verificación (opcional):
-- select origen, estado_registro, count(*) from ausentismosst group by 1,2 order by 1,2;
-- =====================================================================
