-- Correccion 2026-09-24: el producto "Conchita Caprissima. 250 Gr. X 24 Und"
-- (id=116) estaba registrado con id_empresa=1 (INDUPAN) en la tabla
-- productos, pero es de la familia Caprissima de Molinos del Atlantico --
-- sus "hermanos" (PT ESPAGUETI CAPRISSIMA, PT CABELLO ANGEL CAPRISSIMA)
-- estan todos con id_empresa=3. Por esto la vista `facturacion` (que
-- deriva el owner de cada linea desde productos.id_empresa, no desde
-- cabeceraoc) facturaba mal esta linea especifica a INDUPAN en cualquier
-- orden que incluyera este producto -- 4 ordenes afectadas hoy
-- (MOL202607066532, 106694, MED202608017528, MOL202609219390), ninguna
-- facturada aun en Siigo.

update productos
set id_empresa = 3,
    owner = 'MOLINOS DEL ATLANTICO'
where id = 116
  and nombre = 'Conchita Caprissima. 250 Gr. X 24 Und';

-- Verificacion
select id, nombre, id_empresa, owner from productos where id = 116;
