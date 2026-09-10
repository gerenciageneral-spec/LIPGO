-- ============================================================================
-- VERIFICACIÓN DEL 59 — qué va a mostrar la Matriz Integrada
-- ----------------------------------------------------------------------------
-- Solo lecturas. Responde la pregunta práctica: al abrir la Matriz, ¿qué
-- numerales van a aparecer sustentados por un módulo, y cuáles van a quedar en
-- pendiente porque el módulo está vacío?
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1) EL CUADRO COMPLETO: mapeo + registros vivos + estado que tendrá la celda
-- ----------------------------------------------------------------------------
-- Esta es la consulta que importa. Reproduce en SQL la misma regla que aplica
-- lib/sig-actions.ts: con registros > 0 la celda queda «cargado» (medio avance);
-- con 0 queda «pendiente», porque un módulo declarado pero vacío no es
-- evidencia ante un auditor.
--
-- OJO: esto muestra el estado que aporta EL MÓDULO. Si la celda ya tenía un
-- documento aprobado, ese estado más fuerte se conserva (el código toma el
-- máximo de los dos), así que la celda real puede verse mejor que esta columna.

do $$
declare
  r record;
  n bigint;
begin
  raise notice '--------------------------------------------------------------';
  raise notice ' NUMERAL  | MODULO                          | REGS | CELDA';
  raise notice '--------------------------------------------------------------';
  for r in
    select req.numeral, m.modulo, m.tabla
    from public.sig_requisito_modulo m
    join public.sig_requisitos req on req.id = m.requisito_id
    where m.activo
    order by string_to_array(req.numeral, '.')::int[], m.modulo
  loop
    if r.tabla is null then
      raise notice ' % | % | s/t  | pendiente (sin tabla de conteo)',
        rpad(r.numeral, 8), rpad(r.modulo, 31);
    elsif to_regclass('public.' || r.tabla) is null then
      raise notice ' % | % |  --  | pendiente (TABLA NO EXISTE: %)',
        rpad(r.numeral, 8), rpad(r.modulo, 31), r.tabla;
    else
      execute format('select count(*) from public.%I', r.tabla) into n;
      raise notice ' % | % | % | %',
        rpad(r.numeral, 8), rpad(r.modulo, 31), lpad(n::text, 4),
        case when n > 0 then 'cargado (medio avance)' else 'PENDIENTE (modulo vacio)' end;
    end if;
  end loop;
  raise notice '--------------------------------------------------------------';
end $$;


-- ----------------------------------------------------------------------------
-- 2) ¿Los numerales de la semilla existen todos?
-- ----------------------------------------------------------------------------
-- El insert del 59 hace JOIN contra sig_requisitos.numeral. Si algún numeral no
-- existiera, esa fila se habría descartado EN SILENCIO. Deben ser 7.
select count(*) as mapeos_creados,
       case when count(*) = 7 then 'ok — los 7 de la semilla'
            else 'REVISAR — se esperaban 7' end as veredicto
from public.sig_requisito_modulo;

-- Si el conteo no da 7, esta consulta dice cuál falta:
select v.numeral as numeral_de_la_semilla_que_no_existe
from (values ('4.1'),('6.1.2'),('6.1.3'),('6.2'),('9.1'),('9.1.2'),('10.2')) as v(numeral)
where not exists (select 1 from public.sig_requisitos r where r.numeral = v.numeral);


-- ----------------------------------------------------------------------------
-- 3) ¿Hay duplicados? (la prueba de que los índices parciales funcionan)
-- ----------------------------------------------------------------------------
-- Debe devolver 0 filas. Si devuelve algo, los índices únicos parciales no se
-- crearon y el mismo módulo aparecerá repetido en la celda.
select requisito_id, modulo, count(*) as veces
from public.sig_requisito_modulo
where activo and norma_id is null
group by requisito_id, modulo
having count(*) > 1;


-- ----------------------------------------------------------------------------
-- 4) IMPACTO EN EL AVANCE — lo que hay que mirar antes de alarmarse
-- ----------------------------------------------------------------------------
-- Cuántos numerales mapeados quedan pendientes por módulo vacío. Si este número
-- es alto, el porcentaje de avance de la Matriz se verá más bajo que ayer: no
-- es un error, es que ahora se está midiendo algo que antes no se medía.
do $$
declare r record; n bigint; vacios int := 0; total int := 0;
begin
  for r in select distinct m.tabla from public.sig_requisito_modulo m
           where m.activo and m.tabla is not null loop
    if to_regclass('public.' || r.tabla) is not null then
      execute format('select count(*) from public.%I', r.tabla) into n;
      total := total + 1;
      if n = 0 then vacios := vacios + 1; end if;
    end if;
  end loop;
  raise notice 'Modulos mapeados con tabla: %. Vacios (dejan el numeral pendiente): %', total, vacios;
end $$;
