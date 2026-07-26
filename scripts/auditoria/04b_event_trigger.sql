-- =====================================================================
-- 04b_event_trigger.sql — cobertura AUTOMÁTICA de tablas FUTURAS.
-- Un event trigger que, al crear una tabla nueva en `public`, le adjunta
-- solo `trg_auditoria`. Así "auditar todo" se mantiene sin re-correr 04.
-- =====================================================================

create or replace function public.fn_auditoria_autoattach()
returns event_trigger
language plpgsql
as $$
declare
  obj record;
  tbl text;
  sch text;
begin
  for obj in select * from pg_event_trigger_ddl_commands() where command_tag = 'CREATE TABLE'
  loop
    -- object_identity viene como schema.tabla
    sch := split_part(obj.object_identity, '.', 1);
    tbl := split_part(obj.object_identity, '.', 2);
    if sch = 'public' and tbl not in ('auditoria', 'auditoria_modulos') then
      begin
        execute format('drop trigger if exists trg_auditoria on public.%I', tbl);
        execute format(
          'create trigger trg_auditoria after insert or update or delete on public.%I '
          'for each row execute function public.fn_auditoria()', tbl);
      exception when others then
        -- no bloquear la creación de la tabla si algo falla
        null;
      end;
    end if;
  end loop;
end;
$$;

drop event trigger if exists trg_auditoria_autoattach;
create event trigger trg_auditoria_autoattach
  on ddl_command_end
  when tag in ('CREATE TABLE')
  execute function public.fn_auditoria_autoattach();

-- =====================================================================
