-- ============================================================================
-- CORRECCIÓN — auxiliares asignados a vehículos ANTES de su fecha de ingreso
-- ----------------------------------------------------------------------------
-- Caso: Otoniel de Jesús Murillo (ID 4) y Andrés Escorcia (ID 2) ingresaron el
-- 27-jul-2026, pero aparecen en `cabeceraoc.auxiliares` de órdenes anteriores
-- (20, 23, 24 de julio), y por eso `pagonomina` les liquidó destajo.
--
-- El nombre NO se escribe a mano: se localiza por PATRÓN y se reemplaza tal
-- como esté escrito en la base (con o sin tildes, segundo apellido, etc.).
-- Cada patrón está atado a su ID de empresa para no tocar a un homónimo del
-- otro proyecto.
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
-- vía; el PASO 0(c) lo diagnostica.
--
-- ÚNICO PUNTO A AJUSTAR: el bloque `objetivo` (idempresa + patrón + fecha de
-- ingreso). Se repite igual en los pasos 1 y 2.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- PASO 0 (solo lectura) — DIAGNÓSTICO. Correr primero y revisar los 3 puntos.
-- ----------------------------------------------------------------------------

-- (a) CONTROL DE FALSOS POSITIVOS: ¿a qué personas distintas les pega cada
--     patrón? Debe salir UNA sola por patrón. Si aparecen dos, el patrón hay
--     que hacerlo más específico ANTES de continuar.
WITH objetivo(idempresa, patron, fecha_ingreso) AS (
  VALUES (4, '%OTONIEL%',  DATE '2026-07-27'),
         (2, '%ESCORCIA%', DATE '2026-07-27')
)
SELECT o.idempresa,
       o.patron,
       TRIM(t.parte) AS nombre_en_la_base,
       count(*)      AS veces
  FROM cabeceraoc c
  JOIN objetivo o ON o.idempresa = c.idempresa
  CROSS JOIN LATERAL regexp_split_to_table(c.auxiliares, ',') AS t(parte)
 WHERE UPPER(TRIM(t.parte)) LIKE o.patron
 GROUP BY o.idempresa, o.patron, TRIM(t.parte)
 ORDER BY o.idempresa, nombre_en_la_base;

-- (b) Órdenes afectadas (anteriores al ingreso)
WITH objetivo(idempresa, patron, fecha_ingreso) AS (
  VALUES (4, '%OTONIEL%',  DATE '2026-07-27'),
         (2, '%ESCORCIA%', DATE '2026-07-27')
)
SELECT c.idempresa,
       c.id,
       c.ordendecargue,
       c.fechacargue,
       c.placa,
       c.auxiliares,
       array_length(string_to_array(c.auxiliares, ','), 1) AS n_auxiliares,
       TRIM(t.parte) AS nombre_encontrado
  FROM cabeceraoc c
  JOIN objetivo o ON o.idempresa = c.idempresa
  CROSS JOIN LATERAL regexp_split_to_table(c.auxiliares, ',') AS t(parte)
 WHERE c.fechacargue < o.fecha_ingreso
   AND UPPER(TRIM(t.parte)) LIKE o.patron
 ORDER BY c.idempresa, c.fechacargue, c.id;

-- (c) ¿Tienen ASISTENCIA antes del ingreso? Eso paga la BASE del día por otra
--     vía y NO lo corrige este script. Si devuelve filas, hay que tratarlo aparte.
WITH objetivo(idempresa, patron, fecha_ingreso) AS (
  VALUES (4, '%OTONIEL%',  DATE '2026-07-27'),
         (2, '%ESCORCIA%', DATE '2026-07-27')
)
SELECT r.idempresa, r.fecha, r.nombre, r.identificacion, r.puesto, r.asistencia
  FROM registroasistencia r
  JOIN objetivo o ON o.idempresa = r.idempresa
 WHERE r.fecha < o.fecha_ingreso
   AND UPPER(TRIM(r.nombre)) LIKE o.patron
 ORDER BY r.idempresa, r.fecha;

-- ----------------------------------------------------------------------------
-- PASO 1 — VISTA PREVIA del reemplazo. No modifica nada.
-- Confirmar que el número de nombres separados por coma NO cambia.
-- ----------------------------------------------------------------------------
WITH objetivo(idempresa, patron, fecha_ingreso) AS (
  VALUES (4, '%OTONIEL%',  DATE '2026-07-27'),
         (2, '%ESCORCIA%', DATE '2026-07-27')
)
SELECT c.idempresa,
       c.id,
       c.ordendecargue,
       c.fechacargue,
       c.auxiliares AS auxiliares_actual,
       (SELECT string_agg(
                 CASE WHEN UPPER(TRIM(t.parte)) LIKE o.patron
                      THEN 'Aux. Prueba 10'
                      ELSE TRIM(t.parte) END,
                 ',' ORDER BY t.ord)
          FROM regexp_split_to_table(c.auxiliares, ',') WITH ORDINALITY AS t(parte, ord)
       ) AS auxiliares_nuevo,
       array_length(string_to_array(c.auxiliares, ','), 1) AS n_auxiliares_antes
  FROM cabeceraoc c
  JOIN objetivo o ON o.idempresa = c.idempresa
 WHERE c.fechacargue < o.fecha_ingreso
   AND EXISTS (
         SELECT 1
           FROM regexp_split_to_table(c.auxiliares, ',') AS p(parte)
          WHERE UPPER(TRIM(p.parte)) LIKE o.patron
       )
 ORDER BY c.idempresa, c.fechacargue, c.id;

-- ----------------------------------------------------------------------------
-- PASO 2 — UPDATE real. Solo si el PASO 1 se ve correcto.
-- Revisa el "UPDATE N" antes de confirmar el COMMIT.
-- ----------------------------------------------------------------------------
BEGIN;

WITH objetivo(idempresa, patron, fecha_ingreso) AS (
  VALUES (4, '%OTONIEL%',  DATE '2026-07-27'),
         (2, '%ESCORCIA%', DATE '2026-07-27')
),
recalculado AS (
  SELECT c.id,
         (SELECT string_agg(
                   CASE WHEN UPPER(TRIM(t.parte)) LIKE o.patron
                        THEN 'Aux. Prueba 10'
                        ELSE TRIM(t.parte) END,
                   ',' ORDER BY t.ord)
            FROM regexp_split_to_table(c.auxiliares, ',') WITH ORDINALITY AS t(parte, ord)
         ) AS nuevo
    FROM cabeceraoc c
    JOIN objetivo o ON o.idempresa = c.idempresa
   WHERE c.fechacargue < o.fecha_ingreso
     AND EXISTS (
           SELECT 1
             FROM regexp_split_to_table(c.auxiliares, ',') AS p(parte)
            WHERE UPPER(TRIM(p.parte)) LIKE o.patron
         )
)
UPDATE cabeceraoc c
   SET auxiliares = r.nuevo
  FROM recalculado r
 WHERE c.id = r.id;

-- Si el número de filas no coincide con el PASO 1 -> ROLLBACK; en vez de COMMIT.
COMMIT;

-- ----------------------------------------------------------------------------
-- PASO 3 (solo lectura) — VERIFICACIÓN. Ambas deben devolver 0 filas.
-- ----------------------------------------------------------------------------
WITH objetivo(idempresa, patron, fecha_ingreso) AS (
  VALUES (4, '%OTONIEL%',  DATE '2026-07-27'),
         (2, '%ESCORCIA%', DATE '2026-07-27')
)
SELECT c.idempresa, c.id, c.ordendecargue, c.fechacargue, c.auxiliares
  FROM cabeceraoc c
  JOIN objetivo o ON o.idempresa = c.idempresa
 WHERE c.fechacargue < o.fecha_ingreso
   AND UPPER(c.auxiliares) LIKE o.patron
 ORDER BY c.idempresa, c.fechacargue;

-- Y que pagonomina ya no les liquide esos días:
WITH objetivo(idempresa, patron, fecha_ingreso) AS (
  VALUES (4, '%OTONIEL%',  DATE '2026-07-27'),
         (2, '%ESCORCIA%', DATE '2026-07-27')
)
SELECT p.fecha, p.persona, p.idempresa, p.toneladas, p.total_liquidado_dia
  FROM pagonomina p
  JOIN objetivo o ON o.idempresa = p.idempresa
 WHERE p.fecha < o.fecha_ingreso
   AND UPPER(TRIM(p.persona)) LIKE o.patron
 ORDER BY p.fecha;
