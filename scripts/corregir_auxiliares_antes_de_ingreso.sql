-- ============================================================================
-- CORRECCIÓN — auxiliares asignados a vehículos ANTES de su fecha de ingreso
-- ----------------------------------------------------------------------------
-- Caso: Otoniel de Jesús Murillo (ID 4) y Andrés Escorcia (ID 2) ingresaron el
-- 27-jul-2026, pero aparecen en `cabeceraoc.auxiliares` de órdenes anteriores
-- (20, 23, 24 de julio), y por eso `pagonomina` les liquidó destajo.
--
-- POR QUÉ SE REEMPLAZA EL NOMBRE EN VEZ DE BORRARLO:
--   pagonomina reparte el tonelaje así:  peso_base_calculo / cantidad_auxiliares
--   Si se borra el nombre, el DIVISOR baja y a los demás auxiliares del mismo
--   vehículo les SUBE el tonelaje (y el pago). Reemplazándolo por un auxiliar
--   de prueba, el divisor se mantiene y esa porción simplemente no se paga:
--   pagonomina excluye a cualquiera cuyo nombre contenga "prueba"
--   (WHERE pc.persona !~* 'prueba', ver pagonomina_reemplazo.sql).
--
-- OJO — esto corrige el DESTAJO (cabeceraoc). Si la persona además tiene filas
-- en `registroasistencia` antes de su ingreso, cobra la BASE del día por otra
-- vía; el PASO 0 lo diagnostica.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- PASO 0 (solo lectura) — DIAGNÓSTICO. Correr primero y revisar.
--   (a) el nombre EXACTO como está escrito en cabeceraoc.auxiliares
--   (b) si además hay asistencia previa al ingreso (base del día)
-- ----------------------------------------------------------------------------

-- (a) Órdenes afectadas + token exacto del nombre
SELECT c.idempresa,
       c.id,
       c.ordendecargue,
       c.fechacargue,
       c.placa,
       c.auxiliares,
       array_length(string_to_array(c.auxiliares, ','), 1) AS n_auxiliares,
       TRIM(t.parte) AS nombre_encontrado
  FROM cabeceraoc c
  CROSS JOIN LATERAL regexp_split_to_table(c.auxiliares, ',') AS t(parte)
 WHERE c.idempresa IN (2, 4)
   AND c.fechacargue < DATE '2026-07-27'
   AND (TRIM(t.parte) ILIKE '%OTONIEL%' OR TRIM(t.parte) ILIKE '%ESCORCIA%')
 ORDER BY c.idempresa, c.fechacargue, c.id;

-- (b) ¿Tienen asistencia antes del ingreso? (eso paga la BASE del día)
SELECT idempresa, fecha, nombre, identificacion, puesto, asistencia
  FROM registroasistencia
 WHERE idempresa IN (2, 4)
   AND fecha < DATE '2026-07-27'
   AND (nombre ILIKE '%OTONIEL%' OR nombre ILIKE '%ESCORCIA%')
 ORDER BY idempresa, fecha;

-- ----------------------------------------------------------------------------
-- PASO 1 — VISTA PREVIA del reemplazo. No modifica nada.
-- Ajusta el ARRAY con los nombres EXACTOS que devolvió el PASO 0(a),
-- EN MAYÚSCULAS (la comparación normaliza con UPPER + TRIM).
-- ----------------------------------------------------------------------------
WITH objetivo AS (
  SELECT ARRAY[
    'OTONIEL DE JESUS MURILLO',
    'ANDRES ESCORCIA'
  ] AS nombres
)
SELECT c.idempresa,
       c.id,
       c.ordendecargue,
       c.fechacargue,
       c.auxiliares AS auxiliares_actual,
       (SELECT string_agg(
                 CASE WHEN UPPER(TRIM(t.parte)) = ANY ((SELECT nombres FROM objetivo))
                      THEN 'Auxiliar de Prueba 10'
                      ELSE TRIM(t.parte) END,
                 ',' ORDER BY t.ord)
          FROM regexp_split_to_table(c.auxiliares, ',') WITH ORDINALITY AS t(parte, ord)
       ) AS auxiliares_nuevo
  FROM cabeceraoc c
 WHERE c.idempresa IN (2, 4)
   AND c.fechacargue < DATE '2026-07-27'
   AND EXISTS (
         SELECT 1
           FROM regexp_split_to_table(c.auxiliares, ',') AS p(parte)
          WHERE UPPER(TRIM(p.parte)) = ANY ((SELECT nombres FROM objetivo))
       )
 ORDER BY c.idempresa, c.fechacargue, c.id;

-- Verifica en el resultado que:
--   · el número de nombres separados por coma NO cambió (mismo divisor);
--   · solo cambió el nombre objetivo, ningún otro auxiliar se tocó.

-- ----------------------------------------------------------------------------
-- PASO 2 — UPDATE real. Solo si el PASO 1 se ve correcto.
-- Envuelto en transacción: revisa el "UPDATE N" antes de confirmar.
-- ----------------------------------------------------------------------------
BEGIN;

WITH objetivo AS (
  SELECT ARRAY[
    'OTONIEL DE JESUS MURILLO',
    'ANDRES ESCORCIA'
  ] AS nombres
),
recalculado AS (
  SELECT c.id,
         (SELECT string_agg(
                   CASE WHEN UPPER(TRIM(t.parte)) = ANY ((SELECT nombres FROM objetivo))
                        THEN 'Auxiliar de Prueba 10'
                        ELSE TRIM(t.parte) END,
                   ',' ORDER BY t.ord)
            FROM regexp_split_to_table(c.auxiliares, ',') WITH ORDINALITY AS t(parte, ord)
         ) AS nuevo
    FROM cabeceraoc c
   WHERE c.idempresa IN (2, 4)
     AND c.fechacargue < DATE '2026-07-27'
     AND EXISTS (
           SELECT 1
             FROM regexp_split_to_table(c.auxiliares, ',') AS p(parte)
            WHERE UPPER(TRIM(p.parte)) = ANY ((SELECT nombres FROM objetivo))
         )
)
UPDATE cabeceraoc c
   SET auxiliares = r.nuevo
  FROM recalculado r
 WHERE c.id = r.id;

-- Si el número de filas no es el esperado del PASO 1 -> ROLLBACK; en vez de COMMIT.
COMMIT;

-- ----------------------------------------------------------------------------
-- PASO 3 (solo lectura) — VERIFICACIÓN. Debe devolver 0 filas.
-- ----------------------------------------------------------------------------
SELECT c.idempresa, c.id, c.ordendecargue, c.fechacargue, c.auxiliares
  FROM cabeceraoc c
 WHERE c.idempresa IN (2, 4)
   AND c.fechacargue < DATE '2026-07-27'
   AND (c.auxiliares ILIKE '%OTONIEL%' OR c.auxiliares ILIKE '%ESCORCIA%')
 ORDER BY c.idempresa, c.fechacargue;

-- Y confirmar que pagonomina ya no les liquida esos días (debe dar 0 filas):
SELECT fecha, persona, idempresa, toneladas, total_liquidado_dia
  FROM pagonomina
 WHERE fecha < DATE '2026-07-27'
   AND (persona ILIKE '%OTONIEL%' OR persona ILIKE '%ESCORCIA%')
 ORDER BY fecha;
