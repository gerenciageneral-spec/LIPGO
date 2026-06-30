-- =====================================================================
-- Cierre de facturación HISTÓRICA (meses pasados).
-- Marca las operaciones de MESES ANTERIORES al mes actual que quedaron con
-- estadofactura NULL pero que YA FUERON FACTURADAS (proyectos que no usaban el
-- flujo, p. ej. Medellín). NO se borra ni se oculta nada: la información sigue
-- intacta, solo se le pone el estado correcto para que:
--   * el indicador de facturación NO las cuente como "pendiente por solicitar";
--   * sigan siendo visibles con el filtro de histórico del módulo.
--
-- Solo afecta meses ANTERIORES al actual (date_trunc('month', current_date)).
-- El mes actual y futuros NO se tocan (ahí sí debe gestionarse de verdad).
-- Excluye proyección y tolva. Aditivo, acotado y REVERSIBLE (ver al final).
-- =====================================================================

update public.cabeceraoc
   set estadofactura = 'CF - Cerrado'
 where estadofactura is null
   and idempresa in (1, 2, 3, 4)
   and fechaorden < date_trunc('month', current_date)
   and coalesce(tipooperacion, '') not ilike 'proyeccion'
   and coalesce(tipooperacion, '') not ilike 'tolva';

-- Verificacion (opcional):
-- select idempresa, estadofactura, count(*) from cabeceraoc
--  where fechaorden < date_trunc('month', current_date)
--  group by idempresa, estadofactura order by idempresa;

-- =====================================================================
-- NOTA: si prefieres otro estado (p. ej. 'CF - Factura solicitada' o un
-- marcador propio 'Cierre histórico'), cambia el literal de la línea SET.
-- REVERSIÓN (si hiciera falta): poner de nuevo en null SOLO lo marcado aquí —
-- ojo: solo es seguro si nadie más usó 'CF - Cerrado' en esas fechas.
--   update public.cabeceraoc set estadofactura = null
--    where estadofactura = 'CF - Cerrado'
--      and fechaorden < date_trunc('month', current_date) and idempresa in (1,2,3,4);
-- =====================================================================
