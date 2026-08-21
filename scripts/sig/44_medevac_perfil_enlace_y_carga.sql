-- =====================================================================
-- 44 · MEDEVAC + Perfil Sociodemografico: enlace por documento y recarga
--
-- QUE HACE, EN ORDEN:
--   1. Respalda sst_medevac y sst_perfil_sociodemografico antes de tocarlas.
--   2. Agrega la llave de enlace `documento_norm` a las dos tablas. Es el
--      documento sin puntos, espacios ni guiones y en mayuscula: es lo que
--      amarra MEDEVAC <-> Perfil <-> headcount <-> portal del trabajador.
--   3. Agrega columnas de rastro (origen, actualizado_en, actualizado_por) y
--      de control de calidad (requiere_revision, revision_nota).
--   4. Deja UNA fila por persona (indice unico) conservando la mas reciente.
--   5. Crea la vista vw_sst_datos_colaborador, que responde de un vistazo
--      quien tiene MEDEVAC, quien tiene Perfil y a quien le falta.
--   6. Recarga las 67 filas del CSV del formulario (upsert por documento).
--
-- ES ADITIVO E IDEMPOTENTE: se puede correr varias veces. Correr en Supabase.
--
-- TRATAMIENTO DE LOS DATOS DEL CSV (decidido con el negocio):
--   · Nombres: se recortan los espacios sobrantes y los dobles espacios.
--   · Telefonos: se les quitan espacios y guiones (formato, no dato). Si no
--     quedan 10 digitos, el numero se conserva TAL CUAL y la fila se marca.
--   · Alergias "No" se unifican a "Ninguna": si no se hiciera, el indicador de
--     alergias del modulo contaria a esa persona como alergica.
--   · Correos que no son correos ("No", "Ote") quedan VACIOS y marcados.
--   · La fila de Contento Riveros trae una formula de Excel rota en Cargo y
--     Centro de trabajo. NO se adivina que decia: los campos quedan vacios y
--     la fila queda marcada para que SST la digite.
--   · No se importan las columnas N° ni "Marca temporal" del CSV.
--
-- idempresa = 100 (LIP / ADMINISTRATIVO). SST es transversal en esta app: los
-- server actions listan MEDEVAC y Perfil SIN filtrar por proyecto, asi que el
-- centro de trabajo real vive en `centro_trabajo`, no en `idempresa`.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) RESPALDO. Si algo sale mal, los datos anteriores siguen aqui.
-- ---------------------------------------------------------------------
do $$
begin
  if to_regclass('public.sst_medevac_backup_44') is null then
    create table public.sst_medevac_backup_44 as select * from public.sst_medevac;
    raise notice 'Respaldo creado: sst_medevac_backup_44 (% filas)',
      (select count(*) from public.sst_medevac_backup_44);
  else
    raise notice 'sst_medevac_backup_44 ya existe, no se sobrescribe.';
  end if;

  if to_regclass('public.sst_perfil_sd_backup_44') is null then
    create table public.sst_perfil_sd_backup_44 as select * from public.sst_perfil_sociodemografico;
    raise notice 'Respaldo creado: sst_perfil_sd_backup_44 (% filas)',
      (select count(*) from public.sst_perfil_sd_backup_44);
  end if;
end $$;

-- ---------------------------------------------------------------------
-- 2) LLAVE DE ENLACE + COLUMNAS DE RASTRO Y CALIDAD
--
-- `documento_norm` es una columna GENERADA: Postgres la mantiene sola y
-- rechaza que se le escriba. Por eso la app nunca debe mandarla en un insert.
--
-- Devuelve NULL (no cadena vacia) cuando no hay documento, a proposito: asi el
-- indice unico de abajo puede ser NORMAL en vez de parcial. Es deliberado --
-- PostgREST genera ON CONFLICT sin el predicado del indice, de modo que un
-- indice unico PARCIAL haria fallar el guardado desde la app con
-- "there is no unique or exclusion constraint matching the ON CONFLICT".
-- ---------------------------------------------------------------------
alter table public.sst_medevac
  add column if not exists documento_norm text
    generated always as (nullif(upper(regexp_replace(coalesce(documento,''), '[^0-9A-Za-z]', '', 'g')), '')) stored,
  add column if not exists origen            text,
  add column if not exists actualizado_en    timestamptz,
  add column if not exists actualizado_por   text,
  add column if not exists requiere_revision boolean default false,
  add column if not exists revision_nota     text;

alter table public.sst_perfil_sociodemografico
  add column if not exists documento_norm text
    generated always as (nullif(upper(regexp_replace(coalesce(documento,''), '[^0-9A-Za-z]', '', 'g')), '')) stored,
  add column if not exists origen          text,
  add column if not exists actualizado_en  timestamptz,
  add column if not exists actualizado_por text;

-- ---------------------------------------------------------------------
-- 3) UNA FILA POR PERSONA
--
-- Antes de poder hacer upsert por documento hay que garantizar que no haya
-- duplicados. Se conserva la fila de `id` mas alto (la mas reciente) y las
-- demas se mueven a una tabla aparte: no se borran.
-- ---------------------------------------------------------------------
create table if not exists public.sst_medevac_duplicados_44
  (like public.sst_medevac including defaults excluding generated);

do $$
declare n int;
begin
  insert into public.sst_medevac_duplicados_44
  select m.* from public.sst_medevac m
   where m.id in (
     select id from (
       select id, row_number() over (partition by documento_norm order by id desc) as rn
         from public.sst_medevac where documento_norm is not null
     ) d where d.rn > 1
   );
  get diagnostics n = row_count;

  delete from public.sst_medevac where id in (
    select id from (
      select id, row_number() over (partition by documento_norm order by id desc) as rn
        from public.sst_medevac where documento_norm is not null
    ) d where d.rn > 1
  );
  raise notice 'MEDEVAC: % filas duplicadas movidas a sst_medevac_duplicados_44', n;
end $$;

create unique index if not exists ux_sst_medevac_documento
  on public.sst_medevac (documento_norm);

create table if not exists public.sst_perfil_sd_duplicados_44
  (like public.sst_perfil_sociodemografico including defaults excluding generated);

do $$
declare n int;
begin
  insert into public.sst_perfil_sd_duplicados_44
  select p.* from public.sst_perfil_sociodemografico p
   where p.id in (
     select id from (
       select id, row_number() over (partition by documento_norm order by id desc) as rn
         from public.sst_perfil_sociodemografico where documento_norm is not null
     ) d where d.rn > 1
   );
  get diagnostics n = row_count;

  delete from public.sst_perfil_sociodemografico where id in (
    select id from (
      select id, row_number() over (partition by documento_norm order by id desc) as rn
        from public.sst_perfil_sociodemografico where documento_norm is not null
    ) d where d.rn > 1
  );
  raise notice 'Perfil SD: % filas duplicadas movidas a sst_perfil_sd_duplicados_44', n;
end $$;

create unique index if not exists ux_sst_perfil_sd_documento
  on public.sst_perfil_sociodemografico (documento_norm);

-- ---------------------------------------------------------------------
-- 4) LA VISTA QUE ENLAZA TODO
--
-- Parte del headcount (la fuente de verdad de quien trabaja aqui) y le pega
-- MEDEVAC y Perfil por documento. Responde: quien tiene sus datos completos,
-- a quien le falta cual, y que le falta exactamente.
--
-- "completo" para MEDEVAC = lo minimo que sirve en una emergencia real: RH,
-- alergias, EPS y un contacto con telefono. El resto es deseable, no critico.
-- ---------------------------------------------------------------------
create or replace view public.vw_sst_datos_colaborador as
with hc as (
  select nullif(upper(regexp_replace(coalesce(identificacion,''), '[^0-9A-Za-z]', '', 'g')), '') as documento_norm,
         identificacion, nombre, cargo, idempresa, estado
    from public.headcount
)
select
  hc.documento_norm,
  hc.identificacion,
  hc.nombre,
  hc.cargo               as cargo_headcount,
  hc.idempresa,
  hc.estado,
  (m.id is not null)     as tiene_medevac,
  (p.id is not null)     as tiene_perfil,
  m.centro_trabajo,
  m.rh,
  m.eps,
  m.arl,
  coalesce(m.requiere_revision, false) as medevac_requiere_revision,
  m.revision_nota                      as medevac_revision_nota,
  m.actualizado_en                     as medevac_actualizado_en,
  p.actualizado_en                     as perfil_actualizado_en,
  (m.id is not null
   and nullif(trim(m.rh), '')                is not null
   and nullif(trim(m.alergias), '')          is not null
   and nullif(trim(m.eps), '')               is not null
   and nullif(trim(m.contacto_nombre), '')   is not null
   and nullif(trim(m.contacto_telefono), '') is not null
  ) as medevac_completo,
  (p.id is not null
   and nullif(trim(p.fecha_nacimiento), '')  is not null
   and nullif(trim(p.sexo), '')              is not null
   and nullif(trim(p.nivel_escolaridad), '') is not null
   and nullif(trim(p.estado_civil), '')      is not null
   and nullif(trim(p.tipo_vivienda), '')     is not null
  ) as perfil_completo
from hc
left join public.sst_medevac m                  on m.documento_norm = hc.documento_norm
left join public.sst_perfil_sociodemografico p  on p.documento_norm = hc.documento_norm
where hc.documento_norm is not null;

-- ---------------------------------------------------------------------
-- 5) RECARGA DE LAS 67 FILAS DEL CSV
--
-- Upsert por documento: al que ya esta se le actualizan los campos, al que no
-- esta se le crea la fila. NO borra a nadie que ya estuviera en MEDEVAC y no
-- venga en el CSV: la consulta 3 de verificacion los lista para decidir.
-- ---------------------------------------------------------------------
with csv (documento, documento_tipo, nombres, cargo, centro_trabajo, celular, alergias, rh, arl, eps,
          contacto_nombre, contacto_telefono, contacto_parentesco, email, mes_cumple,
          requiere_revision, revision_nota) as (
values
  ('1049945704', 'Cedula de ciudadanía', 'Mendoza Padilla Raúl Enrique', 'Auxiliar Logistico', 'CEDI FUNZA', '3217166797', 'Ninguna', 'O+', 'Sura', 'Mutualser', 'Brilli urtado', '3126567493', 'Madre', 'medozaraul0623@gmail.com', 'Septiembre', false, null),
  ('1073155377', 'Cedula de ciudadanía', 'Contento Riveros Yull Alexander', null, null, '3116439818', 'Ninguna', 'A+', 'Sura', 'Famisanar', 'Marina riveros', '3212020071', 'Madre', 'Yullcr1988@gmail.com', 'Julio', true, 'Cargo llegó con una fórmula de Excel rota en el formulario original · Centro de trabajo llegó con una fórmula de Excel rota en el formulario original'),
  ('1002319848', 'Cedula de ciudadanía', 'Barrera Batista Ander Fabián', 'Coordinador de operaciones', 'CEDI FUNZA', '3112393689', 'Ninguna', 'A-', 'Sura', 'Famisanar', 'Yeliz lozano', '3003140931', 'Esposa', 'barreraanderfabian@gmail.com', 'Marzo', false, null),
  ('1069504611', 'Cedula de ciudadanía', 'Oviedo Martínez Arnaldo Jose', 'Auxiliar Logistico', 'CEDI MEDELLIN', '3014577785', 'Ninguna', 'O+', 'Sura', 'Sura eps', 'Leonor Martínez lopez', '3104436350', 'Madre', 'oarnaldo271@gmail.com', 'Noviembre', false, null),
  ('1007206556', 'Cedula de ciudadanía', 'Berrío Básquet Victor Manuel', 'Auxiliar Logistico', 'CEDI FUNZA', '3203175355', 'Ninguna', 'O+', 'Sura', 'Famisanar', 'Yaleidis herera caballero', '3134919709', 'Esposa', 'Victorberrioberriovasques@gmail.com', 'Marzo', false, null),
  ('1193431838', 'Cedula de ciudadanía', 'Villalobos Martinez Giovanni', 'Auxiliar Logistico', 'CEDI FUNZA', '3108058711', 'Ninguna', 'O+', 'Sura', 'Salud Total', 'Yusdaris berrio', '3023151074', 'Esposa', 'Giovannidejesusbillalobo@gmail.com', 'Marzo', false, null),
  ('6679516', 'Permiso por protección temporal', 'Escalona Olmos Jesús David', 'Auxiliar Logistico', 'CEDI MEDELLIN', '3009542770', 'Ninguna', 'O-', 'Sura', 'Nueva eps S.A.', 'Lucimar Marquez', '3117145266', 'Prima', 'escalonaolmosjesusdavid02@gmail.com', 'Abril', false, null),
  ('1042457110', 'Cedula de ciudadanía', 'Zambrano De Moya Luis Angel', 'Auxiliar Logistico', 'AVIMOL', '3016252700', 'Ninguna', 'B+', 'Sura', 'Salud Total', 'Luz estela de moya', '3012257401', 'Madre', 'lz8150583@gmail.com', 'Octubre', false, null),
  ('80027128', 'Cedula de ciudadanía', 'Jiménez Solano Yilfred', 'Gerente General', 'ADMINISTRATIVO', '3202343157', 'Ninguna', 'B+', 'Sura', 'Sura eps', 'Manuela Merchan', '3112503362', 'Esposa', 'gerenciageneral@lip-sas.com', 'Julio', false, null),
  ('1094951357', 'Cedula de ciudadanía', 'Merchán Jiménez Manuela', 'Gerente comercial', 'ADMINISTRATIVO', '3112503362', 'Clindamicina dipirona, gatos, ácaros, y pasto', 'AB+', 'Sura', 'Sura eps', 'Yilfred Jiménez', '3202343157', 'Esposo', 'manuelamerchanj@gmail.com', 'Septiembre', false, null),
  ('1033373410', 'Cedula de ciudadanía', 'Agamez Florez Manuel Alberto', 'Operario de montacarga', 'CEDI FUNZA', '3175424531', 'Ninguna', 'O+', 'Sura', 'Famisanar', 'Ana Mendoza', '3202953886', 'Esposa', 'agamezmanuel2014@gmail.com', 'Septiembre', false, null),
  ('1048285137', 'Cedula de ciudadanía', 'Jiménez Suarez Habid Rafael', 'Operario de montacarga', 'HARINERA INDUPAN', '3219105213', 'Ninguna', 'O+', 'Sura', 'Salud Total', 'islanyer valencia', '3214025784', 'Esposa', 'Havidjimenez7@gmail.com', 'Octubre', false, null),
  ('1101464336', 'Cedula de ciudadanía', 'Cabello Julio Arleis Jesús', 'Auxiliar Logistico', 'HARINERA INDUPAN', '3224224311', 'Ninguna', 'O+', 'Sura', 'Sanitas', 'Ana Isabel juli', '3204866290', 'Esposa', 'arleycabello8@gmail.com', 'Noviembre', false, null),
  ('1000442265', 'Cedula de ciudadanía', 'Restrepo Laverde Yerson Estiven', 'Auxiliar Logistico', 'CEDI MEDELLIN', '3244756893', 'Ninguna', 'O+', 'Sura', 'Salud Total', 'Liliana', '3137349772', 'Esposa', 'stiven18restrepo@gmail.com', 'Septiembre', false, null),
  ('72434584', 'Cedula de ciudadanía', 'Vargas Zambrano Alveiro Elias', 'Auxiliar Logistico', 'HARINERA INDUPAN', '3011309151', 'Ninguna', 'O+', 'Sura', 'Salud Total', 'Marilin Villarreal', '3011309151', 'Esposa', 'villarrealmarily58@gmail.com', 'Junio', false, null),
  ('1005472020', 'Cedula de ciudadanía', 'Berrio Blanco Luis Eduardo', 'Auxiliar Logistico', 'HARINERA INDUPAN', '3123481693', 'Ninguna', 'B+', 'Sura', 'Salud Total', 'Julio cesar berrio blanco', '3112914022', 'Hermano', 'Berrioluis197@gmail.com', 'Marzo', false, null),
  ('1193510194', 'Cedula de ciudadanía', 'Castillo Antoni Miguel', 'Auxiliar Logistico', 'HARINERA INDUPAN', '3001369553', 'Ninguna', 'B+', 'Sura', 'Compensar', 'María del Carmen Castillo Montaño', '3107574944', 'Madre', null, 'Mayo', true, 'Correo "No" no es válido'),
  ('1026563725', 'Cedula de ciudadanía', 'Welgos Montero Felix Mauricio', 'Operario de montacarga', 'HARINERA INDUPAN', '3106088878', 'Ninguna', 'O+', 'Sura', 'Salud Total', 'Delio welgos', '3143382478', 'Hermano', 'mauro.montero1610@gmail.com', 'Febrero', false, null),
  ('1000221742', 'Cedula de ciudadanía', 'Parra Ossa Deivid Daniel', 'Operario de montacarga', 'HARINERA INDUPAN', '3008636839', 'Ninguna', 'O+', 'Sura', 'Salud Total', 'Luz Aira Ossa', '3042718304', 'Madre', 'deividparra9@gmail.com', 'Marzo', false, null),
  ('1003097095', 'Cedula de ciudadanía', 'Deiver López De La Rosa', 'Auxiliar Logistico', 'CEDI MEDELLIN', '3207919088', 'Ninguna', 'B+', 'Sura', 'Nueva eps S.A.', 'Rosa María shmi', '3135843338', 'Esposa', 'deiverlopez123@hotmeil.com', 'Marzo', false, null),
  ('1047488881', 'Cedula de ciudadanía', 'Coneo Herrera Edgar Miguel', 'Auxiliar Logistico', 'CEDI MEDELLIN', '3043189332', 'Ninguna', 'O+', 'Sura', 'Coosalud', 'Yadira herrera', '3145002847', 'Padre', 'Edgar151996@hotmail.com', 'Junio', false, null),
  ('1016101109', 'Cedula de ciudadanía', 'Castro Alejo Michael Josias', 'Coordinador SST', 'ADMINISTRATIVO', '3135733920', 'Ninguna', 'O+', 'Sura', 'Salud Total', 'Josias Castro', '3135733920', 'Padre', 'maicol9805@gmail.com', 'Febrero', false, null),
  ('1052971002', 'Cedula de ciudadanía', 'Medina Gomez Casseres Karina', 'Gerente sst', 'ADMINISTRATIVO', '3043916976', 'Almendra', 'O+', 'Sura', 'Sura eps', 'Arnold Manjarres', '3182103278', 'Esposo', 'Ing.karina.medina.gomez@gmail.com', 'Enero', false, null),
  ('1004504508', 'Cedula de ciudadanía', 'Truyol Caballero Yair de Jesús', 'Auxiliar Logistico', 'AVIMOL', '3225399736', 'Ninguna', 'B+', 'Sura', 'Salud Total', 'Kleny truyol caballero', '3004229139', 'Hermana', 'yairtruyolcaballero@gmail.com', 'Febrero', false, null),
  ('85084470', 'Cedula de ciudadanía', 'Flórez García Jhon Jairo', 'Auxiliar Logistico', 'AVIMOL', '3117034685', 'Ninguna', 'A+', 'Sura', 'Salud Total', 'Milagro Sandoval', '3117034685', 'Esposa', 'yese231817@gmail.com', 'Marzo', false, null),
  ('1001871824', 'Cedula de ciudadanía', 'De León García Luis Antonio', 'Auxiliar Logistico', 'AVIMOL', '3042881998', 'Ninguna', 'O-', 'Sura', 'Salud Total', 'Andrea Marcela Padilla ferrer esposa', '3042687146', 'Esposa', 'padillaferrerandreamarcela@gmail.com', 'Septiembre', false, null),
  ('1042441053', 'Cedula de ciudadanía', 'Altamar Cuadrado Richard Andres', 'Auxiliar Logistico', 'AVIMOL', '3012689699', 'Ninguna', 'O-', 'Sura', 'Salud Total', 'María Elena Gaviria', '3015776502', 'Esposa', 'Richardaltamar28@gmail.com', 'Marzo', false, null),
  ('72266920', 'Cedula de ciudadanía', 'Villalobos Orozco Antonio Luis', 'Auxiliar Logistico', 'AVIMOL', '3226465556', 'Ninguna', 'AB+', 'Sura', 'Sura eps', 'Giselle cantillo', '3238053811', 'Esposa', 'avillalobos.1270@gmail.com', 'Enero', false, null),
  ('1043139276', 'Cedula de ciudadanía', 'Orozco Barcasnegra Armando De Jesus', 'Auxiliar Logistico', 'AVIMOL', '3244150269', 'Ninguna', 'O+', 'Sura', 'Mutualser', 'Kenia paola borrero gomez', '3236716830', 'Esposa', 'Kenyapaola62@gmail.com', 'Abril', false, null),
  ('1043139748', 'Cedula de ciudadanía', 'De La Hoz Camargo Danilo Jose', 'Auxiliar Logistico', 'AVIMOL', '3108732628', 'Ninguna', 'AB-', 'Sura', 'Sura eps', 'Miriam Camargo', '3146908599', 'Madre', 'DelahozCamargoDanilojose@hogmai.com', 'Diciembre', false, null),
  ('1007962505', 'Cedula de ciudadanía', 'Martínez Mercado Jhon Jairo', 'Auxiliar Logistico', 'HARINERA INDUPAN', '3202471022', 'Ninguna', 'A+', 'Sura', 'Salud Total', 'Paulina mercado', '3116663437', 'Madre', 'martinez.jj.m2022@gmail.com', 'Mayo', false, null),
  ('1050952664', 'Cedula de ciudadanía', 'Castro Beltrán Ivan Andrés', 'Auxiliar Logistico', 'HARINERA INDUPAN', '3208317618', 'Ninguna', 'AB+', 'Sura', 'Salud Total', 'Elis Liliana Amaris Caro', '32132262', 'Esposa', 'jeferbeltran04@gmail.com', 'Julio', true, 'Teléfono del contacto "32132262" no tiene 10 dígitos'),
  ('1002093492', 'Cedula de ciudadanía', 'Ojito Sarabia Carlos Daniel', 'Auxiliar Logistico', 'HARINERA INDUPAN', '30212276031', 'Ninguna', 'A+', 'Sura', 'Salud Total', 'Madre', '3007791003', 'Padre', 'danielojito98@gmail.com', 'Noviembre', true, 'Celular "30212276031" no tiene 10 dígitos'),
  ('1140816546', 'Cedula de ciudadanía', 'Donado Mejia Mac Donald', 'Coordinador de operaciones', 'ADMINISTRATIVO', '3158508642', 'Ninguna', 'O+', 'Sura', 'Sura eps', 'RITA GRACIELA MEJIA SUAREZ', '3043710752', 'Madre', 'mdonado9@gmail.com', 'Febrero', false, null),
  ('1131479081', 'Cedula de ciudadanía', 'Cristo Ramirez Juvenal', 'Operario de montacarga', 'HARINERA INDUPAN', '3116123808', 'Ninguna', 'A+', 'Sura', 'Mutualser', 'Cristo', '3019396298', 'Padre', 'juvnalcristoramirezjuvenal710@gmail.com', 'Febrero', false, null),
  ('1092338456', 'Cedula de ciudadanía', 'Fonseca Suarez Yeferson Arley', 'Auxiliar Logistico', 'POSTOBON CUCUTA', '3104436978', 'Ninguna', 'A+', 'Sura', 'Nueva eps S.A.', 'Fonseca', '3104436978', 'Hermano', 'yeferfonseca2005@gmail.com', 'Julio', false, null),
  ('1131494159', 'Cedula de ciudadanía', 'Castro Palomino Osvaldo', 'Auxiliar Logistico', 'HARINERA INDUPAN', '3108534454', 'Ninguna', 'O+', 'Sura', 'Mutualser', 'Indira Ayos', '3133215181', 'Esposa', 'palominoosbaldo39@gamil.com', 'Abril', false, null),
  ('1005472692', 'Cedula de ciudadanía', 'Sandoval Zuniga Cristian Andres', 'Auxiliar Logistico', 'HARINERA INDUPAN', '3009892313', 'Ninguna', 'O+', 'Sura', 'Salud Total', 'Leysa Bello', '3247407403', 'Esposa', 'crissandoval2025@gmail.com', 'Junio', false, null),
  ('98074100', 'Cedula de ciudadanía', 'Lopez Velasquez Carlos Armando', 'Auxiliar Logistico', 'HARINERA INDUPAN', '3233323639', 'Ninguna', 'O+', 'Sura', 'Coolsanitas', 'Leidy Chaparro', '3118593347', 'Esposa', 'carloslopezvelasquez@gmail.com', 'Enero', false, null),
  ('80075406', 'Cedula de ciudadanía', 'Jimenez Rodriguez Jeffrey Joel', 'Representante Legal', 'ADMINISTRATIVO', '3205013218', 'Ninguna', 'O+', 'Sura', 'Sanitas', 'Sol Gomez', '3007657144', 'Esposa', 'gerenciaoperaciones@lip-sas.com', 'Julio', false, null),
  ('72260522', 'Cedula de ciudadanía', 'Sanchez Mora Brian Jose', 'Coordinador de operaciones', 'ADMINISTRATIVO', '3143177368', 'Ninguna', 'O+', 'Sura', 'Salud Total', 'yolanda mejia coronado', '3143177368', 'Esposa', 'bbriansa1981@gmail.com', 'Abril', false, null),
  ('1033712312', 'Cedula de ciudadanía', 'Rubiano Flautero Fabio Nelson', 'Auxiliar Logistico', 'CEDI FUNZA', '3213740988', 'Ninguna', 'O+', 'Sura', 'Salud Total', 'Juan ordóñez', '3157122957', 'Cuñado', 'nelsonflautero390@gmail.com', 'Julio', false, null),
  ('1143463545', 'Cedula de ciudadanía', 'Aragón Jiménez Andrés Antonio', 'Auxiliar Logistico', 'AVIMOL', '3016128970', 'Ninguna', 'O+', 'Sura', 'Sura eps', 'Aylin yineth barranco peñate', '3243552120', 'Esposa', 'aragonandres600@gmail.com', 'Abril', false, null),
  ('1007517624', 'Cedula de ciudadanía', 'Murillo Peñate Pedro Luis', 'Auxiliar Logistico', 'AVIMOL', '3225326581', 'Ninguna', 'O+', 'Sura', 'Salud Total', 'Erika paola florez teran', '3107092394', 'Esposa', 'Florezalizander24@gmail.com', 'Agosto', false, null),
  ('1043586682', 'Cedula de ciudadanía', 'Cueto Mesino Alexander', 'Auxiliar Logistico', 'HARINERA INDUPAN', '3045252672', 'Ninguna', 'B+', 'Sura', 'Salud Total', 'Maribel Mesino', '3017754285', 'Madre', 'alexandercueto846@gmail.com', 'Septiembre', false, null),
  ('1082856423', 'Cedula de ciudadanía', 'Pérez Pérez Danilo Enrique', 'Auxiliar Logistico', 'HARINERA INDUPAN', '3237927261', 'Ninguna', 'A+', 'Sura', 'Sanitas', 'Hermen Pérez', '310883667', 'Primo', 'enriquedanilo093@gmail.com', 'Febrero', true, 'Teléfono del contacto "310883667" no tiene 10 dígitos'),
  ('1143460868', 'Cedula de ciudadanía', 'De La Rosa Escorcia Anderson Miller', 'Auxiliar Logistico', 'AVIMOL', '3245079977', 'Ninguna', 'A+', 'Sura', 'Mutualser', 'Denis escorcia', '3152286891', 'Madre', 'Mullerdelarosa123@gmail.com', 'Junio', false, null),
  ('8567646', 'Cedula de ciudadanía', 'Rodriguez Manjares Armando Cesar', 'Auxiliar Logistico', 'AVIMOL', '3016139349', 'Ninguna', 'O+', 'Sura', 'Salud Total', 'Marlenis Moreno Guerrero', '3016139349', 'Esposa', 'armandocesar0301@gmail.com', 'Enero', false, null),
  ('1001877920', 'Cedula de ciudadanía', 'Acosta Ferrer Alberto Junior', 'Auxiliar Logistico', 'AVIMOL', '3015074217', 'Ninguna', 'B+', 'Sura', 'Salud Total', 'Nilfa Ferrer', '3011500298', 'Madre', 'nilfaferrer06@gmail.com', 'Noviembre', false, null),
  ('72432828', 'Cedula de ciudadanía', 'Viola Moreno Yedis Rafael', 'Auxiliar Logistico', 'AVIMOL', '3147443149', 'Ninguna', 'B+', 'Sura', 'Salud Total', 'Yutanis Rodriguez Rodriguez', '3233290305', 'Esposa', 'Yesidviola9@gmail.com', 'Mayo', false, null),
  ('1048328535', 'Cedula de ciudadanía', 'Leal Sandoval Edson Erick', 'Auxiliar Logistico', 'AVIMOL', '3106852619', 'Ninguna', 'O+', 'Sura', 'Salud Total', 'Ana Maria Sandoval', '3106852619', 'Madre', 'Edsonericklealsandoval@gmail.com', 'Julio', false, null),
  ('1043604591', 'Cedula de ciudadanía', 'Machacon Hernandez Miguel Angel', 'Operario de montacarga', 'AVIMOL', '3016895461', 'Ninguna', 'O+', 'Sura', 'Mutualser', 'Daniel machacon', '3015872529', 'Hermano', 'Miguelmachacon1987@gimail.com', 'Febrero', false, null),
  ('72347224', 'Cedula de ciudadanía', 'Pacheco Vilches Carlos Alberto', 'Auxiliar Logistico', 'AVIMOL', '3242274633', 'Ninguna', 'O+', 'Sura', 'Nueva eps S.A.', 'Dalis Gonzalez', '3013919693', 'Esposa', 'pachecovilches08@gmail.com', 'Agosto', false, null),
  ('1001874657', 'Cedula de ciudadanía', 'Hoyos Videz Roberto Enrique', 'Auxiliar Logistico', 'AVIMOL', '3022845093', 'Ninguna', 'O+', 'Sura', 'Sura eps', 'Mariela Videz', '3009917447', 'Madre', 'Hoyosvidezrobertoenrique@gmail.com', 'Abril', false, null),
  ('1049936132', 'Cedula de ciudadanía', 'Batista Arrieta Eduar David', 'Auxiliar Logistico', 'CEDI FUNZA', '3239618492', 'Ninguna', 'A+', 'Sura', 'Famisanar', 'Flor María arrieta miranda', '3224528243', 'Madre', 'eduarbatista944@gmail.com', 'Agosto', false, null),
  ('1122812110', 'Cedula de ciudadanía', 'Guevara Orozco Nilson Javier', 'Auxiliar Logistico', 'AVIMOL', '3045539359', 'Ninguna', 'O+', 'Sura', 'Sura eps', 'Luis De Leon', '3042881998', 'Tio', 'Delahozdanitza5@gmail.com', 'Enero', false, null),
  ('1043441052', 'Cedula de ciudadanía', 'Fuentes de la Ossa Cesar Antonio', 'Auxiliar Logistico', 'AVIMOL', '3242091876', 'Ninguna', 'A+', 'Sura', 'Sura eps', 'Gisella de la Ossa', '3001202711', 'Madre', 'delaossacesar19@gmail.com', 'Julio', false, null),
  ('1004323562', 'Cedula de ciudadanía', 'De la Cruz De la Cruz Yefrey Junior', 'Auxiliar Logistico', 'AVIMOL', '3245133980', 'Ninguna', 'O+', 'Sura', 'Salud Total', 'Fredy de la Cruz', '3011995524', 'Padre', 'delacruzyefrey19@gmail.com', 'Junio', false, null),
  ('1048320519', 'Cedula de ciudadanía', 'Fandiño Suarez Halinton Manuel', 'Operario de montacarga', 'AVIMOL', '3013361542', 'Ninguna', 'O+', 'Sura', 'Salud Total', 'Adrian Sansoval', '3011134917', 'Esposa', 'halintonmanuelfandinosuarez4@gmail.com', 'Junio', false, null),
  ('1042437660', 'Cedula de ciudadanía', 'Diaz Sandoval Elkin David', 'Auxiliar Logistico', 'AVIMOL', '3019784064', 'Ninguna', 'O+', 'Sura', 'Famisanar', 'Alsuris carrillo', '3002721489', 'Esposa', 'elkindiaz619@gmail.com', 'Junio', false, null),
  ('1045050093', 'Cedula de ciudadanía', 'Otoniel De Jesús Murillo Ospina', 'Auxiliar Logistico', 'CEDI MEDELLIN', '3216465107', 'Ninguna', 'A+', 'Sura', 'Salud Total', 'Nataly murillo ospina', '3184226573', 'Hermana', 'horiana1515@gmail.com', 'Marzo', false, null),
  ('1001885601', 'Cedula de ciudadanía', 'Escorcia Ucros Andrés Felipe', 'Auxiliar Logistico', 'AVIMOL', '3019680745', 'Ninguna', 'A+', 'Sura', 'Mutualser', 'Cristina Isabel Zamora San juan', '3242938091', 'Esposa', 'felipeucros643@gmail.com', 'Junio', false, null),
  ('1007599302', 'Cedula de ciudadanía', 'Cueto Herrera Yordin Andres', 'Coordinador de Gestión Humana', 'ADMINISTRATIVO', '3024290645', 'Ninguna', 'O+', 'Sura', 'Salud Total', 'Meri Cruz Rodriguez', '3246386577', 'Esposa', 'cuetoherrerayordin@gmail.com', 'Junio', false, null),
  ('1193156582', 'Cedula de ciudadanía', 'Castañeda Vira Anderson Alveiro', 'Auxiliar Logistico', 'CEDI MEDELLIN', '3243488728', 'Ninguna', 'O+', 'Sura', 'Sura eps', 'Gladys Vira', '3023839661', 'Madre', 'andercas180201@gmail.com', 'Febrero', false, null),
  ('5348349', 'Permiso por protección temporal', 'Rodelo Gil Daniel Jose', 'Auxiliar Logistico', 'HARINERA INDUPAN', '3044143470', 'Ninguna', 'O+', 'Sura', 'Famisanar', 'Marelis Gil', '3219894814', 'Madre', 'danielrobelo952@gmail.com', 'Junio', false, null),
  ('1045704259', 'Cedula de ciudadanía', 'Otero Diaz Andreis David', 'Operario de montacarga', 'AVIMOL', '3013632636', 'Ninguna', 'AB+', 'Sura', 'Sura eps', 'Ana Isabel Diaz ospino', '3021254819', 'Madre', null, 'Enero', true, 'Correo "Ote" no es válido'),
  ('1003535166', 'Cedula de ciudadanía', 'Méndez Bernal Cristian David', 'Auxiliar Logistico', 'HARINERA INDUPAN', '3180373968', 'Ninguna', 'A-', 'Sura', 'Salud Total', 'Samantha Sanchez', '3006471464', 'Esposa', 'cristianmendezber78@gmail.com', 'Junio', false, null))
insert into public.sst_medevac as m (
  idempresa, documento, documento_tipo, nombres, cargo, centro_trabajo, celular, alergias, rh, arl, eps,
  contacto_nombre, contacto_telefono, contacto_parentesco, email, mes_cumple,
  requiere_revision, revision_nota, origen, actualizado_en, actualizado_por
)
select 100, c.documento, c.documento_tipo, c.nombres, nullif(c.cargo, ''), nullif(c.centro_trabajo, ''),
       c.celular, c.alergias, c.rh, c.arl, c.eps, c.contacto_nombre, c.contacto_telefono,
       c.contacto_parentesco, nullif(c.email, ''), c.mes_cumple,
       c.requiere_revision, nullif(c.revision_nota, ''),
       'carga_csv', now(), 'Carga CSV formulario MEDEVAC'
  from csv c
on conflict (documento_norm) do update set
  documento_tipo      = excluded.documento_tipo,
  nombres             = excluded.nombres,
  cargo               = excluded.cargo,
  centro_trabajo      = excluded.centro_trabajo,
  celular             = excluded.celular,
  alergias            = excluded.alergias,
  rh                  = excluded.rh,
  arl                 = excluded.arl,
  eps                 = excluded.eps,
  contacto_nombre     = excluded.contacto_nombre,
  contacto_telefono   = excluded.contacto_telefono,
  contacto_parentesco = excluded.contacto_parentesco,
  email               = excluded.email,
  mes_cumple          = excluded.mes_cumple,
  requiere_revision   = excluded.requiere_revision,
  revision_nota       = excluded.revision_nota,
  origen              = 'carga_csv',
  actualizado_en      = now(),
  actualizado_por     = excluded.actualizado_por;

-- ---------------------------------------------------------------------
-- 6) PERMISOS DE LOS MODULOS INTERNOS
-- El portal del trabajador NO usa permisos_usuarios (entra por cedula), asi
-- que aqui solo se asegura el permiso de los dos modulos de la app interna.
-- ---------------------------------------------------------------------
alter table public.permisos_usuarios add column if not exists sst_medevac boolean default false;
alter table public.permisos_usuarios add column if not exists sst_perfil  boolean default false;

-- =====================================================================
-- VERIFICACION: correr despues y revisar las cuatro.
-- =====================================================================

-- 1) Cuantos quedaron y cuantos hay que corregir a mano.
--    Esperado: 67 cargados del CSV y 6 marcados.
select count(*)                                     as total_medevac,
       count(*) filter (where requiere_revision)    as por_corregir,
       count(*) filter (where origen = 'carga_csv') as cargados_del_csv,
       count(distinct documento_norm)               as personas_distintas
  from public.sst_medevac;

-- 2) Las filas marcadas, con el motivo. Estas son las que SST debe arreglar.
select documento, nombres, cargo, centro_trabajo, celular, contacto_telefono, email, revision_nota
  from public.sst_medevac
 where requiere_revision
 order by nombres;

-- 3) Quien estaba en MEDEVAC y NO viene en el CSV. Decidir si se quedan o se
--    borran: pueden ser gente retirada o cargas de prueba.
--    CORRERLA JUSTO DESPUES DE LA CARGA: `origen` guarda quien escribio de
--    ultimo, asi que una ficha del CSV que SST edite despues pasa a 'sst' y
--    empezaria a salir en esta lista sin serlo.
select documento, nombres, centro_trabajo, origen, created_at
  from public.sst_medevac
 where coalesce(origen,'') <> 'carga_csv'
 order by nombres;

-- 4) El estado real de la plantilla: quien esta activo en headcount y le falta
--    MEDEVAC o Perfil. Es lo que el portal le va a exigir a cada trabajador.
select count(*)                                 as activos_headcount,
       count(*) filter (where tiene_medevac)    as con_medevac,
       count(*) filter (where medevac_completo) as medevac_completo,
       count(*) filter (where tiene_perfil)     as con_perfil,
       count(*) filter (where perfil_completo)  as perfil_completo
  from public.vw_sst_datos_colaborador
 where lower(coalesce(estado,'')) = 'activo';

-- =====================================================================
-- FIN. Despues de correr esto:
--   · MEDEVAC y Perfil quedan enlazados por documento.
--   · El portal del trabajador puede preguntar que le falta a cada persona.
--
-- PARA REVERTIR LA CARGA:
--   delete from public.sst_medevac;
--   insert into public.sst_medevac (
--     id, idempresa, centro_trabajo, nombres, documento_tipo, documento, cargo,
--     celular, alergias, rh, arl, eps, contacto_nombre, contacto_telefono,
--     contacto_parentesco, email, mes_cumple, marca_temporal, created_at)
--   select id, idempresa, centro_trabajo, nombres, documento_tipo, documento, cargo,
--     celular, alergias, rh, arl, eps, contacto_nombre, contacto_telefono,
--     contacto_parentesco, email, mes_cumple, marca_temporal, created_at
--     from public.sst_medevac_backup_44;
--   (documento_norm se recalcula sola: es una columna generada)
-- =====================================================================
