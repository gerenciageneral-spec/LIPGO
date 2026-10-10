
-- =====================================================================
-- 281_id3_ubicaciones_nuevas.sql
--
-- Las 25 posiciones nuevas de la bodega de ID3 entran al catálogo. Sin esto, el traslado del
-- script 282 dejaría producto en ubicaciones que la app no conoce.
--
-- POR QUÉ. Gerencia reorganizó la bodega el 2026-10-10 y pasó el mapa nuevo. De los 36 destinos
-- del listado, **25 no existen** en `locations`: ID3 solo tiene A1–A22, AV, B40–B44, B81, E37,
-- E38, E45, E48–E50, E52–E55, E58, E61, CUARENTENA y GRANEL. Si se mueve stock a una posición que
-- no está en el catálogo, no aparece en los desplegables de transacciones ni de conteo, y el
-- panel de ocupación no la ve.
--
-- LAS 25: A23 A24 A25 A26 A27 A28 A29 A30 · B1 B2 B3 B4 · E1 E2 E3 E4 E5 E6 E7 E8 E9 E10 E11 E12 E13
--
-- TODAS A LA BODEGA 3 (BODEGA GENERAL CEDB), que es donde están A, B y E hoy. La otra bodega de
-- ID3 es GRANEL (id 5) y no se toca.
--
-- LA CAPACIDAD QUEDA EN CERO, A PROPÓSITO. Es un dato físico que solo conoce quien organizó la
-- bodega, y en ID3 va de 15 a 13.824 unidades según la posición: inventarlo sería peor que
-- dejarlo vacío. OJO: el panel de ocupación suma el stock de cada zona y lo divide por la
-- capacidad de sus posiciones, así que mientras estas 25 estén en cero, las zonas A, B y E van a
-- verse MÁS llenas de lo que están. Pasar las capacidades reales y se cargan en un minuto.
--
-- LA SECUENCIA DEL id VENÍA DESFASADA, y por eso la primera versión de este script se cayó con
-- "23505: duplicate key value violates unique constraint locations_pkey · Key (id)=(378) already
-- exists": la tabla tiene 317 filas pero su id más alto es 379, así que la secuencia repartía
-- números ya usados. Es la misma trampa conocida en `invtrans`. Se resuelve de las dos maneras:
-- el id se pone a mano (máximo + 1) y al final se ADELANTA LA SECUENCIA, para que la próxima vez
-- que alguien cree una posición desde la app no choque igual. Esa reparación beneficia a los
-- cinco proyectos, no solo a ID3, y no cambia ninguna fila existente.
--
-- ES PURAMENTE ADITIVO: 25 filas nuevas. No toca inventario, ni movimientos, ni las posiciones
-- que ya existen. Idempotente: correrlo dos veces no duplica.
-- =====================================================================

-- ---------------------------------------------------------------------
-- PASO 1 — ANTES.
-- ---------------------------------------------------------------------
select count(*) as ubicaciones_id3 from public.locations where idempresa = 3;
-- Esperado: 43.

select codigo, letra, numero, bodega, capacidad, activo
from public.locations where idempresa = 3 order by letra, numero;

-- ---------------------------------------------------------------------
-- PASO 2 — LAS 25 POSICIONES NUEVAS.
-- ---------------------------------------------------------------------
begin;

do $nuevas$
declare
  v_codigos text[] := array[
    'A23','A24','A25','A26','A27','A28','A29','A30',
    'B1','B2','B3','B4',
    'E1','E2','E3','E4','E5','E6','E7','E8','E9','E10','E11','E12','E13'
  ];
  v_cod text;
  v_creadas int := 0;
  v_existian int := 0;
  v_id bigint;
  v_identidad text;
  v_sql text;
  v_sec text;
begin
  -- LA SECUENCIA DE `locations` ESTÁ DESFASADA (2026-10-10): la primera versión de este script
  -- dejaba que el id lo pusiera la secuencia y se cayó con "23505: duplicate key ... Key (id)=(378)
  -- already exists". La tabla tiene 317 filas y su id máximo es 379, así que la secuencia viene
  -- atrás. Es la misma trampa ya conocida en `invtrans`. Aquí se resuelve de las dos maneras: el
  -- id se pone a mano (max + 1) y al final se adelanta la secuencia, para que la próxima vez que
  -- alguien cree una posición desde la app no choque igual.
  select coalesce(max(id), 0) into v_id from public.locations;

  -- Una columna GENERATED ALWAYS no admite un id explícito sin `overriding system value`; se mira
  -- cómo está declarada en vez de suponerlo.
  select coalesce(identity_generation, '') into v_identidad
    from information_schema.columns
   where table_schema = 'public' and table_name = 'locations' and column_name = 'id';

  foreach v_cod in array v_codigos loop
    if exists (select 1 from public.locations where idempresa = 3 and upper(trim(codigo)) = v_cod) then
      v_existian := v_existian + 1;
      continue;
    end if;
    v_id := v_id + 1;
    v_sql := 'insert into public.locations (id, codigo, nombre, idempresa, activo, bodega, capacidad, letra, numero) '
          || case when v_identidad = 'ALWAYS' then 'overriding system value ' else '' end
          || 'values ($1, $2, $3, 3, ''true'', 3, 0, $4, $5)';
    execute v_sql using
      v_id,
      v_cod,
      'Localizacion ' || v_cod,
      left(v_cod, 1),
      nullif(regexp_replace(v_cod, '\D', '', 'g'), '')::int;
    v_creadas := v_creadas + 1;
  end loop;

  -- La secuencia queda al día con el id más alto que exista de verdad.
  v_sec := pg_get_serial_sequence('public.locations', 'id');
  if v_sec is not null then
    perform setval(v_sec, (select max(id) from public.locations), true);
    raise notice 'Secuencia % puesta al día en %.', v_sec, (select max(id) from public.locations);
  end if;
  raise notice 'Posiciones creadas: % · ya existían: % · esperadas en total: 25', v_creadas, v_existian;
  if v_creadas + v_existian <> 25 then
    raise exception 'Se procesaron % posiciones y eran 25. Se deshace todo.', v_creadas + v_existian;
  end if;
end
$nuevas$;

do $comprobar$
declare v int;
begin
  select count(*) into v from public.locations
   where idempresa = 3
     and upper(trim(codigo)) in ('A23','A24','A25','A26','A27','A28','A29','A30','B1','B2','B3','B4',
                                 'E1','E2','E3','E4','E5','E6','E7','E8','E9','E10','E11','E12','E13');
  if v <> 25 then raise exception 'Quedaron % de las 25 posiciones nuevas. Se deshace todo.', v; end if;

  -- Ninguna puede haber quedado en otra bodega ni inactiva.
  select count(*) into v from public.locations
   where idempresa = 3 and bodega = 3 and activo = 'true'
     and upper(trim(codigo)) in ('A23','A24','A25','A26','A27','A28','A29','A30','B1','B2','B3','B4',
                                 'E1','E2','E3','E4','E5','E6','E7','E8','E9','E10','E11','E12','E13');
  if v <> 25 then raise exception 'Solo % de las 25 quedaron activas en la bodega 3. Se deshace todo.', v; end if;

  raise notice 'LISTO. ID3 pasa de 43 a 68 posiciones. Ya se puede correr el script 282 (los traslados).';
end
$comprobar$;

commit;

-- ---------------------------------------------------------------------
-- PASO 3 — DESPUÉS.
-- ---------------------------------------------------------------------
select count(*) as ubicaciones_id3 from public.locations where idempresa = 3;  -- esperado: 68

select codigo, letra, numero, bodega, capacidad, activo
from public.locations
where idempresa = 3
  and upper(trim(codigo)) in ('A23','A24','A25','A26','A27','A28','A29','A30','B1','B2','B3','B4',
                              'E1','E2','E3','E4','E5','E6','E7','E8','E9','E10','E11','E12','E13')
order by letra, numero;
-- Esperado: las 25, bodega 3, activas, capacidad 0 (pendiente de cargar la real).
