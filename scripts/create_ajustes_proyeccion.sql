-- ============================================================================
-- AJUSTES DE PROYECCIÓN (Compensación › Revisión de nómina › Ajuste de Proyecciones)
-- ----------------------------------------------------------------------------
-- Por qué existe: la nómina se paga ANTES de que termine el último día de la
-- quincena, así que ese día se PROYECTA el tonelaje (órdenes con
-- `cabeceraoc.tipooperacion = 'proyeccion'`). La proyección NO reemplaza a las
-- órdenes reales: se SUMA a ellas — verificado en datos, un auxiliar del
-- 31-jul-2026 tenía 18,857 t de proyección + 1,139 t reales = 19,996 t
-- liquidadas. El día sigue y llegan más órdenes, así que al cerrar el día lo
-- real casi nunca coincide con lo pagado.
--
-- Este control cruza, el día siguiente al pago (el 16 y el 1º):
--     ton_real (solo órdenes reales, con tiquete de báscula)
--   − ton_pagada (lo que pagonomina liquidó ese día: proyección + real)
--   = diferencia  ->  se paga o se descuenta en la quincena SIGUIENTE
--
-- Así se sigue cumpliendo la norma de pagar lo que se factura.
--
-- Los ajustes nacen 'pendiente' y solo salen al archivo plano al APROBARSE,
-- con su novedad propia:
--   · a favor del trabajador -> "72-Ajuste proyección toneladas ingreso-Ingreso"
--   · pagado de más          -> "73-Ajuste mayor valor pagado toneladas-Deducción"
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.ajustes_proyeccion (
  id                bigserial PRIMARY KEY,
  idempresa         integer     NOT NULL,
  -- Día que se proyectó (el último de la quincena que se pagó por anticipado).
  fecha_proyectada  date        NOT NULL,
  -- Quincena a la que pertenece esa fecha (la que se está ajustando).
  anio              integer     NOT NULL,
  mes               integer     NOT NULL,
  quincena          smallint    NOT NULL,
  -- Persona: `persona` es la llave de pagonomina (nombre); `identificacion` es
  -- la que necesita el archivo plano. Se guardan ambas a propósito.
  persona           text        NOT NULL,
  identificacion    text,
  -- Toneladas y plata: lo pagado vs lo real, y la diferencia CON SIGNO.
  ton_pagada        numeric     NOT NULL DEFAULT 0,
  ton_real          numeric     NOT NULL DEFAULT 0,
  diferencia_ton    numeric     NOT NULL DEFAULT 0,
  valor_pagado      numeric     NOT NULL DEFAULT 0,
  valor_real        numeric     NOT NULL DEFAULT 0,
  valor_ajuste      numeric     NOT NULL DEFAULT 0,  -- + a favor del trabajador, − a favor de la empresa
  novedad_siigo     text        NOT NULL,
  -- Quincena donde se aplica (la siguiente a la ajustada).
  anio_aplica       integer     NOT NULL,
  mes_aplica        integer     NOT NULL,
  quincena_aplica   smallint    NOT NULL,
  estado            text        NOT NULL DEFAULT 'pendiente',
  creado_por        text,
  creado            timestamptz NOT NULL DEFAULT now(),
  aprobado_por      text,
  aprobado_en       timestamptz,
  observacion       text,
  CONSTRAINT ajustes_proyeccion_estado_chk CHECK (estado IN ('pendiente', 'aprobado', 'rechazado')),
  CONSTRAINT ajustes_proyeccion_quincena_chk CHECK (quincena IN (1, 2)),
  CONSTRAINT ajustes_proyeccion_quincena_aplica_chk CHECK (quincena_aplica IN (1, 2))
);

-- Un solo ajuste por persona y fecha proyectada: al re-correr el cruce se
-- ACTUALIZA el existente en vez de duplicar el pago.
CREATE UNIQUE INDEX IF NOT EXISTS ajustes_proyeccion_unico_idx
  ON public.ajustes_proyeccion (idempresa, fecha_proyectada, persona);

-- Accesos reales: el archivo plano (por cédula y quincena de aplicación) y la
-- bandeja de aprobación (por estado).
CREATE INDEX IF NOT EXISTS ajustes_proyeccion_aplica_idx
  ON public.ajustes_proyeccion (anio_aplica, mes_aplica, quincena_aplica, estado);
CREATE INDEX IF NOT EXISTS ajustes_proyeccion_ident_idx
  ON public.ajustes_proyeccion (identificacion);
CREATE INDEX IF NOT EXISTS ajustes_proyeccion_estado_idx
  ON public.ajustes_proyeccion (estado);
