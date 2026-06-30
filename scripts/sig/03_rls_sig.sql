-- =====================================================================
-- SIG - Quitar RLS a las tablas del modulo para que el rol de la app
-- (anon / authenticated) pueda leerlas/escribirlas directamente.
-- OPCIONAL: las server actions del SIG ya usan service role (getSupabaseAdmin),
-- asi que el modulo funciona aunque NO corras esto. Ejecutalo solo si quieres
-- que esas tablas sean accesibles tambien con la anon key.
-- Idempotente y seguro de re-ejecutar.
-- =====================================================================

alter table public.sig_normas             disable row level security;
alter table public.sig_requisitos         disable row level security;
alter table public.sig_requisito_norma    disable row level security;
alter table public.sig_documento_cobertura disable row level security;

-- Asegurar privilegios de tabla para los roles de la API (por si faltaran).
grant select, insert, update, delete on
  public.sig_normas,
  public.sig_requisitos,
  public.sig_requisito_norma,
  public.sig_documento_cobertura
  to anon, authenticated;

-- Secuencias (id serial) para permitir inserts desde esos roles.
grant usage, select on all sequences in schema public to anon, authenticated;
