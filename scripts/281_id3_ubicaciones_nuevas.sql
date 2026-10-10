
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
begin
  foreach v_cod in array v_codigos loop
    if exists (select 1 from public.locations where idempresa = 3 and upper(trim(codigo)) = v_cod) then
      v_existian := v_existian + 1;
      continue;
    end if;
    insert into public.locations (codigo, nombre, idempresa, activo, bodega, capacidad, letra, numero)
    values (
      v_cod,
      'Localizacion ' || v_cod,
      3,
      'true',
      3,                                   -- BODEGA GENERAL CEDB, donde están A, B y E
      0,                                   -- capacidad real pendiente (ver cabecera)
      left(v_cod, 1),
      nullif(regexp_replace(v_cod, '\D', '', 'g'), '')::int
    );
    v_creadas := v_creadas + 1;
  end loop;
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
