// Guias del modulo Aprendizaje — area "despachos".
// Generado por entregas; la clave `modulo` debe coincidir EXACTA con el menu.
import type { ContenidoAprendizaje } from "@/lib/aprendizaje-content"

export const APRENDIZAJE_DESPACHOS: ContenidoAprendizaje[] = [
  // ==========================================================================
  // GENERAR ORDENES DE CARGUE
  // ==========================================================================
  {
    modulo: "Generar Órdenes de Cargue",
    resumen: "Convierte pedidos aprobados en una orden de cargue con vehiculo, fechas y control de inventario.",
    proposito:
      "Es el corazon del despacho: toma los pedidos aprobados que estan pendientes, los agrupa en una sola orden de cargue, valida que el inventario y la capacidad del vehiculo alcancen, y genera la orden con su PDF. Se usa cuando ya hay pedidos aprobados y un vehiculo listo (o por llegar) para despachar.",
    puedes: [
      "Filtrar los pedidos pendientes por bodega, fecha, estado, ciudad, cliente, vendedor y orden de compra antes de escoger.",
      "Seleccionar varios pedidos y ajustar por linea cuantas unidades se van a cargar (despacho parcial).",
      "Escoger un vehiculo ya registrado: el conductor y la transportadora se llenan solos y una barra muestra cuanto de la capacidad se esta usando.",
      "Marcar 'Sin vehiculo' para crear la orden sin placa y asignar el vehiculo despues en Gestion de Ordenes.",
      "Decidir, linea por linea, si un despacho parcial cierra la linea del pedido o la deja abierta para un proximo despacho.",
      "Generar la orden con su PDF, que se abre automaticamente para imprimir o compartir.",
    ],
    noPuedes: [
      "Generar la orden si algun producto pide mas unidades que el inventario disponible: el resumen lo marca en rojo y bloquea el boton.",
      "Cargar pedidos sin aprobar, entregados o anulados: nunca aparecen en el listado.",
      "Guardar sin fecha de orden de cargue y fecha de entrega: son obligatorias.",
      "Editar una orden ya generada desde aqui: eso se hace en Gestion de Ordenes.",
    ],
    funcionalidades: [
      {
        nombre: "Filtros de pedidos",
        descripcion:
          "Acota el listado de pedidos aprobados pendientes. El filtro de Bodega ademas define contra que sede se consulta el inventario disponible y en que empresa nace la orden.",
      },
      {
        nombre: "Encabezado de la orden",
        descripcion:
          "Vehiculo, conductor, transportadora, fechas y observaciones. Solo se ofrecen las transportadoras vigentes; si la cita del vehiculo trae una que ya no se usa, el campo queda vacio y obliga a escoger una valida.",
      },
      {
        nombre: "Pedidos seleccionados y resumen por producto",
        descripcion:
          "Muestra el detalle de cada pedido con las unidades a cargar (editables) y un resumen que cruza lo pedido contra el inventario disponible, marcando en rojo cualquier faltante.",
      },
      {
        nombre: "Capacidad del vehiculo",
        descripcion:
          "Barra de colores (verde, amarillo, naranja, rojo) que compara el peso total a cargar contra la capacidad del vehiculo y avisa si se supera.",
      },
      {
        nombre: "Decision sobre lineas parciales",
        descripcion:
          "Si alguna linea se despacha incompleta, un cuadro pregunta si se cierra (no se despachara el resto) o queda abierta para un futuro despacho.",
      },
    ],
    consejos: [
      "Los vehiculos del desplegable salen de Registrar Vehiculos: si la placa no aparece, primero hay que registrar su llegada alli.",
      "Si la orden se crea con vehiculo de placa propia, el sistema genera automaticamente la orden de distribucion gemela (numero con 'D' al final); y si el destino es un CEDI, tambien deja creado el descargue pendiente en el CEDI destino.",
      "Al cambiar la empresa del selector global de la barra superior se limpian los pedidos y el vehiculo elegidos, para no mezclar datos de dos proyectos.",
    ],
  },

  // ==========================================================================
  // GENERAR ORDENES DE DESCARGUE
  // ==========================================================================
  {
    modulo: "Generar Órdenes de Descargue",
    resumen: "Registra a mano la recepcion de un vehiculo que llega a descargar mercancia.",
    proposito:
      "Crea la orden de descargue de un vehiculo que llega con producto: se digita que trae, en que lote, con que peso, y queda la orden con su PDF. Se usa para recepciones que no nacen de un traslado propio, por ejemplo terceros que llegan a un CEDI sin orden madre.",
    puedes: [
      "Escoger el vehiculo entre las citas registradas del proyecto (placa y fecha de llegada).",
      "Registrar fecha de descargue, transportadora, numero de tiquete, numero de orden y peso de bascula en toneladas.",
      "Agregar los productos linea por linea, con lote digitado a mano y cantidad; el peso se calcula solo con el peso unitario del catalogo.",
      "Guardar la orden: queda como operacion de Descargue con su PDF y la cita del vehiculo se marca como procesada.",
    ],
    noPuedes: [
      "Guardar sin vehiculo, sin transportadora o sin al menos un producto con cantidad mayor a cero.",
      "Descargar contra un pedido o una orden de cargue de origen: este modulo es para recepciones digitadas a mano. Los traslados propios llegan solos por Recepcion de Traslado o por el descargue automatico entre sedes.",
      "Editar el peso unitario de los productos: viene del catalogo.",
    ],
    funcionalidades: [
      {
        nombre: "Encabezado de la recepcion",
        descripcion:
          "Fecha, vehiculo (desde las citas abiertas del proyecto), transportadora, tiquete, numero de orden y peso de bascula. Si no se digita numero de orden, el sistema genera un consecutivo propio.",
      },
      {
        nombre: "Lineas de producto con lote",
        descripcion:
          "Cada linea lleva producto (buscador del catalogo), lote digitado y cantidad. El campo Lote existe justamente para terceros que llegan sin orden madre y deben quedar con trazabilidad.",
      },
      {
        nombre: "Peso total de la orden",
        descripcion: "Suma automatica del peso de todas las lineas, calculado con el peso unitario del catalogo.",
      },
    ],
    consejos: [
      "La orden queda en la empresa del selector global de la barra superior: verificar el proyecto antes de guardar.",
      "El vehiculo debe existir como cita en Registrar Vehiculos; al guardar, esa cita se cierra (queda procesada).",
    ],
  },

  // ==========================================================================
  // GENERAR ORDEN DE DISTRIBUCION
  // ==========================================================================
  {
    modulo: "Generar Orden de Distribución",
    resumen: "Crea a mano una orden de distribucion (reparto) para un vehiculo.",
    proposito:
      "Registra una orden de tipo Distribucion digitando productos y cantidades para un vehiculo. Es el camino manual: lo normal es que la distribucion de las placas propias nazca sola como gemela de la orden de cargue (numero con 'D' al final), asi que este modulo se usa solo para casos que la automatizacion no cubre.",
    puedes: [
      "Escoger el vehiculo entre las citas abiertas del proyecto; si la cita trae transportadora, se llena sola.",
      "Registrar fecha de distribucion, tiquete, numero de orden y peso de bascula en toneladas.",
      "Agregar productos linea por linea con cantidad; el peso se calcula con el peso unitario del catalogo y el total se muestra en toneladas.",
      "Guardar la orden: queda como operacion de Distribucion y la cita del vehiculo se marca como procesada.",
    ],
    noPuedes: [
      "Guardar sin vehiculo, sin transportadora o sin al menos un producto con cantidad mayor a cero.",
      "Registrar lote por linea: la distribucion manual no lo maneja (a diferencia del descargue).",
      "Reemplazar la distribucion automatica: si la orden de cargue de una placa propia ya genero su gemela, no hay que duplicarla aqui.",
    ],
    funcionalidades: [
      {
        nombre: "Encabezado de la distribucion",
        descripcion:
          "Fecha, placa (desde las citas del proyecto), transportadora, tiquete, numero de orden y peso de bascula en toneladas.",
      },
      {
        nombre: "Lineas de producto",
        descripcion:
          "Producto con buscador del catalogo y cantidad; el peso por linea y el total de la orden se calculan solos.",
      },
    ],
    consejos: [
      "Las distribuciones creadas a mano se resaltan en rojo con la etiqueta 'manual' en Gestion de Ordenes, para distinguirlas de las automaticas.",
      "La orden queda en la empresa del selector global de la barra superior.",
    ],
  },

  // ==========================================================================
  // GESTION DE ORDENES
  // ==========================================================================
  {
    modulo: "Gestión de Ordenes",
    resumen: "Tablero central para consultar y administrar las ordenes de cargue ya generadas.",
    proposito:
      "Es la mesa de control de las ordenes: muestra cada orden con todos sus hitos (hora de orden, sanitario, llegada del vehiculo, pesajes, asignacion de lote, inicio y fin de cargue) y desde aqui se ejecutan las acciones de seguimiento. Se usa despues de generar la orden y durante toda su vida hasta que finaliza.",
    puedes: [
      "Filtrar por estado (pendientes, finalizadas, todas), numero de orden, fechas, tipo de operacion, placa y empresa.",
      "Abrir el PDF de la orden y exportar el listado filtrado a Excel.",
      "Editar la fecha de cargue de una orden.",
      "Asignar vehiculo a una orden que nacio sin placa (opcion 'Sin vehiculo'); si la placa es propia, en ese momento se genera la orden de distribucion automatica.",
      "Saltar directo al Registro sanitario o a la Bascula de una orden desde su menu de acciones.",
      "Eliminar una orden que aun no ha avanzado: borra cabecera y detalle, reabre los pedidos asociados y, si es una orden de cargue madre, arrastra sus clones automaticos.",
    ],
    noPuedes: [
      "Eliminar una orden que ya tiene asignacion de lote o que ya finalizo cargue: el sistema lo bloquea.",
      "Crear ordenes desde aqui: nacen en Generar Ordenes de Cargue, Descargue o Distribucion.",
      "Asignar vehiculo a una orden que ya tiene placa: la accion se deshabilita.",
    ],
    funcionalidades: [
      {
        nombre: "Tabla de seguimiento",
        descripcion:
          "Una fila por orden con la linea de tiempo completa de la operacion: horas de orden, sanitario, vehiculo, pesajes inicial y final, asignacion de lote, inicio y fin de cargue, peso y tiquete de bascula. Al tocar una fila se muestra la empresa de la orden.",
      },
      {
        nombre: "Menu de acciones por orden",
        descripcion:
          "Editar fecha de cargue, ir a Registro sanitario, asignar vehiculo, ir a Bascula y eliminar orden, con cada accion habilitada solo cuando aplica.",
      },
      {
        nombre: "Distribuciones manuales resaltadas",
        descripcion:
          "Las ordenes de Distribucion creadas a mano (no por la automatizacion) se pintan en rojo con la etiqueta 'manual' para revisarlas con lupa.",
      },
      {
        nombre: "Exportar a Excel",
        descripcion: "Descarga el listado con los filtros aplicados, columna por columna como se ve en pantalla.",
      },
    ],
    consejos: [
      "Eliminar una orden es definitivo: reabre los pedidos para volver a despacharlos, pero no se puede deshacer.",
      "El listado obedece al selector global de la barra superior: si una orden no aparece, revisar el proyecto seleccionado.",
    ],
  },

  // ==========================================================================
  // RECEPCION DE TRASLADO
  // ==========================================================================
  {
    modulo: "Recepción de Traslado",
    resumen: "Recibe los traslados despachados desde otra sede y genera su orden de descargue.",
    proposito:
      "Cuando otra sede despacha un traslado hacia este proyecto, aqui aparece la orden con su placa, productos y lotes tal como salieron. Con un boton se genera la orden de descargue para recibir la mercancia, sin volver a digitar nada. Se usa en la sede que RECIBE el traslado.",
    puedes: [
      "Escoger entre las ordenes de cargue de traslados despachados hacia el proyecto seleccionado.",
      "Consultar el encabezado del traslado: placa, fecha de despacho, tipo de producto y peso total.",
      "Revisar el detalle producto por producto con codigo, lote y cantidad, exactamente como salio de la sede origen.",
      "Generar la orden de descargue con un clic: se crea con consecutivo propio de traslado y queda amarrada a la orden de origen.",
    ],
    noPuedes: [
      "Editar cantidades o lotes del traslado: se recibe lo que la sede origen despacho.",
      "Ver traslados de otros proyectos: solo aparecen los dirigidos a la empresa del selector global.",
      "Crear un traslado desde aqui: el traslado nace en la sede que despacha.",
    ],
    funcionalidades: [
      {
        nombre: "Seleccion de orden de cargue",
        descripcion: "Desplegable con las ordenes de traslado pendientes de recibir, de la mas reciente a la mas antigua.",
      },
      {
        nombre: "Informacion de la orden",
        descripcion: "Placa, fecha de despacho, tipo de producto y peso total calculado con el peso unitario del catalogo.",
      },
      {
        nombre: "Generar Orden de Descargue",
        descripcion:
          "Crea la orden de recepcion con todos los productos y cantidades del traslado, lista para tramitar el descargue fisico.",
      },
    ],
    consejos: [
      "Verificar el selector global antes de generar: la orden de descargue queda en la empresa seleccionada.",
    ],
  },

  // ==========================================================================
  // DASHBOARD DESPACHOS/RECEPCION
  // ==========================================================================
  {
    modulo: "Dashboard Despachos/Recepción",
    resumen: "Tablero en vivo e historico de la operacion de patio: volumen, tiempos y cuellos de botella.",
    proposito:
      "Responde como va la operacion de despachos y recepciones sin abrir orden por orden: cuantas toneladas van, que vehiculos estan en patio y hace cuanto, en que etapa se esta perdiendo tiempo y como se compara el mes o el ano. Se usa para monitorear el dia en tiempo real y para analizar tendencias en las vistas mensual y anual.",
    puedes: [
      "Cambiar entre tres vistas: Diario (operacion en tiempo real), Mensual y Anual, cada una con su selector de dia, mes o ano.",
      "Ver en vivo los vehiculos activos con su estado, tiempo en patio y carga registrada, mas indicadores del dia (volumen, ordenes, lead time, tiempo en cola, cuello de botella, alertas).",
      "Leer los insights rotativos del dia: mensajes automaticos que resaltan lo mas relevante de la operacion.",
      "Analizar el funnel de tiempos por etapa para detectar donde se demora mas cada vehiculo (el cuello de botella se marca en rojo).",
      "Consultar dias u meses historicos con los mismos graficos: tendencia diaria, evolucion mes a mes, dia pico, mes record y proyeccion de cierre.",
      "Exportar a CSV el detalle diario del mes consultado.",
    ],
    noPuedes: [
      "Modificar ordenes ni tiempos desde aqui: es un tablero de solo lectura.",
      "Ver fechas futuras: el selector de dia llega hasta hoy.",
      "Cruzar varios proyectos a la vez: muestra la empresa del selector global.",
    ],
    funcionalidades: [
      {
        nombre: "Vista Diario — Operacion en Tiempo Real",
        descripcion:
          "Panel en vivo con los vehiculos activos y su semaforo de urgencia, ocho indicadores del dia, funnel de tiempos por etapa, rendimiento por hora y torta de estados. Pensado para dejarlo abierto en una pantalla del centro de control.",
      },
      {
        nombre: "Vista Mensual",
        descripcion:
          "Indicadores acumulados del mes (volumen, promedio diario, ordenes, lead time, dia pico), tendencia diaria de toneladas por tipo de operacion contra lead time, cuellos de botella estructurales y distribucion de la carga de trabajo. Incluye exportar CSV.",
      },
      {
        nombre: "Vista Anual",
        descripcion:
          "Acumulado del ano, mes record, mes mas eficiente, proyeccion de cierre, evolucion mes a mes y proporcion del negocio por tipo de operacion (cargue, descargue, distribucion).",
      },
      {
        nombre: "Insights del dia",
        descripcion:
          "Tira rotativa de mensajes generados con los datos de la operacion, con nivel de alerta segun la gravedad.",
      },
    ],
    consejos: [
      "El boton de actualizar refresca los datos al momento; el pie de pagina muestra la hora de la ultima actualizacion.",
    ],
  },

  // ==========================================================================
  // REGISTRAR VEHICULOS
  // ==========================================================================
  {
    modulo: "Registrar Vehículos",
    resumen: "Registra la llegada de un vehiculo al patio: placa, conductor y tipo de operacion.",
    proposito:
      "Es la puerta de entrada de todo vehiculo a la operacion: al llegar al patio se registra su cita con placa, conductor y para que viene (despacho o recepcion). La hora y fecha de llegada quedan grabadas automaticamente y desde ese momento la placa aparece disponible en los demas modulos (ordenes, bascula, sanitario).",
    puedes: [
      "Registrar placa, nombre del conductor, celular, transportadora, tipo de vehiculo, tipo de producto y si viene a despacho o recepcion.",
      "Dejar que el sistema capture solo la hora y fecha de llegada al guardar.",
      "Confiar en los formatos: la placa se convierte a mayusculas sin caracteres raros, el conductor solo acepta letras y el celular solo numeros.",
    ],
    noPuedes: [
      "Registrar una placa que ya tiene un registro abierto: el sistema lo rechaza hasta que la cita anterior se cierre.",
      "Digitar la capacidad del vehiculo: la asigna solo el tipo de vehiculo escogido.",
      "Editar o consultar citas desde aqui: eso se hace en Ver Vehiculos.",
    ],
    funcionalidades: [
      {
        nombre: "Formulario de llegada",
        descripcion:
          "Todos los datos del vehiculo y el conductor en una sola pantalla; los campos obligatorios se marcan en rojo si faltan.",
      },
      {
        nombre: "Hora de llegada automatica",
        descripcion:
          "Al guardar se graba la hora y fecha reales de llegada (hora de Colombia), que despues alimentan los tiempos de patio del dashboard.",
      },
    ],
    consejos: [
      "La cita queda en la empresa del selector global de la barra superior: verificar el proyecto antes de guardar.",
      "Si la placa 'no deja' registrarse, casi siempre es porque quedo una cita abierta de una visita anterior: buscarla en Ver Vehiculos.",
    ],
  },

  // ==========================================================================
  // VER VEHICULOS
  // ==========================================================================
  {
    modulo: "Ver Vehículos",
    resumen: "Consulta y administra las citas de vehiculos registradas.",
    proposito:
      "Muestra todas las citas de vehiculos con su informacion y el avance de cada una (hora de llegada, pesaje inicial, registro sanitario, estatus y orden de cargue asignada). Se usa para saber que vehiculos hay en patio, corregir un dato mal digitado o depurar una cita que no se va a usar.",
    puedes: [
      "Filtrar el listado por placa, transportadora, tipo de vehiculo y tipo de despacho.",
      "Editar los datos de una cita (conductor, celular, transportadora, tipos) mientras el vehiculo no haya avanzado en el proceso.",
      "Eliminar una cita que no se va a usar, si aun no tiene orden de cargue asignada.",
      "Exportar el listado a Excel.",
    ],
    noPuedes: [
      "Crear citas desde aqui: el boton Nuevo esta oculto a proposito; se crean en Registrar Vehiculos.",
      "Editar una cita cuyo vehiculo ya paso por bascula o por registro sanitario: las acciones se bloquean.",
      "Eliminar una cita con orden de cargue asignada: el boton se deshabilita e indica a que orden esta amarrada.",
      "Cambiar las horas capturadas automaticamente (llegada, pesaje, sanitario) ni el estatus: son de solo lectura.",
    ],
    funcionalidades: [
      {
        nombre: "Tabla de citas",
        descripcion:
          "Una fila por cita con placa, conductor, transportadora, tipos, capacidad y las horas que marcan el avance del vehiculo en el proceso, mas el estatus y la orden de cargue si ya se le asigno.",
      },
      {
        nombre: "Filtros rapidos",
        descripcion: "Placa (busqueda parcial), transportadora, tipo de vehiculo y tipo de despacho.",
      },
      {
        nombre: "Editar y eliminar con candados",
        descripcion:
          "Las acciones se deshabilitan solas cuando la cita ya avanzo (peso, sanitario u orden asignada), para proteger la trazabilidad.",
      },
    ],
  },

  // ==========================================================================
  // REGISTRO SANITARIO
  // ==========================================================================
  {
    modulo: "Registro sanitario",
    resumen: "Inspeccion sanitaria del vehiculo antes de cargar, con foto, PDF y aprobacion o rechazo.",
    proposito:
      "Deja constancia de que el vehiculo cumple las condiciones sanitarias antes de la operacion: estado de paredes y pisos, limpieza, olores, proteccion y fumigacion. Genera el acta en PDF y marca la hora del sanitario en la orden o en la cita. Es un paso del flujo entre la llegada del vehiculo y el cargue.",
    puedes: [
      "Inspeccionar 'Con orden de cargue' (vehiculos de ordenes que aun no tienen sanitario) o 'Solo placa' (citas sin registro sanitario).",
      "Responder el checklist Si/No: paredes y pisos, limpieza, olores, proteccion del piso y fumigacion (con plaguicida y fumigador si aplica).",
      "Adjuntar evidencia fotografica: en celular abre la camara directamente; la imagen puede pesar hasta 5MB.",
      "Aprobar la inspeccion (registra la hora del sanitario) o rechazarla (la orden queda marcada como rechazada).",
      "Obtener el acta en PDF que queda guardada y consultable en el historial.",
    ],
    noPuedes: [
      "Rechazar cuando todas las respuestas son Si: el rechazo exige al menos un incumplimiento.",
      "Guardar sin escoger placa ni sin el nombre del auxiliar logistico: son obligatorios.",
      "Editar una inspeccion ya registrada: queda en el historial tal como se hizo.",
    ],
    funcionalidades: [
      {
        nombre: "Tipo de registro",
        descripcion:
          "'Con orden de cargue' amarra la inspeccion a la orden y le graba la hora del sanitario; 'Solo placa' inspecciona una cita sin orden y le graba la hora en la cita.",
      },
      {
        nombre: "Checklist sanitario",
        descripcion:
          "Cinco preguntas Si/No; si hubo fumigacion se piden ademas el plaguicida usado y el nombre del fumigador.",
      },
      {
        nombre: "Evidencia y acta PDF",
        descripcion:
          "La foto y el acta en PDF quedan adjuntas al registro y se consultan despues en Ver historial de Inspeccion.",
      },
      {
        nombre: "Formulario propio de Harinera Indupan",
        descripcion:
          "Con el proyecto Harinera Indupan seleccionado, el modulo muestra otro formato: 'Inspeccion Sanitaria de Vehiculos', con datos de patio (actividad, transportador, responsable), ocho criterios de calidad, fotos multiples, firma del responsable dibujada en pantalla y su propia pestana de historial.",
      },
    ],
    consejos: [
      "Un rechazo marca la orden con estado 'Registro sanitario rechazado': el vehiculo debe corregir y volver a inspeccionarse antes de seguir.",
    ],
  },

  // ==========================================================================
  // VER HISTORIAL DE INSPECCION
  // ==========================================================================
  {
    modulo: "Ver historial de Inspección",
    resumen: "Consulta todas las inspecciones sanitarias realizadas, con su foto y su acta PDF.",
    proposito:
      "Archivo de las inspecciones sanitarias del proyecto: que vehiculo se inspecciono, cuando, que respondio el checklist y si quedo aprobado o rechazado. Es la evidencia que se muestra en auditorias o cuando un cliente pide el soporte sanitario de un despacho.",
    puedes: [
      "Revisar cada inspeccion con fecha, hora, orden de cargue, placa, conductor y producto.",
      "Leer el resultado de cada punto del checklist con semaforo de color (verde cumple, rojo no cumple) y el estado final de aprobacion.",
      "Abrir la foto de evidencia y el acta en PDF de cada registro.",
    ],
    noPuedes: [
      "Editar o eliminar inspecciones: es un historial de solo lectura.",
      "Ver inspecciones de otros proyectos: muestra la empresa del selector global.",
    ],
    funcionalidades: [
      {
        nombre: "Tabla del historial",
        descripcion:
          "Una fila por inspeccion con todos los puntos del checklist coloreados, las observaciones, el fumigador, el auxiliar y el estado de aprobacion.",
      },
      {
        nombre: "Foto y PDF por registro",
        descripcion:
          "Botones para abrir la evidencia fotografica y el acta PDF; se deshabilitan si el registro no los tiene.",
      },
    ],
  },

  // ==========================================================================
  // BASCULA
  // ==========================================================================
  {
    modulo: "Báscula",
    resumen: "Registra el pesaje del vehiculo: horas de entrada y salida de bascula, peso neto y tiquete.",
    proposito:
      "Captura el pesaje real del vehiculo amarrado a su orden de cargue: hora de pesaje inicial, hora de pesaje final, peso neto en toneladas y numero de tiquete. Ese peso es la fuente de verdad para facturar, asi que toda orden debe pasar por aqui. Tambien permite marcar la hora de pesaje inicial de un vehiculo que aun no tiene orden.",
    puedes: [
      "Trabajar 'Con orden de cargue': lista las ordenes del proyecto pendientes de pesaje final, con su avance a la vista.",
      "Ver el detalle de productos y lotes de una orden antes de registrarla (boton del ojo, solo lectura).",
      "Marcar hora de inicio y hora de fin con un boton de reloj que toma la hora real de Colombia (no se digita a mano).",
      "Registrar el peso neto de bascula en toneladas y el numero del tiquete.",
      "Trabajar 'Solo placa (sin orden)': marca la hora de pesaje inicial en la cita de un vehiculo recien llegado.",
    ],
    noPuedes: [
      "Registrar hora de fin sin haber marcado antes la hora de inicio.",
      "Guardar un peso neto mayor a 40 toneladas: el sistema lo frena y pide revisar el punto o la coma.",
      "Pesar clones de distribucion ni operaciones de tolva: no aparecen en la lista porque la orden madre ya se peso.",
      "Editar un pesaje ya cerrado desde aqui: las correcciones se hacen en Historial Bascula con clave.",
    ],
    funcionalidades: [
      {
        nombre: "Registro con orden de cargue",
        descripcion:
          "Tabla de ordenes con placa pendientes de pesaje final. Al registrar la hora de fin, la orden queda finalizada en el sistema.",
      },
      {
        nombre: "Registro solo placa",
        descripcion:
          "Para vehiculos con cita que aun no tienen orden: se les marca la hora del primer pesaje, que luego viaja a la orden cuando se genere.",
      },
      {
        nombre: "Detalle de productos por orden",
        descripcion: "Ventana de consulta con los productos y lotes de la orden, sin afectar el registro del pesaje.",
      },
    ],
    consejos: [
      "El peso de bascula es el insumo de la facturacion: una orden sin peso o sin tiquete queda como pendiente en Historial Bascula y bloquea facturar.",
      "Desde Gestion de Ordenes se puede llegar directo a la bascula de una orden con su menu de acciones.",
    ],
  },

  // ==========================================================================
  // HISTORIAL BASCULA
  // ==========================================================================
  {
    modulo: "Historial Báscula",
    resumen: "Historico de pesajes con alertas de tiquetes y pesos pendientes, y correccion protegida con clave.",
    proposito:
      "Consolida todos los pesajes de bascula del proyecto y vigila que ninguna orden quede sin tiquete ni sin peso (los pesos faltantes bloquean la facturacion). Tambien es el unico lugar donde se corrige un pesaje ya registrado, con clave de autorizacion.",
    puedes: [
      "Filtrar por rango de fechas de orden, placa, numero de orden y tiquete; el rango de fechas tambien actualiza la tarjeta de toneladas de los indicadores de arriba.",
      "Ver de un vistazo cuantas ordenes del periodo estan sin tiquete y cuantas sin peso, y abrir el detalle de cada lista de pendientes.",
      "Detectar tiquetes duplicados: si un mismo numero de tiquete aparece en mas de una orden, se resalta en rojo.",
      "Ver el detalle de productos y lotes de cada orden pesada.",
      "Corregir peso, tiquete y transportadora de un registro, previa clave de autorizacion.",
      "Exportar el historial filtrado a Excel y ver el total de toneladas del periodo.",
    ],
    noPuedes: [
      "Editar un registro sin la clave de autorizacion: la correccion esta protegida.",
      "Consultar este historial en los CEDIs: solo las plantas (Harinera Indupan y Avimol) tienen bascula fisica; en los CEDIs el peso se calcula desde los productos y el modulo lo avisa.",
      "Registrar pesajes nuevos: eso se hace en el modulo Bascula.",
    ],
    funcionalidades: [
      {
        nombre: "Tarjetas de pendientes",
        descripcion:
          "Dos contadores del periodo filtrado: tiquetes pendientes por ingresar y pesos pendientes por ingresar (estos ultimos bloquean facturacion). Al tocarlas se abre la lista completa de ordenes afectadas.",
      },
      {
        nombre: "Historial con filtros",
        descripcion:
          "Tabla con orden, fechas, placa, tiquete, peso de la orden y peso real de bascula; los tiquetes repetidos se marcan en rojo aunque su pareja quede fuera del filtro.",
      },
      {
        nombre: "Correccion con clave",
        descripcion:
          "Editar un registro pide primero una clave; superada, permite ajustar transportadora, tiquete y peso de bascula.",
      },
      {
        nombre: "Exportar a Excel",
        descripcion: "Descarga el historial con los filtros aplicados.",
      },
    ],
    consejos: [
      "Revisar a diario que las dos tarjetas de pendientes esten en verde: un peso sin ingresar detiene la facturacion de esa orden.",
    ],
  },
]
