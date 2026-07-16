-- ============================================================================
-- Vistas de la parte FINANCIERA de LIPgo (definiciones reales).
-- Fuente de verdad versionada. Ver docs/estructura-vistas-financieras.md para
-- la explicación de columnas, dependencias y lógica de negocio.
-- Orden de creación por dependencias: pagonomina → archivoplano (usa pagonomina);
-- toneladasauxiliarespago, facturacion, facturacionturnos son independientes.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- pagonomina — liquidación diaria de nómina por persona.
-- Depende de: cabeceraoc, tarifaspersonal, registroasistencia, tarifasturnos,
--             festivos, headcount.
-- ----------------------------------------------------------------------------
create or replace view public.pagonomina as
 WITH transformacion AS (
         SELECT cabeceraoc.fechacargue,
            cabeceraoc.idempresa,
            cabeceraoc.tipooperacion,
                CASE
                    WHEN (cabeceraoc.idempresa = ANY (ARRAY[3, 4])) THEN cabeceraoc.pesoorden
                    ELSE cabeceraoc.pesovascula
                END AS peso_base_calculo,
            array_length(string_to_array(cabeceraoc.auxiliares, ','::text), 1) AS cantidad_auxiliares,
            TRIM(BOTH FROM regexp_split_to_table(cabeceraoc.auxiliares, ','::text)) AS nombre_auxiliar
           FROM cabeceraoc
          WHERE ((cabeceraoc.fincargue IS NOT NULL) AND ((cabeceraoc.fincargue)::text <> ''::text))
        ), produccion_diaria AS (
         SELECT t.fechacargue AS fecha,
            t.nombre_auxiliar AS persona,
            max(t.idempresa) AS idempresa_operacion,
            sum(
                CASE
                    WHEN (t.cantidad_auxiliares > 0) THEN (t.peso_base_calculo / (t.cantidad_auxiliares)::numeric)
                    ELSE (0)::numeric
                END) AS toneladas_dia,
            sum(
                CASE
                    WHEN ((t.cantidad_auxiliares > 0) AND (tp.tarifa IS NOT NULL)) THEN ((t.peso_base_calculo / (t.cantidad_auxiliares)::numeric) * tp.tarifa)
                    ELSE (0)::numeric
                END) AS pago_produccion_dia
           FROM (transformacion t
             LEFT JOIN tarifaspersonal tp ON (((t.idempresa = tp.empresaid) AND (t.tipooperacion = tp.operacion) AND ((t.fechacargue >= tp.fechaini) AND (t.fechacargue <= tp.fechafin)))))
          GROUP BY t.fechacargue, t.nombre_auxiliar
        ), datos_asistencia AS (
         SELECT registroasistencia.fecha,
            TRIM(BOTH FROM registroasistencia.nombre) AS persona,
            registroasistencia.idempresa AS idempresa_asistencia,
            registroasistencia.puesto,
            registroasistencia.asistencia,
                CASE
                    WHEN (registroasistencia.especialidad = 'true'::text) THEN true
                    ELSE false
                END AS especialidad,
            COALESCE(registroasistencia.hed, (0)::numeric) AS cant_hed,
            COALESCE(registroasistencia.hedf, (0)::numeric) AS cant_hedf,
            COALESCE(registroasistencia.hen, (0)::numeric) AS cant_hen,
            COALESCE(registroasistencia.hef, (0)::numeric) AS cant_hef,
            COALESCE(registroasistencia.hn, (0)::numeric) AS cant_hn,
                CASE
                    WHEN ((registroasistencia.asistencia IS NULL) OR (TRIM(BOTH FROM registroasistencia.asistencia) = ''::text)) THEN 0
                    WHEN (TRIM(BOTH FROM registroasistencia.asistencia) = ANY (ARRAY['13- Incapacidad por enfermedad general al 100%'::text, '31- Vacaciones disfrutadas'::text, '15- Incapacidad por enfermedad general al 66%- ingreso'::text, '14- Incapacidad por enfermedad general al 50'::text, 'Descanso'::text, 'Descanso compensatorio domingo anterior'::text, '38- Licencia no remunerada- Deducción'::text, 'Retiro'::text])) THEN 0
                    ELSE 1
                END AS es_falta_penalizable,
                CASE
                    WHEN (TRIM(BOTH FROM registroasistencia.asistencia) = ANY (ARRAY['Descanso'::text, 'Descanso compensatorio domingo anterior'::text, '38- Licencia no remunerada- Deducción'::text, 'Retiro'::text])) THEN 1
                    ELSE 0
                END AS bloquea_domingo
           FROM registroasistencia
        ), calculo_turnos AS (
         -- Recargos y base del turno calculados POR PERSONA desde el salario de
         -- contrato (headcount.salario), sin auxilio en la base (norma CO). Se
         -- conserva el JOIN a tarifasturnos como registro de "puestos de turno".
         SELECT a.fecha,
            a.persona,
            COALESCE(calc.valor_dia, (0)::numeric) AS base_turno,
            a.cant_hed,
            a.cant_hedf,
            a.cant_hen,
            a.cant_hef,
            a.cant_hn,
            (a.cant_hed  * COALESCE(calc.hod, (0)::numeric) * ((1)::numeric + (COALESCE(pa.pct_hed,  (25)::numeric)  / 100.0))) AS val_hed,
            (a.cant_hedf * COALESCE(calc.hod, (0)::numeric) * ((1)::numeric + (COALESCE(pa.pct_hedf, (115)::numeric) / 100.0))) AS val_hedf,
            (a.cant_hen  * COALESCE(calc.hod, (0)::numeric) * ((1)::numeric + (COALESCE(pa.pct_hen,  (75)::numeric)  / 100.0))) AS val_hen,
            (a.cant_hef  * COALESCE(calc.hod, (0)::numeric) * ((1)::numeric + (COALESCE(pa.pct_hef,  (165)::numeric) / 100.0))) AS val_hef,
            (a.cant_hn   * COALESCE(calc.hod, (0)::numeric) * (COALESCE(pa.pct_hn, (35)::numeric) / 100.0)) AS val_hn,
            (
                (a.cant_hed  * COALESCE(calc.hod, (0)::numeric) * ((1)::numeric + (COALESCE(pa.pct_hed,  (25)::numeric)  / 100.0)))
              + (a.cant_hedf * COALESCE(calc.hod, (0)::numeric) * ((1)::numeric + (COALESCE(pa.pct_hedf, (115)::numeric) / 100.0)))
              + (a.cant_hen  * COALESCE(calc.hod, (0)::numeric) * ((1)::numeric + (COALESCE(pa.pct_hen,  (75)::numeric)  / 100.0)))
              + (a.cant_hef  * COALESCE(calc.hod, (0)::numeric) * ((1)::numeric + (COALESCE(pa.pct_hef,  (165)::numeric) / 100.0)))
              + (a.cant_hn   * COALESCE(calc.hod, (0)::numeric) * (COALESCE(pa.pct_hn, (35)::numeric) / 100.0))
            ) AS total_recargos
           FROM (((datos_asistencia a
             JOIN tarifasturnos tt ON ((((a.fecha >= tt.fechaini) AND (a.fecha <= tt.fechafin)) AND (TRIM(BOTH FROM a.puesto) = TRIM(BOTH FROM tt.puesto)))))
             LEFT JOIN headcount h2 ON ((TRIM(BOTH FROM h2.nombre) = a.persona)))
             LEFT JOIN parametros_legales_anio pa ON ((pa.anio = (EXTRACT(year FROM a.fecha))::integer)))
             CROSS JOIN LATERAL (
                 SELECT (s.base_pers / NULLIF(s.dias_p, (0)::numeric)) AS valor_dia,
                        (s.base_pers / NULLIF((s.dias_p * s.jornada_p), (0)::numeric)) AS hod
                   FROM ( SELECT (COALESCE(h2.salario, pa.smlv))::numeric AS base_pers,  -- base = SALARIO (auxilio NO entra en la base de recargos)
                                 COALESCE(pa.dias_calendario, (30)::numeric) AS dias_p,
                                 COALESCE(pa.jornada_horas, (7)::numeric) AS jornada_p
                        ) s
             ) calc
        ), rango_fechas AS (
         SELECT min(tf.fecha) AS fecha_inicio,
            max(tf.fecha) AS fecha_fin
           FROM ( SELECT cabeceraoc.fechacargue AS fecha
                   FROM cabeceraoc
                UNION ALL
                 SELECT registroasistencia.fecha
                   FROM registroasistencia) tf
        ), lista_empleados AS (
         SELECT DISTINCT transformacion.nombre_auxiliar AS persona
           FROM transformacion
        UNION
         SELECT DISTINCT registroasistencia.nombre AS persona
           FROM registroasistencia
        ), calendario_base AS (
         SELECT (d.fecha)::date AS fecha,
            e.persona
           FROM rango_fechas r,
            (LATERAL generate_series((r.fecha_inicio)::timestamp with time zone, (r.fecha_fin)::timestamp with time zone, '1 day'::interval) d(fecha)
             CROSS JOIN lista_empleados e)
        ), consolidado_completo AS (
         SELECT c.fecha,
            c.persona,
            EXTRACT(dow FROM c.fecha) AS dia_semana,
            p.idempresa_operacion,
            COALESCE((p.idempresa_operacion)::integer, (a.idempresa_asistencia)::integer, (h.idempresa)::integer, 0) AS idempresa_origen,
            a.especialidad,
            h.salario,
            COALESCE((h.salario / (30)::numeric), (58364)::numeric) AS valor_diario_ley,
            COALESCE(pa2.pct_recargo_dominical, (90)::numeric) AS pct_recargo_dominical,
            COALESCE(p.toneladas_dia, (0)::numeric) AS toneladas,
            COALESCE(p.pago_produccion_dia, (0)::numeric) AS pago_produccion,
            ct.base_turno,
            COALESCE(ct.cant_hed, (0)::numeric) AS horas_hed,
            COALESCE(ct.cant_hedf, (0)::numeric) AS horas_hedf,
            COALESCE(ct.cant_hen, (0)::numeric) AS horas_hen,
            COALESCE(ct.cant_hef, (0)::numeric) AS horas_hef,
            COALESCE(ct.cant_hn, (0)::numeric) AS horas_hn,
            COALESCE(ct.val_hed, (0)::numeric) AS val_hed,
            COALESCE(ct.val_hedf, (0)::numeric) AS val_hedf,
            COALESCE(ct.val_hen, (0)::numeric) AS val_hen,
            COALESCE(ct.val_hef, (0)::numeric) AS val_hef,
            COALESCE(ct.val_hn, (0)::numeric) AS val_hn,
            COALESCE(ct.total_recargos, (0)::numeric) AS total_recargos_turno,
                CASE
                    WHEN (ct.base_turno IS NOT NULL) THEN a.puesto
                    WHEN (COALESCE(p.toneladas_dia, (0)::numeric) > (0)::numeric) THEN 'Cargue/Descargue'::text
                    WHEN (f.fecha IS NOT NULL) THEN 'Festivo'::text
                    WHEN (a.puesto IS NOT NULL) THEN a.puesto
                    ELSE 'Sin Registro'::text
                END AS actividad_registrada,
            a.asistencia AS asistencia_texto,
            COALESCE(a.es_falta_penalizable, 0) AS cuenta_como_falta,
            COALESCE(a.bloquea_domingo, 0) AS bloquea_domingo,
                CASE
                    WHEN (f.fecha IS NOT NULL) THEN 0
                    WHEN ((ct.base_turno IS NULL) AND (COALESCE(p.toneladas_dia, (0)::numeric) = (0)::numeric) AND (a.puesto IS NULL) AND ((a.asistencia IS NULL) OR (TRIM(BOTH FROM a.asistencia) = ''::text))) THEN 1
                    ELSE 0
                END AS es_sin_registro,
                CASE
                    WHEN (((ct.base_turno IS NOT NULL) OR (COALESCE(p.toneladas_dia, (0)::numeric) > (0)::numeric) OR (a.puesto IS NOT NULL) OR (f.fecha IS NOT NULL)) AND ((a.asistencia IS NULL) OR (TRIM(BOTH FROM a.asistencia) = ''::text))) THEN 1
                    ELSE 0
                END AS asistio_ok,
                CASE
                    WHEN (f.fecha IS NOT NULL) THEN 1
                    ELSE 0
                END AS es_festivo
           FROM ((((((calendario_base c
             LEFT JOIN produccion_diaria p ON (((c.fecha = p.fecha) AND (c.persona = p.persona))))
             LEFT JOIN datos_asistencia a ON (((c.fecha = a.fecha) AND (c.persona = a.persona))))
             LEFT JOIN calculo_turnos ct ON (((c.fecha = ct.fecha) AND (c.persona = ct.persona))))
             LEFT JOIN festivos f ON ((c.fecha = f.fecha)))
             LEFT JOIN headcount h ON ((h.nombre = c.persona)))
             LEFT JOIN parametros_legales_anio pa2 ON ((pa2.anio = (EXTRACT(year FROM c.fecha))::integer)))
        ), calculo_nomina_base AS (
         SELECT consolidado_completo.fecha,
            consolidado_completo.persona,
            consolidado_completo.dia_semana,
            consolidado_completo.idempresa_operacion,
            consolidado_completo.idempresa_origen,
            consolidado_completo.especialidad,
            consolidado_completo.salario,
            consolidado_completo.valor_diario_ley,
            consolidado_completo.pct_recargo_dominical,
            consolidado_completo.toneladas,
            consolidado_completo.pago_produccion,
            consolidado_completo.base_turno,
            consolidado_completo.horas_hed,
            consolidado_completo.horas_hedf,
            consolidado_completo.horas_hen,
            consolidado_completo.horas_hef,
            consolidado_completo.horas_hn,
            consolidado_completo.val_hed,
            consolidado_completo.val_hedf,
            consolidado_completo.val_hen,
            consolidado_completo.val_hef,
            consolidado_completo.val_hn,
            consolidado_completo.total_recargos_turno,
            consolidado_completo.actividad_registrada,
            consolidado_completo.asistencia_texto,
            consolidado_completo.cuenta_como_falta,
            consolidado_completo.bloquea_domingo,
            consolidado_completo.es_sin_registro,
            consolidado_completo.asistio_ok,
            consolidado_completo.es_festivo,
            sum(consolidado_completo.cuenta_como_falta) OVER (PARTITION BY consolidado_completo.persona ORDER BY consolidado_completo.fecha ROWS BETWEEN 6 PRECEDING AND 1 PRECEDING) AS faltas_semana_anterior,
            sum(consolidado_completo.es_sin_registro) OVER (PARTITION BY consolidado_completo.persona ORDER BY consolidado_completo.fecha ROWS BETWEEN 6 PRECEDING AND 1 PRECEDING) AS vacios_semana_anterior,
            sum(consolidado_completo.bloquea_domingo) OVER (PARTITION BY consolidado_completo.persona ORDER BY consolidado_completo.fecha ROWS BETWEEN 6 PRECEDING AND 1 PRECEDING) AS novedades_semana_anterior,
            max(
                CASE
                    WHEN (TRIM(BOTH FROM consolidado_completo.asistencia_texto) = '38- Licencia no remunerada- Deducción'::text) THEN 1
                    ELSE 0
                END) OVER (PARTITION BY consolidado_completo.persona ORDER BY consolidado_completo.fecha ROWS BETWEEN 6 PRECEDING AND 1 PRECEDING) AS tuvo_licencia_no_rem_semana,
            max(
                CASE
                    WHEN (TRIM(BOTH FROM consolidado_completo.asistencia_texto) = 'Descanso compensatorio domingo anterior'::text) THEN 1
                    ELSE 0
                END) OVER (PARTITION BY consolidado_completo.persona ORDER BY consolidado_completo.fecha ROWS BETWEEN 1 FOLLOWING AND 6 FOLLOWING) AS tiene_compensatorio_posterior
           FROM consolidado_completo
        ), pre_calculo_valores AS (
         SELECT calculo_nomina_base.fecha,
            calculo_nomina_base.persona,
            calculo_nomina_base.dia_semana,
            calculo_nomina_base.idempresa_operacion,
            calculo_nomina_base.idempresa_origen,
            calculo_nomina_base.especialidad,
            calculo_nomina_base.salario,
            calculo_nomina_base.valor_diario_ley,
            calculo_nomina_base.toneladas,
            calculo_nomina_base.pago_produccion,
            calculo_nomina_base.base_turno,
            calculo_nomina_base.horas_hed,
            calculo_nomina_base.horas_hedf,
            calculo_nomina_base.horas_hen,
            calculo_nomina_base.horas_hef,
            calculo_nomina_base.horas_hn,
            calculo_nomina_base.val_hed,
            calculo_nomina_base.val_hedf,
            calculo_nomina_base.val_hen,
            calculo_nomina_base.val_hef,
            calculo_nomina_base.val_hn,
            calculo_nomina_base.total_recargos_turno,
            calculo_nomina_base.actividad_registrada,
            calculo_nomina_base.asistencia_texto,
            calculo_nomina_base.cuenta_como_falta,
            calculo_nomina_base.bloquea_domingo,
            calculo_nomina_base.es_sin_registro,
            calculo_nomina_base.asistio_ok,
            calculo_nomina_base.es_festivo,
            calculo_nomina_base.faltas_semana_anterior,
            calculo_nomina_base.vacios_semana_anterior,
            calculo_nomina_base.novedades_semana_anterior,
            calculo_nomina_base.tuvo_licencia_no_rem_semana,
            calculo_nomina_base.tiene_compensatorio_posterior,
                CASE
                    WHEN (TRIM(BOTH FROM calculo_nomina_base.asistencia_texto) = '15- Incapacidad por enfermedad general al 66%- ingreso'::text) THEN (calculo_nomina_base.valor_diario_ley * 0.6667)
                    WHEN (calculo_nomina_base.es_festivo = 1) THEN calculo_nomina_base.valor_diario_ley
                    WHEN (TRIM(BOTH FROM calculo_nomina_base.asistencia_texto) = ANY (ARRAY['13- Incapacidad por enfermedad general al 100%'::text, '31- Vacaciones disfrutadas'::text, '14- Incapacidad por enfermedad general al 50'::text, 'Descanso'::text, 'Descanso compensatorio domingo anterior'::text])) THEN calculo_nomina_base.valor_diario_ley
                    WHEN (calculo_nomina_base.asistio_ok = 1) THEN
                    CASE
                        WHEN ((calculo_nomina_base.especialidad = true) AND (calculo_nomina_base.base_turno IS NOT NULL)) THEN calculo_nomina_base.base_turno
                        ELSE calculo_nomina_base.valor_diario_ley
                    END
                    ELSE (0)::numeric
                END AS valor_base_final,
                CASE
                    WHEN ((calculo_nomina_base.dia_semana = (0)::numeric) AND ((calculo_nomina_base.faltas_semana_anterior = 0) OR (calculo_nomina_base.faltas_semana_anterior IS NULL)) AND ((calculo_nomina_base.vacios_semana_anterior = 0) OR (calculo_nomina_base.vacios_semana_anterior IS NULL)) AND ((calculo_nomina_base.novedades_semana_anterior = 0) OR (calculo_nomina_base.novedades_semana_anterior IS NULL)) AND ((calculo_nomina_base.tiene_compensatorio_posterior = 0) OR (calculo_nomina_base.tiene_compensatorio_posterior IS NULL))) THEN
                    CASE
                        WHEN ((calculo_nomina_base.especialidad = true) AND (calculo_nomina_base.base_turno IS NOT NULL)) THEN calculo_nomina_base.base_turno
                        ELSE calculo_nomina_base.valor_diario_ley
                    END
                    ELSE (0)::numeric
                END AS valor_domingo_final,
                CASE
                    WHEN ((calculo_nomina_base.toneladas > (0)::numeric) AND (calculo_nomina_base.pago_produccion > calculo_nomina_base.valor_diario_ley)) THEN (calculo_nomina_base.pago_produccion - calculo_nomina_base.valor_diario_ley)
                    ELSE (0)::numeric
                END AS excedente_bruto_destajo,
                CASE
                    WHEN ((calculo_nomina_base.dia_semana = (0)::numeric) AND (calculo_nomina_base.asistio_ok = 1) AND (calculo_nomina_base.especialidad = true) AND (COALESCE(calculo_nomina_base.toneladas, (0)::numeric) = (0)::numeric)) THEN (calculo_nomina_base.valor_diario_ley * (calculo_nomina_base.pct_recargo_dominical / 100.0))
                    ELSE (0)::numeric
                END AS recargodominical
           FROM calculo_nomina_base
        )
 SELECT fecha,
    idempresa_origen AS idempresa,
    COALESCE((idempresa_operacion)::integer, idempresa_origen, 0) AS idempresaliquidacion,
    persona,
    actividad_registrada,
        CASE
            WHEN ((dia_semana = (0)::numeric) AND (tuvo_licencia_no_rem_semana = 1)) THEN '38- Licencia no remunerada- Deducción'::text
            ELSE asistencia_texto
        END AS novedad_reportada,
    especialidad,
    toneladas,
    pago_produccion,
    valor_base_final AS base_dia,
        CASE
            WHEN (excedente_bruto_destajo > (0)::numeric) THEN LEAST(excedente_bruto_destajo, (9948)::numeric)
            ELSE (0)::numeric
        END AS bonif_prestacional,
        CASE
            WHEN (excedente_bruto_destajo > (9948)::numeric) THEN (excedente_bruto_destajo - (9948)::numeric)
            ELSE (0)::numeric
        END AS bonif_no_prestacional,
    horas_hed,
    horas_hedf,
    horas_hen,
    horas_hef,
    horas_hn,
    val_hed AS hed,
    val_hedf AS hedf,
    val_hen AS hen,
    val_hef AS hef,
    val_hn AS hn,
    total_recargos_turno AS total_recargos,
        CASE
            WHEN (TRIM(BOTH FROM asistencia_texto) = ANY (ARRAY['13- Incapacidad por enfermedad general al 100%'::text, '31- Vacaciones disfrutadas'::text, '14- Incapacidad por enfermedad general al 50'::text, '15- Incapacidad por enfermedad general al 66%- ingreso'::text, 'Descanso compensatorio domingo anterior'::text])) THEN (0)::numeric
            ELSE valor_domingo_final
        END AS pago_domingo,
    recargodominical,
    (((
        CASE
            WHEN (TRIM(BOTH FROM asistencia_texto) = '15- Incapacidad por enfermedad general al 66%- ingreso'::text) THEN (valor_diario_ley * 0.6667)
            WHEN (es_festivo = 1) THEN valor_diario_ley
            WHEN (TRIM(BOTH FROM asistencia_texto) = ANY (ARRAY['13- Incapacidad por enfermedad general al 100%'::text, '31- Vacaciones disfrutadas'::text, '14- Incapacidad por enfermedad general al 50'::text, 'Descanso'::text, 'Descanso compensatorio domingo anterior'::text])) THEN valor_diario_ley
            WHEN (especialidad = true) THEN valor_base_final
            WHEN (toneladas > (0)::numeric) THEN pago_produccion
            ELSE valor_base_final
        END + COALESCE(total_recargos_turno, (0)::numeric)) +
        CASE
            WHEN (TRIM(BOTH FROM asistencia_texto) = ANY (ARRAY['Descanso'::text, '31- Vacaciones disfrutadas'::text, 'Descanso compensatorio domingo anterior'::text, '13- Incapacidad por enfermedad general al 100%'::text, '14- Incapacidad por enfermedad general al 50'::text, '15- Incapacidad por enfermedad general al 66%- ingreso'::text])) THEN (0)::numeric
            ELSE valor_domingo_final
        END) + recargodominical) AS total_liquidado_dia
   FROM pre_calculo_valores pc
  WHERE (fecha <= CURRENT_DATE)
    -- Estado / vínculo laboral: excluye días FUERA del vínculo — la persona tiene
    -- contrato(s) en colaboradores_th pero NINGUNO cubre esa fecha (antes de
    -- iniciar o después de terminar). Falla hacia pagar: si no se puede vincular su
    -- contrato (por nombre↔cédula), NO se excluye (nunca deja sin pago a un activo).
    AND NOT (
          EXISTS (SELECT 1 FROM headcount hh
                    JOIN colaboradores_th cc ON ((TRIM(BOTH FROM cc.numero_documento) = TRIM(BOTH FROM hh.identificacion)))
                  WHERE (TRIM(BOTH FROM hh.nombre) = TRIM(BOTH FROM pc.persona)))
      AND NOT EXISTS (SELECT 1 FROM headcount hh
                        JOIN colaboradores_th cc ON ((TRIM(BOTH FROM cc.numero_documento) = TRIM(BOTH FROM hh.identificacion)))
                      WHERE (TRIM(BOTH FROM hh.nombre) = TRIM(BOTH FROM pc.persona))
                        AND (pc.fecha >= cc.fecha_inicio_contrato)
                        AND ((cc.fecha_fin_contrato IS NULL) OR (pc.fecha <= cc.fecha_fin_contrato)))
    )
  ORDER BY persona, fecha DESC;

-- ----------------------------------------------------------------------------
-- archivoplano — novedades por quincena para el archivo plano de nómina (SIIGO).
-- Depende de: pagonomina, headcount.
-- ----------------------------------------------------------------------------
create or replace view public.archivoplano as
 WITH base_datos AS (
         SELECT p.fecha,
            p.idempresa,
            p.persona,
            h.identificacion,
            h.contratosiigo,
            h.salario,
            COALESCE((h.salario / (30)::numeric), (58643)::numeric) AS base_diaria,
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
        ), agrupado_quincena AS (
         SELECT base_datos.mes_txt,
            base_datos.mes_num,
            base_datos.anio_num,
            base_datos.num_quincena,
            base_datos.idempresa,
            base_datos.identificacion,
            base_datos.contratosiigo,
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
    875452 AS nominaproyectada,
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
    ((count(*))::numeric * 7.33) AS cantidadvalor,
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
    ((count(*))::numeric * 7.33) AS cantidadvalor,
    0 AS nominaproyectada,
    NULL::text AS fechainicio,
    NULL::text AS fechafin,
    0 AS diasnohabiles
   FROM base_datos
  WHERE ((EXTRACT(dow FROM base_datos.fecha) = (0)::numeric) AND ((base_datos.recargodominical > (0)::numeric) OR (base_datos.toneladas > (0)::numeric) OR (base_datos.especialidad = true)) AND (COALESCE(base_datos.pago_domingo, (0)::numeric) = (0)::numeric))
  GROUP BY base_datos.mes_txt, base_datos.mes_num, base_datos.anio_num, base_datos.num_quincena, base_datos.idempresa, base_datos.identificacion, base_datos.contratosiigo
  ORDER BY 1 DESC, 2, 4;

-- ----------------------------------------------------------------------------
-- toneladasauxiliarespago — resumen diario de toneladas y pago por auxiliar.
-- Depende de: cabeceraoc, tarifaspersonal.
-- ----------------------------------------------------------------------------
create or replace view public.toneladasauxiliarespago as
 WITH transformacion AS (
         SELECT cabeceraoc.fechacargue,
            cabeceraoc.idempresa,
            cabeceraoc.tipooperacion,
                CASE
                    WHEN (cabeceraoc.idempresa = ANY (ARRAY[3, 4])) THEN cabeceraoc.pesoorden
                    ELSE cabeceraoc.pesovascula
                END AS peso_base_calculo,
            array_length(string_to_array(cabeceraoc.auxiliares, ','::text), 1) AS cantidad_auxiliares,
            TRIM(BOTH FROM regexp_split_to_table(cabeceraoc.auxiliares, ','::text)) AS nombre_auxiliar
           FROM cabeceraoc
          WHERE ((cabeceraoc.fincargue IS NOT NULL) AND ((cabeceraoc.fincargue)::text <> ''::text))
        ), liquidacion_individual AS (
         SELECT t.fechacargue,
            t.idempresa,
            t.nombre_auxiliar,
                CASE
                    WHEN (t.cantidad_auxiliares > 0) THEN (t.peso_base_calculo / (t.cantidad_auxiliares)::numeric)
                    ELSE (0)::numeric
                END AS toneladas_fila,
                CASE
                    WHEN ((t.cantidad_auxiliares > 0) AND (tp.tarifa IS NOT NULL)) THEN ((t.peso_base_calculo / (t.cantidad_auxiliares)::numeric) * tp.tarifa)
                    ELSE (0)::numeric
                END AS pago_fila
           FROM (transformacion t
             LEFT JOIN tarifaspersonal tp ON (((t.idempresa = tp.empresaid) AND (t.tipooperacion = tp.operacion) AND ((t.fechacargue >= tp.fechaini) AND (t.fechacargue <= tp.fechafin)))))
        )
 SELECT fechacargue,
    idempresa,
    nombre_auxiliar AS persona,
    sum(toneladas_fila) AS total_toneladas_dia,
    sum(pago_fila) AS total_pago_dia,
    count(*) AS total_operaciones_realizadas
   FROM liquidacion_individual
  GROUP BY fechacargue, idempresa, nombre_auxiliar
  ORDER BY fechacargue DESC, nombre_auxiliar;

-- ----------------------------------------------------------------------------
-- facturacion — facturación por tonelada/orden de cargue.
-- Depende de: detalleoc, productos, cabeceraoc, tarifasoperacion.
-- ----------------------------------------------------------------------------
create or replace view public.facturacion as
 WITH detalle_preparado AS (
         SELECT d.id,
            d.idorden,
            d.numeroorden,
            d.producto,
            d.cantidad,
            d.toneladas,
            d.cliente,
            c.idempresa,
            c.fechaorden,
            c.fechacargue,
            c.transporte,
            c.tipooperacion,
            c.tiquetebascula,
            c.placa,
            c.pesovascula,
            p.subcategoria,
                CASE
                    WHEN (p.id_empresa = 1) THEN 'INDUPAN'::text
                    WHEN (p.id_empresa = 2) THEN 'AVIMOL'::text
                    WHEN (p.id_empresa = 3) THEN 'Molinos del Atlántico'::text
                    WHEN (p.id_empresa = 4) THEN 'Molinos del Atlántico'::text
                    WHEN (p.id_empresa = 6) THEN 'INDUPAN'::text
                    ELSE (p.id_empresa)::text
                END AS owner_name
           FROM ((detalleoc d
             JOIN productos p ON ((d.producto = p.nombre)))
             JOIN cabeceraoc c ON ((d.idorden = c.id)))
        )
 SELECT dp.numeroorden,
    dp.tiquetebascula,
    dp.placa,
    dp.fechacargue,
    dp.pesovascula AS pesobascula,
    dp.cliente,
    dp.producto,
    dp.toneladas,
    dp.owner_name AS owner,
    dp.subcategoria,
    dp.idempresa,
    dp.fechaorden,
    dp.transporte,
    dp.tipooperacion,
        CASE
            WHEN (t.tarifa IS NOT NULL) THEN t.tarifa
            ELSE 'SIN TARIFA EN MAESTRO'::text
        END AS tarifa,
        CASE
            WHEN (t.tarifa IS NOT NULL) THEN (((t.tarifa)::numeric * dp.toneladas))::text
            ELSE '0'::text
        END AS valor_a_facturar,
    dp.idorden
   FROM (detalle_preparado dp
     LEFT JOIN tarifasoperacion t ON (((t.empresaid = dp.idempresa) AND (TRIM(BOTH FROM upper(t.operacion)) = TRIM(BOTH FROM upper(dp.tipooperacion))) AND (((dp.idempresa = 6) AND (t.empresafactura = dp.owner_name)) OR ((dp.idempresa <> 6) AND ((TRIM(BOTH FROM upper(dp.tipooperacion)) = ANY (ARRAY['TOLVA'::text, 'TOLVA F'::text])) OR ((t.producto = dp.subcategoria) AND ((dp.idempresa = 2) OR (t.empresafactura =
        CASE
            WHEN ((dp.idempresa = ANY (ARRAY[1, 3])) AND (dp.transporte = 'TERCEROS'::text)) THEN dp.owner_name
            ELSE dp.transporte
        END)))))))));

-- ----------------------------------------------------------------------------
-- facturacionturnos — facturación por turnos (especialidad).
-- Depende de: registroasistencia, tarifasfacturacionturnos.
-- ----------------------------------------------------------------------------
create or replace view public.facturacionturnos as
 SELECT a.id,
    a.fecha,
    a.nombre,
    a.identificacion,
    a.puesto,
    a.asistencia,
    GREATEST((0)::numeric, (COALESCE(a.hed, (0)::numeric) - 0.66)) AS hed,
    GREATEST((0)::numeric, (COALESCE(a.hedf, (0)::numeric) - 0.66)) AS hedf,
    GREATEST((0)::numeric, (COALESCE(a.hen, (0)::numeric) - 0.66)) AS hen,
    GREATEST((0)::numeric, (COALESCE(a.hef, (0)::numeric) - 0.66)) AS hef,
    GREATEST((0)::numeric, (COALESCE(a.hn, (0)::numeric) - 0.66)) AS hn,
    a.idempresa,
    a.especialidad,
    t.tarifaturno,
    t.tarifahoraextra,
    t.costoturno,
    t.costohoraextra,
        CASE
            WHEN (t.id IS NULL) THEN 'SIN TARIFA'::text
            ELSE 'OK'::text
        END AS estado_tarifa,
    round((COALESCE(t.tarifahoraextra, (0)::numeric) * GREATEST((0)::numeric, (COALESCE(a.hed, (0)::numeric) - 0.66))), 2) AS valorextra,
    round((COALESCE(t.tarifaturno, (0)::numeric) + (COALESCE(t.tarifahoraextra, (0)::numeric) * GREATEST((0)::numeric, (COALESCE(a.hed, (0)::numeric) - 0.66)))), 2) AS facturacion_total,
    round((COALESCE(t.costohoraextra, (0)::numeric) * GREATEST((0)::numeric, (COALESCE(a.hed, (0)::numeric) - 0.66))), 2) AS costoextra,
    round((COALESCE(t.costoturno, (0)::numeric) + (COALESCE(t.costohoraextra, (0)::numeric) * GREATEST((0)::numeric, (COALESCE(a.hed, (0)::numeric) - 0.66)))), 2) AS costo_total,
    round(((COALESCE(t.tarifaturno, (0)::numeric) + (COALESCE(t.tarifahoraextra, (0)::numeric) * GREATEST((0)::numeric, (COALESCE(a.hed, (0)::numeric) - 0.66)))) - (COALESCE(t.costoturno, (0)::numeric) + (COALESCE(t.costohoraextra, (0)::numeric) * GREATEST((0)::numeric, (COALESCE(a.hed, (0)::numeric) - 0.66))))), 2) AS utilidad
   FROM (registroasistencia a
     LEFT JOIN tarifasfacturacionturnos t ON (((a.puesto = t.puesto) AND ((a.fecha >= t.fechainicio) AND (a.fecha <= t.fechafin)))))
  WHERE (a.puesto <> ALL (ARRAY['Estibado PT'::text, 'Salvado'::text, 'Montacargas de producción'::text, 'Montacargas de cargue'::text, 'Cargue/Descargue'::text, 'Auxiliar Mixto'::text, 'Tolva Bulto'::text, 'Tolva Planchador'::text]))
UNION ALL
 SELECT a.id,
    a.fecha,
    a.nombre,
    a.identificacion,
    a.puesto,
    a.asistencia,
    GREATEST((0)::numeric, (COALESCE(a.hed, (0)::numeric) - 0.66)) AS hed,
    GREATEST((0)::numeric, (COALESCE(a.hedf, (0)::numeric) - 0.66)) AS hedf,
    GREATEST((0)::numeric, (COALESCE(a.hen, (0)::numeric) - 0.66)) AS hen,
    GREATEST((0)::numeric, (COALESCE(a.hef, (0)::numeric) - 0.66)) AS hef,
    GREATEST((0)::numeric, (COALESCE(a.hn, (0)::numeric) - 0.66)) AS hn,
    a.idempresa,
    a.especialidad,
    t.tarifaturno,
    t.tarifahoraextra,
    t.costoturno,
    t.costohoraextra,
        CASE
            WHEN (t.id IS NULL) THEN 'SIN TARIFA'::text
            ELSE 'OK'::text
        END AS estado_tarifa,
    round((COALESCE(t.tarifahoraextra, (0)::numeric) * GREATEST((0)::numeric, (COALESCE(a.hed, (0)::numeric) - 0.66))), 2) AS valorextra,
    round((COALESCE(t.tarifaturno, (0)::numeric) + (COALESCE(t.tarifahoraextra, (0)::numeric) * GREATEST((0)::numeric, (COALESCE(a.hed, (0)::numeric) - 0.66)))), 2) AS facturacion_total,
    round((COALESCE(t.costohoraextra, (0)::numeric) * GREATEST((0)::numeric, (COALESCE(a.hed, (0)::numeric) - 0.66))), 2) AS costoextra,
    round((COALESCE(t.costoturno, (0)::numeric) + (COALESCE(t.costohoraextra, (0)::numeric) * GREATEST((0)::numeric, (COALESCE(a.hed, (0)::numeric) - 0.66)))), 2) AS costo_total,
    round(((COALESCE(t.tarifaturno, (0)::numeric) + (COALESCE(t.tarifahoraextra, (0)::numeric) * GREATEST((0)::numeric, (COALESCE(a.hed, (0)::numeric) - 0.66)))) - (COALESCE(t.costoturno, (0)::numeric) + (COALESCE(t.costohoraextra, (0)::numeric) * GREATEST((0)::numeric, (COALESCE(a.hed, (0)::numeric) - 0.66))))), 2) AS utilidad
   FROM (registroasistencia a
     LEFT JOIN tarifasfacturacionturnos t ON (((a.puesto = t.puesto) AND ((a.fecha >= t.fechainicio) AND (a.fecha <= t.fechafin)))))
  WHERE (a.puesto = ANY (ARRAY['Estibado PT'::text, 'Salvado'::text, 'Montacargas de producción'::text, 'Montacargas de cargue'::text, 'Cargue/Descargue'::text, 'Auxiliar Mixto'::text, 'Tolva Bulto'::text, 'Tolva Planchador'::text]));
