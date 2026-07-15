-- ============================================================================
-- Función trigger: calcular_y_asignar_horas_extras
-- ----------------------------------------------------------------------------
-- Calcula y asigna las HORAS EXTRAS (hed / hedf) del personal de ESPECIALIDAD
-- en la tabla de asistencia (registroasistencia). Reglas:
--   1) Inicio efectivo = max(horaingreso, horaentradaprogramada).
--   2) Fin efectivo    = regla de 30 min de tolerancia a la salida:
--        - si se quedó tarde < 30 min → cuenta hasta la hora programada;
--        - si salió 30+ min tarde (o salió temprano) → su hora real.
--      Con ajuste de cruce de medianoche.
--   3) Horas trabajadas = fin − inicio (ajustando medianoche);
--      Horas extra = horas − 1h (descanso) − 7.3333h (jornada base); mín 0;
--      truncado a 2 decimales (sin redondear hacia arriba).
--   4) Asignación por día ISO: domingo (7) → hedf; resto → hed.
--
-- Es una función de trigger BEFORE INSERT/UPDATE: modifica NEW y lo retorna.
-- ============================================================================

create or replace function public.calcular_y_asignar_horas_extras()
returns trigger
language plpgsql
as $function$
DECLARE
    hora_inicio_efectiva TIME;
    hora_fin_efectiva TIME;
    intervalo_trabajado INTERVAL;
    intervalo_exceso_salida INTERVAL;
    horas_totales NUMERIC;
    horas_extras NUMERIC;
    dia_semana INTEGER;
BEGIN
    -- Validamos que especialidad sea el texto 'true' y tengamos los datos necesarios
    IF LOWER(NEW.especialidad) = 'true'
       AND NEW.horasalida IS NOT NULL
       AND NEW.horaingreso IS NOT NULL
       AND NEW.horasalidaprogramada IS NOT NULL THEN

        -- ====================================================================
        -- 1. LÓGICA DE INICIO EFECTIVO
        -- ====================================================================
        IF NEW.horaingreso < NEW.horaentradaprogramada THEN
            hora_inicio_efectiva := NEW.horaentradaprogramada;
        ELSE
            hora_inicio_efectiva := NEW.horaingreso;
        END IF;

        -- ====================================================================
        -- 2. LÓGICA DE FIN EFECTIVO (REGLA DE LOS 30 MINUTOS)
        -- ====================================================================
        intervalo_exceso_salida := NEW.horasalida - NEW.horasalidaprogramada;

        -- Ajuste de cruce de medianoche
        IF intervalo_exceso_salida < interval '-12 hours' THEN
            intervalo_exceso_salida := intervalo_exceso_salida + interval '24 hours';
        ELSIF intervalo_exceso_salida > interval '12 hours' THEN
            intervalo_exceso_salida := intervalo_exceso_salida - interval '24 hours';
        END IF;

        -- Si se quedó tarde, pero NO superó los 30 minutos, su fin efectivo es la hora programada
        IF intervalo_exceso_salida >= interval '0' AND intervalo_exceso_salida < interval '30 minutes' THEN
            hora_fin_efectiva := NEW.horasalidaprogramada;
        ELSE
            -- Si salió 30+ minutos tarde, o si salió temprano, usamos su hora de salida real
            hora_fin_efectiva := NEW.horasalida;
        END IF;

        -- ====================================================================
        -- 3. CALCULAR TIEMPO TRABAJADO TOTAL Y HORAS EXTRAS
        -- ====================================================================
        intervalo_trabajado := hora_fin_efectiva - hora_inicio_efectiva;

        -- Ajuste para turnos que cruzan la medianoche
        IF intervalo_trabajado < interval '0' THEN
            intervalo_trabajado := intervalo_trabajado + interval '24 hours';
        END IF;

        -- Convertir a horas totales
        horas_totales := EXTRACT(EPOCH FROM intervalo_trabajado) / 3600.0;

        -- Calcular horas extras (Total - 1h descanso - 7.3333h de jornada base)
        horas_extras := horas_totales - 1.0 - 7.3333;

        -- Evitar negativos si trabajó menos de la jornada base
        IF horas_extras < 0 THEN
            horas_extras := 0;
        END IF;

        -- TRUNCAR a 2 decimales (Corta en 0.66 o 2.66 exactos sin redondear hacia arriba)
        horas_extras := TRUNC(horas_extras, 2);

        -- ====================================================================
        -- 4. ASIGNACIÓN POR DÍA DE LA SEMANA
        -- ====================================================================
        dia_semana := EXTRACT(ISODOW FROM NEW.fecha);

        IF dia_semana = 7 THEN
            NEW.hedf := horas_extras;
            NEW.hed := 0;
        ELSE
            NEW.hed := horas_extras;
            NEW.hedf := 0;
        END IF;

    END IF;

    RETURN NEW;
END;
$function$;

-- ----------------------------------------------------------------------------
-- Trigger sugerido (BEFORE INSERT OR UPDATE en registroasistencia).
-- La función usa NEW.especialidad, NEW.horaingreso, NEW.horaentradaprogramada,
-- NEW.horasalida, NEW.horasalidaprogramada, NEW.fecha y asigna NEW.hed/NEW.hedf.
-- Descomenta para (re)crearlo; ajusta el nombre de la tabla si difiere.
-- ----------------------------------------------------------------------------
-- drop trigger if exists trg_calcular_horas_extras on public.registroasistencia;
-- create trigger trg_calcular_horas_extras
--   before insert or update on public.registroasistencia
--   for each row execute function public.calcular_y_asignar_horas_extras();
