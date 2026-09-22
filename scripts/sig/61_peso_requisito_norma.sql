-- =====================================================================
-- SIG - Peso por requisito x norma (Matriz Integrada ISO 9001/14001/45001)
-- Igual al patron ya usado en SG-SST 0312 (sst_estandar_items.peso): cada
-- requisito, DENTRO DE CADA NORMA, tiene un peso que se suma para dar el %
-- de avance de esa norma -- hoy el % contaba cada requisito por igual.
-- ADITIVO e IDEMPOTENTE (seguro de re-ejecutar).
--
-- El peso arranca en 1 para todo lo que ya aplica: el % de avance de cada
-- norma queda IGUAL a como esta hoy (1 x N = contar por igual), y desde la
-- pantalla se puede ajustar requisito por requisito sin tocar nada mas.
-- =====================================================================

alter table public.sig_requisito_norma add column if not exists peso numeric not null default 1;

update public.sig_requisito_norma set peso = 1 where peso is null;

-- =====================================================================
-- FIN.
-- =====================================================================
