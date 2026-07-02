-- =====================================================================
-- 43 · Perfil Sociodemográfico (SST-FOR-32)
-- Censo sociodemográfico de colaboradores (SG-SST / ISO 45001 / Res. 0312):
-- base para análisis y priorización de programas (vigilancia, estilos de vida).
-- Aditivo e idempotente. Correr en Supabase.
-- =====================================================================

create table if not exists public.sst_perfil_sociodemografico (
  id serial primary key,
  idempresa int not null,
  estado text default 'activo',        -- activo | retirado
  documento_tipo   text,
  documento        text,
  nombres          text,
  apellidos        text,
  fecha_nacimiento text,
  edad             int,
  sexo             text,
  eps              text,
  afp              text,
  arl              text,
  centro_trabajo   text,
  turno            text,
  cargo            text,
  fecha_ingreso    text,
  fecha_retiro     text,
  pais_nacimiento  text,
  depto_nacimiento text,
  municipio_residencia text,
  grupo_etnico     text,
  nivel_escolaridad text,
  estado_civil     text,
  cabeza_familia   text,
  num_hijos        int,
  personas_hogar   int,
  ingresos_familiares text,
  tipo_vivienda    text,
  caracteristicas_vivienda text,
  zona             text,
  direccion        text,
  transporte       text,
  estrato          text,
  consume_alcohol  text,
  actividad_fisica text,
  fumador          text,
  marca_temporal   text,
  created_at timestamptz default now()
);
create index if not exists idx_perfil_sd_empresa on public.sst_perfil_sociodemografico (idempresa);

-- La app lee con la llave anon/auth → se lee con cliente admin en el server action,
-- pero además se desactiva RLS por consistencia con las demás tablas SST.
alter table public.sst_perfil_sociodemografico disable row level security;

-- Permiso propio (columna-por-permiso en permisos_usuarios)
alter table public.permisos_usuarios add column if not exists sst_perfil boolean default false;
update public.permisos_usuarios
   set sst_perfil = true
 where coalesce(sst_incidentes, false) or coalesce(sig_matriz, false);

-- =====================================================================
-- FIN. Módulo Certificaciones → ISO 45001 / 0312 → Perfil Sociodemográfico.
-- =====================================================================
