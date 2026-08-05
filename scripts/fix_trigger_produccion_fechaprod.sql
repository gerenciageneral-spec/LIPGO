-- =====================================================================
-- `fn_sync_produccion_to_invtrans`: escribir tambien `fechaprod` y `horaprod`.
--
-- PROBLEMA QUE CORRIGE
-- La produccion que sube el LOGO llega a `invtrans` por este trigger, pero el
-- INSERT no incluia `fechaprod` ni `horaprod`, asi que esas filas nacian con
-- ambas columnas en NULL.
--
-- "Liquidación Tolva del día" filtra por `fechaprod = <fecha>`, de modo que la
-- produccion del LOGO era INVISIBLE ahi — aunque estuviera aprobada y se viera
-- perfectamente en "Aprobación de ingreso de producción", que no filtra por esa
-- columna. Verificado el 2026-08-05 contra datos reales: todas las filas con
-- `creadopor = 'LOGO'` tenian `fechaprod` y `horaprod` en null.
--
-- QUE FECHA SE USA
-- La de `produccion.fecha_hora` convertida a HORA COLOMBIA. Es el momento en que
-- el LOGO registro la produccion, que es el criterio confirmado con el negocio.
-- NO se usa el `lote`: aunque codifica una fecha (YYYYMMDD) y Conciliación
-- Avimol si lo interpreta asi (`loteAFecha`), en Indupan el lote cambia de dia a
-- media mañana, de modo que usarlo mandaria produccion de la tarde al dia
-- siguiente y el turno que la hizo no la veria.
--
-- OJO CON LA ZONA HORARIA: `fecha_hora` se guarda en UTC (los datos muestran el
-- sufijo +00). `AT TIME ZONE 'America/Bogota'` la baja a hora local, que es lo
-- que hay que comparar contra las ventanas de turno. Sin esa conversion, una
-- produccion de las 19:00 UTC (14:00 en Colombia) se leeria como de las 19:00 y
-- caeria en el turno equivocado.
--
-- `horaprod` se guarda como texto "HH:MM", que es el formato que ya espera
-- `lib/liquidacion-tolva-actions.ts` (ver scripts/add_horaprod_invtrans.sql).
--
-- El resto de la funcion queda EXACTAMENTE igual.
-- =====================================================================

CREATE OR REPLACE FUNCTION public.fn_sync_produccion_to_invtrans()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_nombreproducto text;
  v_codproducto text;
  v_location_codigo text;
  v_almacen_nombre text;
  v_max_id bigint;
  v_local timestamp;
BEGIN
  -- 1. Asegurar la secuencia al valor máximo actual para evitar el error 23505
  SELECT COALESCE(MAX(id), 0) INTO v_max_id FROM public.invtrans;
  PERFORM setval(pg_get_serial_sequence('public.invtrans', 'id'), v_max_id, true);

  -- 1b. Momento de la produccion en HORA COLOMBIA (ver cabecera del script).
  v_local := NEW.fecha_hora AT TIME ZONE 'America/Bogota';

  -- 2. Búsqueda de datos en la tabla productos
  SELECT nombre, codigo INTO v_nombreproducto, v_codproducto
  FROM public.productos
  WHERE id = NEW.producto;

  -- 3. Búsqueda de datos en la tabla locations
  SELECT codigo INTO v_location_codigo
  FROM public.locations
  WHERE id = NEW.localizacion;

  -- 4. Búsqueda de datos en la tabla almacenes
  SELECT nombre INTO v_almacen_nombre
  FROM public.almacenes
  WHERE id = NEW.bodega;

  -- 5. Inserción del nuevo registro en invtrans (el ID se genera solo y de forma segura)
  INSERT INTO public.invtrans (
    idempresa,
    idproducto,
    nombreproducto,
    lote,
    location,
    cantidad,
    tipomov,
    status,
    origen,
    creado,
    creadopor,
    codproducto,
    almacen,
    qrestiba,
    fechaprod,
    horaprod
  ) VALUES (
    1,
    NEW.producto::smallint,
    v_nombreproducto,
    NEW.lote::text,
    v_location_codigo,
    NEW.bultos_procesados::numeric,
    'Entrada',
    NULL,
    'ingreso producción',
    NEW.fecha_hora,
    'LOGO',
    v_codproducto,
    v_almacen_nombre,
    NEW.id::numeric,
    v_local::date,
    to_char(v_local, 'HH24:MI')
  );

  RETURN NEW;
END;
$function$;

-- =====================================================================
-- VERIFICACION
-- =====================================================================

-- 1) La funcion quedo con las dos columnas nuevas.
select pg_get_functiondef('public.fn_sync_produccion_to_invtrans'::regproc) like '%fechaprod%'
       as tiene_fechaprod,
       pg_get_functiondef('public.fn_sync_produccion_to_invtrans'::regproc) like '%horaprod%'
       as tiene_horaprod;

-- 2) El trigger sigue siendo AFTER INSERT (no se toco, pero se confirma).
select tgname, pg_get_triggerdef(oid) as definicion
from pg_trigger
where tgrelid = 'public.produccion'::regclass and not tgisinternal;

-- 3) Despues de que el LOGO registre una produccion nueva, debe traer las dos
--    columnas pobladas y la hora debe coincidir con la hora local de la planta.
select id, nombreproducto, lote, cantidad, creado, fechaprod, horaprod, creadopor
from public.invtrans
where creadopor = 'LOGO'
order by id desc
limit 10;
