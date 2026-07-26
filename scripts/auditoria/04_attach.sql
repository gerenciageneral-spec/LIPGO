-- =====================================================================
-- 04_attach.sql — adjunta el trigger de auditoría a TODAS las tablas base
-- de `public`, EXCEPTO la infraestructura de auditoría (evita recursión).
-- Idempotente (drop trigger if exists). Re-correr tras crear tablas nuevas
-- (o usar 04b_event_trigger para cubrir tablas futuras automáticamente).
-- =====================================================================

do $$
declare
  t record;
begin
  for t in
    select tablename
      from pg_tables
     where schemaname = 'public'
       and tablename not in ('auditoria', 'auditoria_modulos')
  loop
    execute format('drop trigger if exists trg_auditoria on public.%I', t.tablename);
    execute format(
      'create trigger trg_auditoria after insert or update or delete on public.%I '
      'for each row execute function public.fn_auditoria()', t.tablename);
  end loop;
end $$;

-- Verificación: cuántas tablas quedaron con el trigger.
-- select count(*) from information_schema.triggers where trigger_name = 'trg_auditoria';
-- =====================================================================
