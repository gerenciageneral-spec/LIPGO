
-- =====================================================================
-- 272_inv_654_devolucion_mal_cargue.sql
--
-- Registra el proceso de autorización del código nuevo 654 — Devolución por mal cargue.
--
-- Gerencia, 2026-10-08: "vamos a crear un código nuevo para las devoluciones por mal cargue,
-- es decir trocado o mayor cantidad; debe tener el campo de la orden y esa devolución debe
-- inmediatamente descontar este producto de la orden despachada y retornar al inventario".
-- Y sobre quién puede hacerlo: "con clave del responsable".
--
-- QUÉ ES EL 654. La orden descontó 100 del inventario porque eso decía, pero el camión solo
-- cargó 90. Esas 10 nunca salieron de la bodega: vuelven al inventario y el pedido las
-- recupera como pendientes. NO es el caso contrario (cargar de más): el sistema no deja
-- registrar una salida mayor a la que la orden autoriza, y eso aparece como faltante en el
-- conteo.
--
-- ES PURAMENTE ADITIVO: un proceso de autorización nuevo, con los mismos perfiles que ya
-- pueden reasignar lote (309), que es el movimiento de confianza equivalente: tocar lo que ya
-- se despachó. No cambia ningún permiso existente, no toca inventario, no toca ninguna clave.
-- Idempotente.
--
-- ORDEN: este script va ANTES de publicar el código. Sin él, el 654 pediría una autorización
-- que todavía no existe.
-- =====================================================================

-- ---------------------------------------------------------------------
-- PASO 1 — ANTES.
-- ---------------------------------------------------------------------
select codigo, nombre, grupo, orden, activo
from public.autorizacion_procesos
where codigo in ('inv_654', 'inv_309')
order by codigo;
-- Esperado: solo inv_309.

select p.nombre as perfil, pp.proceso
from public.autorizacion_perfil_procesos pp
join public.autorizacion_perfiles p on p.id = pp.perfil_id
where pp.proceso in ('inv_654', 'inv_309')
order by pp.proceso, p.nombre;

-- ---------------------------------------------------------------------
-- PASO 2 — EL PROCESO Y SUS PERFILES.
-- ---------------------------------------------------------------------
begin;

insert into public.autorizacion_procesos (codigo, nombre, descripcion, grupo, orden, con_alcance)
values (
  'inv_654',
  'Devolución por mal cargue (654)',
  'Registrar que el camión cargó menos de lo que la orden descontó: el producto vuelve al inventario y el pedido recupera esas unidades como pendientes. Exige la clave del responsable porque toca una orden ya despachada.',
  'Inventario',
  15,
  true
)
on conflict (codigo) do nothing;

-- Los MISMOS perfiles que ya pueden reasignar lote (309), DERIVADOS de él y no escritos a
-- mano: es el movimiento de confianza equivalente (tocar lo que ya se despachó), y así no se
-- queda por fuera ningún perfil creado después del SQL 203 — como pasó con el 271, donde la
-- lista escrita a mano se saltó a «JEFE DE BODEGA».
insert into public.autorizacion_perfil_procesos (perfil_id, proceso)
select pp.perfil_id, 'inv_654'
from public.autorizacion_perfil_procesos pp
where pp.proceso = 'inv_309'
on conflict do nothing;

do $comprobar$
declare
  v_proc int;
  v_654  int;
  v_309  int;
begin
  select count(*) into v_proc from public.autorizacion_procesos where codigo = 'inv_654' and activo;
  if v_proc <> 1 then
    raise exception 'No quedó registrado el proceso inv_654: se deshace todo.';
  end if;

  select count(*) into v_654 from public.autorizacion_perfil_procesos where proceso = 'inv_654';
  select count(*) into v_309 from public.autorizacion_perfil_procesos where proceso = 'inv_309';
  if exists (
    select 1 from public.autorizacion_perfil_procesos a
     where a.proceso = 'inv_309'
       and not exists (select 1 from public.autorizacion_perfil_procesos b
                        where b.proceso = 'inv_654' and b.perfil_id = a.perfil_id)
  ) then
    raise exception 'Hay perfiles que pueden el 309 y no el 654 (% contra %): se deshace todo.', v_309, v_654;
  end if;

  raise notice 'LISTO. inv_654 registrado y asignado a % perfiles (los mismos del 309).', v_654;
end
$comprobar$;

commit;

-- ---------------------------------------------------------------------
-- PASO 3 — DESPUÉS.
-- ---------------------------------------------------------------------
select codigo, nombre, grupo, orden, activo
from public.autorizacion_procesos
where codigo in ('inv_654', 'inv_309')
order by orden;

select p.nombre as perfil, pp.proceso
from public.autorizacion_perfil_procesos pp
join public.autorizacion_perfiles p on p.id = pp.perfil_id
where pp.proceso in ('inv_654', 'inv_309')
order by pp.proceso, p.nombre;
-- Esperado: los mismos perfiles para los dos códigos.

-- Quién tiene clave personal hoy y podría usar el 654 (los demás tendrán que crearla).
select u.nombre, u.email, pf.nombre as perfil
from public.autorizacion_usuario_perfiles up
join public.autorizacion_perfiles pf on pf.id = up.perfil_id
join public.usuarios u on u.id = up.usuario_id
where pf.id in (select perfil_id from public.autorizacion_perfil_procesos where proceso = 'inv_654')
order by pf.nombre, u.nombre;
