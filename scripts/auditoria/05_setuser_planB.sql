-- =====================================================================
-- 05_setuser_planB.sql — SOLO si el header `x-audit-user` NO llega al
-- trigger (p. ej. si el gateway lo filtra). El trigger ya lee este GUC como
-- fallback, así que activar el Plan B NO requiere tocar la función.
--
-- Activación (si aplica): tras resolver el uuid en getSupabaseAdmin, llamar
--   await client.rpc('set_audit_user', { p_uuid: <uuid> })
-- al inicio de cada request de escritura (un round-trip extra por request).
-- =====================================================================

create or replace function public.set_audit_user(p_uuid uuid)
returns void
language plpgsql
security definer
as $$
begin
  perform set_config('app.audit_user', coalesce(p_uuid::text, ''), false);
end;
$$;

-- =====================================================================
