-- ============================================================================
-- DESPLIEGUE — reemplazo de la vista archivoplano
--   VISTA EN VIVO sobre `pagonomina`: cualquier ajuste (horas, jornada, novedades)
--   se refleja al instante en el archivo plano de nómina (SIIGO). Misma fuente de
--   verdad que el IBC de Parafiscales.
--   · Excluye a los trabajadores RETIRADOS (headcount.estado = 'Inactivo'); su
--     nómina pendiente se maneja en el submódulo Liquidaciones.
--   · JORNADA por FECHA (Ley 2101): las horas del recargo/dominical usan la jornada
--     vigente en la fecha desde `parametros_legales_vigencia` — LA MISMA fuente
--     que pagonomina (antes leía jornada_legal y podían divergir). jun-2026 →
--     7,3333; desde 16-jul-2026 → 7. Requiere create_parametros_legales_vigencia.sql.
--   · nominaproyectada = salario quincenal por trabajador (antes fijo 875452).
--   · AJUSTE DE PROYECCIÓN (Revisión de nómina › Ajuste de Proyecciones): rama
--     propia que liquida, en la quincena SIGUIENTE, la diferencia entre lo
--     proyectado y lo realmente movido el último día de la quincena anterior.
--     Solo los APROBADOS. Novedades 72 (ingreso) y 73 (deducción).
--     Requiere scripts/create_ajustes_proyeccion.sql.
--   · BONOS no prestacionales (Compensación › Bonos): rama propia al final que
--     lee `bonos_nomina` (solo APROBADOS), una fila por código de novedad
--     (43/50/66). NO se mezclan con la novedad 52- del bono de productividad.
--     Requiere scripts/create_bonos_nomina.sql.
--   · BONO DE PRODUCTIVIDAD (excedente de destajo): DESDE LA QUINCENA DEL
--     16-JUL-2026 viaja como '52-Bonificación Por Productividad-Ingreso'; hasta
--     la 1ª quincena de julio sigue saliendo como '71-Bonificación Ajuste
--     Toneladas-Ingreso', porque esos planos ya se enviaron a Siigo con ese
--     código. Cambia SOLO la etiqueta: el cálculo es el mismo en ambas ramas.
--   · NOMBRE DEL EMPLEADO (`nombreempleado`, columna 5): Siigo lo exige justo
--     después de la cédula. Sale de `headcount.nombre` — que es la misma llave
--     con la que esta vista une contra pagonomina (h.nombre = p.persona), así
--     que no introduce una segunda fuente de verdad para el nombre.
--   REVERSIBLE: definición previa en git (scripts/vistas_financieras.sql).
--
-- OJO — ESTE SCRIPT USA DROP + CREATE, NO "CREATE OR REPLACE":
-- Postgres solo deja AÑADIR columnas AL FINAL con CREATE OR REPLACE VIEW;
-- insertar `nombreempleado` en medio (posición 5) da error 42P16. Va todo
-- dentro de una transacción para que la vista nunca quede caída: si el CREATE
-- falla, el DROP se revierte solo.
-- Verificado antes de hacerlo: ninguna otra vista, función o script depende de
-- `archivoplano` (la dependencia es al revés — ella lee pagonomina, headcount,
-- parametros_legales_vigencia, bonos_nomina y ajustes_proyeccion).
-- ============================================================================

BEGIN;

DROP VIEW IF EXISTS public.archivoplano;

create view public.archivoplano as
 WITH base_datos AS (
         SELECT p.fecha,
            p.idempresa,
            p.persona,
            h.identificacion,
            h.contratosiigo,
            h.salario,
            COALESCE((h.salario / (30)::numeric), (58643)::numeric) AS base_diaria,
            -- Jornada VIGENTE por fecha (Ley 2101): las horas del recargo/dominical
            -- que se envían a SIIGO se toman de aquí, no de un 7,33 fijo. jun-2026 →
            -- 7,3333; desde 16-jul-2026 → 7.
            -- FUENTE ÚNICA: parametros_legales_vigencia — LA MISMA que usa
            -- pagonomina. Antes se leía jornada_legal (la tabla que
            -- parametros_legales_vigencia reemplazó): si divergían, las HORAS
            -- que viajaban a Siigo no correspondían al VALOR que LIPgo liquidó.
            COALESCE(
              (SELECT pl.jornada_horas FROM parametros_legales_vigencia pl
                WHERE pl.fecha_desde <= p.fecha
                ORDER BY pl.fecha_desde DESC LIMIT 1),
              (7)::numeric
            ) AS jornada_dia,
            p.total_liquidado_dia,
            p.novedad_reportada,
            -- Excedente de destajo del día CON SIGNO (viene de pagonomina.bonif_prestacional).
            -- Se suma por quincena para netear días buenos con días bajos.
            COALESCE(p.bonif_prestacional, (0)::numeric) AS bonif_prestacional,
            COALESCE(p.bonif_no_prestacional, (0)::numeric) AS bonif_no_prestacional,
            p.pago_domingo,
            p.recargodominical,
            p.hed,
            p.hedf,
            p.hen,
            p.hef,
            p.hn,
            p.toneladas,
            p.especialidad,
            p.horas_hed,
            p.horas_hedf,
            p.horas_hen,
            p.horas_hef,
            p.horas_hn,
            to_char((p.fecha)::timestamp with time zone, 'MM'::text) AS mes_txt,
            EXTRACT(month FROM p.fecha) AS mes_num,
            EXTRACT(year FROM p.fecha) AS anio_num,
                CASE
                    WHEN (EXTRACT(day FROM p.fecha) <= (15)::numeric) THEN 1
                    ELSE 2
                END AS num_quincena,
            to_char((p.fecha)::timestamp with time zone, 'DD/MM/YYYY'::text) AS fecha_evento
           FROM (pagonomina p
             -- TRIM en los DOS lados, igual que en pagonomina: `headcount.nombre`
             -- puede traer espacios de sobra del digitado y sin TRIM el cruce falla
             -- en silencio, dejando la fila sin cédula (y por tanto sin destinatario
             -- en Siigo). Los otros dos JOIN a headcount de esta vista ya usan TRIM.
             LEFT JOIN headcount h ON ((TRIM(BOTH FROM h.nombre) = TRIM(BOTH FROM p.persona))))
          -- Excluir del archivo plano a los trabajadores RETIRADOS (estado
          -- Inactivo). null/'activo' permanecen (no rompe a los legados). Su
          -- nómina pendiente se paga desde el submódulo Liquidaciones.
          WHERE (lower(COALESCE(h.estado, 'activo'::text)) <> 'inactivo'::text)
            -- AL PLANO SOLO PASA QUIEN TIENE CONTRATO CON LIP (regla del negocio).
            -- Se exige lo que Siigo necesita para poder asignar la novedad:
            --   · CÉDULA  -> identificacionempleado. Sin ella la fila viaja en
            --     NULL y no le pertenece a nadie. Medido antes de este filtro:
            --     259 filas así, de 41 nombres que ni siquiera están en Head
            --     Count (ex-trabajadores, gente nunca registrada, y el relleno
            --     "SIN AUXILIAR" de Indupan).
            --   · CONTRATO SIIGO -> contratoempleado. Sin contrato no hay a qué
            --     vínculo cargarle la novedad. Medido: 3 de 57 personas no
            --     inactivas no lo tienen, y las 3 son casos a corregir en Head
            --     Count (dos marcadas Activo pero con fecha de retiro, y una con
            --     cédula ficticia).
            -- Los RETIRADOS ya salen por el filtro de estado de arriba: su
            -- nómina pendiente se paga por el submódulo Liquidaciones, no por el
            -- plano. El trabajo de todos ellos sigue visible en pagonomina; lo
            -- que se corta es su viaje a Siigo.
            AND (h.identificacion IS NOT NULL)
            AND (TRIM(BOTH FROM h.identificacion) <> ''::text)
            AND (h.contratosiigo IS NOT NULL)
            AND (TRIM(BOTH FROM h.contratosiigo) <> ''::text)
        ), agrupado_quincena AS (
         SELECT base_datos.mes_txt,
            base_datos.mes_num,
            base_datos.anio_num,
            base_datos.num_quincena,
            base_datos.idempresa,
            base_datos.identificacion,
            base_datos.contratosiigo,
            max(base_datos.salario) AS salario_ref,
            -- Nombre del empleado para el plano. `persona` viene de pagonomina y
            -- es el mismo valor que headcount.nombre (la vista une por ahí), así
            -- que el MAX sobre un grupo de una sola persona devuelve su nombre.
            max(base_datos.persona) AS nombre_ref,
            -- Excedente NETO de la quincena (Σ con signo): los días bajos restan a los
            -- altos. Es el "cruce" por trabajador toneladas vs base.
            -- OJO: aquí va SOLO `bonif_prestacional`. `bonif_no_prestacional` (los
            -- bonos del módulo Compensación › Bonos) NO se mezcla con la novedad
            -- 52-: sale por su propia rama al final, con su código 43/50/66.
            sum(base_datos.bonif_prestacional) AS total_bono_nomina,
            sum(COALESCE(base_datos.hed, (0)::numeric)) AS total_hed_moneda,
            sum(COALESCE(base_datos.horas_hed, (0)::numeric)) AS total_hed_horas
           FROM base_datos
          GROUP BY base_datos.mes_txt, base_datos.mes_num, base_datos.anio_num, base_datos.num_quincena, base_datos.idempresa, base_datos.identificacion, base_datos.contratosiigo
        ), nivelacion AS (
         SELECT agrupado_quincena.mes_txt,
            agrupado_quincena.mes_num,
            agrupado_quincena.anio_num,
            agrupado_quincena.num_quincena,
            agrupado_quincena.idempresa,
            agrupado_quincena.identificacion,
            agrupado_quincena.contratosiigo,
            agrupado_quincena.salario_ref,
            agrupado_quincena.nombre_ref,
            agrupado_quincena.total_bono_nomina,
            agrupado_quincena.total_hed_moneda,
            agrupado_quincena.total_hed_horas,
            -- Bono = excedente NETO de la quincena, con piso 0: cada día ya cobró su
            -- base, así que un neto negativo NO se le descuenta al trabajador — lo asume
            -- la empresa como costo de baja productividad (queda visible). Las HORAS
            -- EXTRA van COMPLETAS: ya NO se nivelan con el déficit.
            GREATEST((0)::numeric, agrupado_quincena.total_bono_nomina) AS bono_final,
            round(agrupado_quincena.total_hed_horas, 2) AS hed_horas_final
           FROM agrupado_quincena
        )
 SELECT nivelacion.mes_txt AS mes,
    nivelacion.num_quincena AS quincena,
    nivelacion.idempresa,
    nivelacion.identificacion AS identificacionempleado,
    nivelacion.nombre_ref AS nombreempleado,
    nivelacion.contratosiigo AS contratoempleado,
    -- RENOMBRADA DESDE LA QUINCENA DEL 16-JUL-2026. Lo ÚNICO que cambia es el
    -- código y el nombre, para que coincidan con el concepto creado en Siigo: el
    -- cálculo (bono_final), el piso 0 y su carácter prestacional son idénticos en
    -- ambas ramas — es la misma cifra con otra etiqueta.
    --
    -- Por qué el corte y no un cambio retroactivo: hasta la 1ª quincena de julio
    -- los planos YA se enviaron a Siigo con la 71. Renombrar hacia atrás dejaría
    -- LIPgo diciendo 52 sobre periodos que Siigo tiene registrados como 71.
    -- El corte es por QUINCENA (el plano se emite por quincena, no por día): se
    -- arma el primer día del periodo (1 ó 16) y se compara contra el 16-jul-2026.
        CASE
            WHEN (make_date((nivelacion.anio_num)::integer, (nivelacion.mes_num)::integer,
                            CASE WHEN nivelacion.num_quincena = 1 THEN 1 ELSE 16 END)
                  >= DATE '2026-07-16')
              THEN '52-Bonificación Por Productividad-Ingreso'::text
            ELSE '71-Bonificación Ajuste Toneladas-Ingreso'::text
        END AS nombrenovedad,
    'Valor'::text AS tiponovedad,
    round(nivelacion.bono_final) AS cantidadvalor,
    round(COALESCE(nivelacion.salario_ref, (1750905)::numeric) / (2)::numeric)::integer AS nominaproyectada, -- quincenal por trabajador (antes fijo 875452); ::integer para no cambiar el tipo de la columna existente
    NULL::text AS fechainicio,
    NULL::text AS fechafin,
    0 AS diasnohabiles
   FROM nivelacion
  WHERE (nivelacion.bono_final > (0)::numeric)
UNION ALL
 SELECT base_datos.mes_txt AS mes,
    base_datos.num_quincena AS quincena,
    base_datos.idempresa,
    base_datos.identificacion AS identificacionempleado,
    base_datos.persona AS nombreempleado,  -- rama sin GROUP BY: el nombre va directo
    base_datos.contratosiigo AS contratoempleado,
    base_datos.novedad_reportada AS nombrenovedad,
    'Dias'::text AS tiponovedad,
    1 AS cantidadvalor,
    0 AS nominaproyectada,
    base_datos.fecha_evento AS fechainicio,
    base_datos.fecha_evento AS fechafin,
    0 AS diasnohabiles
   FROM base_datos
  WHERE ((base_datos.novedad_reportada IS NOT NULL) AND (TRIM(BOTH FROM base_datos.novedad_reportada) <> ''::text) AND (TRIM(BOTH FROM base_datos.novedad_reportada) <> 'Descanso'::text) AND (TRIM(BOTH FROM base_datos.novedad_reportada) <> 'Descanso compensatorio domingo anterior'::text) AND (TRIM(BOTH FROM base_datos.novedad_reportada) <> 'Retiro'::text)
         -- DÍA 31: las novedades de DÍAS no se reportan. Siigo procesa toda
         -- novedad de tipo "Dias" DESCONTANDO el día de la base y pagando el
         -- concepto a su porcentaje. Pero la base quincenal de Siigo son 15 días
         -- —que por la convención de mes de 30 son el 16 al 30—, así que el 31
         -- NO está dentro de esa base: descontarlo resta un día que nunca se
         -- pagó. Y en LIPgo el 31 ya vale $0 por la misma regla (ver
         -- pagonomina_reemplazo.sql), o sea que el día quedaba castigado DOS
         -- veces. Medido sobre datos reales: 7 casos de "38- Licencia no
         -- remunerada" fechados un 31, cada uno restando un día completo
         -- (~$58.364) que LIPgo sí pagaba — era la diferencia contra Siigo.
         -- Las de efecto neto 0 (13-Incapacidad, 20-Licencia, 31-Vacaciones)
         -- también salen, por coherencia: en un mes de 30 días el 31 no existe
         -- para la nómina. El soporte clínico/ausentismo vive en su módulo, no
         -- en el plano.
         AND (EXTRACT(day FROM base_datos.fecha) <> (31)::numeric))
UNION ALL
 SELECT nivelacion.mes_txt AS mes,
    nivelacion.num_quincena AS quincena,
    nivelacion.idempresa,
    nivelacion.identificacion AS identificacionempleado,
    nivelacion.nombre_ref AS nombreempleado,
    nivelacion.contratosiigo AS contratoempleado,
    '10- Horas extras diurnas 125%- Ingreso'::text AS nombrenovedad,
    'Horas'::text AS tiponovedad,
    nivelacion.hed_horas_final AS cantidadvalor,
    0 AS nominaproyectada,
    NULL::text AS fechainicio,
    NULL::text AS fechafin,
    0 AS diasnohabiles
   FROM nivelacion
  WHERE (nivelacion.hed_horas_final > (0)::numeric)
UNION ALL
 SELECT base_datos.mes_txt AS mes,
    base_datos.num_quincena AS quincena,
    base_datos.idempresa,
    base_datos.identificacion AS identificacionempleado,
    max(base_datos.persona) AS nombreempleado,  -- rama agrupada: MAX sobre una sola persona
    base_datos.contratosiigo AS contratoempleado,
    '07- Hora extra diurna dominical o festiva- Ingreso'::text AS nombrenovedad,
    'Horas'::text AS tiponovedad,
    sum(base_datos.horas_hedf) AS cantidadvalor,
    0 AS nominaproyectada,
    NULL::text AS fechainicio,
    NULL::text AS fechafin,
    0 AS diasnohabiles
   FROM base_datos
  WHERE (base_datos.horas_hedf > (0)::numeric)
  GROUP BY base_datos.mes_txt, base_datos.mes_num, base_datos.anio_num, base_datos.num_quincena, base_datos.idempresa, base_datos.identificacion, base_datos.contratosiigo
UNION ALL
 SELECT base_datos.mes_txt AS mes,
    base_datos.num_quincena AS quincena,
    base_datos.idempresa,
    base_datos.identificacion AS identificacionempleado,
    max(base_datos.persona) AS nombreempleado,  -- rama agrupada: MAX sobre una sola persona
    base_datos.contratosiigo AS contratoempleado,
    '11- Horas extras nocturnas 175%- Ingreso'::text AS nombrenovedad,
    'Horas'::text AS tiponovedad,
    sum(base_datos.horas_hen) AS cantidadvalor,
    0 AS nominaproyectada,
    NULL::text AS fechainicio,
    NULL::text AS fechafin,
    0 AS diasnohabiles
   FROM base_datos
  WHERE (base_datos.horas_hen > (0)::numeric)
  GROUP BY base_datos.mes_txt, base_datos.mes_num, base_datos.anio_num, base_datos.num_quincena, base_datos.idempresa, base_datos.identificacion, base_datos.contratosiigo
UNION ALL
 SELECT base_datos.mes_txt AS mes,
    base_datos.num_quincena AS quincena,
    base_datos.idempresa,
    base_datos.identificacion AS identificacionempleado,
    max(base_datos.persona) AS nombreempleado,  -- rama agrupada: MAX sobre una sola persona
    base_datos.contratosiigo AS contratoempleado,
    '12- Horas extras nocturnas dominical o festiva- Ingreso'::text AS nombrenovedad,
    'Horas'::text AS tiponovedad,
    sum(base_datos.horas_hef) AS cantidadvalor,
    0 AS nominaproyectada,
    NULL::text AS fechainicio,
    NULL::text AS fechafin,
    0 AS diasnohabiles
   FROM base_datos
  WHERE (base_datos.horas_hef > (0)::numeric)
  GROUP BY base_datos.mes_txt, base_datos.mes_num, base_datos.anio_num, base_datos.num_quincena, base_datos.idempresa, base_datos.identificacion, base_datos.contratosiigo
UNION ALL
 SELECT base_datos.mes_txt AS mes,
    base_datos.num_quincena AS quincena,
    base_datos.idempresa,
    base_datos.identificacion AS identificacionempleado,
    max(base_datos.persona) AS nombreempleado,  -- rama agrupada: MAX sobre una sola persona
    base_datos.contratosiigo AS contratoempleado,
    '26- Recargo nocturno- Ingreso'::text AS nombrenovedad,
    'Horas'::text AS tiponovedad,
    sum(base_datos.horas_hn) AS cantidadvalor,
    0 AS nominaproyectada,
    NULL::text AS fechainicio,
    NULL::text AS fechafin,
    0 AS diasnohabiles
   FROM base_datos
  WHERE (base_datos.horas_hn > (0)::numeric)
  GROUP BY base_datos.mes_txt, base_datos.mes_num, base_datos.anio_num, base_datos.num_quincena, base_datos.idempresa, base_datos.identificacion, base_datos.contratosiigo
UNION ALL
 SELECT base_datos.mes_txt AS mes,
    base_datos.num_quincena AS quincena,
    base_datos.idempresa,
    base_datos.identificacion AS identificacionempleado,
    max(base_datos.persona) AS nombreempleado,  -- rama agrupada: MAX sobre una sola persona
    base_datos.contratosiigo AS contratoempleado,
    '08- Hora extra recargo dominical o festivo- Ingreso'::text AS nombrenovedad,
    'Horas'::text AS tiponovedad,
    sum(base_datos.jornada_dia) AS cantidadvalor,  -- horas = jornada vigente por fecha (Ley 2101), no 7,33 fijo
    0 AS nominaproyectada,
    NULL::text AS fechainicio,
    NULL::text AS fechafin,
    0 AS diasnohabiles
   FROM base_datos
  WHERE ((EXTRACT(dow FROM base_datos.fecha) = (0)::numeric) AND ((base_datos.recargodominical > (0)::numeric) OR (base_datos.toneladas > (0)::numeric) OR (base_datos.especialidad = true)) AND (COALESCE(base_datos.pago_domingo, (0)::numeric) > (0)::numeric))
  GROUP BY base_datos.mes_txt, base_datos.mes_num, base_datos.anio_num, base_datos.num_quincena, base_datos.idempresa, base_datos.identificacion, base_datos.contratosiigo
UNION ALL
 SELECT base_datos.mes_txt AS mes,
    base_datos.num_quincena AS quincena,
    base_datos.idempresa,
    base_datos.identificacion AS identificacionempleado,
    max(base_datos.persona) AS nombreempleado,  -- rama agrupada: MAX sobre una sola persona
    base_datos.contratosiigo AS contratoempleado,
    '25- Recargo dominical o festivo- Ingreso'::text AS nombrenovedad,
    'Horas'::text AS tiponovedad,
    sum(base_datos.jornada_dia) AS cantidadvalor,  -- horas = jornada vigente por fecha (Ley 2101), no 7,33 fijo
    0 AS nominaproyectada,
    NULL::text AS fechainicio,
    NULL::text AS fechafin,
    0 AS diasnohabiles
   FROM base_datos
  WHERE ((EXTRACT(dow FROM base_datos.fecha) = (0)::numeric) AND ((base_datos.recargodominical > (0)::numeric) OR (base_datos.toneladas > (0)::numeric) OR (base_datos.especialidad = true)) AND (COALESCE(base_datos.pago_domingo, (0)::numeric) = (0)::numeric))
  GROUP BY base_datos.mes_txt, base_datos.mes_num, base_datos.anio_num, base_datos.num_quincena, base_datos.idempresa, base_datos.identificacion, base_datos.contratosiigo
UNION ALL
-- BONOS no prestacionales (Compensación › Bonos). Una fila por CÓDIGO de
-- novedad (43 ocasionales / 50 no prestacional / 66 aux. movilidad), para que
-- en Siigo queden separados entre sí y del bono de productividad (52-).
--
-- Se lee `bonos_nomina` DIRECTO (no vía pagonomina) a propósito: el archivo
-- plano necesita `identificacionempleado`, y la cédula es la llave natural de
-- esta tabla — así no depende del frágil match por NOMBRE que pagonomina sí
-- necesita. Solo entran los APROBADOS, y se hereda la exclusión de retirados.
 SELECT to_char((b.fecha)::timestamp with time zone, 'MM'::text) AS mes,
        CASE
            WHEN (EXTRACT(day FROM b.fecha) <= (15)::numeric) THEN 1
            ELSE 2
        END AS quincena,
    b.idempresa,
    b.identificacion AS identificacionempleado,
    -- `bonos_nomina` guarda su propio nombre: sirve de respaldo si la cédula no
    -- cruza con Head Count, para que la fila no salga sin nombre al plano.
    COALESCE(max(h.nombre), max(b.nombre)) AS nombreempleado,
    h.contratosiigo AS contratoempleado,
    b.novedad_siigo AS nombrenovedad,
    'Valor'::text AS tiponovedad,
    round(sum(b.valor)) AS cantidadvalor,
    round(COALESCE(max(h.salario), (1750905)::numeric) / (2)::numeric)::integer AS nominaproyectada,
    NULL::text AS fechainicio,
    NULL::text AS fechafin,
    0 AS diasnohabiles
   FROM (bonos_nomina b
     LEFT JOIN headcount h ON ((TRIM(BOTH FROM h.identificacion) = TRIM(BOTH FROM b.identificacion))))
  WHERE ((b.estado = 'aprobado'::text) AND (lower(COALESCE(h.estado, 'activo'::text)) <> 'inactivo'::text))
  GROUP BY to_char((b.fecha)::timestamp with time zone, 'MM'::text),
        CASE
            WHEN (EXTRACT(day FROM b.fecha) <= (15)::numeric) THEN 1
            ELSE 2
        END,
    b.idempresa, b.identificacion, h.contratosiigo, b.novedad_siigo
UNION ALL
-- AJUSTE DE PROYECCIÓN (Revisión de nómina › Ajuste de Proyecciones).
-- La nómina se paga antes de cerrar el último día de la quincena, así que ese
-- día el tonelaje se PROYECTA; al cerrar, lo real casi nunca coincide. La
-- diferencia se liquida en la quincena SIGUIENTE (anio_aplica/mes_aplica/
-- quincena_aplica), con su novedad propia:
--   · a favor del trabajador -> 72-Ajuste proyección toneladas ingreso-Ingreso
--   · pagado de más          -> 73-Ajuste mayor valor pagado toneladas-Deducción
-- Solo entran los APROBADOS. Se agrupa por novedad para que ingreso y deducción
-- salgan en filas separadas. `cantidadvalor` va en VALOR ABSOLUTO: el signo lo
-- da el concepto (la 73 es de deducción), no un número negativo en el plano.
 SELECT to_char(make_date(a.anio_aplica, a.mes_aplica, 1), 'MM'::text) AS mes,
    a.quincena_aplica AS quincena,
    a.idempresa,
    a.identificacion AS identificacionempleado,
    -- Mismo criterio que la rama de bonos: `ajustes_proyeccion.persona` es el
    -- respaldo si la cédula no cruza con Head Count.
    COALESCE(max(h.nombre), max(a.persona)) AS nombreempleado,
    h.contratosiigo AS contratoempleado,
    a.novedad_siigo AS nombrenovedad,
    'Valor'::text AS tiponovedad,
    round(abs(sum(a.valor_ajuste))) AS cantidadvalor,
    round(COALESCE(max(h.salario), (1750905)::numeric) / (2)::numeric)::integer AS nominaproyectada,
    NULL::text AS fechainicio,
    NULL::text AS fechafin,
    0 AS diasnohabiles
   FROM (ajustes_proyeccion a
     LEFT JOIN headcount h ON ((TRIM(BOTH FROM h.identificacion) = TRIM(BOTH FROM a.identificacion))))
  WHERE ((a.estado = 'aprobado'::text) AND (lower(COALESCE(h.estado, 'activo'::text)) <> 'inactivo'::text))
  GROUP BY to_char(make_date(a.anio_aplica, a.mes_aplica, 1), 'MM'::text),
    a.quincena_aplica, a.idempresa, a.identificacion, h.contratosiigo, a.novedad_siigo
 HAVING (round(abs(sum(a.valor_ajuste))) > (0)::numeric)
  -- ORDER BY POSICIONAL: 1 = mes, 2 = quincena, 4 = identificacionempleado.
  -- `nombreempleado` entró en la 5, así que las posiciones 1, 2 y 4 no se
  -- movieron y este ORDER BY sigue significando lo mismo.
  ORDER BY 1 DESC, 2, 4;

COMMIT;
