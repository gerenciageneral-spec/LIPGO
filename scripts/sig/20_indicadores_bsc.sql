-- =====================================================================
-- SIG - Balanced Scorecard / Tablero Gerencial (el "cerebro" de las 3 ISO).
-- Enriquece sig_indicadores con la metadata BSC (perspectiva, área, finalidad,
-- cliente interno/externo, contribución y AMARRE al objetivo estratégico) y
-- agrega indicadores PROPIOS del servicio de LIP como operador de outsourcing.
-- Aditivo e idempotente. Alcance LIP (idempresa = 100).
-- =====================================================================

-- 1) Columnas BSC -------------------------------------------------------
alter table public.sig_indicadores add column if not exists perspectiva text;       -- financiera | cliente | procesos | aprendizaje
alter table public.sig_indicadores add column if not exists area text;              -- nombre del área
alter table public.sig_indicadores add column if not exists finalidad text;         -- para qué sirve
alter table public.sig_indicadores add column if not exists cliente_interno text;   -- quién usa el resultado dentro de LIP
alter table public.sig_indicadores add column if not exists cliente_externo text;   -- parte interesada externa
alter table public.sig_indicadores add column if not exists contribucion text;      -- cómo contribuye al objetivo gerencial
alter table public.sig_indicadores add column if not exists objetivo_id int;        -- amarre a sig_objetivos.id

-- 2) Backfill de ÁREA a partir del proceso ------------------------------
update public.sig_indicadores set area = case proceso_codigo
  when 'DE' then 'Dirección Estratégica'
  when 'CD' then 'Cargue y Descargue'
  when 'AI' then 'Almacenamiento e Inventarios'
  when 'GH' then 'Gestión Humana y SST'
  when 'TI' then 'Tecnología (LIPgo)'
  when 'CO' then 'Compras y Proveedores'
  when 'EM' then 'Evaluación y Mejora'
  else 'Dirección Estratégica' end
where area is null;

-- 3) Backfill de PERSPECTIVA (BSC) --------------------------------------
update public.sig_indicadores set perspectiva = 'cliente'
  where perspectiva is null and (parte_interesada in ('cliente','conductor') or codigo in ('IND-G-01','IND-G-02','IND-G-03','IND-G-05'));
update public.sig_indicadores set perspectiva = 'aprendizaje'
  where perspectiva is null and (proceso_codigo in ('GH','TI') or codigo in ('IND-G-04','IND-EM-01'));
update public.sig_indicadores set perspectiva = 'financiera'
  where perspectiva is null and parte_interesada in ('direccion','legal');
update public.sig_indicadores set perspectiva = 'procesos' where perspectiva is null;

-- 4) cliente_externo a partir de la parte interesada --------------------
update public.sig_indicadores set cliente_externo = case parte_interesada
  when 'cliente' then 'Cliente (Indupan / Avimol / Cedis)'
  when 'conductor' then 'Conductores / transportistas'
  when 'proveedor' then 'Proveedores'
  when 'legal' then 'Entes de control'
  else null end
where cliente_externo is null;

-- 5) Enriquecimiento de los indicadores existentes (finalidad / cliente
--    interno / contribución). Por código, idempotente. -----------------
update public.sig_indicadores set
  finalidad = 'Medir la percepción de valor del cliente sobre el servicio de LIP',
  cliente_interno = 'Gerencia General / Comercial',
  contribucion = 'Sostiene la relación y renovación de contratos de outsourcing'
where codigo = 'IND-G-01';
update public.sig_indicadores set
  finalidad = 'Asegurar una atención ágil y respetuosa al transportista en sede',
  cliente_interno = 'Jefe de Operaciones',
  contribucion = 'Reduce tiempos de espera y reclamaciones del cliente'
where codigo = 'IND-G-02';
update public.sig_indicadores set
  finalidad = 'Demostrar el cumplimiento del servicio de cargue en el tramo de LIP',
  cliente_interno = 'Gerencia / Jefe de Operaciones',
  contribucion = 'Es el corazón del SLA: servicio entregado por LIP'
where codigo = 'IND-G-03';
update public.sig_indicadores set
  finalidad = 'Seguir el avance de la implementación del SIG hacia la certificación',
  cliente_interno = 'Gerencia / Coordinador SIG',
  contribucion = 'Habilita la certificación ISO 9001/14001/45001'
where codigo = 'IND-G-04';
update public.sig_indicadores set
  finalidad = 'Evidenciar la trazabilidad total del despacho en LIPgo',
  cliente_interno = 'Comercial / Operaciones',
  contribucion = 'Valor agregado diferencial frente a la competencia'
where codigo = 'IND-G-05';
update public.sig_indicadores set
  cliente_interno = 'Jefe de Operaciones',
  finalidad = coalesce(finalidad,'Dimensionar el volumen operado por LIP'),
  contribucion = coalesce(contribucion,'Soporta la facturación y el dimensionamiento del recurso')
where proceso_codigo = 'CD' and cliente_interno is null;
update public.sig_indicadores set
  cliente_interno = 'Líder de Bodega',
  finalidad = coalesce(finalidad,'Asegurar la fidelidad del inventario bajo custodia de LIP'),
  contribucion = coalesce(contribucion,'Evita faltantes cobrables y sostiene la confianza del cliente')
where proceso_codigo = 'AI' and cliente_interno is null;
update public.sig_indicadores set
  cliente_interno = 'Coordinador de Gestión Humana',
  finalidad = coalesce(finalidad,'Garantizar el talento que presta el servicio'),
  contribucion = coalesce(contribucion,'Disponibilidad y competencia del personal operativo')
where proceso_codigo = 'GH' and cliente_interno is null;

-- 6) Indicadores PROPIOS del servicio de LIP (outsourcing) --------------
--    Algunos en vivo (calculo_auto) y otros manuales/SLA editables.
insert into public.sig_indicadores
  (idempresa, codigo, proceso_codigo, area, perspectiva, nombre, tipo, parte_interesada,
   formula, fuente, calculo_auto, unidad, meta, sentido, frecuencia, responsable,
   finalidad, cliente_interno, cliente_externo, contribucion, valor_manual, orden) values
  (100,'IND-G-06','DE','Dirección Estratégica','cliente','Nivel de servicio global LIP (SLA)','gerencial','cliente',
   'Promedio ponderado del cumplimiento de los SLA acordados con el cliente','manual',null,'%',95,'mayor_mejor','mensual','Gerencia General',
   'Resumir en un solo número el cumplimiento del servicio contratado','Gerencia / Comercial','Cliente (Indupan / Avimol / Cedis)','Es el compromiso contractual: define la continuidad del outsourcing',null,6),
  (100,'IND-CD-06','CD','Cargue y Descargue','cliente','Cumplimiento de meta de tonelaje','resultado','cliente',
   'Toneladas operadas / meta del periodo (EMPRESA_META_DIA_TON × días operativos)','cabeceraoc','desp_meta_ton','%',95,'mayor_mejor','mensual','Jefe de Operaciones',
   'Verificar que LIP cumple el volumen comprometido por sede','Jefe de Operaciones','Cliente (Indupan / Avimol / Cedis)','Cumple el compromiso de capacidad del servicio',null,15),
  (100,'IND-CD-07','CD','Cargue y Descargue','cliente','Cumplimiento de SLA de tiempos de atención','resultado','cliente',
   'Órdenes atendidas dentro del tiempo pactado / total','manual',null,'%',95,'mayor_mejor','mensual','Coordinador de Operación',
   'Asegurar la oportunidad del servicio en sede','Jefe de Operaciones','Cliente / conductores','Reduce esperas y mejora la satisfacción',null,16),
  (100,'IND-AI-03','AI','Almacenamiento e Inventarios','procesos','Exactitud del inventario físico (ERI)','resultado','cliente',
   'Ítems sin diferencia en el conteo físico / ítems contados (cuadre mensual)','sig_inventario_cuadre',null,'%',98,'mayor_mejor','mensual','Líder de Bodega',
   'Demostrar la fidelidad del inventario en el cierre mensual','Líder de Bodega','Cliente','Sustenta el cierre mensual y evita faltantes cobrables',null,22),
  (100,'IND-GH-04','GH','Gestión Humana y SST','aprendizaje','Cobertura de personal del servicio','resultado','colaborador',
   'Personal disponible / personal requerido por el SLA','manual',null,'%',100,'mayor_mejor','mensual','Coordinador de Gestión Humana',
   'Garantizar la dotación de personal que el servicio requiere','Jefe de Operaciones','Cliente','Sin personal no hay servicio: habilita el cumplimiento del SLA',null,33)
on conflict (idempresa, codigo) do nothing;

-- 7) AMARRE a objetivos estratégicos (sig_objetivos) --------------------
--    Liga cada indicador a su objetivo por el texto del objetivo (único).
update public.sig_indicadores i set objetivo_id = o.id
  from public.sig_objetivos o
 where o.objetivo = 'Mantener la satisfacción del cliente'
   and i.codigo in ('IND-G-01','IND-G-02','IND-CD-04','IND-CD-07') and i.objetivo_id is null;
update public.sig_indicadores i set objetivo_id = o.id
  from public.sig_objetivos o
 where o.objetivo = 'Lograr la certificación integrada ISO 9001/14001/45001'
   and i.codigo in ('IND-G-04','IND-EM-01','IND-DE-01') and i.objetivo_id is null;
update public.sig_indicadores i set objetivo_id = o.id
  from public.sig_objetivos o
 where o.objetivo = 'Cumplir los Estándares Mínimos SG-SST (Res. 0312)'
   and i.proceso_codigo = 'GH' and i.objetivo_id is null;

create index if not exists idx_sig_indicadores_obj on public.sig_indicadores (objetivo_id);
create index if not exists idx_sig_indicadores_persp on public.sig_indicadores (perspectiva);

-- =====================================================================
-- FIN. Metadata BSC + 5 indicadores de servicio LIP + amarre a objetivos.
-- =====================================================================
