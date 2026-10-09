
-- =====================================================================
-- 271_inv_701_aprobar.sql
--
-- El sobrante de inventario (701) pasa a necesitar aprobación de la gerencia del proyecto,
-- igual que su pareja el faltante (702).
--
-- Gerencia, 2026-10-08: "los códigos 701 y 702 solo se habilitan para los cierres de
-- inventario, antes no se deben usar" → y al ver que el 702 ya pasaba por aprobación:
-- "perfecto, si el 701 y el 702 ya están por aprobación de gerencia, déjalo".
--
-- POR QUÉ HACÍA FALTA: el 702 (que BAJA inventario) ya estaba en la cola de aprobación desde
-- el SQL 62. El 701 (que lo SUBE) se aplicaba de una, sin que nadie lo viera: era el único
-- código capaz de inventar existencias sin control. Medido el 2026-10-08: de 760 movimientos
-- 701/702 en la historia, 432 se hicieron a mano fuera de un cierre.
--
-- ES PURAMENTE ADITIVO: registra un proceso de autorización nuevo y lo asigna a los MISMOS
-- perfiles que ya aprueban el 702 (Gerencia de proyecto y Coordinador LIP; Gerencia General
-- LIPgo los tiene todos por regla). No cambia ningún permiso existente, no toca inventario,
-- no toca ninguna clave. Idempotente.
--
-- ORDEN: este script va ANTES de que se publique el cambio de código. Si el código llegara
-- primero, un 701 pediría una autorización que todavía no existe y fallaría.
-- =====================================================================

-- ---------------------------------------------------------------------
-- PASO 1 — ANTES.
-- ---------------------------------------------------------------------
select codigo, nombre, grupo, orden, activo
from public.autorizacion_procesos
where codigo in ('inv_701_aprobar', 'inv_702_aprobar')
order by codigo;
-- Esperado: solo inv_702_aprobar.

select p.nombre as perfil, pp.proceso
from public.autorizacion_perfil_procesos pp
join public.autorizacion_perfiles p on p.id = pp.perfil_id
where pp.proceso in ('inv_701_aprobar', 'inv_702_aprobar')
order by p.nombre, pp.proceso;

-- ---------------------------------------------------------------------
-- PASO 2 — EL PROCESO Y SUS PERFILES.
-- ---------------------------------------------------------------------
begin;

insert into public.autorizacion_procesos (codigo, nombre, descripcion, grupo, orden, con_alcance)
values (
  'inv_701_aprobar',
  'Aprobar sobrante de inventario (701)',
  'Aprobar o rechazar en "Aprobaciones pendientes" un sobrante de conteo. Igual que el faltante (702): nadie sube inventario sin que la gerencia del proyecto lo vea.',
  'Inventario',
  33,
  true
)
on conflict (codigo) do nothing;

-- Los MISMOS perfiles que ya aprueban el 702, para no inventar una regla nueva.
insert into public.autorizacion_perfil_procesos (perfil_id, proceso)
select p.id, 'inv_701_aprobar'
from public.autorizacion_perfiles p
where p.nombre in ('Gerencia General LIPgo', 'Gerencia de proyecto', 'Coordinador LIP')
on conflict do nothing;

do $comprobar$
declare
  v_proc int;
  v_701  int;
  v_702  int;
begin
  select count(*) into v_proc from public.autorizacion_procesos where codigo = 'inv_701_aprobar' and activo;
  if v_proc <> 1 then
    raise exception 'No quedó registrado el proceso inv_701_aprobar: se deshace todo.';
  end if;

  select count(*) into v_701 from public.autorizacion_perfil_procesos where proceso = 'inv_701_aprobar';
  select count(*) into v_702 from public.autorizacion_perfil_procesos where proceso = 'inv_702_aprobar';
  if v_701 < v_702 then
    raise exception 'El 701 quedó asignado a % perfiles y el 702 a %: deberían ser los mismos. Se deshace todo.', v_701, v_702;
  end if;

  raise notice 'LISTO. inv_701_aprobar registrado y asignado a % perfiles (el 702 tiene %).', v_701, v_702;
end
$comprobar$;

commit;

-- ---------------------------------------------------------------------
-- PASO 3 — DESPUÉS.
-- ---------------------------------------------------------------------
select codigo, nombre, grupo, orden, activo
from public.autorizacion_procesos
where codigo in ('inv_701_aprobar', 'inv_702_aprobar')
order by orden;

select p.nombre as perfil, pp.proceso
from public.autorizacion_perfil_procesos pp
join public.autorizacion_perfiles p on p.id = pp.perfil_id
where pp.proceso in ('inv_701_aprobar', 'inv_702_aprobar')
order by pp.proceso, p.nombre;
-- Esperado: los mismos perfiles para los dos códigos.
