/**
 * Catalogo de contenido del modulo "Aprendizaje".
 *
 * QUE ES: la guia de usuario de LIPgo. Para cada modulo explica para que
 * sirve, que se puede hacer, que NO se puede hacer y como funciona cada
 * funcionalidad.
 *
 * COMO SE MUESTRA: el modulo "Aprendizaje" es universal (no esta en
 * MODULE_PERMISSION_MAP, asi que el sidebar lo muestra a todos), pero el
 * CONTENIDO se filtra: cada usuario solo ve la guia de los modulos para los
 * que tiene permiso de visualizacion en `permisos_usuarios`. El filtro se
 * resuelve contra `allowedModules` de /api/user-modules, la misma fuente que
 * usa el sidebar, para que nunca diverjan.
 *
 * ---------------------------------------------------------------------------
 * REGLA DE MANTENIMIENTO (importante)
 * ---------------------------------------------------------------------------
 * Cada vez que se cree un modulo nuevo, o se agregue/cambie una funcionalidad
 * de uno existente, hay que actualizar este archivo en el MISMO cambio.
 *
 * `pnpm run check:aprendizaje` compara MODULE_PERMISSION_MAP contra este
 * catalogo y falla listando lo que quede sin documentar. Correrlo antes de
 * dar por terminado un modulo nuevo.
 *
 * La clave `modulo` debe coincidir EXACTAMENTE (tildes incluidas) con la
 * clave usada en `lib/permissions-map.ts`; es lo que amarra guia <-> permiso.
 */

export interface FuncionalidadAprendizaje {
  /** Nombre de la funcionalidad tal como la ve el usuario en pantalla. */
  nombre: string
  /** Que hace y cuando usarla, en lenguaje de operacion (no de codigo). */
  descripcion: string
}

export interface ContenidoAprendizaje {
  /** Clave EXACTA del modulo en MODULE_PERMISSION_MAP. */
  modulo: string
  /** Una linea: para que sirve. Se muestra en el listado. */
  resumen: string
  /** Parrafo: que problema resuelve y en que momento del flujo se usa. */
  proposito: string
  /** Acciones que el modulo SI permite. */
  puedes: string[]
  /** Limites reales del modulo. Evita que el usuario busque algo que no esta. */
  noPuedes: string[]
  /** Desglose funcionalidad por funcionalidad. */
  funcionalidades: FuncionalidadAprendizaje[]
  /** Opcional: advertencias y buenas practicas. */
  consejos?: string[]
}

export const CATALOGO_APRENDIZAJE: ContenidoAprendizaje[] = [
  // ==========================================================================
  // APRENDIZAJE (el propio modulo)
  // ==========================================================================
  {
    modulo: "Aprendizaje",
    resumen: "La guia de usuario de LIPgo, ajustada a tus permisos.",
    proposito:
      "Explica para que sirve cada modulo al que tienes acceso, que puedes hacer en el, que no, y como funciona cada una de sus funcionalidades. Es el lugar para resolver dudas antes de tocar la operacion.",
    puedes: [
      "Consultar la guia de cualquier modulo que tengas habilitado.",
      "Buscar un modulo por nombre para llegar directo a su guia.",
      "Abrir el modulo directamente desde su guia con el boton \"Abrir el modulo\".",
      "Pedirle a LIPbot que te guie paso a paso en ese modulo con el boton \"Pedir ayuda a LIPbot\" (le abre el chat con la pregunta ya lista).",
      "Preguntarle lo mismo a LIPbot desde cualquier pantalla de la app, sin pasar por este modulo: el sabe explicar cualquier modulo al que tengas acceso.",
    ],
    noPuedes: [
      "Ver la guia de modulos a los que no tienes acceso: el contenido se filtra con los mismos permisos del menu.",
      "Editar el contenido desde la aplicacion: las guias se actualizan junto con el codigo.",
    ],
    funcionalidades: [
      {
        nombre: "Filtrado por permisos",
        descripcion:
          "El listado se arma con los mismos modulos que ves en el menu lateral. Si te otorgan un permiso nuevo, su guia aparece aqui automaticamente.",
      },
      {
        nombre: "Acciones desde la guia",
        descripcion:
          "Cada modulo documentado trae dos botones: \"Abrir el modulo\" te lleva directo a el, y \"Pedir ayuda a LIPbot\" abre el asistente con una pregunta ya escrita para que te explique como trabajar ahi paso a paso.",
      },
      {
        nombre: "LIPbot capacitado",
        descripcion:
          "LIPbot conoce esta misma guia para todos los modulos: preguntale 'como hago X' o 'que puedo hacer en Y' desde cualquier pantalla y te respondera con la guia real de ese modulo, respetando tus permisos.",
      },
      {
        nombre: "Pendiente de documentar",
        descripcion:
          "Los modulos cuya guia todavia no se ha escrito aparecen marcados con esa etiqueta. Se van completando por entregas.",
      },
    ],
  },

  // ==========================================================================
  // ALMACENAMIENTO · Gestion inventario
  // ==========================================================================
  {
    modulo: "Transacciones de Inventario",
    resumen: "Movimientos y correcciones de inventario por codigo de transaccion (estilo SAP), con trazabilidad completa.",
    proposito:
      "Es el punto donde el inventario cambia. Todo movimiento o correccion (malos ingresos, correccion de lote, cantidades, reversos, bloqueos) se registra aqui escribiendo el codigo de la transaccion, y queda con trazabilidad de quien lo hizo, quien autorizo y por que — ya no se corrige nada directo en la base de datos.",
    puedes: [
      "Movimiento por codigo: escribir el codigo (101, 601, 311, 309, 102, 602, 552, 312, 653, 344, 343, 701, 702, 561, 551) y el sistema habilita SOLO los campos de ese movimiento, con la nomenclatura visible al lado.",
      "Corregir un lote/producto/ubicacion mal digitado (309), anular ingresos (102), salidas (602), mermas (552) o traslados (312) — total o parcialmente, siempre referenciando el movimiento original.",
      "Bloquear producto en cuarentena (344) y liberarlo (343) sin sacarlo del inventario.",
      "Formulario clasico: registrar Entrada, Salida o Reproceso como siempre, con o sin QR de estiba.",
      "Consulta de movimientos: ver cualquier movimiento por rango de fechas (desde-hasta) con todos sus datos y exportar a Excel.",
      "Historial de correcciones: revisar todo lo ejecutado por codigo (quien, quien autorizo, motivo, evidencia) y exportarlo.",
      "Pestana Guia: la capacitacion completa de cada transaccion con pasos y ejemplos.",
    ],
    noPuedes: [
      "Editar o eliminar un movimiento ya registrado: un error se corrige con OTRO movimiento (un reverso), nunca borrando.",
      "Reversar mas de lo que el movimiento original registro (el sistema controla el reversible restante).",
      "Ejecutar un codigo de correccion sin motivo y sin la clave del responsable.",
      "Dejar el inventario en negativo: si la cantidad supera el stock del lote, el sistema bloquea el movimiento.",
    ],
    funcionalidades: [
      {
        nombre: "Movimiento por codigo",
        descripcion:
          "Se escribe el codigo de la transaccion y el formulario habilita los campos de ese movimiento. Los codigos de correccion exigen motivo y clave del responsable; los reversos piden buscar y elegir el movimiento original y muestran cuanto queda reversible. Antes de ejecutar, un dialogo resume exactamente que se va a mover.",
      },
      {
        nombre: "Nomenclatura visible",
        descripcion:
          "La tabla de codigos con su explicacion esta siempre al lado derecho, con buscador; clic en un codigo lo selecciona. Los codigos que requieren clave llevan un escudo.",
      },
      {
        nombre: "Formulario clasico (con o sin QR)",
        descripcion:
          "El flujo de siempre: Entrada suma stock; Salida y Reproceso lo restan y validan contra el stock real del producto/lote/localizacion. En modo QR se escanea la estiba y el sistema trae la linea de inventario.",
      },
      {
        nombre: "Consulta de movimientos",
        descripcion:
          "Cualquier movimiento del proyecto en un rango desde-hasta (dia calendario de Colombia), con filtros por producto, lote, tipo, codigo y usuario, y exportacion a Excel.",
      },
      {
        nombre: "Historial de correcciones",
        descripcion:
          "Registro propio y revisable de todo lo ejecutado por codigo: fecha, codigo, origen y destino, cantidad, motivo, quien lo realizo, quien lo autorizo y los movimientos generados como evidencia.",
      },
    ],
    consejos: [
      "El movimiento queda asociado a la empresa seleccionada en la barra superior. Si registra en la empresa equivocada, el saldo se afecta en la empresa equivocada.",
      "Ante la duda de que codigo usar, abra la pestana Guia o preguntele a LIPbot: conoce cada transaccion y direcciona el paso a paso.",
    ],
  },
  {
    modulo: "Saldos de inventario",
    resumen: "Consulta el inventario abierto por lote y localizacion.",
    proposito:
      "Vista de detalle del inventario: responde 'cuanto tengo de este producto, en que lote y en que localizacion'. Es la consulta que se usa antes de despachar o de asignar lotes.",
    puedes: [
      "Consultar el stock disponible, reservado y final de cada linea de inventario.",
      "Filtrar la consulta y exportar el resultado a Excel.",
    ],
    noPuedes: [
      "Modificar saldos. Es una vista de solo lectura.",
      "Corregir una diferencia desde aqui: eso se hace en Cuadre de Inventario.",
    ],
    funcionalidades: [
      {
        nombre: "Stock disponible, reservado y final",
        descripcion:
          "Disponible es lo que se puede comprometer; reservado es lo que ya quedo comprometido por una orden; final es el resultado de los dos. Si el disponible se ve mas bajo de lo esperado, normalmente hay cantidad reservada.",
      },
      { nombre: "Exportar a Excel", descripcion: "Descarga exactamente las filas que quedaron despues de aplicar los filtros." },
    ],
  },
  {
    modulo: "Saldos por producto",
    resumen: "Consulta el inventario consolidado por producto, sin abrir por lote.",
    proposito:
      "La vista gerencial del inventario: cuanto hay en total de cada producto, sin el detalle de lotes ni localizaciones. Sirve para revisar cobertura y planear, no para operar.",
    puedes: [
      "Ver el total por producto con su categoria y subcategoria.",
      "Filtrar por categoria, subcategoria y producto, y exportar a Excel.",
    ],
    noPuedes: [
      "Ver el detalle por lote o localizacion: para eso esta Saldos de inventario.",
      "Modificar saldos. Es una vista de solo lectura.",
    ],
    funcionalidades: [
      {
        nombre: "Filtro en cascada",
        descripcion:
          "La subcategoria se habilita solo despues de elegir una categoria, y muestra unicamente las subcategorias de esa categoria.",
      },
    ],
  },
  {
    modulo: "Traslados de producto",
    resumen: "Mueve producto entre localizaciones o entre estibas.",
    proposito:
      "Registra el movimiento fisico de producto dentro de la bodega. No cambia la cantidad total del inventario: cambia donde esta.",
    puedes: [
      "Registrar un traslado entre localizaciones.",
      "Registrar un traslado entre estibas.",
    ],
    noPuedes: [
      "Cambiar la cantidad total en inventario: un traslado mueve, no suma ni resta.",
      "Trasladar mas cantidad de la que hay en el origen.",
    ],
    funcionalidades: [
      {
        nombre: "Traslado de localizaciones",
        descripcion: "Mueve producto de una localizacion a otra dentro del almacen.",
      },
      {
        nombre: "Traslado entre estibas",
        descripcion: "Mueve producto de una estiba a otra, conservando la trazabilidad del QR de cada estiba.",
      },
    ],
  },
  {
    modulo: "Gestión de transacciones",
    resumen: "Consulta y audita todos los movimientos de inventario registrados.",
    proposito:
      "El historial completo de movimientos. Sirve para auditar: quien movio que, cuando, de donde salio y con que origen. Es la herramienta para rastrear una diferencia de inventario hasta el movimiento que la causo.",
    puedes: [
      "Consultar todas las transacciones con su tipo, status, origen y usuario que las creo.",
      "Filtrar por producto, localizacion, tipo de movimiento, status, origen, usuario y fecha.",
      "Exportar el resultado filtrado a Excel.",
    ],
    noPuedes: [
      "Editar, anular o aprobar una transaccion. Es una vista de solo lectura.",
      "Crear un movimiento nuevo: eso se hace en Transacciones de Inventario.",
    ],
    funcionalidades: [
      {
        nombre: "Campo Origen",
        descripcion:
          "Indica que proceso genero el movimiento (por ejemplo 'orden de cargue' cuando lo genero una asignacion de lotes). Es la forma mas rapida de saber si un movimiento fue manual o automatico.",
      },
      {
        nombre: "Campo Status",
        descripcion:
          "Marca el estado del movimiento. Las salidas generadas por asignacion de lotes nacen como 'por descontar' hasta que el proceso las consume; tambien existen 'aprobado' y 'rechazado'.",
      },
    ],
  },
  {
    modulo: "Capacidad Bodega",
    resumen: "Reporte de utilizacion y ocupacion de la bodega.",
    proposito:
      "Muestra que tan llena esta la bodega y como se distribuye la ocupacion, para decidir si hay espacio para recibir y donde ubicar.",
    puedes: [
      "Ver el resumen de utilizacion del ambito seleccionado.",
      "Filtrar por rango de ocupacion y limpiar el filtro para volver al total.",
    ],
    noPuedes: [
      "Cambiar la capacidad configurada de una bodega o localizacion desde aqui: eso se define en Configuracion.",
      "Mover producto para liberar espacio: eso se hace en Traslados de producto.",
    ],
    funcionalidades: [
      {
        nombre: "Filtro por rango de ocupacion",
        descripcion:
          "Al hacer clic en un rango, la vista se limita a las ubicaciones dentro de ese nivel de ocupacion. Sirve para aislar rapidamente lo que esta lleno o lo que esta vacio.",
      },
    ],
  },
  {
    modulo: "Montacargas y personal día",
    resumen: "Registro diario de montacargas disponibles y personal de operacion.",
    proposito:
      "Deja constancia, dia por dia, de con cuantos montacargas y cuanta gente se opero. Es el insumo para analizar productividad y para sustentar cobros asociados a la operacion.",
    puedes: [
      "Crear el registro del dia con la disponibilidad de montacargas y el conteo de personal.",
      "Editar y eliminar registros.",
      "Filtrar por rango de fechas y exportar a Excel.",
    ],
    noPuedes: [
      "Elegir la fecha o la empresa del registro: se asocian automaticamente a la fecha actual y a la empresa seleccionada en la barra superior.",
    ],
    funcionalidades: [
      {
        nombre: "Nuevo registro",
        descripcion:
          "Abre el formulario del dia. Como la fecha y la empresa se asignan solas, verifique la empresa seleccionada arriba ANTES de guardar.",
      },
      {
        nombre: "Filtro por rango + Exportar",
        descripcion: "Permite revisar un periodo completo y bajarlo a Excel para consolidar.",
      },
    ],
  },
  {
    modulo: "Panel LIP Inventario",
    resumen: "Panel analitico de exactitud y movimientos de inventario.",
    proposito:
      "Reune en un solo lugar los indicadores de salud del inventario: como se mueve, que productos rotan, como cierra contra los pedidos y si se esta respetando el FIFO. Es la vista de analisis, no de operacion.",
    puedes: [
      "Revisar el dashboard de indicadores y la clasificacion ABC de productos.",
      "Consultar el kardex de detalle, la conciliacion mensual, el cuadre diario, la preservacion/FIFO y la conciliacion de pedidos contra salidas.",
    ],
    noPuedes: [
      "Registrar movimientos ni ajustar inventario. Todo el panel es de consulta.",
      "Cerrar un mes o generar correcciones: eso se hace en Cuadre de Inventario.",
    ],
    funcionalidades: [
      {
        nombre: "Dashboard",
        descripcion:
          "Distribucion de movimientos, top de productos por salidas (fast movers), clasificacion ABC de Pareto y comparativo de recepcion contra despacho por mes.",
      },
      {
        nombre: "Inventario detalle (Kardex)",
        descripcion:
          "Recorrido movimiento por movimiento de un producto, para reconstruir como llego a su saldo actual. Al abrir un producto muestra arriba el total de entradas, salidas, traslados, ajustes y merma de ese periodo ya sumado, sin tener que sumar cada movimiento uno por uno.",
      },
      {
        nombre: "Conciliacion mensual y Cuadre diario",
        descripcion: "Comparan lo que dice el sistema contra lo contado, en el corte mensual y en el dia.",
      },
      {
        nombre: "Preservacion / FIFO",
        descripcion: "Muestra si se estan despachando primero los lotes mas antiguos, que es el criterio de preservacion del producto.",
      },
      {
        nombre: "Conciliacion pedidos vs salidas",
        descripcion: "Cruza lo pedido contra lo que efectivamente salio, para detectar faltantes o sobrantes de despacho.",
      },
    ],
  },
  {
    modulo: "Cuadre de Inventario",
    resumen: "Conteo fisico de cierre (varias personas a la vez) y correcciones que ajustan el stock.",
    proposito:
      "Es el unico modulo donde una diferencia de inventario se convierte en un ajuste real de stock. Maneja el ciclo completo del conteo de cierre: se cuenta entre varias personas si hace falta, se generan las correcciones, se cierra, se firma y se aprueba. El conteo total firmado del cierre queda como el inventario inicial del mes siguiente.",
    puedes: [
      "Registrar el conteo fisico mientras esta en borrador o contado: cada linea (producto + lote + ubicacion) se guarda sola al contarla, asi varias personas cuentan el mismo documento a la vez sin pisarse el trabajo del otro.",
      "Ver, por producto, la cantidad contada por lote y el total sumado, y quien conto cada linea.",
      "Generar las correcciones a partir de un conteo en estado contado.",
      "Cerrar el mes (ajusta el stock) y firmar el acta con firma digital dibujada, como evidencia de auditoria.",
      "Corregir manualmente un lote o ubicacion equivocado desde la pestana Correcciones, sin depender del conteo.",
      "Consultar el historico de conteos y de correcciones.",
    ],
    noPuedes: [
      "Editar un conteo que ya esta cerrado o aprobado: solo es editable en borrador o contado.",
      "Ajustar stock saltandose el flujo: el ajuste ocurre unicamente al cerrar el mes, o al aprobar una correccion manual.",
      "Editar/renombrar un lote o ubicacion existente directamente: toda correccion es un movimiento real (entrada o salida), nunca una reescritura.",
    ],
    funcionalidades: [
      {
        nombre: "Conteo por linea (varias personas a la vez)",
        descripcion:
          "Cada cantidad contada se guarda al momento, por producto + lote + ubicacion, sin borrar lo que otra persona ya conto. La tabla agrupa por producto: arriba el subtotal (sistema, conteo, diferencia) y, debajo, el detalle por lote/ubicacion con quien lo conto y a que hora.",
      },
      {
        nombre: "Conteo total (cierre de mes) vs conteo ciclico",
        descripcion:
          "El conteo TOTAL (el que cierra el mes) compara contra el inventario CONGELADO del dia anterior: excluye automaticamente lo que ya se movio hoy (cargue/descargue/produccion), aunque se cree a media manana. Aun asi, lo ideal es crearlo antes de que arranque la operacion del dia. El conteo CICLICO (verificacion puntual de un producto, boton \"Un producto\" al crear) compara contra el stock EN VIVO en el momento de crearlo — es otro caso de uso, no sirve para el cierre mensual.",
      },
      {
        nombre: "Estados del conteo",
        descripcion:
          "Borrador (se esta capturando) → Contado (ya tiene cantidades) → Cerrado (con correcciones generadas) → Aprobado (mes cerrado y stock ajustado). Cada estado habilita acciones distintas.",
      },
      {
        nombre: "Generar correcciones",
        descripcion:
          "Disponible cuando el conteo esta en estado contado. Toma las diferencias entre lo contado y el sistema (mismo lote/ubicacion) y arma las correcciones propuestas automaticamente.",
      },
      {
        nombre: "Correcciones (pestana aparte, manual)",
        descripcion:
          "Para corregir un lote/ubicacion equivocado, o registrar stock fisico encontrado en un lote que el sistema tenia en cero (por eso no aparecia en la lista del conteo). No reescribe nada: cada correccion registrada es un MOVIMIENTO REAL que solo se aplica al APROBARLA (boton check). Para mover cantidad de un lote mal a uno bien hacen falta DOS correcciones — una salida en el lote incorrecto y una entrada en el correcto — no una sola.",
      },
      {
        nombre: "Cerrar mes (ajusta stock)",
        descripcion:
          "Accion final e irreversible en la practica: aplica las correcciones y deja el stock del sistema igual a lo contado. Revise las correcciones antes de ejecutarla.",
      },
      {
        nombre: "Firma del acta",
        descripcion:
          "Firma digital dibujada (no solo texto), guardada como evidencia. Un conteo total cerrado o aprobado se enlaza automaticamente como el inventario inicial del mes siguiente al generar el Acta en Conciliacion Mensual (Panel LIP Inventario).",
      },
    ],
    consejos: [
      "Cerrar el mes ajusta el stock real. Confirme el conteo fisico antes de ejecutarlo, porque el ajuste queda registrado contra el inventario.",
      "Si varias personas cuentan el mismo documento, cada quien puede trabajar su parte del listado al tiempo: el guardado es por linea, no reemplaza lo que ya conto el companero.",
      "Una correccion registrada no mueve stock por si sola: hay que aprobarla (boton check) para que se postee el movimiento real y se actualice el saldo.",
    ],
  },
  {
    modulo: "Auditoría de Inventario",
    resumen: "Herramienta de conteo fisico para comparar contra el sistema.",
    proposito:
      "Sirve para hacer un conteo fisico de una localizacion y ver, en pantalla, la diferencia contra lo que dice el sistema. Es una herramienta de verificacion rapida: muestra el resultado pero no toca el inventario.",
    puedes: [
      "Filtrar por almacen, localizacion y producto para acotar lo que se va a contar.",
      "Iniciar el conteo, digitar las cantidades contadas y validar para ver la diferencia contra el stock del sistema.",
      "Reiniciar el conteo y empezar de nuevo.",
    ],
    noPuedes: [
      "Guardar el conteo: al salir del modulo o reiniciar, lo digitado se pierde.",
      "Ajustar el inventario con el resultado. Este modulo no escribe nada; el ajuste se hace en Cuadre de Inventario.",
    ],
    funcionalidades: [
      {
        nombre: "Iniciar conteo",
        descripcion:
          "Trae las lineas de inventario de la localizacion seleccionada con su stock de sistema y las deja listas para digitar el conteo fisico.",
      },
      {
        nombre: "Validar inventario",
        descripcion:
          "Calcula la diferencia (contado menos sistema) de cada linea. Positiva es sobrante y negativa es faltante. Si cambia una cantidad despues de validar, hay que volver a validar.",
      },
    ],
    consejos: [
      "Si el conteo debe quedar registrado y ajustar el stock, use Cuadre de Inventario. Este modulo es solo para verificar.",
    ],
  },

  // ==========================================================================
  // ALMACENAMIENTO · Asignacion de Lotes
  // ==========================================================================
  {
    modulo: "Asignación de Lotes",
    resumen: "Asigna que lotes concretos se despachan en cada orden de cargue.",
    proposito:
      "Es el paso de trazabilidad del despacho: define, para cada linea de la orden, de que lote y de que localizacion sale el producto. Al aprobar, deja reservado el inventario, marca la orden como ya loteada y genera el soporte en PDF.",
    puedes: [
      "Seleccionar una orden de cargue pendiente y ver sus productos agrupados por cliente.",
      "Asignar cantidades por lote y localizacion, o usar Auto asignar para que el sistema proponga la distribucion.",
      "Marcar un lote como Lote alterno cuando se agota el inventario de los lotes firmes.",
      "Aprobar la asignacion, lo que genera el historial, el movimiento de inventario y el PDF de soporte.",
    ],
    noPuedes: [
      "Asignar mas cantidad de la pedida ni superar el stock disponible: el sistema bloquea la aprobacion.",
      "Ver ordenes de Tolva, de proyeccion ni los clones de Distribucion (+D): esos no asignan lotes.",
      "Volver a asignar una orden ya aprobada: desaparece de la lista. Para rehacerla hay que anularla desde Historial de lotes.",
    ],
    funcionalidades: [
      {
        nombre: "Auto asignar",
        descripcion:
          "Reparte automaticamente la cantidad pedida entre los lotes disponibles, empezando por el lote mas antiguo y cuidando no usar dos veces el mismo stock entre clientes. Es una propuesta: se puede ajustar a mano despues.",
      },
      {
        nombre: "Edad del lote",
        descripcion:
          "Cada linea muestra los dias de antiguedad del lote. Los de mas de 15 dias se resaltan en amarillo para que salgan primero y se respete el FIFO.",
      },
      {
        nombre: "Lote alterno",
        descripcion:
          "Casilla que marca un lote como alterno. Su cantidad no suma al asignado firme de la linea ni descuenta del restante, y en inventario queda con status 'Lote alterno'. El sistema lo EXIGE cuando ya se agoto el stock firme y todavia falta cantidad por cubrir.",
      },
      {
        nombre: "Resumen por Lote y Location",
        descripcion:
          "Panel lateral que consolida cuanto se va a descontar de cada combinacion de lote y localizacion, sumando todos los clientes de la orden. Sirve para verificar que no se este sobregirando un lote.",
      },
      {
        nombre: "Aprobar",
        descripcion:
          "Registra las asignaciones en el historial de lotes, crea las salidas de inventario en estado 'por descontar', marca la hora de loteo en la orden, guarda la placa del vehiculo y genera el PDF de soporte.",
      },
    ],
    consejos: [
      "El campo Restante solo cuenta los lotes firmes: si marco un lote como alterno, el restante no baja. Es intencional.",
      "Revise la placa que muestra el modulo antes de aprobar: es la que queda registrada en el historial.",
    ],
  },
  {
    modulo: "Historial de lotes",
    resumen: "Consulta el historico de asignaciones de lotes y permite anularlas.",
    proposito:
      "Es la trazabilidad de que lote se despacho, a que cliente, en que orden y con que vehiculo. Tambien es el unico lugar donde se puede deshacer una asignacion ya aprobada.",
    puedes: [
      "Consultar el historico con filtros por cliente, producto, placa y rango de fechas.",
      "Descargar el PDF de soporte de cada asignacion.",
      "Exportar el historico filtrado a Excel.",
      "Anular todas las asignaciones de una orden de cargue.",
    ],
    noPuedes: [
      "Anular una sola linea: la anulacion aplica a TODAS las asignaciones de la orden seleccionada.",
      "Recuperar lo anulado: la anulacion borra los registros, no los marca como anulados.",
    ],
    funcionalidades: [
      {
        nombre: "Filtro por placa",
        descripcion:
          "Permite rastrear todo lo que se despacho en un vehiculo. La placa se captura automaticamente al aprobar la asignacion.",
      },
      {
        nombre: "Anular Asignaciones de Ordenes",
        descripcion:
          "Elimina el historial de lotes de esa orden, elimina los movimientos de inventario asociados y limpia la hora de loteo. El efecto practico es que la orden vuelve a aparecer como pendiente en Asignacion de Lotes para volver a asignarla.",
      },
    ],
    consejos: [
      "La anulacion es un borrado, no un reverso con rastro. Uselo solo para corregir una asignacion equivocada que aun no se ha despachado.",
    ],
  },
]

// ---------------------------------------------------------------------------
// Guias por AREA (lib/aprendizaje/*.ts) — un archivo por grupo del menu para
// que el catalogo sea mantenible. Este archivo concatena todo; la API publica
// (CATALOGO completo, indice y lista) no cambia para la UI ni para LIPbot.
// NOTA: scripts/check-aprendizaje.mjs tambien escanea lib/aprendizaje/*.ts.
// ---------------------------------------------------------------------------
import { APRENDIZAJE_DESPACHOS } from "@/lib/aprendizaje/despachos"
import { APRENDIZAJE_PEDIDOS } from "@/lib/aprendizaje/pedidos-torre"
import { APRENDIZAJE_PRODUCCION } from "@/lib/aprendizaje/produccion"
import { APRENDIZAJE_OPERACION_LIP } from "@/lib/aprendizaje/operacion-lip"
import { APRENDIZAJE_FINANCIERA } from "@/lib/aprendizaje/financiera"
import { APRENDIZAJE_RRHH_A } from "@/lib/aprendizaje/rrhh-seleccion-formacion"
import { APRENDIZAJE_RRHH_B } from "@/lib/aprendizaje/rrhh-asistencia-nomina"
import { APRENDIZAJE_COMPENSACION } from "@/lib/aprendizaje/compensacion"
import { APRENDIZAJE_CERTIFICACIONES } from "@/lib/aprendizaje/certificaciones"
import { APRENDIZAJE_SST } from "@/lib/aprendizaje/sst"
import { APRENDIZAJE_CONFIGURACION } from "@/lib/aprendizaje/configuracion"
import { APRENDIZAJE_MRP } from "@/lib/aprendizaje/mrp"

const CATALOGO_COMPLETO: ContenidoAprendizaje[] = [
  ...CATALOGO_APRENDIZAJE,
  ...APRENDIZAJE_DESPACHOS,
  ...APRENDIZAJE_PEDIDOS,
  ...APRENDIZAJE_PRODUCCION,
  ...APRENDIZAJE_OPERACION_LIP,
  ...APRENDIZAJE_FINANCIERA,
  ...APRENDIZAJE_RRHH_A,
  ...APRENDIZAJE_RRHH_B,
  ...APRENDIZAJE_COMPENSACION,
  ...APRENDIZAJE_CERTIFICACIONES,
  ...APRENDIZAJE_SST,
  ...APRENDIZAJE_CONFIGURACION,
  ...APRENDIZAJE_MRP,
]

/** Indice por nombre de modulo, para resolver la guia en O(1) desde la UI. */
export const APRENDIZAJE_POR_MODULO: Record<string, ContenidoAprendizaje> = Object.fromEntries(
  CATALOGO_COMPLETO.map((c) => [c.modulo, c]),
)

/** Nombres de modulo que ya tienen guia escrita. */
export const MODULOS_DOCUMENTADOS: string[] = CATALOGO_COMPLETO.map((c) => c.modulo)
