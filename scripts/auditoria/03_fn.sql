-- =====================================================================
-- 03_fn.sql — función trigger genérica de auditoría.
-- Robusta para CUALQUIER tabla: opera sobre to_jsonb(OLD/NEW), nunca
-- referencia columnas directas (soporta PK variable y tablas sin idempresa).
-- El ACTOR se lee del header HTTP `x-audit-user` que inyecta la app en
-- getSupabaseAdmin (con fallback al GUC app.audit_user por si algún día se
-- habilita db_pre_request). Sin actor → 'sistema'.
-- =====================================================================

create or replace function public.fn_auditoria()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  j_old    jsonb := case when TG_OP <> 'INSERT' then to_jsonb(OLD) else null end;
  j_new    jsonb := case when TG_OP <> 'DELETE' then to_jsonb(NEW) else null end;
  j_ref    jsonb := coalesce(j_new, j_old);
  v_actor  uuid;
  v_nombre text;
  v_emp    integer;
  v_regid  text;
  v_modulo text;
  v_desc   text;
  v_campos text[];
begin
  -- 1) Actor: header directo (robusto) con fallback a GUC pre-request.
  begin
    v_actor := nullif(
      coalesce(
        current_setting('request.headers', true)::json ->> 'x-audit-user',
        current_setting('app.audit_user', true)
      ), ''
    )::uuid;
  exception when others then
    v_actor := null;
  end;

  if v_actor is not null then
    select p.usuario into v_nombre from public.profiles p where p.id = v_actor;
  end if;
  v_nombre := coalesce(v_nombre, 'sistema');

  -- 2) PK del registro (probar nombres comunes en este repo).
  v_regid := coalesce(
    j_ref ->> 'id', j_ref ->> 'uuid', j_ref ->> 'usuario_id',
    j_ref ->> 'codigo', j_ref ->> 'cod'
  );

  -- 3) idempresa (varias convenciones de nombre).
  begin
    v_emp := nullif(coalesce(
      j_ref ->> 'idempresa', j_ref ->> 'id_empresa',
      j_ref ->> 'empresaid', j_ref ->> 'empresa_id'
    ), '')::integer;
  exception when others then
    v_emp := null;
  end;

  -- 4) Módulo (catálogo con fallback prettify).
  select m.modulo into v_modulo from public.auditoria_modulos m where m.tabla = TG_TABLE_NAME;
  v_modulo := coalesce(v_modulo, initcap(replace(TG_TABLE_NAME, '_', ' ')));

  -- 5) Descripción + campos cambiados.
  if TG_OP = 'INSERT' then
    v_desc := 'Creó registro';
  elsif TG_OP = 'DELETE' then
    v_desc := 'Eliminó registro';
  else
    select array_agg(key order by key) into v_campos
    from jsonb_each(j_new)
    where j_new -> key is distinct from j_old -> key
      and key <> 'updated_at';
    if v_campos is null or array_length(v_campos, 1) = 0 then
      return null; -- UPDATE no-op: no auditar
    end if;
    v_desc := 'Editó ' || array_length(v_campos, 1) || ' campo(s): ' ||
              array_to_string(v_campos[1:5], ', ') ||
              case when array_length(v_campos, 1) > 5 then '…' else '' end;
  end if;

  insert into public.auditoria
    (actor_id, actor_nombre, idempresa, modulo, tabla, operacion,
     registro_id, descripcion, antes, despues, campos_cambiados)
  values
    (v_actor, v_nombre, v_emp, v_modulo, TG_TABLE_NAME, TG_OP,
     v_regid, v_desc, j_old, j_new, v_campos);

  return null; -- AFTER trigger
end;
$$;

-- =====================================================================
