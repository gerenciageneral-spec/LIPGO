-- =====================================================================
-- 45 · Perfil Sociodemografico (SST-FOR-32): recarga desde el formulario
--
-- Requiere haber corrido antes scripts/sig/44_medevac_perfil_enlace_y_carga.sql,
-- que es el que crea `documento_norm` y su indice unico. Sin eso el upsert de
-- aqui falla.
--
-- REEMPLAZA EL CENSO COMPLETO. Al terminar, `sst_perfil_sociodemografico`
-- queda con EXACTAMENTE las filas de este archivo y nada mas. Lo que hubiera
-- antes y no venga aqui SE ELIMINA -- incluido lo que un trabajador haya
-- diligenciado desde el portal.
--
-- Nada se pierde de verdad: antes de borrar, esas filas se copian a
-- public.sst_perfil_sd_eliminados_45 para poder revisarlas o devolverlas.
--
-- IDEMPOTENTE: se puede correr varias veces; el resultado es el mismo.
-- Correr en Supabase.
--
-- ============================ LEER ANTES =============================
--
-- 1. EL ARCHIVO LLEGO INCOMPLETO. Trae 29 filas completas; la numero 30
--    (Carlos Daniel Ojito Sarabia, doc 1002093492) venia cortada a mitad
--    -- "...HARINERA INDUPAN,Diurno,Auxiliar" -- y no se sabe si habia mas
--    filas despues. NO se adivino nada: esa fila y las que siguieran NO
--    entran. Para cargarlas basta con volver a correr este script con las
--    filas que falten agregadas al bloque VALUES.
--
-- 2. HAY UN DOCUMENTO QUE NO CUADRA CON MEDEVAC.
--       Yilfred Jimenez Solano   perfil: 80037138   MEDEVAC: 80027128
--    El documento es la LLAVE que enlaza los dos formatos. Mientras no se
--    unifique, esa persona queda con ficha de emergencia y perfil sueltos:
--    en Cobertura saldra como "le falta el perfil" aunque lo tenga. NO se
--    corrigio aqui porque no hay forma de saber cual de los dos es el bueno.
--    La consulta 4 de verificacion lo deja a la vista.
--
-- 3. QUE SE HIZO CON LOS DATOS
--    · Fechas DD/MM/AAAA -> AAAA-MM-DD. Es el unico formato en el que el
--      orden alfabetico es el cronologico.
--    · `edad` se DERIVA de la fecha de nacimiento, no se copia del archivo:
--      una edad guardada deja de ser cierta al ano siguiente y la fecha no.
--      (Se verifico: las 29 edades derivadas coinciden con las del archivo.)
--    · Las columnas "Dia", "Mes" y "Ano" del archivo NO se guardan: son la
--      ANTIGUEDAD, que se calcula sola desde `fecha_ingreso`. Guardarla
--      seria congelar un numero que cambia todos los dias.
--    · Tampoco se guardan "N°" ni "Marca temporal".
--    · La EPS se lleva a la misma escritura que ya quedo en MEDEVAC. Sin
--      eso, "SALUD TOTAL" y "Salud Total" contarian como dos EPS distintas
--      y los informes no cuadrarian entre los dos modulos. Las escrituras
--      erroneas ("MULTUALSER", "Mutual set" -> "Mutualser") se corrigen y la
--      fila queda MARCADA.
--    · A un municipio de residencia le quedo el texto de ayuda del
--      formulario ("Municipio"): se deja vacio y la fila queda marcada.
--
-- OJO CON EL VOCABULARIO: "Tipo de vivienda" es la clase de inmueble (Casa,
-- Apartamento) y "Caracteristicas" es la tenencia (Propia, Arrendada,
-- Familiar). Es al reves de lo que sugieren los nombres, pero es como esta el
-- formulario y como quedan los datos.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) RESPALDO antes de tocar nada.
-- ---------------------------------------------------------------------
do $$
begin
  if to_regclass('public.sst_perfil_sd_backup_45') is null then
    create table public.sst_perfil_sd_backup_45 as select * from public.sst_perfil_sociodemografico;
    raise notice 'Respaldo creado: sst_perfil_sd_backup_45 (% filas)',
      (select count(*) from public.sst_perfil_sd_backup_45);
  else
    raise notice 'sst_perfil_sd_backup_45 ya existe, no se sobrescribe.';
  end if;
end $$;

-- ---------------------------------------------------------------------
-- 2) COLUMNAS DE CONTROL DE CALIDAD, iguales a las de MEDEVAC.
-- ---------------------------------------------------------------------
alter table public.sst_perfil_sociodemografico
  add column if not exists requiere_revision boolean default false,
  add column if not exists revision_nota     text;

-- Guardia: si no se corrio el script 44, el upsert de abajo fallaria con un
-- mensaje que no dice nada. Mejor detenerse aqui explicando por que.
do $$
begin
  if not exists (
    select 1 from pg_indexes
     where schemaname = 'public' and indexname = 'ux_sst_perfil_sd_documento'
  ) then
    raise exception 'Falta el indice ux_sst_perfil_sd_documento. Corre primero scripts/sig/44_medevac_perfil_enlace_y_carga.sql';
  end if;
end $$;

-- ---------------------------------------------------------------------
-- 3) LAS 29 FILAS DEL FORMULARIO
--
-- Upsert por documento: al que ya esta se le actualiza el perfil, al que no
-- esta se le crea. El borrado de lo que sobra va DESPUES, en el paso 4, y a
-- proposito en ese orden: si algo falla aqui el script se detiene y la tabla
-- se queda como estaba, en vez de quedar vacia a medio camino.
-- ---------------------------------------------------------------------
with csv (documento, documento_tipo, nombres, apellidos, fecha_nacimiento, edad, sexo, eps, afp, arl,
          centro_trabajo, turno, cargo, fecha_ingreso, pais_nacimiento, depto_nacimiento, municipio_residencia,
          grupo_etnico, nivel_escolaridad, estado_civil, cabeza_familia, num_hijos, personas_hogar,
          ingresos_familiares, tipo_vivienda, caracteristicas_vivienda, zona, direccion, transporte, estrato,
          consume_alcohol, actividad_fisica, fumador) as (
values
  ('1007599302', 'Cedula de ciudadanía', 'Yordin Andres', 'Cueto Herrera', '1993-06-02', 33, 'Masculino', 'Salud Total', 'PROTECCIÓN', 'Sura', 'ADMINISTRATIVO', 'Diurno', 'Coordinador de Gestion Humana', '2025-05-03', 'Colombia', 'Atlántico', 'Medellin', 'Sin Pertenencia Etnica', 'Técnico', 'Unión libre', 'SI', 1, 3, 'Más de 2 Salarios', 'Apartamento', 'Familiar', 'Urbana', 'CR 29 74 33', 'Vehículo particular', '4', 'NO', 'NO', 'NO'),
  ('80075406', 'Cedula de ciudadanía', 'Jeffrey Joel', 'Jimenez Rodriguez', '1985-07-25', 41, 'Masculino', 'Sanitas', 'PORVENIR', 'Sura', 'ADMINISTRATIVO', 'Diurno', 'Representante Legal', '2025-02-01', 'Colombia', 'Guajira', 'Valledupar', 'Sin Pertenencia Etnica', 'Postgrado', 'Casado', 'SI', 2, 5, 'Más de 2 Salarios', 'Casa', 'Propia', 'Urbana', 'Calle 4B No. 20-66', 'Vehículo particular', '3', 'SI', 'SI', 'NO'),
  ('1049936132', 'Cedula de ciudadanía', 'Eduar David', 'Batista Arrieta', '2005-08-20', 21, 'Masculino', 'Famisanar', 'PROTECCIÓN', 'Sura', 'CEDI FUNZA', 'Diurno', 'Auxiliar Logistico', '2026-03-05', 'Colombia', 'Bolívar', 'Mosquera', 'Sin Pertenencia Etnica', 'Secundaria Completa', 'Soltero', 'SI', 1, 3, 'Entre 1 Y 2 Salarios Mínimos', 'Apartamento', 'Arrendada', 'Urbana', 'Cra 2a_480', 'Bicicleta', '2', 'NO', 'SI', 'NO'),
  ('80037138', 'Cedula de ciudadanía', 'Yilfred', 'Jiménez Solano', '1980-07-05', 46, 'Masculino', 'Sura eps', 'PORVENIR', 'Sura', 'ADMINISTRATIVO', 'Diurno', 'Gerente General', '2024-04-20', 'Colombia', 'Guajira', 'Mosquera', 'Sin Pertenencia Etnica', 'Postgrado', 'Unión libre', 'SI', 1, 2, 'Más de 2 Salarios', 'Apartamento', 'Propia', 'Urbana', 'Calle 10# 14a 77', 'Vehículo particular', '4', 'NO', 'SI', 'NO'),
  ('1033712312', 'Cedula de ciudadanía', 'Fabio Nelson', 'Rubiano Flautero', '2007-07-03', 19, 'Masculino', 'Salud Total', 'PROTECCIÓN', 'Sura', 'CEDI FUNZA', 'Mixto', 'Auxiliar Logistico', '2026-05-20', 'Colombia', 'Cundinamarca', 'Mosquera cundinamarca', 'Sin Pertenencia Etnica', 'Secundaria Completa', 'Soltero', 'NO', 0, 4, 'Entre 1 Y 2 Salarios Mínimos', 'Apartamento', 'Arrendada', 'Urbana', 'Calle 17b # 3e-20 Iregui 1', 'Bicicleta', '1', 'NO', 'SI', 'NO'),
  ('1042457110', 'Cedula de ciudadanía', 'Luis ángel', 'Zambrano de moya', '1997-10-06', 28, 'Masculino', 'Salud Total', 'PORVENIR', 'Sura', 'AVIMOL', 'Mixto', 'Auxiliar Logistico', '2026-04-13', 'Colombia', 'Atlántico', 'Soledad Atlántico', 'Sin Pertenencia Etnica', 'Secundaria Incompleta', 'Soltero', 'SI', 2, 4, 'Entre 1 Y 2 Salarios Mínimos', 'Casa', 'Familiar', 'Suburbana', 'Calle 58 1d 80', 'Transporte público', '1', 'SI', 'NO', 'NO'),
  ('1094951357', 'Cedula de ciudadanía', 'Manuela', 'Merchan Jimenez', '1995-09-07', 30, 'Femenino', 'Sura eps', 'PORVENIR', 'Sura', 'ADMINISTRATIVO', 'Diurno', 'Gerente comercial', '2024-01-20', 'Colombia', 'Cundinamarca', 'Bogotá DC', 'Sin Pertenencia Etnica', 'Profesional', 'Unión libre', 'SI', 0, 2, 'Entre 1 Y 2 Salarios Mínimos', 'Apartamento', 'Propia', 'Urbana', 'Cll 10s #14a-77', 'Vehículo particular', '4', 'NO', 'SI', 'NO'),
  ('1043441052', 'Cedula de ciudadanía', 'Cesar Antonio', 'Fuentes de la ossa', '2005-07-20', 21, 'Masculino', 'Sura eps', 'PROTECCIÓN', 'Sura', 'AVIMOL', 'Diurno', 'Auxiliar Logistico', '2026-03-02', 'Colombia', 'Atlántico', 'Barranquilla', 'Sin Pertenencia Etnica', 'Secundaria Completa', 'Unión libre', 'SI', 1, 6, 'Entre 1 Y 2 Salarios Mínimos', 'Casa', 'Arrendada', 'Urbana', 'Calle 51b # 8d - 24', 'Moto', '2', 'SI', 'SI', 'NO'),
  ('1007206556', 'Cedula de ciudadanía', 'Victor Manuel', 'Berrio Vasquez', '1996-03-13', 30, 'Masculino', 'Famisanar', 'PORVENIR', 'Sura', 'CEDI FUNZA', 'Diurno', 'Auxiliar Logistico', '2026-02-07', 'Colombia', 'Sucre', 'Funza Cundinamarca', 'Sin Pertenencia Etnica', 'Primaria Incompleta', 'Unión libre', 'SI', 1, 4, 'Entre 1 Y 2 Salarios Mínimos', 'Apartamento', 'Arrendada', 'Urbana', 'Carre.5 12 .38', 'Bicicleta', '1', 'NO', 'SI', 'NO'),
  ('1033373410', 'Cedula de ciudadanía', 'Manuel Alberto', 'Agamez Florez', '1991-09-15', 34, 'Masculino', 'Famisanar', 'PROTECCIÓN', 'Sura', 'CEDI FUNZA', 'Diurno', 'Operario de montacarga', '2025-02-06', 'Colombia', 'Antioquia', 'Bogotá DC', 'Sin Pertenencia Etnica', 'Secundaria Completa', 'Unión libre', 'SI', 0, 2, 'Entre 1 Y 2 Salarios Mínimos', 'Casa', 'Arrendada', 'Urbana', 'Calle 78a #106-15', 'Moto', '3', 'NO', 'NO', 'NO'),
  ('1042441053', 'Cedula de ciudadanía', 'Richard andres', 'Altamar Cuadrado', '1991-03-30', 35, 'Masculino', 'Salud Total', 'PORVENIR', 'Sura', 'AVIMOL', 'Mixto', 'Auxiliar Logistico', '2026-03-03', 'Colombia', 'Atlántico', null, null, 'Primaria Incompleta', 'Unión libre', 'NO', 4, 4, 'Entre 1 Y 2 Salarios Mínimos', 'Casa', 'Arrendada', 'Rural', '19A-27', 'Transporte público', '1', 'NO', 'NO', 'SI'),
  ('1003097095', 'Cedula de ciudadanía', 'Deiver', 'López de la Rosa', '1995-03-07', 31, 'Masculino', 'Nueva eps S.A.', 'PORVENIR', 'Sura', 'CEDI MEDELLIN', 'Diurno', 'Auxiliar Logistico', '2026-05-04', 'Colombia', 'Córdoba', 'Medellín', 'Sin Pertenencia Etnica', 'Primaria Completa', 'Unión libre', 'SI', 3, 3, 'Entre 1 Y 2 Salarios Mínimos', null, 'Arrendada', 'Urbana', 'CLL 60#49_29', 'Transporte público', '1', 'NO', 'NO', 'NO'),
  ('6679516', 'Permiso por protección temporal', 'Jesús David', 'Escalona Olmos', '2001-04-10', 25, 'Masculino', 'Nueva eps S.A.', 'COLPENSIONES', 'Sura', 'CEDI MEDELLIN', 'Diurno', 'Auxiliar Logistico', '2026-06-18', 'Venezuela', 'Trujillo', 'Medellín', 'Sin Pertenencia Etnica', 'Secundaria Completa', 'Soltero', 'SI', 1, 4, 'Entre 1 Y 2 Salarios Mínimos', 'Apartamento', 'Arrendada', 'Urbana', 'CL 101 # 50c - 198', 'Transporte público', '2', 'NO', 'SI', 'NO'),
  ('1047488881', 'Cedula de ciudadanía', 'Edgar Miguel', 'Coneo Herrera', '1996-06-15', 30, 'Masculino', 'Coosalud', 'PORVENIR', 'Sura', 'CEDI MEDELLIN', 'Diurno', 'Auxiliar Logistico', '2026-06-05', 'Colombia', 'Bolívar', 'Medellín', null, 'Secundaria Completa', 'Unión libre', 'SI', 0, 3, 'Entre 1 Y 2 Salarios Mínimos', 'Apartamento', 'Arrendada', 'Urbana', 'Calle 47 9', 'Caminando', '1', 'SI', 'NO', 'SI'),
  ('1000442265', 'Cedula de ciudadanía', 'Yerson Estiven', 'Restrepo Laverde', '2002-08-18', 24, 'Masculino', 'Salud Total', 'PORVENIR', 'Sura', 'CEDI MEDELLIN', 'Diurno', 'Auxiliar Logistico', '2026-04-08', 'Colombia', 'Antioquia', 'Medellin', 'Sin Pertenencia Etnica', 'Secundaria Completa', 'Unión libre', 'SI', 0, 2, 'Entre 1 Y 2 Salarios Mínimos', 'Apartamento', 'Arrendada', 'Urbana', 'Castilla', 'Transporte público', '5', 'NO', 'SI', 'NO'),
  ('1069504611', 'Cedula de ciudadanía', 'Arnaldo Jose', 'Oviedo Martínez', '1998-06-07', 28, 'Masculino', 'Salud Total', 'PROTECCIÓN', 'Sura', 'CEDI MEDELLIN', 'Mixto', 'Auxiliar Logistico', '2026-06-19', 'Colombia', 'Córdoba', 'Itagüí', 'Sin Pertenencia Etnica', 'Secundaria Completa', 'Soltero', 'NO', 1, 1, 'Entre 1 Y 2 Salarios Mínimos', 'Casa', 'Arrendada', 'Urbana', 'CARRERA 50#24-70', 'Transporte público', '3', 'NO', 'SI', 'NO'),
  ('1131479081', 'Cedula de ciudadanía', 'Juvenal', 'Cristo Ramirez', '2003-02-07', 23, 'Masculino', 'Mutualser', 'COLPENSIONES', 'Sura', 'HARINERA INDUPAN', 'Mixto', 'Operario de montacarga', '2026-06-23', 'Colombia', 'Bolívar', 'Bogotá DC', 'Sin Pertenencia Etnica', 'Primaria Completa', 'Soltero', 'SI', 1, 3, 'Entre 1 Y 2 Salarios Mínimos', 'Apartamento', 'Arrendada', 'Rural', '137b#154a72', 'Transporte público', '1', 'NO', 'SI', 'NO'),
  ('1073155377', 'Cedula de ciudadanía', 'Yull alexander', 'Contento riveros', '1988-07-16', 38, 'Masculino', 'Famisanar', 'COLFONDOS', 'Sura', 'ADMINISTRATIVO', 'Diurno', 'Coordinador de operaciones', '2025-11-01', 'Colombia', 'Cundinamarca', 'Madrid', 'Sin Pertenencia Etnica', 'Tecnólogo', 'Soltero', 'SI', 1, 3, 'Más de 2 Salarios', 'Casa', 'Arrendada', 'Urbana', 'Carrera 22a # 6a -38', 'Vehículo particular', '2', 'NO', 'NO', 'NO'),
  ('1049945704', 'Cedula de ciudadanía', 'Raúl Enrique', 'Mendoza padilla', '1997-10-21', 28, 'Masculino', 'Sura eps', 'PORVENIR', 'Sura', 'CEDI FUNZA', 'Mixto', 'Auxiliar Logistico', '2026-02-05', 'Colombia', 'Bolívar', 'Bogotá DC', 'Sin Pertenencia Etnica', 'Secundaria Incompleta', 'Soltero', 'SI', 3, 4, 'Entre 1 Y 2 Salarios Mínimos', 'Apartamento', 'Arrendada', 'Urbana', 'Planada Mosquera', 'Bicicleta', '1', 'SI', 'SI', 'NO'),
  ('1193431838', 'Cedula de ciudadanía', 'Jovanis De Jesus', 'Villalobos Martinez', '1999-03-22', 27, 'Masculino', 'Salud Total', 'PORVENIR', 'Sura', 'CEDI FUNZA', 'Diurno', 'Auxiliar Logistico', '2025-05-13', 'Colombia', 'Guajira', 'Bogotá DC', 'Sin Pertenencia Etnica', 'Secundaria Completa', 'Soltero', 'SI', 1, 2, 'Entre 1 Y 2 Salarios Mínimos', 'Casa', 'Arrendada', 'Suburbana', 'CALLE 11-8 05', 'Caminando', '2', 'NO', 'SI', 'NO'),
  ('1002319848', 'Cedula de ciudadanía', 'Ander fabian', 'Barrera Batista', '1990-03-17', 36, 'Masculino', 'Famisanar', 'PROTECCIÓN', 'Sura', 'CEDI FUNZA', 'Mixto', 'Coordinador de operaciones', '2025-04-08', 'Colombia', 'Bolívar', 'Bogotá DC', 'Sin Pertenencia Etnica', 'Secundaria Incompleta', 'Unión libre', 'SI', 3, 5, 'Entre 1 Y 2 Salarios Mínimos', 'Apartamento', 'Arrendada', 'Urbana', 'Cr1#24_24', 'Caminando', '3', 'SI', 'SI', 'NO'),
  ('1004323562', 'Cedula de ciudadanía', 'Yefrey Junior', 'De la cruz', '2002-06-22', 24, 'Masculino', 'Salud Total', 'PORVENIR', 'Sura', 'AVIMOL', 'Diurno', 'Auxiliar Logistico', '2025-05-20', 'Colombia', 'Magdalena', 'Soledad', 'Sin Pertenencia Etnica', 'Secundaria Completa', 'Unión libre', 'SI', 1, 3, 'Entre 1 Y 2 Salarios Mínimos', 'Apartamento', 'Arrendada', 'Urbana', 'Calle 11=#19b-12', 'Transporte público', '2', 'SI', 'SI', 'NO'),
  ('72260522', 'Cedula de ciudadanía', 'Brian jose', 'Sanchez Mora', '1981-04-07', 45, 'Masculino', 'Salud Total', 'PROTECCIÓN', 'Sura', 'ADMINISTRATIVO', 'Diurno', 'Coordinador de operaciones', '2025-04-01', 'Colombia', 'Atlántico', 'barranquilla', 'Sin Pertenencia Etnica', 'Profesional', 'Casado', 'SI', 3, 3, 'Entre 1 Y 2 Salarios Mínimos', 'Apartamento', 'Propia', 'Urbana', 'calle 100 numero 19 sur - 40 torre 1 apto 804', 'Transporte público', '2', 'NO', 'NO', 'NO'),
  ('1043604591', 'Cedula de ciudadanía', 'Miguel Ángel', 'Machacon Hernández', '1987-02-06', 39, 'Masculino', 'Mutualser', 'COLFONDOS', 'Sura', 'AVIMOL', 'Diurno', 'Operario de montacarga', '2026-03-09', 'Colombia', 'Atlántico', null, 'Sin Pertenencia Etnica', 'Técnico', 'Soltero', 'NO', 1, 2, 'Entre 1 Y 2 Salarios Mínimos', 'Apartamento', 'Familiar', 'Rural', 'Calle 116 42b91', 'Moto', '3', 'SI', 'SI', 'NO'),
  ('1193510194', 'Cedula de ciudadanía', 'Antoni Miguel', 'Castillo', '1989-09-10', 36, 'Masculino', 'Compensar', 'PORVENIR', 'Sura', 'HARINERA INDUPAN', 'Diurno', 'Auxiliar Logistico', '2026-01-26', 'Colombia', 'Tumaco Nariño', 'Bogotá DC', 'Sin Pertenencia Etnica', 'Primaria Completa', 'Soltero', 'NO', 1, 4, 'Entre 1 Y 2 Salarios Mínimos', 'Apartamento', 'Arrendada', 'Urbana', 'CR 56 2 B-82 P 2', 'Transporte público', '3', 'SI', 'NO', 'NO'),
  ('1000221742', 'Cedula de ciudadanía', 'Deivid Daniel', 'Parra Ossa', '2000-03-01', 26, 'Masculino', 'Salud Total', 'COLPENSIONES', 'Sura', 'HARINERA INDUPAN', 'Diurno', 'Operario de montacarga', '2024-11-01', 'Colombia', 'Cundinamarca', 'Bogotá DC', 'Sin Pertenencia Etnica', 'Secundaria Completa', 'Soltero', 'NO', 0, 5, 'Entre 1 Y 2 Salarios Mínimos', 'Casa', 'Familiar', 'Urbana', 'Calle 3 b bis #5b 11 este', 'Moto', '2', 'SI', 'NO', 'NO'),
  ('1048285137', 'Cedula de ciudadanía', 'Habido Rafael', 'Jiménez suarez', '2001-10-31', 24, 'Masculino', 'Salud Total', 'PORVENIR', 'Sura', 'HARINERA INDUPAN', 'Diurno', 'Operario de montacarga', '2026-01-09', 'Colombia', 'Atlántico', 'Bogotá DC', 'Sin Pertenencia Etnica', 'Secundaria Completa', 'Unión libre', 'SI', 3, 6, 'Entre 1 Y 2 Salarios Mínimos', 'Apartamento', 'Arrendada', 'Urbana', 'Calle 2a #55-44', 'Bicicleta', '2', 'SI', 'SI', 'SI'),
  ('98074100', 'Cedula de ciudadanía', 'Carlos Armando', 'Lopez Velasquez', '1979-01-05', 47, 'Masculino', 'Sanitas', 'PORVENIR', 'Sura', 'HARINERA INDUPAN', 'Diurno', 'Auxiliar Logistico', '2026-03-23', 'Colombia', 'Nariño', 'Bogotá DC', 'Sin Pertenencia Etnica', 'Primaria Incompleta', 'Unión libre', 'SI', 2, 4, 'Entre 1 Y 2 Salarios Mínimos', 'Apartamento', 'Arrendada', 'Urbana', 'Calle 49a #5b 63', 'Transporte público', '2', 'NO', 'NO', 'NO'),
  ('1131494159', 'Cedula de ciudadanía', 'Osvaldo', 'Castro Palomino', '1986-04-07', 40, 'Masculino', 'Mutualser', 'PORVENIR', 'Sura', 'HARINERA INDUPAN', 'Diurno', 'Auxiliar Logistico', '2025-07-17', 'Colombia', 'Bolívar', 'Bogotá DC', 'Sin Pertenencia Etnica', 'Primaria Incompleta', 'Unión libre', 'SI', 2, 3, 'Entre 1 Y 2 Salarios Mínimos', 'Apartamento', 'Arrendada', 'Urbana', 'El lucero', 'Transporte público', '2', 'NO', 'SI', 'SI'))
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
  n.nota is not null, n.nota,
  'carga_csv', now(), 'Carga CSV formulario Perfil Sociodemografico'
from csv c
left join (values
  ('1042441053', 'El municipio de residencia quedó con el texto de ayuda del formulario ("Municipio")'),
  ('1131479081', 'La EPS venía escrita "MULTUALSER" y se normalizó a "Mutualser"'),
  ('1043604591', 'La EPS venía escrita "MULTUALSER" y se normalizó a "Mutualser"'),
  ('1131494159', 'La EPS venía escrita "Mutual set" y se normalizó a "Mutualser"'),
  ('80037138',   'El documento no coincide con el de su ficha MEDEVAC (80027128): mientras no se unifique, la ficha y el perfil quedan sueltos')
) as n(doc, nota) on n.doc = c.documento
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

-- ---------------------------------------------------------------------
-- 4) REEMPLAZO: fuera lo que no viene en este archivo
--
-- Se ejecuta DESPUES del upsert de arriba a proposito. Si aquel hubiera
-- fallado, el script se detiene antes de llegar aqui y la tabla se queda como
-- estaba; al reves -- borrar primero -- una falla dejaria el censo vacio.
--
-- La lista de documentos se extrajo del bloque VALUES de este mismo archivo,
-- asi que no puede quedar desalineada con el.
--
-- Antes de borrar, las filas se COPIAN a sst_perfil_sd_eliminados_45. No es
-- lo mismo "sobra" que "esta mal": puede haber gente que diligencio su perfil
-- desde el portal despues de que se exporto este archivo, y esa informacion
-- hay que poder recuperarla.
-- ---------------------------------------------------------------------
create table if not exists public.sst_perfil_sd_eliminados_45
  (like public.sst_perfil_sociodemografico including defaults excluding generated);

do $$
declare n int;
begin
  insert into public.sst_perfil_sd_eliminados_45
  select p.* from public.sst_perfil_sociodemografico p
   where p.documento_norm is null
      or p.documento_norm not in (
    '1007599302', '80075406', '1049936132', '80037138', '1033712312',
    '1042457110', '1094951357', '1043441052', '1007206556', '1033373410',
    '1042441053', '1003097095', '6679516', '1047488881', '1000442265',
    '1069504611', '1131479081', '1073155377', '1049945704', '1193431838',
    '1002319848', '1004323562', '72260522', '1043604591', '1193510194',
    '1000221742', '1048285137', '98074100', '1131494159'
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
    '1000221742', '1048285137', '98074100', '1131494159'
      );

  if n = 0 then
    raise notice 'Reemplazo: no habia perfiles ajenos a este archivo. Nada que borrar.';
  else
    raise notice 'Reemplazo: % perfiles NO venian en el archivo. Se movieron a sst_perfil_sd_eliminados_45 y se borraron del censo.', n;
  end if;
end $$;

-- =====================================================================
-- VERIFICACION: correr despues y revisar las cinco.
-- =====================================================================

-- 1) Cuantos quedaron y cuantos hay que revisar.
--    Esperado EXACTAMENTE: 29 perfiles en total, 29 del CSV y 5 marcados.
--    Si "total_perfiles" no da 29, el reemplazo no se aplico.
select count(*)                                     as total_perfiles,
       count(*) filter (where requiere_revision)    as por_revisar,
       count(*) filter (where origen = 'carga_csv') as cargados_del_csv,
       count(distinct documento_norm)               as personas_distintas
  from public.sst_perfil_sociodemografico;

-- 2) Las filas marcadas, con el motivo.
select documento, apellidos, nombres, eps, municipio_residencia, revision_nota
  from public.sst_perfil_sociodemografico
 where requiere_revision
 order by apellidos;

-- 3) QUE SE BORRO. Perfiles que existian y no venian en este archivo.
--    REVISAR ESTO: si aparece alguien que diligencio su perfil desde el portal
--    hace poco, su informacion es mas reciente que la del archivo y
--    seguramente hay que devolverla (ver el bloque del final).
--    Si sale vacia, el censo ya era exactamente este archivo.
select documento, apellidos, nombres, origen, actualizado_en, actualizado_por
  from public.sst_perfil_sd_eliminados_45
 order by actualizado_en desc nulls last, apellidos;

-- 4) EL CRUCE QUE IMPORTA: perfiles cuyo documento no existe en MEDEVAC, y
--    fichas MEDEVAC sin perfil. Aqui es donde sale el caso de Yilfred.
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

-- 5) La cobertura ya con los perfiles cargados: cuanta gente activa sigue sin
--    completar. Es lo que muestra la pestana Cobertura del modulo MEDEVAC.
select count(*)                                 as activos_headcount,
       count(*) filter (where medevac_completo) as medevac_completo,
       count(*) filter (where perfil_completo)  as perfil_completo
  from public.vw_sst_datos_colaborador
 where lower(coalesce(estado,'')) = 'activo';

-- =====================================================================
-- SI HAY QUE DEVOLVER ALGO DE LO BORRADO
--
-- La consulta 3 lista lo que salio. Para devolver a UNA persona -- por ejemplo
-- alguien que diligencio su perfil desde el portal y por eso no venia en el
-- archivo -- basta con reinsertarla desde la tabla de eliminados. Cambiar la
-- cedula y descomentar:
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
--     from public.sst_perfil_sd_eliminados_45
--    where documento = 'PONER_AQUI_LA_CEDULA'
--   on conflict (documento_norm) do nothing;
--
-- PARA REVERTIR TODO EL CENSO al estado anterior a este script:
--   public.sst_perfil_sd_backup_45 tiene la foto completa de como estaba.
-- =====================================================================
