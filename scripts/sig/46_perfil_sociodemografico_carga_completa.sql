-- ============================================================================
-- 46 · Perfil Sociodemografico (SST-FOR-32): recarga COMPLETA, 67 personas
--
-- Reemplaza el censo entero. Al terminar, `sst_perfil_sociodemografico` queda
-- con EXACTAMENTE estas 67 filas y nada mas.
--
-- SUSTITUYE al script 45, que cargaba solo 29 filas porque el archivo de
-- entonces llego cortado. Este trae el formulario completo. Si el 45 ya se
-- corrio, este lo actualiza sin problema: es el mismo upsert por documento.
-- Si el 45 NO se corrio, tampoco importa -- este es autonomo.
--
-- REQUISITO: haber corrido antes scripts/sig/44_medevac_perfil_enlace_y_carga.sql,
-- que crea `documento_norm` y su indice unico. El paso 0 se detiene si falta.
--
-- IDEMPOTENTE: se puede correr varias veces; el resultado es el mismo.
--
-- ============================ LO QUE HAY QUE SABER ==========================
--
-- 1. DOS PERSONAS TIENEN DOCUMENTO DISTINTO EN LOS DOS FORMATOS:
--
--       Yilfred Jimenez Solano       perfil 80037138    MEDEVAC 80027128
--       Arleis Jesus Cabello Julio   perfil 1102465336  MEDEVAC 1101464336
--
--    Las otras 65 cuadran exacto. El documento es la LLAVE que enlaza los dos
--    formatos, asi que mientras no se unifique, esas dos personas quedan con
--    ficha de emergencia y perfil sueltos: en Cobertura salen como que les
--    falta el perfil aunque lo tengan. NO se adivina cual es el bueno; las dos
--    filas quedan MARCADAS y la consulta 4 las deja a la vista.
--
-- 2. QUE SE HIZO CON LOS DATOS
--    · Fechas DD/MM/AAAA -> AAAA-MM-DD: es el unico formato en el que el orden
--      alfabetico es el cronologico.
--    · `edad` se DERIVA de la fecha de nacimiento, no se copia del archivo: una
--      edad guardada deja de ser cierta al ano siguiente y la fecha no.
--      VERIFICADO: las 67 edades derivadas coinciden con las del archivo.
--    · Las columnas "Dia", "Mes" y "Ano" NO se guardan: son la ANTIGUEDAD en la
--      empresa, calculada al 1-sep-2026 (verificado: las 67 cuadran). Se calcula
--      sola desde `fecha_ingreso`; guardarla seria congelar un numero que cambia
--      todos los dias. El modulo la muestra derivada.
--    · Tampoco se guardan "N°" ni "Marca temporal".
--    · La EPS se lleva a la misma escritura que ya quedo en MEDEVAC. Sin eso,
--      "SALUD TOTAL" y "Salud Total" contarian como dos EPS distintas al
--      agrupar y ningun informe cuadraria entre los dos modulos. Las escrituras
--      erroneas ("MULTUALSER", "Mutual set" -> "Mutualser") se corrigen y la
--      fila queda MARCADA.
--    · "Indigena" se escribe "Indígena": es solo la tilde, no se marca.
--
-- 3. QUEDAN 14 FILAS MARCADAS para revisar a mano: los dos documentos que no
--    cuadran, seis EPS mal escritas, dos municipios vacios o con el texto de
--    ayuda del formulario, dos grupos etnicos vacios, un tipo de vivienda
--    vacio, un municipio que en realidad es un departamento y tres
--    departamentos de nacimiento que traen un municipio o no corresponden al
--    pais. Se ven en la pestana "Por corregir" del modulo.
--
-- idempresa = 100 (LIP / ADMINISTRATIVO). SST es transversal: los server
-- actions listan el perfil SIN filtrar por proyecto, asi que el centro de
-- trabajo real vive en `centro_trabajo`, no en `idempresa`.
-- ============================================================================


-- ----------------------------------------------------------------------------
-- PASO 0 — REQUISITO. Sin el indice del script 44 el upsert falla con un
-- mensaje que no dice nada; mejor detenerse aqui explicando por que.
-- ----------------------------------------------------------------------------
do $$
begin
  if not exists (
    select 1 from pg_indexes
     where schemaname = 'public' and indexname = 'ux_sst_perfil_sd_documento'
  ) then
    raise exception 'Falta el indice ux_sst_perfil_sd_documento. Corre primero scripts/sig/44_medevac_perfil_enlace_y_carga.sql';
  end if;
end $$;


-- ----------------------------------------------------------------------------
-- PASO 1 — RESPALDO y columnas de control de calidad.
-- ----------------------------------------------------------------------------
do $$
begin
  if to_regclass('public.sst_perfil_sd_backup_46') is null then
    create table public.sst_perfil_sd_backup_46 as select * from public.sst_perfil_sociodemografico;
    raise notice 'Respaldo creado: sst_perfil_sd_backup_46 (% filas)',
      (select count(*) from public.sst_perfil_sd_backup_46);
  else
    raise notice 'sst_perfil_sd_backup_46 ya existe, no se sobrescribe.';
  end if;
end $$;

-- Por si el script 45 no se corrio: estas columnas las necesita el upsert.
alter table public.sst_perfil_sociodemografico
  add column if not exists requiere_revision boolean default false,
  add column if not exists revision_nota     text,
  add column if not exists origen            text,
  add column if not exists actualizado_en    timestamptz,
  add column if not exists actualizado_por   text;


-- ----------------------------------------------------------------------------
-- PASO 2 — LAS 67 FILAS DEL FORMULARIO
--
-- Upsert por documento. El borrado de lo que sobra va DESPUES, en el paso 3, y
-- a proposito en ese orden: si algo falla aqui el script se detiene y la tabla
-- se queda como estaba, en vez de quedar vacia a medio camino.
-- ----------------------------------------------------------------------------
with csv (documento, documento_tipo, nombres, apellidos, fecha_nacimiento, edad, sexo, eps, afp, arl,
          centro_trabajo, turno, cargo, fecha_ingreso, pais_nacimiento, depto_nacimiento, municipio_residencia,
          grupo_etnico, nivel_escolaridad, estado_civil, cabeza_familia, num_hijos, personas_hogar,
          ingresos_familiares, tipo_vivienda, caracteristicas_vivienda, zona, direccion, transporte, estrato,
          consume_alcohol, actividad_fisica, fumador, requiere_revision, revision_nota) as (
values
  ('1007599302', 'Cedula de ciudadanía', 'Yordin Andres', 'Cueto Herrera', '1993-06-02', 33, 'Masculino', 'Salud Total', 'PROTECCIÓN', 'Sura', 'ADMINISTRATIVO', 'Diurno', 'Coordinador de Gestion Humana', '2025-05-03', 'Colombia', 'Atlántico', 'Medellin', 'Sin Pertenencia Etnica', 'Técnico', 'Unión libre', 'SI', 1, 3, 'Más de 2 Salarios', 'Apartamento', 'Familiar', 'Urbana', 'CR 29 74 33', 'Vehículo particular', '4', 'NO', 'NO', 'NO', false, null),
  ('80075406', 'Cedula de ciudadanía', 'Jeffrey Joel', 'Jimenez Rodriguez', '1985-07-25', 41, 'Masculino', 'Sanitas', 'PORVENIR', 'Sura', 'ADMINISTRATIVO', 'Diurno', 'Representante Legal', '2025-02-01', 'Colombia', 'Guajira', 'Valledupar', 'Sin Pertenencia Etnica', 'Postgrado', 'Casado', 'SI', 2, 5, 'Más de 2 Salarios', 'Casa', 'Propia', 'Urbana', 'Calle 4B No. 20-66', 'Vehículo particular', '3', 'SI', 'SI', 'NO', false, null),
  ('1049936132', 'Cedula de ciudadanía', 'Eduar David', 'Batista Arrieta', '2005-08-20', 21, 'Masculino', 'Famisanar', 'PROTECCIÓN', 'Sura', 'CEDI FUNZA', 'Diurno', 'Auxiliar Logistico', '2026-03-05', 'Colombia', 'Bolívar', 'Mosquera', 'Sin Pertenencia Etnica', 'Secundaria Completa', 'Soltero', 'SI', 1, 3, 'Entre 1 Y 2 Salarios Mínimos', 'Apartamento', 'Arrendada', 'Urbana', 'Cra 2a_480', 'Bicicleta', '2', 'NO', 'SI', 'NO', false, null),
  ('80037138', 'Cedula de ciudadanía', 'Yilfred', 'Jiménez Solano', '1980-07-05', 46, 'Masculino', 'Sura eps', 'PORVENIR', 'Sura', 'ADMINISTRATIVO', 'Diurno', 'Gerente General', '2024-04-20', 'Colombia', 'Guajira', 'Mosquera', 'Sin Pertenencia Etnica', 'Postgrado', 'Unión libre', 'SI', 1, 2, 'Más de 2 Salarios', 'Apartamento', 'Propia', 'Urbana', 'Calle 10# 14a 77', 'Vehículo particular', '4', 'NO', 'SI', 'NO', true, 'El documento no coincide con el de su ficha MEDEVAC (80027128): mientras no se unifique, la ficha y el perfil quedan sueltos'),
  ('1033712312', 'Cedula de ciudadanía', 'Fabio Nelson', 'Rubiano Flautero', '2007-07-03', 19, 'Masculino', 'Salud Total', 'PROTECCIÓN', 'Sura', 'CEDI FUNZA', 'Mixto', 'Auxiliar Logistico', '2026-05-20', 'Colombia', 'Cundinamarca', 'Mosquera cundinamarca', 'Sin Pertenencia Etnica', 'Secundaria Completa', 'Soltero', 'NO', 0, 4, 'Entre 1 Y 2 Salarios Mínimos', 'Apartamento', 'Arrendada', 'Urbana', 'Calle 17b # 3e-20 Iregui 1', 'Bicicleta', '1', 'NO', 'SI', 'NO', false, null),
  ('1042457110', 'Cedula de ciudadanía', 'Luis ángel', 'Zambrano de moya', '1997-10-06', 28, 'Masculino', 'Salud Total', 'PORVENIR', 'Sura', 'AVIMOL', 'Mixto', 'Auxiliar Logistico', '2026-04-13', 'Colombia', 'Atlántico', 'Soledad Atlántico', 'Sin Pertenencia Etnica', 'Secundaria Incompleta', 'Soltero', 'SI', 2, 4, 'Entre 1 Y 2 Salarios Mínimos', 'Casa', 'Familiar', 'Suburbana', 'Calle 58 1d 80', 'Transporte público', '1', 'SI', 'NO', 'NO', false, null),
  ('1094951357', 'Cedula de ciudadanía', 'Manuela', 'Merchan Jimenez', '1995-09-07', 30, 'Femenino', 'Sura eps', 'PORVENIR', 'Sura', 'ADMINISTRATIVO', 'Diurno', 'Gerente comercial', '2024-01-20', 'Colombia', 'Cundinamarca', 'Bogotá DC', 'Sin Pertenencia Etnica', 'Profesional', 'Unión libre', 'SI', 0, 2, 'Entre 1 Y 2 Salarios Mínimos', 'Apartamento', 'Propia', 'Urbana', 'Cll 10s #14a-77', 'Vehículo particular', '4', 'NO', 'SI', 'NO', false, null),
  ('1043441052', 'Cedula de ciudadanía', 'Cesar Antonio', 'Fuentes de la ossa', '2005-07-20', 21, 'Masculino', 'Sura eps', 'PROTECCIÓN', 'Sura', 'AVIMOL', 'Diurno', 'Auxiliar Logistico', '2026-03-02', 'Colombia', 'Atlántico', 'Barranquilla', 'Sin Pertenencia Etnica', 'Secundaria Completa', 'Unión libre', 'SI', 1, 6, 'Entre 1 Y 2 Salarios Mínimos', 'Casa', 'Arrendada', 'Urbana', 'Calle 51b # 8d - 24', 'Moto', '2', 'SI', 'SI', 'NO', false, null),
  ('1007206556', 'Cedula de ciudadanía', 'Victor Manuel', 'Berrio Vasquez', '1996-03-13', 30, 'Masculino', 'Famisanar', 'PORVENIR', 'Sura', 'CEDI FUNZA', 'Diurno', 'Auxiliar Logistico', '2026-02-07', 'Colombia', 'Sucre', 'Funza Cundinamarca', 'Sin Pertenencia Etnica', 'Primaria Incompleta', 'Unión libre', 'SI', 1, 4, 'Entre 1 Y 2 Salarios Mínimos', 'Apartamento', 'Arrendada', 'Urbana', 'Carre.5 12 .38', 'Bicicleta', '1', 'NO', 'SI', 'NO', false, null),
  ('1033373410', 'Cedula de ciudadanía', 'Manuel Alberto', 'Agamez Florez', '1991-09-15', 34, 'Masculino', 'Famisanar', 'PROTECCIÓN', 'Sura', 'CEDI FUNZA', 'Diurno', 'Operario de montacarga', '2025-02-06', 'Colombia', 'Antioquia', 'Bogotá DC', 'Sin Pertenencia Etnica', 'Secundaria Completa', 'Unión libre', 'SI', 0, 2, 'Entre 1 Y 2 Salarios Mínimos', 'Casa', 'Arrendada', 'Urbana', 'Calle 78a #106-15', 'Moto', '3', 'NO', 'NO', 'NO', false, null),
  ('1042441053', 'Cedula de ciudadanía', 'Richard andres', 'Altamar Cuadrado', '1991-03-30', 35, 'Masculino', 'Salud Total', 'PORVENIR', 'Sura', 'AVIMOL', 'Mixto', 'Auxiliar Logistico', '2026-03-03', 'Colombia', 'Atlántico', null, null, 'Primaria Incompleta', 'Unión libre', 'NO', 4, 4, 'Entre 1 Y 2 Salarios Mínimos', 'Casa', 'Arrendada', 'Rural', '19A-27', 'Transporte público', '1', 'NO', 'NO', 'SI', true, 'El municipio de residencia quedó con el texto de ayuda del formulario ("Municipio") · El grupo étnico quedó vacío'),
  ('1003097095', 'Cedula de ciudadanía', 'Deiver', 'López de la Rosa', '1995-03-07', 31, 'Masculino', 'Nueva eps S.A.', 'PORVENIR', 'Sura', 'CEDI MEDELLIN', 'Diurno', 'Auxiliar Logistico', '2026-05-04', 'Colombia', 'Córdoba', 'Medellín', 'Sin Pertenencia Etnica', 'Primaria Completa', 'Unión libre', 'SI', 3, 3, 'Entre 1 Y 2 Salarios Mínimos', null, 'Arrendada', 'Urbana', 'CLL 60#49_29', 'Transporte público', '1', 'NO', 'NO', 'NO', true, 'El tipo de vivienda quedó vacío'),
  ('6679516', 'Permiso por protección temporal', 'Jesús David', 'Escalona Olmos', '2001-04-10', 25, 'Masculino', 'Nueva eps S.A.', 'COLPENSIONES', 'Sura', 'CEDI MEDELLIN', 'Diurno', 'Auxiliar Logistico', '2026-06-18', 'Venezuela', 'Trujillo', 'Medellín', 'Sin Pertenencia Etnica', 'Secundaria Completa', 'Soltero', 'SI', 1, 4, 'Entre 1 Y 2 Salarios Mínimos', 'Apartamento', 'Arrendada', 'Urbana', 'CL 101 # 50c - 198', 'Transporte público', '2', 'NO', 'SI', 'NO', false, null),
  ('1047488881', 'Cedula de ciudadanía', 'Edgar Miguel', 'Coneo Herrera', '1996-06-15', 30, 'Masculino', 'Coosalud', 'PORVENIR', 'Sura', 'CEDI MEDELLIN', 'Diurno', 'Auxiliar Logistico', '2026-06-05', 'Colombia', 'Bolívar', 'Medellín', null, 'Secundaria Completa', 'Unión libre', 'SI', 0, 3, 'Entre 1 Y 2 Salarios Mínimos', 'Apartamento', 'Arrendada', 'Urbana', 'Calle 47 9', 'Caminando', '1', 'SI', 'NO', 'SI', true, 'El grupo étnico quedó vacío'),
  ('1000442265', 'Cedula de ciudadanía', 'Yerson Estiven', 'Restrepo Laverde', '2002-08-18', 24, 'Masculino', 'Salud Total', 'PORVENIR', 'Sura', 'CEDI MEDELLIN', 'Diurno', 'Auxiliar Logistico', '2026-04-08', 'Colombia', 'Antioquia', 'Medellin', 'Sin Pertenencia Etnica', 'Secundaria Completa', 'Unión libre', 'SI', 0, 2, 'Entre 1 Y 2 Salarios Mínimos', 'Apartamento', 'Arrendada', 'Urbana', 'Castilla', 'Transporte público', '5', 'NO', 'SI', 'NO', false, null),
  ('1069504611', 'Cedula de ciudadanía', 'Arnaldo Jose', 'Oviedo Martínez', '1998-06-07', 28, 'Masculino', 'Salud Total', 'PROTECCIÓN', 'Sura', 'CEDI MEDELLIN', 'Mixto', 'Auxiliar Logistico', '2026-06-19', 'Colombia', 'Córdoba', 'Itagüí', 'Sin Pertenencia Etnica', 'Secundaria Completa', 'Soltero', 'NO', 1, 1, 'Entre 1 Y 2 Salarios Mínimos', 'Casa', 'Arrendada', 'Urbana', 'CARRERA 50#24-70', 'Transporte público', '3', 'NO', 'SI', 'NO', false, null),
  ('1131479081', 'Cedula de ciudadanía', 'Juvenal', 'Cristo Ramirez', '2003-02-07', 23, 'Masculino', 'Mutualser', 'COLPENSIONES', 'Sura', 'HARINERA INDUPAN', 'Mixto', 'Operario de montacarga', '2026-06-23', 'Colombia', 'Bolívar', 'Bogotá DC', 'Sin Pertenencia Etnica', 'Primaria Completa', 'Soltero', 'SI', 1, 3, 'Entre 1 Y 2 Salarios Mínimos', 'Apartamento', 'Arrendada', 'Rural', '137b#154a72', 'Transporte público', '1', 'NO', 'SI', 'NO', true, 'La EPS venía escrita "MULTUALSER" y se normalizó a "Mutualser"'),
  ('1073155377', 'Cedula de ciudadanía', 'Yull alexander', 'Contento riveros', '1988-07-16', 38, 'Masculino', 'Famisanar', 'COLFONDOS', 'Sura', 'ADMINISTRATIVO', 'Diurno', 'Coordinador de operaciones', '2025-11-01', 'Colombia', 'Cundinamarca', 'Madrid', 'Sin Pertenencia Etnica', 'Tecnólogo', 'Soltero', 'SI', 1, 3, 'Más de 2 Salarios', 'Casa', 'Arrendada', 'Urbana', 'Carrera 22a # 6a -38', 'Vehículo particular', '2', 'NO', 'NO', 'NO', false, null),
  ('1049945704', 'Cedula de ciudadanía', 'Raúl Enrique', 'Mendoza padilla', '1997-10-21', 28, 'Masculino', 'Sura eps', 'PORVENIR', 'Sura', 'CEDI FUNZA', 'Mixto', 'Auxiliar Logistico', '2026-02-05', 'Colombia', 'Bolívar', 'Bogotá DC', 'Sin Pertenencia Etnica', 'Secundaria Incompleta', 'Soltero', 'SI', 3, 4, 'Entre 1 Y 2 Salarios Mínimos', 'Apartamento', 'Arrendada', 'Urbana', 'Planada Mosquera', 'Bicicleta', '1', 'SI', 'SI', 'NO', false, null),
  ('1193431838', 'Cedula de ciudadanía', 'Jovanis De Jesus', 'Villalobos Martinez', '1999-03-22', 27, 'Masculino', 'Salud Total', 'PORVENIR', 'Sura', 'CEDI FUNZA', 'Diurno', 'Auxiliar Logistico', '2025-05-13', 'Colombia', 'Guajira', 'Bogotá DC', 'Sin Pertenencia Etnica', 'Secundaria Completa', 'Soltero', 'SI', 1, 2, 'Entre 1 Y 2 Salarios Mínimos', 'Casa', 'Arrendada', 'Suburbana', 'CALLE 11-8 05', 'Caminando', '2', 'NO', 'SI', 'NO', false, null),
  ('1002319848', 'Cedula de ciudadanía', 'Ander fabian', 'Barrera Batista', '1990-03-17', 36, 'Masculino', 'Famisanar', 'PROTECCIÓN', 'Sura', 'CEDI FUNZA', 'Mixto', 'Coordinador de operaciones', '2025-04-08', 'Colombia', 'Bolívar', 'Bogotá DC', 'Sin Pertenencia Etnica', 'Secundaria Incompleta', 'Unión libre', 'SI', 3, 5, 'Entre 1 Y 2 Salarios Mínimos', 'Apartamento', 'Arrendada', 'Urbana', 'Cr1#24_24', 'Caminando', '3', 'SI', 'SI', 'NO', false, null),
  ('1004323562', 'Cedula de ciudadanía', 'Yefrey Junior', 'De la cruz', '2002-06-22', 24, 'Masculino', 'Salud Total', 'PORVENIR', 'Sura', 'AVIMOL', 'Diurno', 'Auxiliar Logistico', '2025-05-20', 'Colombia', 'Magdalena', 'Soledad', 'Sin Pertenencia Etnica', 'Secundaria Completa', 'Unión libre', 'SI', 1, 3, 'Entre 1 Y 2 Salarios Mínimos', 'Apartamento', 'Arrendada', 'Urbana', 'Calle 11=#19b-12', 'Transporte público', '2', 'SI', 'SI', 'NO', false, null),
  ('72260522', 'Cedula de ciudadanía', 'Brian jose', 'Sanchez Mora', '1981-04-07', 45, 'Masculino', 'Salud Total', 'PROTECCIÓN', 'Sura', 'ADMINISTRATIVO', 'Diurno', 'Coordinador de operaciones', '2025-04-01', 'Colombia', 'Atlántico', 'barranquilla', 'Sin Pertenencia Etnica', 'Profesional', 'Casado', 'SI', 3, 3, 'Entre 1 Y 2 Salarios Mínimos', 'Apartamento', 'Propia', 'Urbana', 'calle 100 numero 19 sur - 40 torre 1 apto 804', 'Transporte público', '2', 'NO', 'NO', 'NO', false, null),
  ('1043604591', 'Cedula de ciudadanía', 'Miguel Ángel', 'Machacon Hernández', '1987-02-06', 39, 'Masculino', 'Mutualser', 'COLFONDOS', 'Sura', 'AVIMOL', 'Diurno', 'Operario de montacarga', '2026-03-09', 'Colombia', 'Atlántico', null, 'Sin Pertenencia Etnica', 'Técnico', 'Soltero', 'NO', 1, 2, 'Entre 1 Y 2 Salarios Mínimos', 'Apartamento', 'Familiar', 'Rural', 'Calle 116 42b91', 'Moto', '3', 'SI', 'SI', 'NO', true, 'La EPS venía escrita "MULTUALSER" y se normalizó a "Mutualser" · El municipio de residencia quedó vacío'),
  ('1193510194', 'Cedula de ciudadanía', 'Antoni Miguel', 'Castillo', '1989-09-10', 36, 'Masculino', 'Compensar', 'PORVENIR', 'Sura', 'HARINERA INDUPAN', 'Diurno', 'Auxiliar Logistico', '2026-01-26', 'Colombia', 'Tumaco Nariño', 'Bogotá DC', 'Sin Pertenencia Etnica', 'Primaria Completa', 'Soltero', 'NO', 1, 4, 'Entre 1 Y 2 Salarios Mínimos', 'Apartamento', 'Arrendada', 'Urbana', 'CR 56 2 B-82 P 2', 'Transporte público', '3', 'SI', 'NO', 'NO', true, 'Departamento de nacimiento: Tumaco Nariño es un municipio, no un departamento'),
  ('1000221742', 'Cedula de ciudadanía', 'Deivid Daniel', 'Parra Ossa', '2000-03-01', 26, 'Masculino', 'Salud Total', 'COLPENSIONES', 'Sura', 'HARINERA INDUPAN', 'Diurno', 'Operario de montacarga', '2024-11-01', 'Colombia', 'Cundinamarca', 'Bogotá DC', 'Sin Pertenencia Etnica', 'Secundaria Completa', 'Soltero', 'NO', 0, 5, 'Entre 1 Y 2 Salarios Mínimos', 'Casa', 'Familiar', 'Urbana', 'Calle 3 b bis #5b 11 este', 'Moto', '2', 'SI', 'NO', 'NO', false, null),
  ('1048285137', 'Cedula de ciudadanía', 'Habido Rafael', 'Jiménez suarez', '2001-10-31', 24, 'Masculino', 'Salud Total', 'PORVENIR', 'Sura', 'HARINERA INDUPAN', 'Diurno', 'Operario de montacarga', '2026-01-09', 'Colombia', 'Atlántico', 'Bogotá DC', 'Sin Pertenencia Etnica', 'Secundaria Completa', 'Unión libre', 'SI', 3, 6, 'Entre 1 Y 2 Salarios Mínimos', 'Apartamento', 'Arrendada', 'Urbana', 'Calle 2a #55-44', 'Bicicleta', '2', 'SI', 'SI', 'SI', false, null),
  ('98074100', 'Cedula de ciudadanía', 'Carlos Armando', 'Lopez Velasquez', '1979-01-05', 47, 'Masculino', 'Sanitas', 'PORVENIR', 'Sura', 'HARINERA INDUPAN', 'Diurno', 'Auxiliar Logistico', '2026-03-23', 'Colombia', 'Nariño', 'Bogotá DC', 'Sin Pertenencia Etnica', 'Primaria Incompleta', 'Unión libre', 'SI', 2, 4, 'Entre 1 Y 2 Salarios Mínimos', 'Apartamento', 'Arrendada', 'Urbana', 'Calle 49a #5b 63', 'Transporte público', '2', 'NO', 'NO', 'NO', false, null),
  ('1131494159', 'Cedula de ciudadanía', 'Osvaldo', 'Castro Palomino', '1986-04-07', 40, 'Masculino', 'Mutualser', 'PORVENIR', 'Sura', 'HARINERA INDUPAN', 'Diurno', 'Auxiliar Logistico', '2025-07-17', 'Colombia', 'Bolívar', 'Bogotá DC', 'Sin Pertenencia Etnica', 'Primaria Incompleta', 'Unión libre', 'SI', 2, 3, 'Entre 1 Y 2 Salarios Mínimos', 'Apartamento', 'Arrendada', 'Urbana', 'El lucero', 'Transporte público', '2', 'NO', 'SI', 'SI', true, 'La EPS venía escrita "Mutual set" y se normalizó a "Mutualser"'),
  ('1002093492', 'Cedula de ciudadanía', 'Carlos daniel', 'Ojito Sarabia', '1998-11-02', 27, 'Masculino', 'Salud Total', 'PORVENIR', 'Sura', 'HARINERA INDUPAN', 'Diurno', 'Auxiliar Logistico', '2026-03-07', 'Colombia', 'Atlántico', 'Bogotá DC', 'Sin Pertenencia Etnica', 'Secundaria Completa', 'Soltero', 'SI', 0, 4, 'Entre 1 Y 2 Salarios Mínimos', 'Apartamento', 'Arrendada', 'Urbana', 'Carrera 5E Diagonal 88-67', 'Transporte público', '2', 'SI', 'SI', 'NO', false, null),
  ('72434584', 'Cedula de ciudadanía', 'Alveiro Elias', 'Vargas zambrano', '1984-06-26', 42, 'Masculino', 'Salud Total', 'PROTECCIÓN', 'Sura', 'HARINERA INDUPAN', 'Mixto', 'Auxiliar Logistico', '2025-08-18', 'Colombia', 'Atlántico', 'Bogotá DC', 'Sin Pertenencia Etnica', 'Primaria Completa', 'Casado', 'SI', 3, 5, 'Entre 1 Y 2 Salarios Mínimos', 'Apartamento', 'Arrendada', 'Urbana', 'Suba pinar', 'Transporte público', '2', 'NO', 'SI', 'NO', false, null),
  ('1005472692', 'Cedula de ciudadanía', 'Cristian Andres', 'Sandoval Zuñiga', '1999-06-26', 27, 'Masculino', 'Salud Total', 'PORVENIR', 'Sura', 'HARINERA INDUPAN', 'Diurno', 'Auxiliar Logistico', '2025-10-20', 'Colombia', 'Sucre', 'Bogotá DC', 'Sin Pertenencia Etnica', 'Secundaria Incompleta', 'Unión libre', 'SI', 0, 2, 'Entre 1 Y 2 Salarios Mínimos', 'Apartamento', 'Arrendada', 'Urbana', 'Santa Librada', 'Transporte público', '2', 'NO', 'SI', 'NO', false, null),
  ('1102465336', 'Cedula de ciudadanía', 'Arleis Jesús', 'Cabello Julio', '1978-06-16', 48, 'Masculino', 'Sanitas', 'PROTECCIÓN', 'Sura', 'HARINERA INDUPAN', 'Diurno', 'Auxiliar Logistico', '2025-09-01', 'Venezuela', 'Sucre', 'Bogotá DC', 'Sin Pertenencia Etnica', 'Secundaria Incompleta', 'Unión libre', 'SI', 2, 4, 'Entre 1 Y 2 Salarios Mínimos', 'Casa', 'Arrendada', 'Urbana', 'Funsa', 'Transporte público', '1', 'SI', 'SI', 'NO', true, 'El documento no coincide con el de su ficha MEDEVAC (1101464336): mientras no se unifique, la ficha y el perfil quedan sueltos · Departamento de nacimiento: el pais es Venezuela pero el departamento (Sucre) es colombiano'),
  ('1007962505', 'Cedula de ciudadanía', 'Jhon Jairo', 'Martinez Mercado', '2000-05-08', 26, 'Masculino', 'Salud Total', 'PORVENIR', 'Sura', 'HARINERA INDUPAN', 'Mixto', 'Auxiliar Logistico', '2026-04-21', 'Colombia', 'Atlántico', 'Bogotá DC', 'Sin Pertenencia Etnica', 'Secundaria Completa', 'Soltero', 'NO', 0, 1, 'Entre 1 Y 2 Salarios Mínimos', 'Apartamento', 'Arrendada', 'Urbana', 'Cra 106 bis 19-18', 'Transporte público', '2', 'NO', 'SI', 'NO', false, null),
  ('1005472020', 'Cedula de ciudadanía', 'Luis Eduardo', 'Berrio Blanco', '1991-06-12', 35, 'Masculino', 'Salud Total', 'PORVENIR', 'Sura', 'HARINERA INDUPAN', 'Diurno', 'Auxiliar Logistico', '2024-11-21', 'Colombia', 'Sucre', 'Funza', 'Sin Pertenencia Etnica', 'Secundaria Completa', 'Soltero', 'SI', 2, 4, 'Entre 1 Y 2 Salarios Mínimos', 'Apartamento', 'Arrendada', 'Urbana', 'Calle 21a #2b bis _03', 'Transporte público', '2', 'SI', 'SI', 'NO', false, null),
  ('1026563725', 'Cedula de ciudadanía', 'Felix Mauricio', 'Welgos Montero', '1990-02-21', 36, 'Masculino', 'Salud Total', 'PROTECCIÓN', 'Sura', 'HARINERA INDUPAN', 'Diurno', 'Operario de montacarga', '2024-11-01', 'Colombia', 'Tolima', 'Bogotá DC', 'Sin Pertenencia Etnica', 'Primaria Completa', 'Unión libre', 'SI', 3, 4, 'Entre 1 Y 2 Salarios Mínimos', 'Casa', 'Familiar', 'Urbana', 'Ciudad bolivar villas del diamante', 'Moto', '2', 'SI', 'SI', 'SI', false, null),
  ('1016101109', 'Cedula de ciudadanía', 'Michael Josias', 'Castro Alejo', '1998-02-05', 28, 'Masculino', 'Salud Total', 'PORVENIR', 'Sura', 'ADMINISTRATIVO', 'Diurno', 'Coordinador SST', '2026-06-16', 'Colombia', 'Cundinamarca', 'Bogotá DC', 'Sin Pertenencia Etnica', 'Secundaria Completa', 'Soltero', 'NO', 0, 0, 'Más de 2 Salarios', 'Casa', 'Arrendada', 'Urbana', 'Calle 39 f # 72 f 11 sur', 'Bicicleta', '3', 'NO', 'SI', 'NO', false, null),
  ('1052971002', 'Cedula de ciudadanía', 'Karina', 'Medina', '1991-01-21', 35, 'Femenino', 'Sura eps', 'PORVENIR', 'Sura', 'ADMINISTRATIVO', 'Diurno', 'Gerente sst', '2026-06-16', 'Colombia', 'Bolívar', 'Barranquilla', 'Sin Pertenencia Etnica', 'Postgrado', 'Casado', 'NO', 1, 3, 'Más de 2 Salarios', 'Apartamento', 'Propia', 'Urbana', 'Calle 120 #42b-112', 'Vehículo particular', '4', 'NO', 'SI', 'NO', false, null),
  ('1001874657', 'Cedula de ciudadanía', 'Roberto Enrique', 'Hoyos Videz', '1990-04-25', 36, 'Masculino', 'Salud Total', 'PORVENIR', 'Sura', 'AVIMOL', 'Diurno', 'Auxiliar Logistico', '2026-04-28', 'Colombia', 'Atlántico', 'Soledad', 'Sin Pertenencia Etnica', 'Secundaria Completa', 'Soltero', 'SI', 5, 4, 'Entre 1 Y 2 Salarios Mínimos', 'Casa', 'Familiar', 'Urbana', 'Cra 15 e 1 n 50 a 14 la alinza', 'Transporte público', '1', 'SI', 'SI', 'NO', false, null),
  ('85084470', 'Cedula de ciudadanía', 'Jhon Jairo', 'Flórez García', '1983-03-01', 43, 'Masculino', 'Salud Total', 'COLPENSIONES', 'Sura', 'AVIMOL', 'Diurno', 'Auxiliar Logistico', '2025-04-01', 'Colombia', 'Meta', 'Malambo', 'Sin Pertenencia Etnica', 'Primaria Incompleta', 'Unión libre', 'SI', 4, 5, 'Entre 1 Y 2 Salarios Mínimos', 'Casa', 'Familiar', 'Urbana', 'Calle 12 #10-05 centro de Malambo', 'Transporte público', '2', 'NO', 'SI', 'NO', false, null),
  ('72266920', 'Cedula de ciudadanía', 'Antonio Luis', 'Villalobos Orozco', '1982-01-12', 44, 'Masculino', 'Sura eps', 'PROTECCIÓN', 'Sura', 'AVIMOL', 'Diurno', 'Auxiliar Logistico', '2025-04-01', 'Colombia', 'Atlántico', 'Barranquilla', 'Sin Pertenencia Etnica', 'Primaria Incompleta', 'Unión libre', 'SI', 3, 6, 'Entre 1 Y 2 Salarios Mínimos', 'Casa', 'Familiar', 'Urbana', 'Calle 57 1533', 'Transporte público', '3', 'NO', 'SI', 'NO', false, null),
  ('1043139748', 'Cedula de ciudadanía', 'Danilo jose', 'De la hoz Camargo', '2005-12-20', 20, 'Masculino', 'Sura eps', 'COLPENSIONES', 'Sura', 'AVIMOL', 'Diurno', 'Auxiliar Logistico', '2026-06-09', 'Colombia', 'Atlántico', 'Soledad', 'Sin Pertenencia Etnica', 'Primaria Completa', 'Unión libre', 'NO', 1, 5, 'Entre 1 Y 2 Salarios Mínimos', 'Apartamento', 'Propia', 'Rural', 'Calle 52 transversal 6', 'Transporte público', '2', 'NO', 'SI', 'NO', false, null),
  ('1140816546', 'Cedula de ciudadanía', 'Mac Donald', 'Donado Mejia', '1988-02-11', 38, 'Masculino', 'Sura eps', 'COLPENSIONES', 'Sura', 'ADMINISTRATIVO', 'Diurno', 'Coordinador de operaciones', '2025-06-19', 'Colombia', 'Atlántico', 'BARRANQUILLA', 'Sin Pertenencia Etnica', 'Tecnólogo', 'Casado', 'SI', 3, 4, 'Entre 1 Y 2 Salarios Mínimos', 'Casa', 'Arrendada', 'Rural', 'Calle 12A1 # 9A-04 Barrio Frias', 'Transporte público', '2', 'NO', 'SI', 'NO', false, null),
  ('1048328535', 'Cedula de ciudadanía', 'Edson Erick', 'Leal sandoval', '1997-07-28', 29, 'Masculino', 'Coosalud', 'PORVENIR', 'Sura', 'AVIMOL', 'Mixto', 'Auxiliar Logistico', '2025-06-24', 'Colombia', 'Atlántico', 'BARRANQUILLA', 'Sin Pertenencia Etnica', 'Secundaria Incompleta', 'Unión libre', 'SI', 3, 5, 'Entre 1 Y 2 Salarios Mínimos', 'Apartamento', 'Arrendada', 'Urbana', 'Carrera 40 número 632', 'Transporte público', '1', 'NO', 'SI', 'NO', false, null),
  ('1001877920', 'Cedula de ciudadanía', 'Alberto Junior', 'Acosta Ferrer', '2000-11-16', 25, 'Masculino', 'Salud Total', 'PROTECCIÓN', 'Sura', 'AVIMOL', 'Diurno', 'Auxiliar Logistico', '2025-04-01', 'Colombia', 'Atlántico', 'Soledad', 'Sin Pertenencia Etnica', 'Técnico', 'Unión libre', 'SI', 2, 4, 'Entre 1 Y 2 Salarios Mínimos', 'Apartamento', 'Propia', 'Urbana', 'Calle 13 n 15 A 26', 'Transporte público', '1', 'NO', 'SI', 'NO', false, null),
  ('1092338456', 'Cedula de ciudadanía', 'Yeferson Arley', 'Fonseca Suarez', '2005-07-13', 21, 'Masculino', 'Nueva eps S.A.', 'COLPENSIONES', 'Sura', 'POSTOBON CUCUTA', 'Mixto', 'Auxiliar Logistico', '2026-06-28', 'Colombia', 'Norte de Santander', 'Villa del rosario', 'Sin Pertenencia Etnica', 'Tecnólogo', 'Soltero', 'NO', 0, 3, 'Entre 1 Y 2 Salarios Mínimos', 'Casa', 'Propia', 'Urbana', 'Carrera 11#188-8 san martin-villa del rosario', 'Moto', '1', 'NO', 'SI', 'NO', false, null),
  ('1143463545', 'Cedula de ciudadanía', 'Andrés Antonio', 'Aragón Jiménez', '1998-04-09', 28, 'Masculino', 'Sura eps', 'PORVENIR', 'Sura', 'AVIMOL', 'Diurno', 'Auxiliar Logistico', '2025-04-01', 'Colombia', 'Atlántico', 'Barranquilla', 'Sin Pertenencia Etnica', 'Secundaria Completa', 'Unión libre', 'SI', 2, 4, 'Entre 1 Y 2 Salarios Mínimos', 'Apartamento', 'Familiar', 'Rural', 'Carrera 17#7-29', 'Transporte público', '1', 'SI', 'NO', 'NO', false, null),
  ('1048320519', 'Cedula de ciudadanía', 'Halinton Manuel', 'Fandiño Suarez', '1996-06-16', 30, 'Masculino', 'Salud Total', 'COLFONDOS', 'Sura', 'AVIMOL', 'Diurno', 'Operario de montacarga', '2026-03-09', 'Colombia', 'Atlántico', 'Barranquilla', 'Sin Pertenencia Etnica', 'Secundaria Completa', 'Unión libre', 'SI', 4, 8, 'Entre 1 Y 2 Salarios Mínimos', 'Apartamento', 'Propia', 'Urbana', 'Kra40#616 mesolandia Malambo', 'Transporte público', '1', 'SI', 'SI', 'NO', false, null),
  ('1043586682', 'Cedula de ciudadanía', 'Alexander', 'Cueto Mesino', '1990-09-10', 35, 'Masculino', 'Salud Total', 'PROTECCIÓN', 'Sura', 'HARINERA INDUPAN', 'Mixto', 'Auxiliar Logistico', '2026-07-09', 'Colombia', 'Atlántico', 'Bogotá DC', 'Sin Pertenencia Etnica', 'Primaria Incompleta', 'Soltero', 'NO', 0, 3, 'Entre 1 Y 2 Salarios Mínimos', 'Apartamento', 'Arrendada', 'Urbana', 'Calle 132d#124b-68', 'Transporte público', '2', 'SI', 'SI', 'NO', false, null),
  ('1004504508', 'Cedula de ciudadanía', 'Yair De Jesus', 'Truyol caballero', '1988-02-10', 38, 'Masculino', 'Salud Total', 'PORVENIR', 'Sura', 'AVIMOL', 'Diurno', 'Auxiliar Logistico', '2026-04-13', 'Colombia', 'Magdalena', 'Barranquilla', 'Sin Pertenencia Etnica', 'Técnico', 'Casado', 'SI', 2, 2, 'Entre 1 Y 2 Salarios Mínimos', 'Casa', 'Propia', 'Urbana', 'Calle 50 a 5 16', 'Bicicleta', '1', 'NO', 'SI', 'NO', false, null),
  ('8567646', 'Cedula de ciudadanía', 'Armando Cesar', 'Rodriguez Manjarrez', '1978-01-03', 48, 'Masculino', 'Salud Total', 'PROTECCIÓN', 'Sura', 'AVIMOL', 'Diurno', 'Auxiliar Logistico', '2025-04-09', 'Colombia', 'Magdalena', 'Atlantico', 'Sin Pertenencia Etnica', 'Secundaria Incompleta', 'Unión libre', 'SI', 3, 2, 'Entre 1 Y 2 Salarios Mínimos', 'Casa', 'Propia', 'Urbana', 'Kra4#76f18', 'Transporte público', '1', 'SI', 'SI', 'NO', true, 'El municipio de residencia dice "Atlantico", que es un departamento'),
  ('1007517624', 'Cedula de ciudadanía', 'Pedro Luis', 'Murillo Peñate', '2001-08-05', 25, 'Masculino', 'Coosalud', 'PORVENIR', 'Sura', 'AVIMOL', 'Diurno', 'Auxiliar Logistico', '2026-07-02', 'Colombia', 'Sucre', 'Barranquilla', 'Indígena', 'Primaria Completa', 'Casado', 'SI', 1, 7, 'Entre 1 Y 2 Salarios Mínimos', 'Apartamento', 'Arrendada', 'Urbana', 'Carrera 33b 6.58', 'Transporte público', '1', 'NO', 'SI', 'NO', false, null),
  ('1082856423', 'Cedula de ciudadanía', 'Danilo Enrique', 'Pérez Pérez', '2004-02-12', 22, 'Masculino', 'Sanitas', 'PORVENIR', 'Sura', 'HARINERA INDUPAN', 'Mixto', 'Auxiliar Logistico', '2026-07-14', 'Colombia', 'Magdalena', 'Bogotá DC', 'Sin Pertenencia Etnica', 'Secundaria Completa', 'Soltero', 'SI', 0, 3, 'Entre 1 Y 2 Salarios Mínimos', 'Apartamento', 'Arrendada', 'Urbana', 'Cll 33 a sur # 12 j 08', 'Transporte público', '2', 'NO', 'SI', 'NO', false, null),
  ('72347224', 'Cedula de ciudadanía', 'Carloa Alberto', 'Pacheco Vilches', '1985-08-03', 41, 'Masculino', 'Nueva eps S.A.', 'COLFONDOS', 'Sura', 'AVIMOL', 'Diurno', 'Auxiliar Logistico', '2026-06-16', 'Colombia', 'Atlántico', 'Barranquilla', 'Sin Pertenencia Etnica', 'Secundaria Incompleta', 'Unión libre', 'SI', 2, 2, 'Entre 1 Y 2 Salarios Mínimos', 'Apartamento', 'Arrendada', 'Urbana', 'Carreta 10 sur 51B 77', 'Transporte público', '1', 'SI', 'NO', 'NO', false, null),
  ('1042437660', 'Cedula de ciudadanía', 'Elkin David', 'Diaz Sandoval', '1991-06-06', 35, 'Masculino', 'Famisanar', 'COLPENSIONES', 'Sura', 'HARINERA INDUPAN', 'Diurno', 'Auxiliar Logistico', '2026-07-07', 'Colombia', 'Atlántico', 'Barranquilla', 'Sin Pertenencia Etnica', 'Secundaria Completa', 'Unión libre', 'SI', 1, 3, 'Entre 1 Y 2 Salarios Mínimos', 'Apartamento', 'Arrendada', 'Urbana', 'Carrera22#15-19', 'Transporte público', '1', 'NO', 'SI', 'NO', false, null),
  ('1043139276', 'Cedula de ciudadanía', 'Armando De Jesus', 'Orozco Barcasnegras', '1996-04-20', 30, 'Masculino', 'Mutualser', 'PORVENIR', 'Sura', 'AVIMOL', 'Diurno', 'Auxiliar Logistico', '2025-07-05', 'Colombia', 'Atlántico', 'Soledad', 'Sin Pertenencia Etnica', 'Secundaria Completa', 'Unión libre', 'SI', 2, 4, 'Entre 1 Y 2 Salarios Mínimos', 'Apartamento', 'Arrendada', 'Urbana', 'Calle 27 #26 a 191 soledad', 'Transporte público', '1', 'SI', 'NO', 'NO', true, 'La EPS venía escrita "MULTUALSER" y se normalizó a "Mutualser"'),
  ('1001871824', 'Cedula de ciudadanía', 'Luis Antonio', 'De Leon Garcia', '1991-09-10', 34, 'Masculino', 'Salud Total', 'PORVENIR', 'Sura', 'AVIMOL', 'Diurno', 'Auxiliar Logistico', '2025-05-21', 'Colombia', 'Atlántico', 'Soledad', 'Sin Pertenencia Etnica', 'Primaria Incompleta', 'Unión libre', 'SI', 2, 4, 'Entre 1 Y 2 Salarios Mínimos', 'Apartamento', 'Arrendada', 'Urbana', 'CL 12 15A 44', 'Transporte público', '1', 'SI', 'NO', 'SI', false, null),
  ('1122812110', 'Cedula de ciudadanía', 'Nilson Javier', 'Guevara Orozco', '2001-01-10', 25, 'Masculino', 'Salud Total', 'PORVENIR', 'Sura', 'AVIMOL', 'Diurno', 'Auxiliar Logistico', '2026-03-16', 'Colombia', 'Atlántico', 'Soledad', 'Sin Pertenencia Etnica', 'Secundaria Completa', 'Unión libre', 'SI', 1, 3, 'Entre 1 Y 2 Salarios Mínimos', 'Casa', 'Arrendada', 'Urbana', 'CR 16 11A 28', 'Transporte público', '1', 'SI', 'NO', 'NO', false, null),
  ('72432828', 'Cedula de ciudadanía', 'Yesid Rafael', 'Viola Moreno', '1982-05-26', 44, 'Masculino', 'Salud Total', 'PORVENIR', 'Sura', 'AVIMOL', 'Diurno', 'Auxiliar Logistico', '2026-04-21', 'Colombia', 'Atlántico', 'Soledad', 'Sin Pertenencia Etnica', 'Primaria Incompleta', 'Unión libre', 'SI', 3, 4, 'Entre 1 Y 2 Salarios Mínimos', 'Apartamento', 'Propia', 'Urbana', 'CL 9 26 04', 'Transporte público', '1', 'NO', 'NO', 'NO', false, null),
  ('1045050093', 'Cedula de ciudadanía', 'Otoniel De Jesus', 'Murillo Ospina', '1996-03-07', 30, 'Masculino', 'Salud Total', 'COLPENSIONES', 'Sura', 'CEDI MEDELLIN', 'Diurno', 'Auxiliar Logistico', '2026-07-21', 'Colombia', 'Antioquia', 'Tamesis', 'Sin Pertenencia Etnica', 'Secundaria Completa', 'Soltero', 'NO', 0, 2, 'Entre 1 Y 2 Salarios Mínimos', 'Apartamento', 'Arrendada', 'Urbana', 'Calle 55 carrera 58 f1 interior 335 fatima itagui', 'Caminando', '2', 'NO', 'SI', 'NO', false, null),
  ('1001885601', 'Cedula de ciudadanía', 'Andres Felipe', 'Escorcia Ucros', '2002-06-04', 24, 'Masculino', 'Mutualser', 'PROTECCIÓN', 'Sura', 'AVIMOL', 'Diurno', 'Auxiliar Logistico', '2026-07-23', 'Colombia', 'Atlántico', 'Soledad', 'Sin Pertenencia Etnica', 'Secundaria Completa', 'Unión libre', 'NO', 0, 4, 'Entre 1 Y 2 Salarios Mínimos', 'Apartamento', 'Familiar', 'Urbana', 'Calle 50 cra 2F-31', 'Transporte público', '1', 'SI', 'SI', 'NO', true, 'La EPS venía escrita "MULTUALSER" y se normalizó a "Mutualser"'),
  ('1193156582', 'Cedula de ciudadanía', 'Anderson Albeiro', 'Castañeda Vira', '2001-02-18', 25, 'Masculino', 'Sura eps', 'PORVENIR', 'Sura', 'CEDI MEDELLIN', 'Mixto', 'Auxiliar Logistico', '2026-07-15', 'Colombia', 'Antioquia', 'Medellin', 'Sin Pertenencia Etnica', 'Secundaria Incompleta', 'Soltero', 'NO', 0, 2, 'Entre 1 Y 2 Salarios Mínimos', 'Casa', 'Familiar', 'Urbana', 'Cr 35 # 40 - 25', 'Moto', '2', 'NO', 'SI', 'SI', false, null),
  ('1143460868', 'Cedula de ciudadanía', 'Anderson Miller', 'De La Rosa Escorcia', '1996-06-19', 30, 'Masculino', 'Mutualser', 'PORVENIR', 'Sura', 'AVIMOL', 'Mixto', 'Auxiliar Logistico', '2026-07-03', 'Colombia', 'Atlántico', 'Barranquilla', 'Sin Pertenencia Etnica', 'Primaria Completa', 'Soltero', 'SI', 1, 4, 'Más de 2 Salarios', 'Casa', 'Familiar', 'Urbana', 'Dg 76 f # 5c - 45', 'Transporte público', '1', 'SI', 'SI', 'SI', true, 'La EPS venía escrita "MULTUALSER" y se normalizó a "Mutualser"'),
  ('1050952664', 'Cedula de ciudadanía', 'Ivan Andres', 'Castro Beltran', '2007-07-02', 19, 'Masculino', 'Sanitas', 'COLPENSIONES', 'Sura', 'HARINERA INDUPAN', 'Mixto', 'Auxiliar Logistico', '2025-09-03', 'Colombia', 'Bolívar', 'Bogotá DC', 'Sin Pertenencia Etnica', 'Secundaria Completa', 'Soltero', 'NO', 0, 2, 'Entre 1 Y 2 Salarios Mínimos', 'Casa', 'Arrendada', 'Urbana', 'Cra 44 # 74 a sur', 'Transporte público', '2', 'NO', 'NO', 'NO', false, null),
  ('5348349', 'Permiso por protección temporal', 'Daniel Jose', 'Rodelo Gil', '1996-06-24', 30, 'Masculino', 'Famisanar', 'PORVENIR', 'Sura', 'HARINERA INDUPAN', 'Mixto', 'Auxiliar Logistico', '2026-08-05', 'Venezuela', 'Caracas', 'Bogotá DC', 'Sin Pertenencia Etnica', 'Secundaria Incompleta', 'Soltero', 'SI', 1, 6, 'Más de 2 Salarios', 'Apartamento', 'Arrendada', 'Urbana', 'Cr 45 c #58 f', 'Transporte público', '2', 'NO', 'NO', 'SI', false, null),
  ('1045704259', 'Cedula de ciudadanía', 'Andreis David', 'Otero Diaz', '1992-01-19', 34, 'Masculino', 'Sura eps', 'PROTECCIÓN', 'Sura', 'AVIMOL', 'Diurno', 'Operario de montacarga', '2026-08-17', 'Colombia', 'Atlántico', 'Barranquilla', 'Sin Pertenencia Etnica', 'Técnico', 'Unión libre', 'SI', 2, 4, 'Entre 1 Y 2 Salarios Mínimos', 'Casa', 'Familiar', 'Urbana', 'Carrera 8 93 76', 'Transporte público', '1', 'NO', 'NO', 'NO', false, null),
  ('1003535166', 'Cedula de ciudadanía', 'Cristian David', 'Mendez Bernal', '2003-06-19', 23, 'Masculino', 'Salud Total', 'PROTECCIÓN', 'Sura', 'HARINERA INDUPAN', 'Diurno', 'Auxiliar Logistico', '2026-08-18', 'Colombia', 'Facatativá', 'Bogotá DC', 'Sin Pertenencia Etnica', 'Secundaria Completa', 'Unión libre', 'NO', 0, 3, 'Entre 1 Y 2 Salarios Mínimos', 'Apartamento', 'Arrendada', 'Urbana', 'Carrera 77A #64D - 12 Sur', 'Transporte público', '2', 'NO', 'SI', 'NO', true, 'Departamento de nacimiento: Facatativá es un municipio, no un departamento'))
insert into public.sst_perfil_sociodemografico as p (
  idempresa, estado, documento, documento_tipo, nombres, apellidos, fecha_nacimiento, edad, sexo,
  eps, afp, arl, centro_trabajo, turno, cargo, fecha_ingreso, pais_nacimiento, depto_nacimiento,
  municipio_residencia, grupo_etnico, nivel_escolaridad, estado_civil, cabeza_familia, num_hijos,
  personas_hogar, ingresos_familiares, tipo_vivienda, caracteristicas_vivienda, zona, direccion,
  transporte, estrato, consume_alcohol, actividad_fisica, fumador,
  requiere_revision, revision_nota, origen, actualizado_en, actualizado_por
)
select
  100, 'activo', c.documento, c.documento_tipo, c.nombres, c.apellidos, c.fecha_nacimiento, c.edad, c.sexo,
  c.eps, c.afp, c.arl, c.centro_trabajo, c.turno, c.cargo, c.fecha_ingreso, c.pais_nacimiento,
  c.depto_nacimiento, nullif(c.municipio_residencia, ''), nullif(c.grupo_etnico, ''),
  c.nivel_escolaridad, c.estado_civil, c.cabeza_familia, c.num_hijos, c.personas_hogar,
  c.ingresos_familiares, nullif(c.tipo_vivienda, ''), c.caracteristicas_vivienda, c.zona, c.direccion,
  c.transporte, c.estrato, c.consume_alcohol, c.actividad_fisica, c.fumador,
  c.requiere_revision, nullif(c.revision_nota, ''),
  'carga_csv', now(), 'Carga CSV formulario Perfil Sociodemografico (67)'
from csv c
on conflict (documento_norm) do update set
  documento_tipo           = excluded.documento_tipo,
  nombres                  = excluded.nombres,
  apellidos                = excluded.apellidos,
  fecha_nacimiento         = excluded.fecha_nacimiento,
  edad                     = excluded.edad,
  sexo                     = excluded.sexo,
  eps                      = excluded.eps,
  afp                      = excluded.afp,
  arl                      = excluded.arl,
  centro_trabajo           = excluded.centro_trabajo,
  turno                    = excluded.turno,
  cargo                    = excluded.cargo,
  fecha_ingreso            = excluded.fecha_ingreso,
  pais_nacimiento          = excluded.pais_nacimiento,
  depto_nacimiento         = excluded.depto_nacimiento,
  municipio_residencia     = excluded.municipio_residencia,
  grupo_etnico             = excluded.grupo_etnico,
  nivel_escolaridad        = excluded.nivel_escolaridad,
  estado_civil             = excluded.estado_civil,
  cabeza_familia           = excluded.cabeza_familia,
  num_hijos                = excluded.num_hijos,
  personas_hogar           = excluded.personas_hogar,
  ingresos_familiares      = excluded.ingresos_familiares,
  tipo_vivienda            = excluded.tipo_vivienda,
  caracteristicas_vivienda = excluded.caracteristicas_vivienda,
  zona                     = excluded.zona,
  direccion                = excluded.direccion,
  transporte               = excluded.transporte,
  estrato                  = excluded.estrato,
  consume_alcohol          = excluded.consume_alcohol,
  actividad_fisica         = excluded.actividad_fisica,
  fumador                  = excluded.fumador,
  requiere_revision        = excluded.requiere_revision,
  revision_nota            = excluded.revision_nota,
  estado                   = 'activo',
  origen                   = 'carga_csv',
  actualizado_en           = now(),
  actualizado_por          = excluded.actualizado_por;


-- ----------------------------------------------------------------------------
-- PASO 3 - REEMPLAZO: fuera lo que no viene en este archivo
--
-- Antes de borrar, las filas se COPIAN a sst_perfil_sd_eliminados_46. No es lo
-- mismo "sobra" que "esta mal": puede haber alguien que diligencio su perfil
-- desde el portal despues de exportar este archivo, y esa informacion es MAS
-- reciente que la que entra. Hay que poder verla y devolverla.
--
-- La lista de documentos salio del bloque VALUES de arriba, asi que no puede
-- quedar desalineada con el.
-- ----------------------------------------------------------------------------
create table if not exists public.sst_perfil_sd_eliminados_46
  (like public.sst_perfil_sociodemografico including defaults excluding generated);

do $$
declare n int;
begin
  insert into public.sst_perfil_sd_eliminados_46
  select p.* from public.sst_perfil_sociodemografico p
   where p.documento_norm is null
      or p.documento_norm not in (
    '1007599302', '80075406', '1049936132', '80037138', '1033712312',
    '1042457110', '1094951357', '1043441052', '1007206556', '1033373410',
    '1042441053', '1003097095', '6679516', '1047488881', '1000442265',
    '1069504611', '1131479081', '1073155377', '1049945704', '1193431838',
    '1002319848', '1004323562', '72260522', '1043604591', '1193510194',
    '1000221742', '1048285137', '98074100', '1131494159', '1002093492',
    '72434584', '1005472692', '1102465336', '1007962505', '1005472020',
    '1026563725', '1016101109', '1052971002', '1001874657', '85084470',
    '72266920', '1043139748', '1140816546', '1048328535', '1001877920',
    '1092338456', '1143463545', '1048320519', '1043586682', '1004504508',
    '8567646', '1007517624', '1082856423', '72347224', '1042437660',
    '1043139276', '1001871824', '1122812110', '72432828', '1045050093',
    '1001885601', '1193156582', '1143460868', '1050952664', '5348349',
    '1045704259', '1003535166'
      );
  get diagnostics n = row_count;

  delete from public.sst_perfil_sociodemografico
   where documento_norm is null
      or documento_norm not in (
    '1007599302', '80075406', '1049936132', '80037138', '1033712312',
    '1042457110', '1094951357', '1043441052', '1007206556', '1033373410',
    '1042441053', '1003097095', '6679516', '1047488881', '1000442265',
    '1069504611', '1131479081', '1073155377', '1049945704', '1193431838',
    '1002319848', '1004323562', '72260522', '1043604591', '1193510194',
    '1000221742', '1048285137', '98074100', '1131494159', '1002093492',
    '72434584', '1005472692', '1102465336', '1007962505', '1005472020',
    '1026563725', '1016101109', '1052971002', '1001874657', '85084470',
    '72266920', '1043139748', '1140816546', '1048328535', '1001877920',
    '1092338456', '1143463545', '1048320519', '1043586682', '1004504508',
    '8567646', '1007517624', '1082856423', '72347224', '1042437660',
    '1043139276', '1001871824', '1122812110', '72432828', '1045050093',
    '1001885601', '1193156582', '1143460868', '1050952664', '5348349',
    '1045704259', '1003535166'
      );

  if n = 0 then
    raise notice 'Reemplazo: no habia perfiles ajenos a este archivo. Nada que borrar.';
  else
    raise notice 'Reemplazo: % perfiles NO venian en el archivo. Se movieron a sst_perfil_sd_eliminados_46 y se borraron del censo.', n;
  end if;
end $$;


-- ============================================================================
-- VERIFICACION: correr despues y revisar las cinco.
-- ============================================================================

-- 1) Esperado EXACTAMENTE: 67 perfiles en total, 67 del CSV y 14 marcados.
--    Si "total_perfiles" no da 67, el reemplazo no se aplico.
select count(*)                                     as total_perfiles,
       count(*) filter (where requiere_revision)    as por_revisar,
       count(*) filter (where origen = 'carga_csv') as cargados_del_csv,
       count(distinct documento_norm)               as personas_distintas
  from public.sst_perfil_sociodemografico;

-- 2) Las 14 filas marcadas, con el motivo. Es la lista de trabajo de SST y es
--    la misma que muestra la pestana "Por corregir" del modulo.
select documento, apellidos, nombres, eps, municipio_residencia, grupo_etnico,
       tipo_vivienda, depto_nacimiento, revision_nota
  from public.sst_perfil_sociodemografico
 where requiere_revision
 order by apellidos;

-- 3) QUE SE BORRO. Si aparece alguien que diligencio su perfil desde el portal
--    hace poco, su informacion es mas reciente que la del archivo y
--    seguramente hay que devolverla (ver el bloque del final).
--    Si sale vacia, el censo ya era exactamente este archivo.
select documento, apellidos, nombres, origen, actualizado_en, actualizado_por
  from public.sst_perfil_sd_eliminados_46
 order by actualizado_en desc nulls last, apellidos;

-- 4) EL CRUCE QUE IMPORTA: quien tiene perfil sin ficha MEDEVAC y al reves.
--    Esperado: exactamente 2 y 2 - Yilfred y Arleis, por el documento que no
--    cuadra. Si sale alguien mas, hay algo que revisar.
select 'perfil sin ficha MEDEVAC' as caso, p.documento, p.apellidos || ' ' || p.nombres as persona
  from public.sst_perfil_sociodemografico p
  left join public.sst_medevac m on m.documento_norm = p.documento_norm
 where m.id is null
union all
select 'ficha MEDEVAC sin perfil', m.documento, m.nombres
  from public.sst_medevac m
  left join public.sst_perfil_sociodemografico p on p.documento_norm = m.documento_norm
 where p.id is null
 order by 1, 3;

-- 5) La cobertura ya con el censo completo. Es lo que muestra la pestana
--    Cobertura del modulo MEDEVAC.
select count(*)                                 as activos_headcount,
       count(*) filter (where medevac_completo) as medevac_completo,
       count(*) filter (where perfil_completo)  as perfil_completo
  from public.vw_sst_datos_colaborador
 where lower(coalesce(estado,'')) = 'activo';


-- ============================================================================
-- PARA DEVOLVER ALGO DE LO BORRADO
--
-- La consulta 3 lista lo que salio. Para devolver a UNA persona, reinsertarla
-- desde la tabla de eliminados. Cambiar la cedula y descomentar:
--
--   insert into public.sst_perfil_sociodemografico (
--     idempresa, estado, documento, documento_tipo, nombres, apellidos,
--     fecha_nacimiento, edad, sexo, eps, afp, arl, centro_trabajo, turno, cargo,
--     fecha_ingreso, pais_nacimiento, depto_nacimiento, municipio_residencia,
--     grupo_etnico, nivel_escolaridad, estado_civil, cabeza_familia, num_hijos,
--     personas_hogar, ingresos_familiares, tipo_vivienda, caracteristicas_vivienda,
--     zona, direccion, transporte, estrato, consume_alcohol, actividad_fisica,
--     fumador, origen, actualizado_en, actualizado_por)
--   select idempresa, estado, documento, documento_tipo, nombres, apellidos,
--     fecha_nacimiento, edad, sexo, eps, afp, arl, centro_trabajo, turno, cargo,
--     fecha_ingreso, pais_nacimiento, depto_nacimiento, municipio_residencia,
--     grupo_etnico, nivel_escolaridad, estado_civil, cabeza_familia, num_hijos,
--     personas_hogar, ingresos_familiares, tipo_vivienda, caracteristicas_vivienda,
--     zona, direccion, transporte, estrato, consume_alcohol, actividad_fisica,
--     fumador, origen, actualizado_en, actualizado_por
--     from public.sst_perfil_sd_eliminados_46
--    where documento = 'PONER_AQUI_LA_CEDULA'
--   on conflict (documento_norm) do nothing;
--
-- PARA REVERTIR TODO el censo al estado anterior a este script:
--   public.sst_perfil_sd_backup_46 tiene la foto completa de como estaba.
-- ============================================================================
