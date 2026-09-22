-- ============================================================================
-- 190 — ¿CÓMO ESTÁN GUARDADOS LOS CELULARES DE LOS CONDUCTORES?
-- ----------------------------------------------------------------------------
-- Diagnóstico. NO modifica nada: solo lecturas.
--
-- POR QUÉ, ANTES DE QUITAR EL DESVÍO DE PRUEBAS
-- Mientras los avisos iban a un número fijo, el formato de `cabeceraoc.celular`
-- daba igual. Al pasar a real, ese campo pasa a decidir si el mensaje sale o
-- no: WhatsApp exige el número completo con indicativo y sin signos.
--
-- Un celular colombiano tiene 10 dígitos empezando por 3 (3215698570). Con 9,
-- con espacios, con guiones o vacío, la normalización devuelve null y el aviso
-- no se envía. No es una falla ruidosa: el conductor simplemente no recibe nada
-- y en el historial queda un intento sin mensaje.
--
-- Esto cuenta cuántos hay de cada clase ANTES de activar, en vez de
-- descubrirlo cargue por cargue.
-- ============================================================================


-- ----------------------------------------------------------------------------
-- 1 — DÓNDE ESTÁ EL TELÉFONO
-- ----------------------------------------------------------------------------

select column_name, data_type
from information_schema.columns
where table_schema = 'public'
  and table_name   = 'cabeceraoc'
  and (column_name ilike '%celular%'
       or column_name ilike '%telefono%'
       or column_name ilike '%movil%')
order by column_name;


-- ----------------------------------------------------------------------------
-- 2 — EL REPARTO POR FORMATO
-- ----------------------------------------------------------------------------
-- La clasificación imita exactamente lo que hace `normalizarTelefono`:
-- se quitan los no-dígitos y se mira el largo.

with ordenes as (
  select id,
         ordendecargue,
         celular,
         regexp_replace(coalesce(celular, ''), '[^0-9]', '', 'g') as digitos
  from public.cabeceraoc
  where fechacargue >= current_date - 90
)
select case
         when celular is null or btrim(celular) = ''   then '1. vacio — no se puede avisar'
         when length(digitos) = 10 and digitos like '3%' then '2. OK — 10 digitos, se le antepone 57'
         when length(digitos) = 12 and digitos like '57%' then '3. OK — ya trae el 57'
         when length(digitos) between 11 and 15        then '4. se acepta tal cual (otro pais?)'
         when length(digitos) = 9                      then '5. FALLA — 9 digitos, le falta uno'
         when length(digitos) < 9                      then '6. FALLA — muy corto'
         else                                               '7. FALLA — formato raro'
       end as clase,
       count(*) as ordenes,
       min(length(digitos)) as min_digitos,
       max(length(digitos)) as max_digitos
from ordenes
group by 1
order by 1;


-- ----------------------------------------------------------------------------
-- 3 — EJEMPLOS DE LOS QUE FALLARÍAN
-- ----------------------------------------------------------------------------
-- Para ver con qué se está tratando: si es un error de digitación puntual o un
-- patrón (por ejemplo, que a todos les falte el mismo dígito).

with ordenes as (
  select id, ordendecargue, conductor, celular,
         regexp_replace(coalesce(celular, ''), '[^0-9]', '', 'g') as digitos
  from public.cabeceraoc
  where fechacargue >= current_date - 90
    and celular is not null
    and btrim(celular) <> ''
)
select ordendecargue, conductor, celular, digitos, length(digitos) as n
from ordenes
where not (
      (length(digitos) = 10 and digitos like '3%')
   or (length(digitos) = 12 and digitos like '57%')
   or (length(digitos) between 11 and 15)
)
order by length(digitos), ordendecargue desc
limit 30;


-- ----------------------------------------------------------------------------
-- 4 — CUÁNTOS CARGUES QUEDARÍAN SIN AVISO
-- ----------------------------------------------------------------------------
-- El número que importa para decidir si se activa hoy o se corrigen datos
-- primero.

with ordenes as (
  select id,
         regexp_replace(coalesce(celular, ''), '[^0-9]', '', 'g') as digitos,
         celular
  from public.cabeceraoc
  where fechacargue >= current_date - 90
)
select count(*) as cargues_90d,
       count(*) filter (
         where (length(digitos) = 10 and digitos like '3%')
            or (length(digitos) = 12 and digitos like '57%')
            or (length(digitos) between 11 and 15)
       ) as con_celular_utilizable,
       count(*) filter (
         where celular is null or btrim(celular) = ''
       ) as sin_celular,
       count(*) filter (
         where celular is not null and btrim(celular) <> ''
           and not (
                (length(digitos) = 10 and digitos like '3%')
             or (length(digitos) = 12 and digitos like '57%')
             or (length(digitos) between 11 and 15)
           )
       ) as con_celular_invalido
from ordenes;


-- ----------------------------------------------------------------------------
-- 5 — EL RESPALDO: `citasvehiculos.telefono`
-- ----------------------------------------------------------------------------
-- El aviso usa este campo cuando `cabeceraoc.celular` viene vacío. Sirve saber
-- si vale la pena o si está igual de incompleto.

with citas as (
  select ocargue,
         telefono,
         regexp_replace(coalesce(telefono, ''), '[^0-9]', '', 'g') as digitos
  from public.citasvehiculos
)
select count(*) as citas,
       count(*) filter (where telefono is null or btrim(telefono) = '') as sin_telefono,
       count(*) filter (
         where (length(digitos) = 10 and digitos like '3%')
            or (length(digitos) = 12 and digitos like '57%')
       ) as utilizables
from citas;
