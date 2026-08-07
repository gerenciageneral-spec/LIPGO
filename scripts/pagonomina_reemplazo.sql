-- ============================================================================
-- DESPLIEGUE — reemplazo de la vista pagonomina
--   (recargos por persona + dominical % + FILTRO de vínculo laboral)
-- ----------------------------------------------------------------------------
-- Incluye TODO lo validado:
--   - recargos/base del turno por persona desde headcount.salario (auxilio fuera
--     de la base) y parametros_legales_anio; recargo dominical parametrizado.
--   - FILTRO de estado/vínculo: no liquida días fuera del contrato de la persona
--     (cubre el caso "no pagar a inactivos"). Falla hacia pagar.
--   - CORTE por fecha de retiro (headcount.fecha_retiro): no liquida días
--     posteriores al retiro (cierra la fuga que dejaba el vínculo con contrato
--     abierto), salvo que la persona esté ACTIVA (reingreso). Auxiliares de
--     PRUEBA excluidos en todos los ID.
--   - PARÁMETROS LEGALES por INTERVALO DE FECHA: jornada, recargo dominical y los pct
--     de hora extra (incl. las dominicales hedf/hef y el recargo nocturno dominical)
--     salen de `parametros_legales_vigencia` según la fecha del turno — no por año.
--     jun-2026 → 7,3333 h/80%/hedf 2,05; desde 16-jul-2026 → 7 h/90%/hedf 2,15. Automático.
--     Unifica y reemplaza jornada_legal + recargo_dominical_legal.
--   - DÍA 31 — MES CALENDARIO DE 30 DÍAS (regla histórica del negocio): el día 31
--     NO paga base salarial ni dominical/festivo, para NADIE. Solo lleva las
--     NOVEDADES del día (horas extra, en total_recargos) y, para quien trabaja por
--     TONELADAS, lo producido — pero ese tonelaje va COMPLETO al EXCEDENTE
--     (bonif_prestacional), NO a la base. Razón: el archivo plano no transmite la
--     base (Siigo la paga sola desde el contrato); si el tonelaje fuera a base, se
--     vería en pagonomina pero nunca le llegaría al trabajador y descuadraría
--     contra Siigo. En excedente sale por la novedad 71 y además queda sujeto al
--     Ajuste de Proyecciones.
--     Aplica a TODO el histórico (sin piso de vigencia), por decisión del negocio.
--   - DOMINGO TRABAJADO = 1 + recargo (1,90 hoy), DESDE EL 16-JUL-2026: el día
--     trabajado lo cubre la base y encima va el RECARGO dominical; NO se paga
--     además el día de descanso. Se separa del TONELAJE: aplica igual venga el
--     día por toneladas o por turno (antes el recargo solo lo cobraba el
--     personal de turno con cero toneladas, y un domingo de tolva con tonelaje
--     en cero quedaba sin recargo y sin novedad en el plano). El % sale de la
--     vigencia (80% hasta 15-jul-2026, 90% desde el 16). Cruza al peso contra la
--     novedad "25- Recargo dominical o festivo" del archivo plano.
--     El descanso dominical de quien NO trabajó no cambia: se paga completo.
--     PISO 16-jul-2026 — no se mueven las quincenas ya pagadas.
--   - CORTE por FECHA DE INGRESO (headcount.fechainicio): no liquida días
--     ANTERIORES al inicio de actividades. `headcount.fechainicio` es la FUENTE
--     DE VERDAD del ingreso (el filtro de vínculo contra colaboradores_th falla
--     hacia pagar y dejaba pasar festivos previos al ingreso). Con PISO DE
--     VIGENCIA 2026-07-16 para no reescribir quincenas ya pagadas/reportadas.
--   - BONOS no prestacionales (módulo Compensación › Bonos): la CTE `bonos_dia`
--     agrega por (fecha, persona) los bonos APROBADOS de `bonos_nomina` y los
--     expone en la columna `bonif_no_prestacional` (antes muerta en 0). NO se
--     suman a `total_liquidado_dia` a propósito: esa columna alimenta el IBC de
--     la PILA, el costo de nómina del P&L y las prestaciones de retiro, y el
--     bono es NO prestacional. Llega al trabajador por el ARCHIVO PLANO, con su
--     propia novedad (43/50/66). Requiere scripts/create_bonos_nomina.sql.
--   - BLINDAJE MULTI-TURNO (registroasistencia.turno): `datos_asistencia` colapsa por
--     (fecha,persona) ANTES de calculo_turnos — necesario porque Auxiliar Mixto puede
--     tener 2 filas el mismo día (Turno 1 + Turno 2, ver scripts/add_turno_registroasistencia.sql).
--     Sin este colapso, esa 2ª fila DUPLICARÍA la base salarial del día. Para todo lo
--     demás (1 fila/persona/día) es un no-op exacto. Requiere correr antes
--     scripts/add_turno_registroasistencia.sql.
-- Mismos nombres/campos/lógica de salida. REVERSIBLE (definición previa en git).
-- REQUISITO: correr antes scripts/create_parametros_legales_vigencia.sql.
-- ANTES DE CORRER: valida con scripts/pagonomina_estado_diagnostico.sql que los
-- días que el filtro quitaría sean correctos.
-- ============================================================================

create or replace view public.pagonomina as
 WITH transformacion AS (
         SELECT cabeceraoc.fechacargue,
            cabeceraoc.idempresa,
            cabeceraoc.tipooperacion,
                CASE
                    -- Cedis id3/4 DESCARGUE: se paga con el peso de BÁSCULA del tiquete
                    -- (normalizado a toneladas, IGUAL que el cobro / basculaTiqueteDescargue),
                    -- cayendo al detalle (pesoorden) si no hay báscula o el dato es corrupto.
                    -- Cargue/otros en cedis y plantas id1/2 quedan sin cambio.
                    WHEN ((cabeceraoc.idempresa = ANY (ARRAY[3, 4])) AND (cabeceraoc.tipooperacion = 'Descargue'::text)) THEN
                        CASE
                            WHEN (COALESCE(cabeceraoc.pesovascula, (0)::numeric) <= (0)::numeric) THEN cabeceraoc.pesoorden
                            WHEN ((
                                CASE WHEN ((cabeceraoc.pesovascula / NULLIF(cabeceraoc.pesoorden, (0)::numeric)) > (50)::numeric)
                                     THEN (cabeceraoc.pesovascula / (1000)::numeric) ELSE cabeceraoc.pesovascula END
                                ) / NULLIF(cabeceraoc.pesoorden, (0)::numeric) NOT BETWEEN (0.1)::numeric AND (10)::numeric) THEN cabeceraoc.pesoorden
                            ELSE (
                                CASE WHEN ((cabeceraoc.pesovascula / NULLIF(cabeceraoc.pesoorden, (0)::numeric)) > (50)::numeric)
                                     THEN (cabeceraoc.pesovascula / (1000)::numeric) ELSE cabeceraoc.pesovascula END
                                )
                        END
                    WHEN (cabeceraoc.idempresa = ANY (ARRAY[3, 4])) THEN cabeceraoc.pesoorden
                    ELSE cabeceraoc.pesovascula
                END AS peso_base_calculo,
            array_length(string_to_array(cabeceraoc.auxiliares, ','::text), 1) AS cantidad_auxiliares,
            TRIM(BOTH FROM regexp_split_to_table(cabeceraoc.auxiliares, ','::text)) AS nombre_auxiliar
           FROM cabeceraoc
          WHERE ((cabeceraoc.fincargue IS NOT NULL) AND ((cabeceraoc.fincargue)::text <> ''::text))
            -- AVIMOL (idempresa=2): la Distribución NO se paga por destajo — el clon
            -- automático "+D" de las placas propias (generarDistribucionAutomatica)
            -- HEREDA los mismos `auxiliares` de su Cargue madre, así que sin esta
            -- exclusión esas mismas personas cobraban su tonelaje de Cargue Y OTRA VEZ
            -- el de la Distribución clon (doble conteo real, no solo un pago de más).
            -- Ya está cubierta aparte por las 300 t fijas de facturación
            -- (lib/cargos-fijos-actions.ts, "Distribución Turno") — concepto de
            -- FACTURACIÓN, no de nómina; no se cruza con esto. Exclusión TOTAL (ni
            -- toneladas ni pago) para no caer en el patrón de excedente_bruto_destajo
            -- negativo cuando hay toneladas sin tarifa. Fuera de Avimol, sin cambio:
            -- id1/3/4 siguen pagando Distribución con su propia tarifa y auxiliares.
            AND NOT ((cabeceraoc.idempresa = 2) AND (cabeceraoc.tipooperacion = 'Distribucion'::text))
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
        ), datos_asistencia_raw AS (
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
                -- Novedades que BLOQUEAN el pago del descanso dominical SIGUIENTE.
                -- OJO: 'Descanso compensatorio domingo anterior' NO va aquí — ese
                -- compensatorio afecta al domingo ANTERIOR (vía
                -- tiene_compensatorio_posterior, que le quita el doble pago al domingo
                -- que se trabajó), pero NO debe quitarle su descanso dominical al
                -- domingo SIGUIENTE (la semana con compensatorio es semana completa).
                CASE
                    WHEN (TRIM(BOTH FROM registroasistencia.asistencia) = ANY (ARRAY['Descanso'::text, '38- Licencia no remunerada- Deducción'::text, 'Retiro'::text])) THEN 1
                    ELSE 0
                END AS bloquea_domingo
           FROM registroasistencia
        ), datos_asistencia AS (
         -- BLINDAJE multi-turno: registroasistencia.turno permite 2 filas el mismo
         -- día para la misma persona (Auxiliar Mixto con Turno 1 + Turno 2, cada uno
         -- con su propio horario). Se COLAPSAN aquí en UNA sola fila por
         -- (fecha,persona) ANTES de calculo_turnos/consolidado_completo, para que el
         -- resto de la vista siga viendo exactamente 1 fila por día, como siempre:
         -- las horas extra de ambos turnos se SUMAN (se trabajaron las dos), y la
         -- base del día (valor_diario_ley/base_turno) se sigue pagando UNA sola vez.
         -- Para el caso de hoy (1 fila/persona/día en el 100% de los puestos) este
         -- GROUP BY es un no-op exacto: MAX/SUM/bool_or de una sola fila = esa fila.
         SELECT r.fecha,
            r.persona,
            max(r.idempresa_asistencia) AS idempresa_asistencia,
            max(r.puesto) AS puesto,
            max(r.asistencia) AS asistencia,
            bool_or(r.especialidad) AS especialidad,
            sum(r.cant_hed) AS cant_hed,
            sum(r.cant_hedf) AS cant_hedf,
            sum(r.cant_hen) AS cant_hen,
            sum(r.cant_hef) AS cant_hef,
            sum(r.cant_hn) AS cant_hn,
            max(r.es_falta_penalizable) AS es_falta_penalizable,
            max(r.bloquea_domingo) AS bloquea_domingo
           FROM datos_asistencia_raw r
          GROUP BY r.fecha, r.persona
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
             -- Parámetros legales VIGENTES en la fecha del turno (una sola fuente por
             -- intervalos): jornada, recargo dominical y los pct de hora extra ya vienen
             -- correctos por fecha (jun-2026: 7,3333/80%/hedf 105; desde 16-jul: 7/90%/hedf 115).
             LEFT JOIN LATERAL (SELECT * FROM parametros_legales_vigencia pv
                                 WHERE (pv.fecha_desde <= a.fecha)
                                 ORDER BY pv.fecha_desde DESC LIMIT 1) pa ON (true))
             CROSS JOIN LATERAL (
                 SELECT (s.base_pers / NULLIF(s.dias_p, (0)::numeric)) AS valor_dia,
                        (s.base_pers / NULLIF((s.dias_p * s.jornada_p), (0)::numeric)) AS hod
                   FROM ( SELECT (COALESCE(h2.salario, pa.smlv))::numeric AS base_pers,  -- base = SALARIO (auxilio NO entra en la base de recargos)
                                 COALESCE(pa.dias_calendario, (30)::numeric) AS dias_p,
                                 COALESCE(pa.jornada_horas, (7)::numeric) AS jornada_p  -- jornada vigente por fecha
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
        -- BONOS no prestacionales del módulo "Bonos" (Compensación). Se AGREGA
        -- por (fecha, persona) ANTES de unirlo: una persona puede tener VARIOS
        -- bonos el mismo día (conceptos distintos) y sin este colapso el LEFT
        -- JOIN haría fan-out, DUPLICANDO la fila del día completa (misma trampa
        -- que blinda `datos_asistencia`). Solo entran los APROBADOS.
        -- OJO: es NO prestacional -> NO se suma a total_liquidado_dia (esa
        -- columna alimenta el IBC de la PILA, el costo del P&L y las
        -- prestaciones de retiro). Sale por `bonif_no_prestacional` y llega al
        -- trabajador vía el ARCHIVO PLANO.
        ), bonos_dia AS (
         SELECT b.fecha,
            TRIM(BOTH FROM b.nombre) AS persona,
            sum(b.valor) AS bono_no_prestacional
           FROM bonos_nomina b
          WHERE (b.estado = 'aprobado'::text)
          GROUP BY b.fecha, TRIM(BOTH FROM b.nombre)
        ), consolidado_completo AS (
         SELECT c.fecha,
            c.persona,
            EXTRACT(dow FROM c.fecha) AS dia_semana,
            p.idempresa_operacion,
            COALESCE((p.idempresa_operacion)::integer, (a.idempresa_asistencia)::integer, (h.idempresa)::integer, 0) AS idempresa_origen,
            a.especialidad,
            h.salario,
            COALESCE((h.salario / (30)::numeric), (58364)::numeric) AS valor_diario_ley,
            -- Recargo dominical VIGENTE por fecha (viene de la vigencia pa2: 80% hasta
            -- 15-jul-2026, 90% desde 16-jul). Automático por intervalo.
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
                END AS es_festivo,
            -- Bono NO prestacional del día (módulo Bonos). Ya viene agregado
            -- por (fecha, persona) desde `bonos_dia`, así que el join no
            -- multiplica filas.
            COALESCE(bo.bono_no_prestacional, (0)::numeric) AS bono_no_prestacional
           FROM (((((((calendario_base c
             LEFT JOIN produccion_diaria p ON (((c.fecha = p.fecha) AND (c.persona = p.persona))))
             LEFT JOIN datos_asistencia a ON (((c.fecha = a.fecha) AND (c.persona = a.persona))))
             LEFT JOIN calculo_turnos ct ON (((c.fecha = ct.fecha) AND (c.persona = ct.persona))))
             LEFT JOIN festivos f ON ((c.fecha = f.fecha)))
             -- TRIM en los DOS lados: `persona` viene ya recortado (datos_asistencia_raw
             -- hace TRIM del nombre), pero `headcount.nombre` puede traer espacios de
             -- sobra del digitado. Sin TRIM el cruce falla en silencio y la persona
             -- queda SIN SALARIO (cae al default de $58.364) y SIN CÉDULA, así que
             -- tampoco la identifica el archivo plano. Casos reales encontrados:
             -- MIGUEL ANTONIO SANDOVAL (activo) y JUAN PABLO RAIGOSA GALEANO, ambos
             -- con un espacio al final del nombre en Head Count.
             LEFT JOIN headcount h ON ((TRIM(BOTH FROM h.nombre) = TRIM(BOTH FROM c.persona))))
             LEFT JOIN bonos_dia bo ON (((c.fecha = bo.fecha) AND (c.persona = bo.persona))))
             LEFT JOIN LATERAL (SELECT * FROM parametros_legales_vigencia pv
                                 WHERE (pv.fecha_desde <= c.fecha)
                                 ORDER BY pv.fecha_desde DESC LIMIT 1) pa2 ON (true))
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
            consolidado_completo.bono_no_prestacional,
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
            calculo_nomina_base.bono_no_prestacional,
            calculo_nomina_base.faltas_semana_anterior,
            calculo_nomina_base.vacios_semana_anterior,
            calculo_nomina_base.novedades_semana_anterior,
            calculo_nomina_base.tuvo_licencia_no_rem_semana,
            calculo_nomina_base.tiene_compensatorio_posterior,
                CASE
                    -- DÍA 31 — MES CALENDARIO DE 30 DÍAS. El salario mensual ya cubre
                    -- el mes completo, así que el 31 NO paga base salarial: NADIE, ni
                    -- siquiera el destajo.
                    --
                    -- OJO — por qué el destajo tampoco va en base: el ARCHIVO PLANO no
                    -- transmite la base (Siigo la paga sola desde el contrato, 15 días
                    -- fijos). Solo viajan las NOVEDADES. Si el tonelaje del 31 se
                    -- pusiera aquí, se vería en pagonomina pero NUNCA le llegaría al
                    -- trabajador por Siigo, y además descuadraría contra el plano.
                    -- Por eso todo el tonelaje del 31 se va al EXCEDENTE
                    -- (excedente_bruto_destajo, más abajo), que sí sale como novedad 71
                    -- y además queda sujeto al Ajuste de Proyecciones.
                    --
                    -- Va PRIMERO para ganarle a festivo/novedades: el 31 no paga base
                    -- ni aunque sea festivo (ver también valor_domingo_final abajo).
                    WHEN (EXTRACT(day FROM calculo_nomina_base.fecha) = (31)::numeric) THEN (0)::numeric
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
                    -- DÍA 31: no paga dominical de ningún tipo (ni el día de descanso
                    -- ni el festivo). Decisión del negocio: el 31 solo lleva novedades.
                    WHEN (EXTRACT(day FROM calculo_nomina_base.fecha) = (31)::numeric) THEN (0)::numeric
                    -- DOMINGO TRABAJADO (desde 16-jul-2026): NO paga día de descanso.
                    -- El día trabajado ya lo cubre la base, y encima va el RECARGO
                    -- dominical (ver `recargodominical` abajo): total 1 + pct = 1,90.
                    -- Antes se pagaba el día otra vez (2,00 en Indupan, hasta 2,90 en
                    -- Avimol cuando además entraba el recargo) y descuadraba contra
                    -- Siigo, que solo recibe la novedad del recargo.
                    -- El descanso dominical de quien NO trabajó no se toca: sigue
                    -- pagándose completo por la rama de abajo.
                    WHEN ((calculo_nomina_base.fecha >= DATE '2026-07-16')
                      AND (calculo_nomina_base.dia_semana = (0)::numeric)
                      AND (calculo_nomina_base.asistio_ok = 1)
                      AND (calculo_nomina_base.actividad_registrada <> ALL (ARRAY['Festivo'::text, 'Sin Registro'::text]))) THEN (0)::numeric
                    WHEN ((calculo_nomina_base.dia_semana = (0)::numeric) AND ((calculo_nomina_base.faltas_semana_anterior = 0) OR (calculo_nomina_base.faltas_semana_anterior IS NULL)) AND ((calculo_nomina_base.vacios_semana_anterior = 0) OR (calculo_nomina_base.vacios_semana_anterior IS NULL)) AND ((calculo_nomina_base.novedades_semana_anterior = 0) OR (calculo_nomina_base.novedades_semana_anterior IS NULL)) AND ((calculo_nomina_base.tiene_compensatorio_posterior = 0) OR (calculo_nomina_base.tiene_compensatorio_posterior IS NULL))) THEN
                    CASE
                        WHEN ((calculo_nomina_base.especialidad = true) AND (calculo_nomina_base.base_turno IS NOT NULL)) THEN calculo_nomina_base.base_turno
                        ELSE calculo_nomina_base.valor_diario_ley
                    END
                    ELSE (0)::numeric
                END AS valor_domingo_final,
                -- Excedente de destajo del día CON SIGNO (nuevo modelo): en un día de
                -- toneladas se compara lo generado (pago_produccion) contra la base del
                -- día (valor_diario_ley). Positivo si movió por encima de su base,
                -- NEGATIVO si por debajo. Se suma por quincena para netear días buenos
                -- con días bajos (el bono nunca baja la base; ver archivoplano). Excluye
                -- especialidad (esos días son por turno/horas, no por tonelaje).
                CASE
                    -- DÍA 31: TODO el tonelaje va al excedente, COMPLETO (sin restarle
                    -- base, porque ese día no hay base que descontar). Es la única vía
                    -- por la que ese pago llega al trabajador: el excedente se netea
                    -- por quincena y sale como novedad 71 en el archivo plano — la base
                    -- no viaja en el plano. Además, al quedar en excedente queda sujeto
                    -- al Ajuste de Proyecciones, que es el objetivo del negocio.
                    WHEN (EXTRACT(day FROM calculo_nomina_base.fecha) = (31)::numeric) THEN
                    CASE
                        -- EXCEPCIÓN "apoyo en cargue": una persona de especialidad=true
                        -- SÍ entra al destajo cuando tiene una fila en
                        -- apoyo_cargue_asignaciones ese día (la agregaron desde el módulo
                        -- "Asignación de apoyo en cargue" a una orden de Cargue/Descargue).
                        -- No cambia la regla general de especialidad, solo la excepciona
                        -- para ese día/persona puntual.
                        WHEN ((calculo_nomina_base.toneladas > (0)::numeric) AND ((calculo_nomina_base.especialidad IS NOT TRUE) OR EXISTS (SELECT 1 FROM apoyo_cargue_asignaciones ap WHERE ((ap.fecha = calculo_nomina_base.fecha) AND (upper(TRIM(BOTH FROM ap.persona)) = upper(TRIM(BOTH FROM calculo_nomina_base.persona))))))) THEN calculo_nomina_base.pago_produccion
                        ELSE (0)::numeric
                    END
                    -- Misma excepción de "apoyo en cargue" que arriba.
                    WHEN ((calculo_nomina_base.toneladas > (0)::numeric) AND ((calculo_nomina_base.especialidad IS NOT TRUE) OR EXISTS (SELECT 1 FROM apoyo_cargue_asignaciones ap WHERE ((ap.fecha = calculo_nomina_base.fecha) AND (upper(TRIM(BOTH FROM ap.persona)) = upper(TRIM(BOTH FROM calculo_nomina_base.persona))))))) THEN (calculo_nomina_base.pago_produccion - calculo_nomina_base.valor_diario_ley)
                    ELSE (0)::numeric
                END AS excedente_bruto_destajo,
                CASE
                    -- DÍA 31: sin recargo dominical (mismo criterio que arriba).
                    WHEN (EXTRACT(day FROM calculo_nomina_base.fecha) = (31)::numeric) THEN (0)::numeric
                    -- DOMINGO TRABAJADO (desde 16-jul-2026): SIEMPRE paga el recargo,
                    -- venga el día por toneladas o por turno. Antes solo lo cobraba el
                    -- personal de turno CON CERO toneladas, así que el destajo quedaba
                    -- por fuera y, peor, un domingo de tolva con el tonelaje en cero
                    -- caía en un limbo: ni recargo aquí ni novedad en el plano.
                    -- El % sale de la vigencia (80% hasta 15-jul-2026, 90% desde el 16),
                    -- así que el día trabajado queda en 1 + pct = 1,90 hoy.
                    -- Cruza exactamente contra la novedad "25- Recargo dominical o
                    -- festivo" del archivo plano, que Siigo valora a ese mismo pct.
                    WHEN ((calculo_nomina_base.fecha >= DATE '2026-07-16')
                      AND (calculo_nomina_base.dia_semana = (0)::numeric)
                      AND (calculo_nomina_base.asistio_ok = 1)
                      AND (calculo_nomina_base.actividad_registrada <> ALL (ARRAY['Festivo'::text, 'Sin Registro'::text]))) THEN
                    (
                        CASE
                            WHEN ((calculo_nomina_base.especialidad = true) AND (calculo_nomina_base.base_turno IS NOT NULL)) THEN calculo_nomina_base.base_turno
                            ELSE calculo_nomina_base.valor_diario_ley
                        END * (calculo_nomina_base.pct_recargo_dominical / 100.0)
                    )
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
        -- Marcador de domingo perdido por licencia no remunerada en la semana.
        -- OJO: `archivoplano` consume esta columna como NOVEDAD REAL, y Siigo
        -- procesa toda novedad de días DESCONTANDO el día. Por eso solo se marca
        -- el domingo que NO se trabajó: si la persona trabajó ese domingo, LIPgo
        -- le paga base + recargo (regla del 1,90), y mandar el 38 hacía que Siigo
        -- le descontara un día efectivamente trabajado. Caso real: CARLOS DANIEL
        -- OJITO, domingo 26-jul-2026, −$58.364 contra Siigo.
        -- Para quien NO trabajó el domingo el marcador sigue igual: ya perdió el
        -- descanso por `bloquea_domingo`, y la novedad lo deja documentado.
        CASE
            WHEN ((dia_semana = (0)::numeric) AND (tuvo_licencia_no_rem_semana = 1)
                  AND ((asistio_ok = 0) OR (actividad_registrada = ANY (ARRAY['Festivo'::text, 'Sin Registro'::text])))) THEN '38- Licencia no remunerada- Deducción'::text
            ELSE asistencia_texto
        END AS novedad_reportada,
    especialidad,
    toneladas,
    pago_produccion,
    valor_base_final AS base_dia,
        -- Bonificación por productividad = excedente de destajo del día CON SIGNO.
        -- TODO es prestacional (se elimina el tope de $9.948; cotiza completo al IBC).
        -- Va con signo para que la quincena netee (archivoplano suma y aplica MAX(0,·)).
        --
        -- SE RESTA LA BASE EFECTIVAMENTE PAGADA (`valor_base_final`), NO la teórica
        -- (`valor_diario_ley`), desde el 16-jul-2026.
        --
        -- El excedente es "lo que produjo POR ENCIMA de lo que se le pagó de base".
        -- Si ese día NO se le pagó base —porque tuvo una novedad que no remunera—,
        -- restarle igual salario/30 le cobra una base que nunca recibió y le borra
        -- el bono de toda la quincena. Caso real: DANILO JOSE DE LA HOZ CAMARGO,
        -- 21-jul-2026: movió 2,9 t ($11.889) en un día con base $0. La vista le
        -- calculaba 11.889 − 58.364 = −46.475 y su neto quincenal caía a −$43.560
        -- (bono $0), cuando el módulo de Revisión de nómina —que sí resta la base
        -- real— daba +$14.803. Esa era la diferencia entre LIPgo y el archivo plano.
        --
        -- En un día normal las dos fórmulas dan lo MISMO (valor_base_final =
        -- valor_diario_ley), y en el día 31 también (valor_base_final = 0, así que
        -- el tonelaje entra completo al excedente, igual que la rama del 31).
        -- Solo difieren en los días con tonelaje y sin base pagada: 5 personas en
        -- la quincena en curso.
        --
        -- PISO 16-jul-2026: antes de esa fecha se conserva `excedente_bruto_destajo`
        -- tal como estaba, para no reescribir quincenas ya enviadas a Siigo.
        CASE
            WHEN ((fecha >= DATE '2026-07-16')
              AND (toneladas > (0)::numeric)
              -- EXCEPCIÓN "apoyo en cargue" (ver excedente_bruto_destajo arriba):
              -- misma condición, para que este valor con piso de vigencia coincida.
              AND ((especialidad IS NOT TRUE) OR EXISTS (SELECT 1 FROM apoyo_cargue_asignaciones ap WHERE ((ap.fecha = fecha) AND (upper(TRIM(BOTH FROM ap.persona)) = upper(TRIM(BOTH FROM persona))))))) THEN (pago_produccion - valor_base_final)
            ELSE excedente_bruto_destajo
        END AS bonif_prestacional,
        -- Bono NO prestacional del módulo "Bonos" (Compensación): suma de los
        -- bonos APROBADOS de ese día para esa persona. NO entra a
        -- total_liquidado_dia (no cotiza al IBC ni genera prestaciones); se
        -- paga vía la novedad propia del ARCHIVO PLANO (43/50/66).
        COALESCE(bono_no_prestacional, (0)::numeric) AS bonif_no_prestacional,
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
            -- DÍA 31 (mes calendario de 30 días): SIN BASE para nadie. El tonelaje
            -- del destajo NO va aquí: se liquida por `excedente_bruto_destajo` ->
            -- novedad 71 del archivo plano (la base no viaja en el plano; Siigo la
            -- paga sola desde el contrato). Así el total del día queda solo con las
            -- novedades (horas extra), y el tonelaje se paga por el bono, sujeto al
            -- Ajuste de Proyecciones. Debe ir PRIMERO y en sincronía con la misma
            -- rama de `valor_base_final` (pre_calculo_valores) — este CASE es un
            -- duplicado histórico de aquel; si se toca uno, tocar el otro.
            WHEN (EXTRACT(day FROM fecha) = (31)::numeric) THEN (0)::numeric
            WHEN (TRIM(BOTH FROM asistencia_texto) = '15- Incapacidad por enfermedad general al 66%- ingreso'::text) THEN (valor_diario_ley * 0.6667)
            WHEN (es_festivo = 1) THEN valor_diario_ley
            WHEN (TRIM(BOTH FROM asistencia_texto) = ANY (ARRAY['13- Incapacidad por enfermedad general al 100%'::text, '31- Vacaciones disfrutadas'::text, '14- Incapacidad por enfermedad general al 50'::text, 'Descanso'::text, 'Descanso compensatorio domingo anterior'::text])) THEN valor_diario_ley
            WHEN (especialidad = true) THEN valor_base_final
            -- NUEVO MODELO: el día de destajo YA NO se liquida al valor de sus
            -- toneladas, sino a la BASE del día (valor_base_final = salario/30). Lo que
            -- generó de más/menos por tonelaje se netea por quincena como bonificación
            -- (bonif_prestacional, ver archivoplano). Así cada día trabajado paga su
            -- base como en SIIGO, sin nivelar hacia abajo el bono ni las horas extra.
            ELSE valor_base_final
        END + COALESCE(total_recargos_turno, (0)::numeric)) +
        CASE
            WHEN (TRIM(BOTH FROM asistencia_texto) = ANY (ARRAY['Descanso'::text, '31- Vacaciones disfrutadas'::text, 'Descanso compensatorio domingo anterior'::text, '13- Incapacidad por enfermedad general al 100%'::text, '14- Incapacidad por enfermedad general al 50'::text, '15- Incapacidad por enfermedad general al 66%- ingreso'::text])) THEN (0)::numeric
            ELSE valor_domingo_final
        END) + recargodominical) AS total_liquidado_dia
   FROM pre_calculo_valores pc
  WHERE (fecha <= CURRENT_DATE)
    -- Auxiliares de PRUEBA (todos los ID): NUNCA entran a la nómina a pagar.
    AND (pc.persona !~* 'prueba')
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
    -- Corte por FECHA DE RETIRO (headcount.fecha_retiro): no se liquidan los días
    -- POSTERIORES al retiro de la persona. Cierra la fuga que el filtro de vínculo
    -- de arriba deja pasar cuando el contrato en colaboradores_th sigue abierto
    -- (fecha_fin_contrato NULL) o no se puede vincular por nombre↔cédula.
    -- SALVAGUARDA (falla hacia pagar): NO corta a quien esté ACTIVO en algún Head
    -- Count (reingreso, o fecha_retiro vieja de un vínculo anterior); su vínculo
    -- vigente manda. Solo corta a los realmente retirados (sin registro Activo).
    AND NOT (
          EXISTS (SELECT 1 FROM headcount hr
                   WHERE (TRIM(BOTH FROM hr.nombre) = TRIM(BOTH FROM pc.persona))
                     AND (hr.fecha_retiro IS NOT NULL)
                     AND (pc.fecha > hr.fecha_retiro))
      AND NOT EXISTS (SELECT 1 FROM headcount ha
                       WHERE (TRIM(BOTH FROM ha.nombre) = TRIM(BOTH FROM pc.persona))
                         AND (UPPER(TRIM(BOTH FROM COALESCE(ha.estado, ''::text))) = 'ACTIVO'))
    )
    -- ------------------------------------------------------------------------
    -- CORTE POR FECHA DE INGRESO (headcount.fechainicio) — simétrico al de
    -- retiro. `headcount.fechainicio` es la FUENTE DE VERDAD del inicio de
    -- actividades: antes de esa fecha no se liquida NADA.
    --
    -- Por qué era necesario: el filtro de vínculo laboral de arriba compara
    -- contra `colaboradores_th` y FALLA HACIA PAGAR — solo excluye si la
    -- persona tiene contrato registrado allí y ninguno cubre la fecha. Quien
    -- no tenga fila en `colaboradores_th` (caso real y frecuente) cobraba días
    -- previos a su ingreso. Y el caso más silencioso son los FESTIVOS: el
    -- calendario es cartesiano (todos los días × todas las personas), así que
    -- un festivo se liquidaba a cualquiera de la lista aunque aún no existiera
    -- como empleado — sin pasar por registroasistencia ni por cabeceraoc, o
    -- sea, sin ningún dato que se pudiera corregir a mano.
    --
    -- PISO DE VIGENCIA (2026-07-16): la regla NO se aplica retroactivamente.
    -- Reescribir quincenas ya pagadas cambiaría liquidaciones cerradas, el IBC
    -- ya reportado a la PILA y archivos planos ya enviados a Siigo. Medido
    -- sobre datos reales: con este piso afecta 2 personas / $116.727 (el caso
    -- que originó la regla); sin piso serían 50 personas / $17.8 millones.
    -- Para extenderla hacia atrás, basta mover esta fecha — pero eso es una
    -- decisión de negocio, no técnica.
    --
    -- MULTI-EMPRESA: se toma la fechainicio MÍNIMA de la persona entre todas
    -- sus filas de Head Count. Si trabajó antes en otro proyecto, esos días
    -- siguen siendo válidos.
    -- FALLA HACIA PAGAR: si no tiene `fechainicio`, no se corta nada.
    -- ------------------------------------------------------------------------
    AND NOT (
          pc.fecha >= DATE '2026-07-16'
      AND EXISTS (SELECT 1 FROM headcount hi
                   WHERE (TRIM(BOTH FROM hi.nombre) = TRIM(BOTH FROM pc.persona))
                     AND (hi.fechainicio IS NOT NULL))
      AND pc.fecha < (SELECT min(hi2.fechainicio) FROM headcount hi2
                       WHERE (TRIM(BOTH FROM hi2.nombre) = TRIM(BOTH FROM pc.persona))
                         AND (hi2.fechainicio IS NOT NULL))
    )
  ORDER BY persona, fecha DESC;

-- Limpieza: ya no se necesita la vista de verificacion.
drop view if exists public.pagonomina_v2;
