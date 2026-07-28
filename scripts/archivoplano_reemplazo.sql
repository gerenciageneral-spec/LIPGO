-- ============================================================================
-- DESPLIEGUE — reemplazo de la vista archivoplano
--   VISTA EN VIVO sobre `pagonomina`: cualquier ajuste (horas, jornada, novedades)
--   se refleja al instante en el archivo plano de nómina (SIIGO). Misma fuente de
--   verdad que el IBC de Parafiscales.
--   · Excluye a los trabajadores RETIRADOS (headcount.estado = 'Inactivo'); su
--     nómina pendiente se maneja en el submódulo Liquidaciones.
--   · JORNADA por FECHA (Ley 2101): las horas del recargo/dominical usan la jornada
--     vigente en la fecha (tabla `jornada_legal`), no un 7,33 fijo. jun-2026 → 7,3333;
--     desde 16-jul-2026 → 7. Requiere scripts/create_jornada_legal.sql.
--   · nominaproyectada = salario quincenal por trabajador (antes fijo 875452).
--   REVERSIBLE: definición previa en git (scripts/vistas_financieras.sql).
-- ============================================================================

create or replace view public.archivoplano as
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
            -- 7,3333; desde 16-jul-2026 → 7. Se actualiza en línea con jornada_legal.
            COALESCE(
              (SELECT jl.horas_dia FROM jornada_legal jl WHERE jl.fecha_desde <= p.fecha
                ORDER BY jl.fecha_desde DESC LIMIT 1),
              (7.33)::numeric
            ) AS jornada_dia,
            p.total_liquidado_dia,
            p.novedad_reportada,
            COALESCE(p.bonif_prestacional, (0)::numeric) AS bonif_prestacional,
            COALESCE(p.bonif_no_prestacional, (0)::numeric) AS bonif_no_prestacional,
                CASE
                    WHEN ((p.novedad_reportada IS NOT NULL) AND (TRIM(BOTH FROM p.novedad_reportada) <> ''::text)) THEN (0)::numeric
                    ELSE GREATEST((0)::numeric, (COALESCE((h.salario / (30)::numeric), (58643)::numeric) - COALESCE(p.total_liquidado_dia, (0)::numeric)))
                END AS deficit_dia,
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
             LEFT JOIN headcount h ON ((h.nombre = p.persona)))
          -- Excluir del archivo plano a los trabajadores RETIRADOS (estado
          -- Inactivo). null/'activo' permanecen (no rompe a los legados). Su
          -- nómina pendiente se paga desde el submódulo Liquidaciones.
          WHERE (lower(COALESCE(h.estado, 'activo'::text)) <> 'inactivo'::text)
        ), agrupado_quincena AS (
         SELECT base_datos.mes_txt,
            base_datos.mes_num,
            base_datos.anio_num,
            base_datos.num_quincena,
            base_datos.idempresa,
            base_datos.identificacion,
            base_datos.contratosiigo,
            max(base_datos.salario) AS salario_ref,
            sum((base_datos.bonif_prestacional + base_datos.bonif_no_prestacional)) AS total_bono_nomina,
            sum(COALESCE(base_datos.hed, (0)::numeric)) AS total_hed_moneda,
            sum(COALESCE(base_datos.horas_hed, (0)::numeric)) AS total_hed_horas,
            sum(base_datos.deficit_dia) AS total_deficit
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
            agrupado_quincena.total_bono_nomina,
            agrupado_quincena.total_hed_moneda,
            agrupado_quincena.total_hed_horas,
            agrupado_quincena.total_deficit,
            GREATEST((0)::numeric, (agrupado_quincena.total_bono_nomina - agrupado_quincena.total_deficit)) AS bono_final,
            GREATEST((0)::numeric, (agrupado_quincena.total_deficit - agrupado_quincena.total_bono_nomina)) AS deficit_restante,
            GREATEST((0)::numeric, (agrupado_quincena.total_hed_moneda - GREATEST((0)::numeric, (agrupado_quincena.total_deficit - agrupado_quincena.total_bono_nomina)))) AS hed_moneda_final,
                CASE
                    WHEN (agrupado_quincena.total_hed_horas > (0)::numeric) THEN round((GREATEST((0)::numeric, (agrupado_quincena.total_hed_moneda - GREATEST((0)::numeric, (agrupado_quincena.total_deficit - agrupado_quincena.total_bono_nomina)))) / (agrupado_quincena.total_hed_moneda / agrupado_quincena.total_hed_horas)), 2)
                    ELSE (0)::numeric
                END AS hed_horas_final
           FROM agrupado_quincena
        )
 SELECT nivelacion.mes_txt AS mes,
    nivelacion.num_quincena AS quincena,
    nivelacion.idempresa,
    nivelacion.identificacion AS identificacionempleado,
    nivelacion.contratosiigo AS contratoempleado,
    '71-Bonificación Ajuste Toneladas-Ingreso'::text AS nombrenovedad,
    'Valor'::text AS tiponovedad,
    round(nivelacion.bono_final) AS cantidadvalor,
    round(COALESCE(nivelacion.salario_ref, (1750905)::numeric) / (2)::numeric) AS nominaproyectada, -- quincenal por trabajador (antes fijo 875452)
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
    base_datos.contratosiigo AS contratoempleado,
    base_datos.novedad_reportada AS nombrenovedad,
    'Dias'::text AS tiponovedad,
    1 AS cantidadvalor,
    0 AS nominaproyectada,
    base_datos.fecha_evento AS fechainicio,
    base_datos.fecha_evento AS fechafin,
    0 AS diasnohabiles
   FROM base_datos
  WHERE ((base_datos.novedad_reportada IS NOT NULL) AND (TRIM(BOTH FROM base_datos.novedad_reportada) <> ''::text) AND (TRIM(BOTH FROM base_datos.novedad_reportada) <> 'Descanso'::text) AND (TRIM(BOTH FROM base_datos.novedad_reportada) <> 'Descanso compensatorio domingo anterior'::text) AND (TRIM(BOTH FROM base_datos.novedad_reportada) <> 'Retiro'::text))
UNION ALL
 SELECT nivelacion.mes_txt AS mes,
    nivelacion.num_quincena AS quincena,
    nivelacion.idempresa,
    nivelacion.identificacion AS identificacionempleado,
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
  ORDER BY 1 DESC, 2, 4;
