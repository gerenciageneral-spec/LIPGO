// Guias del modulo Aprendizaje — area "produccion".
// Generado por entregas; la clave `modulo` debe coincidir EXACTA con el menu.
import type { ContenidoAprendizaje } from "@/lib/aprendizaje-content"

export const APRENDIZAJE_PRODUCCION: ContenidoAprendizaje[] = [
  {
    modulo: "Ingreso de Producción",
    resumen: "Registra a mano la entrada de producto terminado desde la planta.",
    proposito:
      "Es la puerta de entrada manual del producto terminado al inventario. Aqui se captura lo que salio de la planta (producto, lote, cantidad, fecha y hora real de produccion) y queda pendiente hasta que alguien lo apruebe en Aprobacion de ingreso de produccion. Antes de registrar hay que tener seleccionado el proyecto en la barra superior, porque el ingreso queda amarrado a ese proyecto.",
    puedes: [
      "Agregar varias lineas de producto en un mismo ingreso (producto, lote, cantidad, observaciones).",
      "Elegir el lote por fecha (se arma automatico con el formato de fecha) o escribirlo manual.",
      "Registrar la fecha y la hora REAL de produccion de cada lote.",
      "Dejar que la fecha de vencimiento se calcule sola segun la vida util del producto.",
      "Eliminar una linea agregada antes de enviar el ingreso.",
      "Descargar el comprobante en PDF que se genera al registrar.",
    ],
    noPuedes: [
      "Aprobar el ingreso desde aqui: lo registrado queda 'Pendiente aprobar' y entra al inventario solo cuando se aprueba.",
      "Registrar sin proyecto activo: si no hay empresa seleccionada en la barra superior, el sistema no deja guardar.",
      "Asignar almacen o localizacion: eso se define al aprobar.",
    ],
    funcionalidades: [
      {
        nombre: "Lineas de producto",
        descripcion:
          "Completa los campos, pulsa Agregar Linea y repite; al final registras todas las lineas juntas con un solo boton.",
      },
      {
        nombre: "Tipo de Lote",
        descripcion:
          "En modo 'Por Fecha' eliges un dia y el lote se arma automatico; en modo 'Manual' escribes el lote como venga marcado.",
      },
      {
        nombre: "Hora de Produccion",
        descripcion:
          "Es la hora en que realmente se produjo el lote, no la hora en que lo registras. Con esa hora la Liquidacion Tolva decide si el tonelaje es del Turno 1 o del Turno 2.",
      },
      {
        nombre: "Comprobante PDF",
        descripcion: "Al registrar el ingreso se descarga un PDF con el detalle, que sirve como soporte del movimiento.",
      },
    ],
    consejos: [
      "Si registras hoy la produccion de ayer, pon la hora real de ayer: si la dejas vacia o pones la hora actual, la liquidacion por turnos puede repartir mal las toneladas.",
      "Lo capturado a mano aqui entra a inventario pero NO se liquida como Tolva; la liquidacion del dia solo toma lo que llega del contador automatico de la planta.",
    ],
  },
  {
    modulo: "Tolva",
    resumen: "Crea a mano una orden de Tolva con productos, peso y personal asignado.",
    proposito:
      "Formulario para registrar una orden de Tolva: la orden que documenta el tonelaje producido y define a que personal se le paga ese trabajo. Se indica la fecha de fabricacion, el lote, los productos con sus cantidades (el peso se calcula solo) y los empleados que participaron. Hoy el camino normal es que estas ordenes salgan de la Liquidacion Tolva del dia o desde Ver ingresos de produccion; este formulario queda para casos manuales.",
    puedes: [
      "Registrar la fecha de fabricacion y el lote de la orden.",
      "Agregar productos linea por linea; el peso unitario y el peso total en kilos se calculan solos.",
      "Buscar y seleccionar el personal que participo (los empleados del proyecto activo).",
      "Ver el peso total de la orden mientras la armas.",
      "Limpiar el formulario y empezar de nuevo antes de guardar.",
    ],
    noPuedes: [
      "Guardar sin lote, sin productos o sin al menos un empleado asignado: el sistema lo exige.",
      "Consultar o borrar ordenes ya creadas: para eso esta Ver Tolva.",
      "Cambiar el peso unitario de un producto: viene del maestro de productos.",
    ],
    funcionalidades: [
      {
        nombre: "Encabezado de la orden",
        descripcion: "Fecha de fabricacion, lote y peso total. El peso total suma solo a medida que agregas productos.",
      },
      {
        nombre: "Personal Asignado",
        descripcion:
          "Buscador de empleados del proyecto activo; los seleccionados quedan como los auxiliares de la orden, que son a quienes se les paga el tonelaje.",
      },
      {
        nombre: "Tabla de productos",
        descripcion:
          "Cada linea lleva producto y cantidad; el sistema calcula el peso por unidad y el peso total de la linea en kilos.",
      },
    ],
    consejos: [
      "Una orden creada a mano con cantidades distintas a lo aprobado del dia genera diferencias en la Auditoria de Liquidacion Tolva (entregado vs facturado).",
    ],
  },
  {
    modulo: "Ver Tolva",
    resumen: "Lista las ordenes de Tolva registradas, con edicion de personal y borrado.",
    proposito:
      "Consulta de todas las ordenes de Tolva del proyecto activo (incluye las de domingo, que van con un sufijo distinto pero son el mismo tipo de orden). Muestra numero de orden, fecha, auxiliares asignados, peso en toneladas, productos y estado, y permite corregir el personal de una orden o eliminarla por completo.",
    puedes: [
      "Ver el listado de ordenes de Tolva con fecha, auxiliares, peso, productos y estado.",
      "Editar una orden para cambiar el personal asignado.",
      "Eliminar una orden completa (pide confirmacion y borra tambien su detalle de productos).",
      "Cambiar de proyecto en la barra superior para ver las ordenes de otro proyecto.",
    ],
    noPuedes: [
      "Modificar la fecha, el lote o los productos de una orden existente: en edicion solo se toca el personal.",
      "Recuperar una orden eliminada: el borrado es definitivo.",
    ],
    funcionalidades: [
      {
        nombre: "Listado de Tolvas",
        descripcion:
          "Tabla ordenada de la mas reciente a la mas antigua, con los auxiliares y productos de cada orden a la vista.",
      },
      {
        nombre: "Editar",
        descripcion:
          "Abre la orden con todo bloqueado excepto el personal: sirve para corregir quien trabajo realmente ese tonelaje.",
      },
      {
        nombre: "Eliminar",
        descripcion:
          "Borra la orden y sus lineas de producto tras confirmar. Usar con cuidado: la orden es la base del pago y del cobro del tonelaje.",
      },
    ],
    consejos: [
      "Si una orden trae la lista de auxiliares mal, editala en vez de borrarla y volverla a crear: conservas el numero de orden y su trazabilidad.",
    ],
  },
  {
    modulo: "Ver ingresos de producción",
    resumen: "Consulta, corrige y agrupa los ingresos de produccion registrados.",
    proposito:
      "Tabla de todos los ingresos de produccion del proyecto activo, aprobados o pendientes. Sirve para revisar que se registro, corregir o eliminar lo que sigue pendiente, exportar a Excel y, ademas, seleccionar varios ingresos para crear de una vez la orden de Tolva que les asigna auxiliares.",
    puedes: [
      "Filtrar por producto, lote, localizacion, fecha y tipo de produccion (LIP o Harinera).",
      "Exportar a Excel exactamente lo que se ve en pantalla.",
      "Descargar el PDF de respaldo de cada ingreso.",
      "Editar producto, lote o cantidad de un ingreso que sigue pendiente de aprobar.",
      "Eliminar un ingreso pendiente (pide confirmacion).",
      "Seleccionar varios ingresos con 'Asignar auxiliares' y continuar a Tolva para crear la orden con los productos ya precargados.",
    ],
    noPuedes: [
      "Editar ni eliminar un ingreso ya aprobado o rechazado: queda bloqueado.",
      "Llevar a Tolva produccion marcada como Harinera: es produccion propia del cliente, genera inventario pero no se cobra ni se paga por tonelaje.",
      "Aprobar ingresos desde aqui: eso se hace en Aprobacion de ingreso de produccion.",
    ],
    funcionalidades: [
      {
        nombre: "Filtros",
        descripcion:
          "Busqueda por producto, lote, localizacion y fecha, mas un filtro rapido por tipo (Todos / LIP / Harinera).",
      },
      {
        nombre: "Columna Tipo",
        descripcion:
          "Distingue la produccion LIP (la que se factura) de la produccion Harinera (propia del cliente, no facturable).",
      },
      {
        nombre: "Columna Orden Tolva",
        descripcion:
          "Muestra a que orden de Tolva quedo enlazado cada ingreso; vacia significa que ese ingreso aun no tiene auxiliares asignados.",
      },
      {
        nombre: "Asignar auxiliares (seleccion masiva)",
        descripcion:
          "Marca los ingresos, pulsa Continuar a Tolva y el sistema consolida los productos, propone lote y fecha, y solo te pide el personal. Al guardar, los ingresos quedan enlazados a la orden creada.",
      },
      {
        nombre: "Exportar a Excel",
        descripcion: "Descarga el listado visible con codigo, producto, lote, cantidad, tipo, orden de Tolva y fecha.",
      },
    ],
    consejos: [
      "El 'Seleccionar todo' aplica solo sobre lo visible con los filtros actuales: filtra primero por LIP para no arrastrar lineas de Harinera a la seleccion.",
    ],
  },
  {
    modulo: "Aprobación de ingreso de producción",
    resumen: "Aprueba o rechaza los ingresos pendientes y les asigna ubicacion en bodega.",
    proposito:
      "Aqui se decide que entra de verdad al inventario. Cada ingreso pendiente se revisa y, para aprobarlo, hay que asignarle almacen y localizacion (donde queda fisicamente el producto). Al aprobar, el producto suma al inventario del proyecto; al rechazar, no entra. Tambien llegan aqui los ingresos que se generan automaticamente por el descargue en los CEDI.",
    puedes: [
      "Ver los ingresos pendientes del proyecto activo con producto, lote, cantidad, quien lo creo y de donde vino.",
      "Aprobar un ingreso eligiendo almacen y localizacion (obligatorios).",
      "Ajustar o agregar observaciones al momento de aprobar.",
      "Rechazar un ingreso que no corresponde.",
      "Ver el QR de estiba cuando el ingreso vino por lectura de QR.",
      "Distinguir la produccion LIP de la Harinera antes de aprobar.",
    ],
    noPuedes: [
      "Aprobar sin almacen y localizacion: el boton no se habilita hasta elegir ambos.",
      "Modificar producto, lote o cantidad: si algo esta mal, se corrige en Ver ingresos de produccion antes de aprobar.",
      "Deshacer una aprobacion o un rechazo desde este modulo.",
    ],
    funcionalidades: [
      {
        nombre: "Aprobar",
        descripcion:
          "Abre la fila en modo edicion con el almacen y la localizacion originales precargados; confirmas o los cambias y el producto entra al inventario en esa ubicacion.",
      },
      {
        nombre: "Rechazar",
        descripcion: "Marca el ingreso como rechazado y no entra al inventario.",
      },
      {
        nombre: "Columna Origen",
        descripcion:
          "Indica de donde vino el ingreso (registro manual, lectura de QR, descargue automatico), util para saber que se esta aprobando.",
      },
      {
        nombre: "Columna Tipo",
        descripcion: "Resalta la produccion Harinera, que genera inventario pero no se factura.",
      },
    ],
    consejos: [
      "La hora que se muestra es la hora exacta del registro tal como se guardo, sin conversiones: sirve para auditar cuando se capturo realmente.",
      "Aprueba en el dia: la Liquidacion Tolva del dia solo reparte por turnos lo que ya esta aprobado.",
    ],
  },
  {
    modulo: "Liquidación Tolva del día",
    resumen: "Genera la orden de Tolva por turno desde los ingresos ya aprobados del dia.",
    proposito:
      "Automatiza la liquidacion diaria de la Tolva: toma las toneladas aprobadas del dia, las reparte entre Turno 1 y Turno 2 segun la hora real de produccion y la ventana horaria programada para el personal de tolva, y con un clic registra la orden de cada turno con su personal y su tonelaje. Los domingos la orden sale con su variante propia. Incluye una pestana de auditoria que cruza lo entregado, lo facturado y lo pagado.",
    puedes: [
      "Consultar la liquidacion de cualquier fecha para el proyecto activo.",
      "Ver por turno la ventana horaria, el personal programado y las lineas de producto con sus toneladas.",
      "Registrar la orden de Tolva de cada turno con un boton.",
      "Detectar ingresos cuya hora quedo fuera de la ventana de los turnos (no bloquean, pero quedan fuera hasta revisarse).",
      "Revisar en la Auditoria el cruce por dia: entrega real vs facturado vs pago, con alertas de discrepancia.",
    ],
    noPuedes: [
      "Liquidar produccion capturada a mano en Ingreso de Produccion: solo se liquida la que llega del contador automatico de la planta (incluida la registrada por QR).",
      "Registrar el mismo turno dos veces el mismo dia: el sistema lo bloquea.",
      "Editar aqui las horas o el personal: la hora se corrige en el ingreso y el personal en la programacion de turnos.",
    ],
    funcionalidades: [
      {
        nombre: "Liquidacion del dia",
        descripcion:
          "Dos tarjetas (Turno 1 y Turno 2) con ventana horaria, personal, detalle de productos y total de toneladas; el boton registra la orden del turno.",
      },
      {
        nombre: "Alerta de ingresos fuera de ventana",
        descripcion:
          "Lista los ingresos cuya hora no cae en ningun turno; indica si falta la hora de produccion o si hay que ajustar el horario de tolva de ese dia. No impiden registrar los turnos verificados.",
      },
      {
        nombre: "Alerta de turno sin personal",
        descripcion:
          "Si un turno tiene toneladas pero nadie programado, avisa que la orden saldra sin auxiliares: nadie cobraria ese tonelaje.",
      },
      {
        nombre: "Auditoria (pago / cobro / entrega)",
        descripcion:
          "Cruce por dia en un rango de fechas: toneladas entregadas vs facturadas (deben coincidir al 100%), pago a trabajadores y cobro por facturacion, con indicadores y filas resaltadas cuando hay diferencia.",
      },
    ],
    consejos: [
      "Una diferencia entre entregado y facturado suele venir de ingresos 'sin turno' pendientes de resolver o de una Tolva creada a mano con otra cantidad.",
      "Pago en cero con entrega y cobro mayores a cero significa que se registro un turno sin personal: revisa la programacion antes de registrar.",
    ],
  },
  {
    modulo: "Dashboard de Producción",
    resumen: "Tablero en vivo de la planta: eficiencia OEE, velocidad, paros y averias.",
    proposito:
      "Muestra como esta trabajando la maquina de produccion, con datos que llegan cada 2 minutos del contador de la planta. Calcula la eficiencia general OEE como disponibilidad (tiempo trabajando vs detenida) por rendimiento (ritmo real vs meta) por calidad (bultos buenos vs averias). Ademas del vivo, trae resumenes mensual y anual y un reporte detallado por rango de fechas.",
    puedes: [
      "Ver en vivo el estado de la maquina, la produccion del dia y el cronometro de inactividad.",
      "Seguir el OEE del dia con sus tres factores: disponibilidad, rendimiento y calidad.",
      "Ver la linea de tiempo de disponibilidad y la velocidad de produccion cada 2 minutos frente a la meta.",
      "Revisar el resumen del dia por producto: bultos, averias, estibas y arrume.",
      "Consultar la tendencia mensual (bultos vs averias) y el top de productos con mas averias.",
      "Ver el resumen anual con desperdicio y mezcla de produccion por producto.",
      "Sacar un reporte por rango de fechas con cumplimiento vs meta y descargarlo en CSV.",
    ],
    noPuedes: [
      "Registrar produccion ni corregir datos: todo llega del contador automatico de la planta.",
      "Justificar los paros desde aqui: eso se hace en Reporte de Paros y este tablero solo refleja cuales quedaron comentados.",
    ],
    funcionalidades: [
      {
        nombre: "En Vivo",
        descripcion:
          "Estado actual de la maquina, indicadores del dia (bultos, estibas, arrume, averias), tarjeta OEE, disponibilidad por franja del turno y velocidad cada 2 minutos. El turno se toma de la programacion real del dia.",
      },
      {
        nombre: "Eficiencia General (OEE)",
        descripcion:
          "Un solo numero que multiplica disponibilidad, rendimiento y calidad. Si cualquiera de los tres cae, el OEE cae: sirve para saber donde esta la perdida.",
      },
      {
        nombre: "Resumen Mensual",
        descripcion:
          "Elige mes y ve la tendencia diaria de bultos vs averias y el top 5 de productos con mas averias (cuellos de botella).",
      },
      {
        nombre: "Resumen Anual",
        descripcion: "Vision del ano: evolucion del desperdicio y mezcla de produccion por producto.",
      },
      {
        nombre: "Reporte",
        descripcion:
          "Consulta por rango de fechas con registros detallados (producto, bodega, localizacion, lote, bultos, meta, averias), indicadores de cumplimiento y exportacion a CSV.",
      },
    ],
    consejos: [
      "Los paros justificados en Reporte de Paros aparecen aqui diferenciados de los que siguen sin comentar: la meta operativa es que no quede ninguno sin justificar.",
    ],
  },
  {
    modulo: "Reporte de Paros",
    resumen: "Justifica los tiempos en que la maquina estuvo detenida.",
    proposito:
      "Detecta automaticamente las franjas del dia en que la maquina no produjo (a partir de las lecturas cada 2 minutos del contador, dentro del turno programado) y permite escribirle a cada paro su categoria y su motivo. Lo justificado se refleja en el Dashboard de Produccion como paro comentado; lo demas queda marcado como sin comentar.",
    puedes: [
      "Ver los paros detectados de hoy o de cualquier dia anterior.",
      "Escribir el motivo de cada paro y clasificarlo (mecanico, electrico, falta de insumos, cambio de referencia, aseo, falta de personal, calidad u otro).",
      "Seleccionar varios paros y aplicarles el mismo motivo y categoria de una sola vez.",
      "Quitar un comentario guardado si se justifico por error.",
      "Seguir la cobertura del dia: cuantos paros van comentados y cuantos minutos siguen sin justificar.",
      "Revisar el historial y analisis de paros de dias anteriores.",
    ],
    noPuedes: [
      "Crear o borrar paros: las franjas las detecta el sistema con los datos del contador, aqui solo se explican.",
      "Justificar paros de fechas futuras.",
    ],
    funcionalidades: [
      {
        nombre: "Reportar del dia",
        descripcion:
          "Tabla de franjas detenidas con hora de inicio y fin, duracion, categoria, motivo y estado (comentado / sin comentar). El turno del dia se toma de la programacion real del personal.",
      },
      {
        nombre: "Indicadores de cobertura",
        descripcion:
          "Paros del dia, comentados, sin comentar y porcentaje de cobertura, con los minutos detenidos en cada grupo.",
      },
      {
        nombre: "Justificacion masiva",
        descripcion:
          "Marca varias franjas del mismo evento (por ejemplo un solo dano largo) y aplicales el motivo una sola vez.",
      },
      {
        nombre: "Historial y analisis",
        descripcion: "Pestana con el acumulado de paros de dias anteriores para analizar causas repetidas.",
      },
    ],
    consejos: [
      "Justifica los paros el mismo dia: con el evento fresco el motivo es confiable y el Dashboard queda completo.",
    ],
  },
  {
    modulo: "Historial Aprobaciones",
    resumen: "Consulta el historial de lotes aprobados por orden de cargue.",
    proposito:
      "Vista de solo lectura para rastrear que lotes se aprobaron y en que orden de cargue salieron. Responde preguntas de trazabilidad del tipo 'a que cliente se fue este lote y cuando', con el soporte en PDF cuando existe.",
    puedes: [
      "Ver el historial con fecha, cliente, producto, lote, localizacion, cantidad y orden de cargue.",
      "Filtrar por cliente, por producto y por rango de fechas.",
      "Exportar el listado a Excel.",
      "Abrir el PDF de soporte de cada registro cuando esta disponible.",
    ],
    noPuedes: [
      "Modificar o eliminar registros: es una vista de consulta.",
      "Aprobar lotes desde aqui: las aprobaciones ocurren en los flujos de despacho y produccion.",
    ],
    funcionalidades: [
      {
        nombre: "Filtros",
        descripcion:
          "Listas de clientes y productos del proyecto activo mas un rango de fechas; se combinan entre si para acotar la busqueda.",
      },
      {
        nombre: "Exportar a Excel",
        descripcion: "Descarga el historial con las mismas columnas de la tabla para compartirlo o cruzarlo por fuera.",
      },
      {
        nombre: "PDF",
        descripcion: "Icono por fila que abre el documento de soporte del registro en otra pestana.",
      },
    ],
  },
  {
    modulo: "Reprocesos",
    resumen: "Gestiona los productos en reproceso hasta confirmar su entrega o darlos de baja.",
    proposito:
      "Lista los productos que quedaron en reproceso (producto que salio con problema y debe volver a trabajarse) y permite cerrarlos: o se confirma la entrega del reproceso ya recuperado, indicando lote y cantidad final, o se da de baja si no se recupera.",
    puedes: [
      "Ver los reprocesos pendientes del proyecto activo con producto, codigo, lote, cantidad y fecha de creacion.",
      "Gestionar un reproceso: confirmar la entrega ajustando el lote y la cantidad final recuperada.",
      "Dar de baja un reproceso que no se va a recuperar (pide confirmacion).",
    ],
    noPuedes: [
      "Crear reprocesos desde aqui: nacen en los flujos de operacion donde se detecta el producto con problema.",
      "Recuperar un reproceso dado de baja.",
    ],
    funcionalidades: [
      {
        nombre: "Gestionar",
        descripcion:
          "Abre el formulario con el lote y la cantidad precargados; puedes ajustar la cantidad realmente recuperada antes de confirmar la entrega.",
      },
      {
        nombre: "Dar de baja",
        descripcion: "Elimina el reproceso pendiente tras confirmar, para los casos en que el producto no se recupera.",
      },
    ],
    consejos: [
      "Antes de confirmar, verifica la cantidad real recuperada: no siempre coincide con la cantidad que entro a reproceso.",
    ],
  },
  {
    modulo: "Servicios Adicionales",
    resumen: "Solicita turnos u horas extra de personal, con firma y aprobacion.",
    proposito:
      "Formulario para pedir personal adicional al proyecto: turnos completos u horas extra, por puesto y fecha. La solicitud se firma en pantalla y queda pendiente de aprobacion; una vez aprobada genera un PDF de soporte. El puesto se elige de la lista de tarifas de facturacion, para que despues la solicitud pueda cruzarse contra lo que se le factura al cliente.",
    puedes: [
      "Armar la solicitud con varias lineas: tipo de servicio (Turnos u Horas Extra), puesto, fecha requerida y cantidad.",
      "Firmar la solicitud dibujando la firma en pantalla (mouse o dedo).",
      "Enviar la solicitud, que queda en estado Pendiente hasta que alguien la apruebe o rechace.",
      "Consultar el historial de solicitudes con su estado y quien aprobo.",
      "Filtrar el historial por rango de fecha de solicitud y descargarlo en Excel.",
      "Ver el PDF de aprobacion de las solicitudes ya aprobadas, sin salir de la pantalla.",
    ],
    noPuedes: [
      "Aprobar o rechazar solicitudes desde aqui: eso lo hace quien tiene ese permiso en su propio modulo.",
      "Enviar sin firma: la firma del solicitante es obligatoria.",
      "Escribir el puesto libre: si no hay puestos configurados en las tarifas de facturacion de turnos, hay que crearlos primero.",
    ],
    funcionalidades: [
      {
        nombre: "Lineas de solicitud",
        descripcion:
          "Cada linea define tipo de servicio, puesto (de la lista de tarifas), fecha requerida y cantidad de personas; puedes agregar tantas lineas como necesites en un solo envio.",
      },
      {
        nombre: "Firma digital",
        descripcion: "Recuadro para dibujar la firma; queda adjunta a la solicitud como respaldo de quien pidio el servicio.",
      },
      {
        nombre: "Historial de solicitudes",
        descripcion:
          "Listado por proyecto con fecha, solicitante, tipo, puesto, cantidad, estado (Pendiente / Aprobado / Rechazado) y quien aprobo.",
      },
      {
        nombre: "PDF de aprobacion",
        descripcion:
          "Las solicitudes aprobadas traen un PDF que se abre en un visor dentro de la pantalla, con opcion de abrirlo aparte.",
      },
      {
        nombre: "Exportar a Excel",
        descripcion: "Descarga el historial filtrado, incluyendo el enlace al PDF de aprobacion de cada solicitud.",
      },
    ],
    consejos: [
      "Cada linea de la solicitud se convierte en una solicitud individual: asi cada puesto y fecha puede aprobarse por separado.",
    ],
  },
]
