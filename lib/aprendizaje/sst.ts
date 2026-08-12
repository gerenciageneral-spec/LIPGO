// Guias del modulo Aprendizaje — area "sst".
// Generado por entregas; la clave `modulo` debe coincidir EXACTA con el menu.
import type { ContenidoAprendizaje } from "@/lib/aprendizaje-content"

export const APRENDIZAJE_SST: ContenidoAprendizaje[] = [
  // ==========================================================================
  // SG-SST · Resolucion 0312
  // ==========================================================================
  {
    modulo: "Auditoría 0312",
    resumen: "Tablero central del SG-SST: cumplimiento de los 60 estandares minimos frente a la evidencia real registrada en LIPgo.",
    proposito:
      "Muestra en una sola pantalla como esta la empresa frente a la Resolucion 0312 de 2019: el porcentaje total de cumplimiento, el detalle por ciclo PHVA (Planear, Hacer, Verificar, Actuar) y, estandar por estandar, si cumple, no cumple o no aplica. Ademas cruza cada estandar con la evidencia viva de los demas modulos: si un estandar esta marcado como cumple pero no tiene registros que lo respalden, lo senala como inconsistencia. El SG-SST se certifica a nivel LIP, no por cliente. Es la vista de consulta para preparar una auditoria; las respuestas se editan en la Matriz de Estandares.",
    puedes: [
      "Ver el porcentaje total de cumplimiento con su valoracion (aceptable, moderadamente aceptable o critico) y el puntaje por ciclo PHVA.",
      "Buscar un estandar por numeral, item o nombre, y filtrar por ciclo o por estado (cumple, no cumple, no aplica).",
      "Ver por cada estandar en que modulo de LIPgo vive su evidencia y cuantos registros la respaldan.",
      "Detectar inconsistencias: estandares marcados como cumple pero sin evidencia registrada.",
      "Cambiar de anio cuando hay mas de una autoevaluacion registrada.",
      "Exportar la tabla filtrada a un archivo para trabajarla por fuera.",
      "Revisar el resumen de brechas: la lista de estandares en no cumple con su documento y modulo asociado.",
    ],
    noPuedes: [
      "Cambiar el estado de un estandar desde aqui. Las respuestas se marcan en la Matriz de Estandares.",
      "Subir soportes o evidencia. Los archivos se cargan en la Matriz de Estandares y en cada modulo fuente.",
      "Editar los pesos o el listado de estandares: vienen definidos por la norma.",
    ],
    funcionalidades: [
      {
        nombre: "Velocimetro de cumplimiento",
        descripcion:
          "Circulo con el porcentaje total y la valoracion legal: aceptable por encima de 85 por ciento, moderadamente aceptable entre 60 y 85, critico por debajo de 60.",
      },
      {
        nombre: "Tarjetas por ciclo PHVA",
        descripcion:
          "Cuatro tarjetas (Planear, Hacer, Verificar, Actuar) con el porcentaje y los puntos obtenidos sobre el peso de cada ciclo.",
      },
      {
        nombre: "Columna de evidencia en LIPgo",
        descripcion:
          "Cada estandar indica el modulo donde se gestiona su evidencia y cuantos registros existen. Si dice 'sin evidencia' en un estandar que cumple, aparece la alerta 'cumple sin evidencia' para corregirlo antes de una auditoria.",
      },
      {
        nombre: "Resumen de brechas",
        descripcion:
          "Al final se listan todos los estandares en no cumple con su numeral, documento asociado y modulo, para atacarlos desde el Plan de Mejoramiento.",
      },
    ],
    consejos: [
      "Revisa primero las alertas de 'cumple sin evidencia': son lo que un auditor externo detecta mas rapido.",
      "Las brechas de este tablero alimentan el Plan de Mejoramiento, que se sincroniza solo al abrirlo.",
    ],
  },
  {
    modulo: "Matriz de Estándares",
    resumen: "La autoevaluacion de los 60 estandares minimos: aqui se marca cumple / no cumple / no aplica, se sube la evidencia y se firma el acta.",
    proposito:
      "Es la vista de trabajo del auditor interno del SG-SST. Recorre los 60 estandares de la Resolucion 0312 agrupados por ciclo PHVA y por estandar, marca el estado de cada item, deja observaciones, adjunta soportes y ve el puntaje recalcularse al instante segun las reglas de la norma. Los numerales de medicion (3.3.1 a 3.3.6) se cumplen automaticamente cuando el indicador correspondiente tiene medicion registrada. Al terminar, la autoevaluacion se cierra con responsable, fecha y firma, y queda como acta.",
    puedes: [
      "Marcar cada item como cumple, no cumple o no aplica; el puntaje total, por ciclo y por estandar se recalcula al instante.",
      "Buscar por numeral, estandar o item, y filtrar con los chips: todos, solo no cumple, o por ciclo PHVA.",
      "Expandir un item para ver que se debe verificar (documental, campo o mixto) y escribir la observacion del auditor.",
      "Subir archivos de evidencia por estandar: el nuevo queda como vigente y el anterior se conserva como historico.",
      "Ver en los numerales 3.3.1 a 3.3.6 el valor medido del indicador frente a su meta, con acceso a la vista 3D del indicador.",
      "Abrir el soporte de Examenes Medicos desde el numeral de evaluaciones medicas, digitando la clave de acceso.",
      "Cerrar la autoevaluacion como acta con responsable, fecha y firma en pantalla, y reabrirla si hay que corregir.",
    ],
    noPuedes: [
      "Modificar los 60 estandares, sus pesos o sus ciclos: vienen definidos por la norma.",
      "Marcar a mano los numerales de medicion 3.3.x cuando ya hay indicador: se auto-cumplen con la medicion real.",
      "Borrar el historial de soportes: los archivos reemplazados quedan como historicos, no se eliminan.",
    ],
    funcionalidades: [
      {
        nombre: "Calculo en vivo segun la norma",
        descripcion:
          "Cumple y no aplica suman el peso del item; no cumple suma cero. La valoracion sale sola: aceptable por encima de 85 por ciento, moderadamente aceptable entre 60 y 85, critico por debajo de 60.",
      },
      {
        nombre: "Soportes con historial",
        descripcion:
          "Cada estandar tiene su cargador de archivos. Todo lo subido va al repositorio central: lo nuevo queda vigente y lo anterior como historico, para demostrar trazabilidad.",
      },
      {
        nombre: "Indicadores auto-cumplidos",
        descripcion:
          "Los numerales de medicion muestran una etiqueta con el valor real del indicador y su meta. Tocarla abre la ficha 3D del indicador de ese numeral.",
      },
      {
        nombre: "Cierre y firma del acta",
        descripcion:
          "Al final de la matriz se registra el responsable del SG-SST, la fecha y la firma dibujada en pantalla. La autoevaluacion queda cerrada y se puede reabrir si hace falta.",
      },
    ],
    consejos: [
      "Adjunta el soporte en el mismo momento en que marcas cumple: asi la Auditoria 0312 nunca mostrara 'cumple sin evidencia'.",
      "Usa el chip 'Solo no cumple' para trabajar las brechas una por una.",
    ],
  },
  {
    modulo: "Repositorio de Soportes",
    resumen: "Biblioteca de todos los archivos cargados como evidencia en la Matriz de Estandares, con estado vigente o historico.",
    proposito:
      "Reune en un solo lugar los documentos que respaldan los 60 estandares minimos, para consultarlos o descargarlos sin recorrer la matriz. Cada archivo indica a que estandar pertenece, cuando se subio, su tamano y si es la version vigente o una historica que fue reemplazada. Es la vista que se le muestra a un auditor cuando pide 'todos los soportes'.",
    puedes: [
      "Buscar un archivo por numeral, nombre del estandar o nombre del documento.",
      "Filtrar por estandar, por estado (solo vigentes, solo historicos o todos) y ordenar del mas reciente al mas antiguo o al reves.",
      "Ver cuantos soportes vigentes hay y cuantos estandares tienen al menos un soporte.",
      "Abrir o descargar cualquier archivo.",
      "Actualizar la lista para traer lo ultimo que se haya cargado.",
    ],
    noPuedes: [
      "Subir archivos desde aqui: la evidencia se carga en la Matriz de Estandares, en la fila de cada estandar.",
      "Eliminar o reemplazar documentos: es una vista de solo consulta.",
    ],
    funcionalidades: [
      {
        nombre: "Vigente vs historico",
        descripcion:
          "Cuando un soporte se reemplaza en la matriz, el anterior no se pierde: queda marcado como historico. Aqui se puede revisar toda la linea de tiempo documental de cada estandar.",
      },
      {
        nombre: "Indicadores de cobertura",
        descripcion:
          "Tres tarjetas muestran soportes vigentes, estandares con soporte y archivos totales incluyendo historicos, para saber de un vistazo que tan documentado esta el sistema.",
      },
    ],
  },
  {
    modulo: "Plan de Mejoramiento",
    resumen: "Acciones correctivas, preventivas y de mejora del SG-SST, sincronizadas automaticamente con la auditoria de los 60 estandares.",
    proposito:
      "Convierte las brechas de la autoevaluacion 0312 en un plan de trabajo con responsable, fecha limite, avance y soportes. Al abrir el modulo se sincroniza solo con la auditoria: crea una accion por cada estandar nuevo en no cumple y cierra las acciones de estandares ya subsanados. El circuito tambien funciona al reves: cuando marcas una accion como cerrada, su estandar pasa a cumple y la auditoria se recalcula. Asi el plan siempre refleja el estado real del sistema.",
    puedes: [
      "Ver todas las acciones con su hallazgo, responsable, fecha fin, avance y estado (abierta, en proceso, cerrada, vencida).",
      "Actualizar el porcentaje de avance y el estado de cada accion directamente en la tabla.",
      "Cerrar una accion: el estandar vinculado pasa a cumple y se recalcula la auditoria 0312.",
      "Subir soportes de la ejecucion en cada accion.",
      "Agregar acciones manuales con hallazgo, descripcion, tipo (correctiva, preventiva o mejora), responsable y fecha fin.",
      "Forzar la sincronizacion con la auditoria con el boton correspondiente, ademas de la que ocurre sola al abrir.",
    ],
    noPuedes: [
      "Eliminar acciones: se cierran o quedan en el historial, para no perder trazabilidad ante auditoria.",
      "Cerrar un estandar en la auditoria sin pasar por aqui o por la matriz: la unica via es marcar la accion como cerrada o cambiar el estado en la Matriz de Estandares.",
    ],
    funcionalidades: [
      {
        nombre: "Sincronizacion automatica con la auditoria",
        descripcion:
          "Al abrir el modulo (y con el boton Sincronizar) se crean acciones para los estandares en no cumple que no las tienen y se cierran las de estandares ya subsanados.",
      },
      {
        nombre: "Cierre con efecto en la auditoria",
        descripcion:
          "Marcar una accion como cerrada pone su avance en 100, sube el estandar vinculado a cumple y recalcula el puntaje de la 0312. Todo en un solo paso.",
      },
      {
        nombre: "Tarjetas de seguimiento",
        descripcion:
          "Resumen de acciones totales, cerradas, pendientes, vencidas (con fecha fin ya pasada) y avance promedio del plan.",
      },
      {
        nombre: "Soportes por accion",
        descripcion:
          "Cada accion tiene su propio cargador de documentos para evidenciar la ejecucion (actas, fotos, registros).",
      },
    ],
    consejos: [
      "Antes de una visita de auditoria, revisa la tarjeta de vencidas: una accion vencida sin gestion es un hallazgo casi seguro.",
    ],
  },
  {
    modulo: "Indicadores SST",
    resumen: "Tablero de indicadores del SG-SST con comparativo entre anios, metas y conexion con la matriz 0312 y el BSC.",
    proposito:
      "Mide la gestion del sistema: frecuencia y severidad de accidentes, ausentismo y demas indicadores de los numerales 3.3.1 a 3.3.6, mas los indicadores de gestion del SG-SST. Los de medicion se calculan sobre la accidentalidad y el ausentismo reales de LIP (la medicion es de toda la empresa, no por proyecto). Cada indicador muestra su valor, su meta, su evolucion mensual y como viene frente al anio anterior, pensado para demostrar gestion ante una auditoria. Cuando un indicador tiene medicion, su numeral se auto-cumple en la Matriz de Estandares y ademas alimenta el cuadro de mando de la empresa.",
    puedes: [
      "Ver el tablero con todos los indicadores: valor actual, meta, estado (en meta o fuera) y grafica mensual del anio.",
      "Elegir el anio a consultar y contra que anio comparar.",
      "Ver el panel de avance hacia la meta: cada indicador viaja de su punto del anio base al actual sobre un mismo eje, con verde si se acerca y rojo si se aleja.",
      "Consultar el comparativo anual en tabla: valor de ambos anios, variacion coloreada segun el sentido del indicador y estado frente a la meta.",
      "Abrir la ficha 3D de cualquier indicador tocando su tarjeta.",
      "Registrar mediciones por periodo (mes o anio) con numerador, denominador, valor, meta y analisis del periodo.",
    ],
    noPuedes: [
      "Medir por proyecto: los indicadores del SG-SST son de LIP como empresa.",
      "Cambiar el catalogo de indicadores o su numeral 0312: esta definido en el sistema.",
      "Borrar mediciones historicas desde la pantalla.",
    ],
    funcionalidades: [
      {
        nombre: "Banda de resumen",
        descripcion:
          "Cuantos indicadores estan en meta, cuantos fuera y cuantos mejoran frente al anio base, para leer la gestion en un vistazo.",
      },
      {
        nombre: "Avance hacia la meta",
        descripcion:
          "Panel que pone todos los indicadores sobre un mismo eje de cumplimiento del objetivo, aunque tengan unidades distintas. Mas a la derecha es mas cerca de la meta; el tramo verde o rojo dice si mejoro o empeoro.",
      },
      {
        nombre: "Evolucion mensual",
        descripcion:
          "Cada tarjeta grafica el anio actual mes a mes, con el anio base como referencia punteada y la meta senalada. Los meses futuros no se dibujan para no simular caidas falsas.",
      },
      {
        nombre: "Cableado 0312, Matriz y BSC",
        descripcion:
          "Cada indicador muestra etiquetas con su numeral de la Resolucion 0312, su auto-cumplimiento en la Matriz de Estandares y su aporte al cuadro de mando, para que la auditoria rastree la conexion.",
      },
      {
        nombre: "Registro de mediciones",
        descripcion:
          "Pestana para capturar el periodo (mes o consolidado anual), el indicador, numerador, denominador, valor, meta, unidad y la observacion con el analisis de que paso y que se hizo.",
      },
    ],
    consejos: [
      "En los indicadores donde menor es mejor (accidentalidad, ausentismo), que el valor baje es buena noticia: la variacion se colorea segun el sentido, no segun el signo.",
    ],
  },
  {
    modulo: "IPEVR",
    resumen: "Matriz de identificacion de peligros y valoracion de riesgos con la metodologia GTC 45.",
    proposito:
      "Registra los peligros de cada proceso, actividad y tarea, los valora con niveles de deficiencia, exposicion y consecuencia, y calcula automaticamente el nivel de riesgo, su interpretacion (niveles I a IV) y la aceptabilidad. Ademas guarda las medidas de intervencion propuestas segun la jerarquia de controles y el seguimiento del plan de accion con su porcentaje de cumplimiento. Es la base para priorizar que riesgos atacar primero.",
    puedes: [
      "Registrar un peligro con su contexto: proceso, zona, actividad, tarea, si es rutinaria, clasificacion (fisico, quimico, biomecanico, psicosocial, etc.), descripcion y efectos posibles.",
      "Documentar los controles existentes en la fuente, el medio y el individuo.",
      "Valorar el riesgo eligiendo nivel de deficiencia, exposicion y consecuencia; el nivel de probabilidad, el nivel de riesgo y su interpretacion se calculan solos y se ven antes de guardar.",
      "Registrar las medidas de intervencion propuestas por jerarquia: eliminacion, sustitucion, ingenieria, administrativos y proteccion personal.",
      "Llevar el seguimiento del plan de accion de cada peligro con controles propuestos, implementados y porcentaje de cumplimiento.",
      "Consultar la matriz completa, abrir el detalle de cualquier peligro y adjuntar soportes por fila.",
    ],
    noPuedes: [
      "Cambiar a mano el nivel de riesgo o la aceptabilidad: se calculan automaticamente a partir de los niveles elegidos.",
      "Eliminar peligros registrados desde la pantalla.",
    ],
    funcionalidades: [
      {
        nombre: "Calculo automatico GTC 45",
        descripcion:
          "Al elegir deficiencia, exposicion y consecuencia, el sistema calcula el nivel de probabilidad y el nivel de riesgo, lo clasifica del nivel I (mas critico) al IV y determina si es aceptable.",
      },
      {
        nombre: "Tarjetas por nivel de riesgo",
        descripcion:
          "Resumen de peligros totales y cuantos hay en cada nivel, mas el conteo de riesgos no aceptables que exigen intervencion prioritaria.",
      },
      {
        nombre: "Detalle completo del peligro",
        descripcion:
          "Boton Ver que abre todo lo registrado: contexto, valoracion, medidas por jerarquia y el estado del plan de accion, listo para revision o auditoria.",
      },
      {
        nombre: "Seguimiento de gestion del cambio",
        descripcion:
          "Cada peligro guarda su plan de accion con fecha de implementacion y porcentaje de cumplimiento, que se colorea en la matriz segun el avance.",
      },
    ],
  },
  {
    modulo: "Registro Preoperacional",
    resumen: "Inspeccion diaria del montacargas antes de operarlo: chequeo del operador, chequeo fisico y mecanico, y firma.",
    proposito:
      "Cada dia, antes de usar el montacargas, el operador diligencia esta inspeccion: declara que esta en condiciones de operar (licencia o curso vigente, buen estado de salud, sin consumo de sustancias) y revisa punto por punto el estado fisico y mecanico del equipo (frenos, llantas, luces, alarma de reversa, extintor, horquillas, mastil y demas). El registro exige seleccionar al operador del personal de la empresa y firmar en pantalla. El historial cruza la hora en que se lleno la inspeccion contra la hora de entrada del operador ese dia, para detectar inspecciones diligenciadas antes de llegar a trabajar.",
    puedes: [
      "Diligenciar la inspeccion con fecha, turno, referencia del equipo, placa y el operador elegido del personal de la empresa.",
      "Marcar las declaraciones del operador y los puntos de inspeccion fisica y mecanica, y anotar la desviacion identificada si algo no cumple.",
      "Firmar en pantalla; sin firma no se puede guardar.",
      "Consultar el historial paginado con la hora de entrada del operador y la diferencia frente a la hora en que diligencio la inspeccion.",
      "Descargar cualquier inspeccion como documento con todos los puntos, observaciones y la firma.",
      "Ver el dashboard por periodo (7 a 90 dias): puntos que mas fallan, primer dia de falla de cada uno y matriz de inspecciones por vehiculo y fecha.",
    ],
    noPuedes: [
      "Guardar sin seleccionar al operador con su identificacion o sin la placa del equipo.",
      "Guardar sin firmar en pantalla.",
      "Editar o borrar una inspeccion ya guardada: queda como registro historico.",
    ],
    funcionalidades: [
      {
        nombre: "Chequeo en dos bloques",
        descripcion:
          "Primero las validaciones del operador (licencia o curso vigente, salud y descanso adecuados, sin consumo de sustancias) y luego la inspeccion fisica y mecanica del equipo, punto por punto.",
      },
      {
        nombre: "Cruce con la marcacion de entrada",
        descripcion:
          "El historial muestra a que hora entro el operador ese dia y cuanto tiempo despues (o antes) diligencio la inspeccion. Una diferencia negativa senala que se lleno antes de marcar entrada.",
      },
      {
        nombre: "Dashboard de fallas",
        descripcion:
          "Por el periodo elegido: total de inspecciones, vehiculos y operadores distintos, ranking de los puntos con mas incumplimientos y el detalle de cada falla con fecha, placa y operador.",
      },
      {
        nombre: "Matriz por vehiculo",
        descripcion:
          "Vista tipo calendario por placa: que dias se inspecciono cada equipo y como le fue, para detectar dias sin inspeccion.",
      },
    ],
    consejos: [
      "La placa se escribe a mano: digitala igual que aparece en Gestion de Montacargas para que la inspeccion quede atribuida a la hoja de vida del equipo correcto.",
    ],
  },
  {
    modulo: "Equipos y Mantenimiento",
    resumen: "Hoja de vida de los equipos del SG-SST y su cronograma de mantenimientos preventivos y correctivos.",
    proposito:
      "Inventario de los equipos relevantes para seguridad (montacargas, bandas transportadoras, estanterias, extintores, herramientas, basculas) con sus datos basicos y estado, mas el registro de sus mantenimientos: que se programo, que se ejecuto, con que proveedor y a que costo. Cubre el estandar de mantenimiento de instalaciones y equipos. Para montacargas, la identificacion es la placa que se cruza con las inspecciones preoperacionales.",
    puedes: [
      "Registrar equipos con sede, tipo, identificacion o placa, marca, modelo, serie, fecha de ingreso, horometro y estado (operativo, fuera de servicio o de baja).",
      "Programar mantenimientos preventivos o correctivos por equipo, con fecha programada, fecha de ejecucion, proveedor, costo y descripcion.",
      "Consultar el listado de equipos y el de mantenimientos con su estado (programado, ejecutado o vencido).",
      "Ver de un vistazo cuantos equipos hay, cuantos estan operativos y cuantos mantenimientos estan programados o vencidos.",
    ],
    noPuedes: [
      "Eliminar equipos o mantenimientos desde la pantalla: los cambios de situacion se manejan con el estado.",
      "Registrar aqui las inspecciones diarias: eso se hace en Registro Preoperacional.",
    ],
    funcionalidades: [
      {
        nombre: "Hoja de vida basica del equipo",
        descripcion:
          "Cada equipo guarda sus datos de identificacion y su estado. Para montacargas, la placa registrada aqui es la que permite cruzar las inspecciones preoperacionales.",
      },
      {
        nombre: "Cronograma de mantenimiento",
        descripcion:
          "Los mantenimientos quedan como programados y pasan a ejecutados o vencidos; las tarjetas de arriba alertan cuantos estan vencidos para priorizarlos.",
      },
    ],
    consejos: [
      "Si el equipo es un montacarga y quieres bitacora con fotos, QR y preventivos por horas, usa Gestion de Montacargas: este modulo es el inventario general de equipos del SG-SST.",
    ],
  },
  {
    modulo: "Gestión de Montacargas",
    resumen: "Maestro de montacargas por proyecto: etiquetas QR, hoja de vida completa, fallas pendientes y preventivos.",
    proposito:
      "Administra el parque de montacargas de cada proyecto. Cada equipo tiene su ficha tecnica, su etiqueta QR para pegar en la maquina, su hoja de vida (bitacora de mantenimientos con fotos y costos, mas las inspecciones preoperacionales atribuidas) y su programacion de mantenimiento preventivo por horas de uso o por dias. Para registrar una actividad o cerrar una falla hay que leer el QR del equipo (o digitar su codigo), lo que garantiza que quien registra esta frente a la maquina correcta.",
    puedes: [
      "Crear y editar montacargas con su ficha completa: placa, alias, marca, modelo, serie, capacidad, tipo de energia, horometro y frecuencia de preventivo por horas o dias.",
      "Ver las alertas de arriba: fallas sin resolver y equipos con el preventivo vencido, sin entrar a ninguna pestana.",
      "Consultar la hoja de vida de cada equipo: datos tecnicos, costo acumulado de mantenimiento, bitacora de actividades con fotos y sus inspecciones preoperacionales con hallazgos.",
      "Registrar actividades de mantenimiento o falla leyendo el QR del equipo, y cerrar pendientes de la misma forma.",
      "Revisar la pestana de pendientes: fallas abiertas ordenadas de la mas vieja a la mas reciente.",
      "Controlar los preventivos: frecuencia, horometro, ultimo preventivo y estado (al dia, proximo, vencido o sin programar).",
      "Generar e imprimir las etiquetas QR de los equipos del proyecto.",
    ],
    noPuedes: [
      "Registrar una actividad o cerrar un pendiente sin identificar el equipo por su QR o codigo de etiqueta.",
      "Ver montacargas sin elegir un proyecto en el selector global: cada equipo pertenece a un proyecto.",
      "Eliminar equipos: se marcan como fuera de servicio o de baja.",
    ],
    funcionalidades: [
      {
        nombre: "Compuerta por QR",
        descripcion:
          "Al registrar o cerrar una actividad, primero se lee el QR de la maquina (o se digita el codigo de la etiqueta). El sistema valida que corresponda al equipo esperado y usa el proyecto del equipo identificado, no el del selector.",
      },
      {
        nombre: "Hoja de vida con costos",
        descripcion:
          "Cada equipo acumula el costo total de sus mantenimientos y el del ultimo anio, junto con la bitacora completa: quien reporto, quien cerro, solucion, repuestos y fotos.",
      },
      {
        nombre: "Preoperacionales atribuidos",
        descripcion:
          "La hoja de vida cruza las inspecciones diarias del equipo con sus hallazgos. Si una placa del preoperacional no coincide con ningun equipo del maestro, se reporta como 'sin casar' en vez de atribuirla a ciegas.",
      },
      {
        nombre: "Control de preventivos",
        descripcion:
          "El preventivo vence por lo que ocurra primero: las horas de uso o los dias configurados. Un equipo sin frecuencia definida aparece como sin programar.",
      },
      {
        nombre: "Etiquetas QR imprimibles",
        descripcion: "Pestana que genera las etiquetas QR de todos los equipos del proyecto, listas para imprimir y pegar en cada maquina.",
      },
    ],
  },
  {
    modulo: "Entrega de EPP",
    resumen: "Registro de entregas y reposiciones de elementos de proteccion personal, para propios y contratistas.",
    proposito:
      "Deja constancia de cada elemento de proteccion entregado a un trabajador: que se entrego, cuanto, si fue entrega inicial o reposicion y por que motivo se repuso. Cubre el estandar de suministro de elementos de proteccion personal y sirve como evidencia de que la dotacion de seguridad si llega a la gente.",
    puedes: [
      "Registrar una entrega con sede, trabajador, cedula, cargo y tipo de persona (propio o contratista).",
      "Elegir el elemento (botas, guantes, gafas, proteccion auditiva, arnes, chaleco, entre otros) y la cantidad.",
      "Marcar si es entrega inicial o reposicion, y en las reposiciones anotar el motivo (desgaste, dano, vencimiento).",
      "Consultar el historial de entregas y los totales: entregas, trabajadores distintos y reposiciones.",
    ],
    noPuedes: [
      "Capturar la firma del trabajador en la entrega: esta prevista para una fase posterior.",
      "Descontar inventario de bodega: este registro es de constancia, no mueve existencias.",
      "Editar o eliminar entregas ya registradas.",
    ],
    funcionalidades: [
      {
        nombre: "Registro rapido de entrega",
        descripcion:
          "Formulario corto con los datos del trabajador, el elemento, la cantidad y el motivo. Al guardar pasa directo al historial.",
      },
      {
        nombre: "Historial con distincion de reposiciones",
        descripcion:
          "La tabla marca cada fila como inicial o reposicion, para detectar elementos que se estan reponiendo con demasiada frecuencia.",
      },
    ],
  },
  {
    modulo: "Gestión de Dotación EPP",
    resumen: "Control de la dotacion entregada a cada colaborador con tallas, evidencia en PDF y semaforo de renovacion cada 4 meses.",
    proposito:
      "Administra la dotacion (camisa, pantalon, botas, guantes o dotacion completa) entregada a los colaboradores del proyecto. Cada registro guarda las tallas, la cantidad, el estado y la constancia firmada en PDF, y el sistema calcula cuantos dias faltan para la proxima renovacion: la dotacion se renueva cada 4 meses y el semaforo avisa cuando se acerca o ya se vencio.",
    puedes: [
      "Crear un registro de dotacion eligiendo al colaborador del personal del proyecto y la fecha de entrega.",
      "Registrar el tipo de item con sus tallas: talla de camisa (S a XL) y talla de pantalon en numero.",
      "Adjuntar la evidencia de la entrega en PDF y consultarla despues desde la tabla.",
      "Ver el semaforo de dias para renovar: verde con tiempo, amarillo a 20 dias o menos, rojo a 10 dias o menos (negativo si ya se vencio).",
      "Cambiar el estado de la dotacion: entregado, devuelto o danado.",
      "Editar o eliminar un registro existente.",
    ],
    noPuedes: [
      "Registrar dotacion a alguien que no este en el personal del proyecto seleccionado.",
      "Adjuntar evidencia en un formato distinto a PDF.",
    ],
    funcionalidades: [
      {
        nombre: "Renovacion cada 4 meses",
        descripcion:
          "A partir de la fecha de entrega, el sistema calcula la fecha de renovacion (entrega mas 4 meses) y muestra los dias que faltan con color segun la urgencia.",
      },
      {
        nombre: "Tallas segun el item",
        descripcion:
          "El formulario pide solo las tallas que aplican: camisa y pantalon para dotacion completa, una sola talla para los demas elementos.",
      },
      {
        nombre: "Evidencia adjunta",
        descripcion:
          "Cada registro puede llevar el PDF con la constancia de entrega firmada, visible desde el formulario y desde la tabla.",
      },
    ],
    consejos: [
      "Revisa periodicamente los registros en rojo: son dotaciones vencidas o a punto de vencerse que pueden convertirse en hallazgo.",
    ],
  },
  {
    modulo: "Investigación AT",
    resumen: "Investigacion completa de accidentes, incidentes y enfermedades laborales con el formato propio de LIP, analisis de causas y plan de accion.",
    proposito:
      "Documenta la investigacion de cada evento con el formato oficial de LIP (codigo SST-FOR-21, construido sobre el reporte FURAT): datos del empleador ya prellenados, informacion de la persona, detalle del evento con los catalogos oficiales (lugar, tipo de lesion, parte del cuerpo, agente y mecanismo), testigos con su version, manejo medico y ausentismo, reporte legal a la ARL y al Ministerio, analisis de causas con espina de pescado, plan de accion con controles en fuente, medio e individuo, retroalimentacion y firmas. La investigacion debe cerrarse dentro de los 15 dias del evento y el modulo mide ese cumplimiento.",
    puedes: [
      "Registrar el evento clasificandolo como incidente, accidente de trabajo o enfermedad laboral, con su severidad (leve, grave, mortal); el centro de trabajo se prellena segun el proyecto seleccionado.",
      "Diligenciar la informacion completa de la persona: documento, afiliaciones, cargo, vinculacion, antiguedad, salario, funciones y proteccion que portaba.",
      "Describir el evento con los catalogos oficiales de lugar, tipo de lesion, parte del cuerpo afectada, agente y mecanismo, mas la descripcion libre.",
      "Agregar testigos con su cedula y version, y registrar el manejo: primeros auxilios, remision, hospitalizacion y el ausentismo con dias y diagnostico.",
      "Dejar constancia del reporte legal: aviso a la ARL con fecha y radicado, y aviso al Ministerio cuando aplica.",
      "Analizar causas con la espina de pescado de 4 ramas (factores personales, factores del trabajo, actos inseguros, condiciones inseguras) y los cuadros de causas inmediatas y basicas.",
      "Armar el plan de accion con una o varias medidas, cada una con tipo de control (fuente, medio o individuo), responsables, fechas y estado, y generar el documento del formato en PDF con el logo de LIP.",
    ],
    noPuedes: [
      "Editar los datos del empleador del encabezado: son fijos de LIP.",
      "Modificar el PDF generado: es la foto no editable de lo registrado; si hay que corregir, se corrige el registro.",
      "Eliminar investigaciones guardadas: el historial se conserva y solo cambia de estado.",
    ],
    funcionalidades: [
      {
        nombre: "Formato oficial en pantalla",
        descripcion:
          "El formulario recorre las mismas secciones del formato fisico de LIP, del encabezado a las firmas, para que la investigacion quede completa y uniforme.",
      },
      {
        nombre: "Espina de pescado",
        descripcion:
          "Herramienta grafica de causas con las 4 ramas del formato; lo capturado ahi se imprime en el documento junto con los cuadros de causas inmediatas y basicas.",
      },
      {
        nombre: "Plan de accion fuente / medio / individuo",
        descripcion:
          "Cada medida de intervencion registra el tipo de control, responsable de ejecucion, fecha de implementacion, responsable de verificacion y estado (pendiente, implementado, verificado).",
      },
      {
        nombre: "Control del plazo legal",
        descripcion:
          "Las tarjetas muestran cuantos eventos hay por tipo y gravedad, los dias perdidos y el porcentaje de investigaciones hechas dentro de los 15 dias. El historial marca en rojo las que se pasaron del plazo.",
      },
      {
        nombre: "Documento PDF con logo",
        descripcion:
          "Vista previa o descarga del formato completo en PDF desde el formulario o desde el historial. Si se adjunto el original editable, tambien se puede descargar.",
      },
    ],
    consejos: [
      "Los accidentes graves o mortales se reportan a la ARL y al Ministerio dentro de los 2 dias habiles: no dejes esa seccion para el final.",
      "Si el evento entro por Alertas de AT, el borrador ya viene prellenado: completa la investigacion aqui.",
    ],
  },
  {
    modulo: "Alertas de AT",
    resumen: "Vigilancia automatica: cada accidente de trabajo registrado en ausentismos genera una alerta con su investigacion pendiente.",
    proposito:
      "Garantiza que ningun accidente de trabajo se quede sin investigar. El modulo esta conectado con los ausentismos de Gestion Humana: cada ausentismo de tipo accidente de trabajo aparece aqui como una alerta con los dias transcurridos desde el evento. Como la ley da 15 dias para investigar, las alertas que superan ese plazo sin investigacion cerrada se marcan como vencidas. Desde la misma alerta se genera el borrador de la investigacion, ya prellenado con los datos del colaborador y del evento.",
    puedes: [
      "Ver todos los accidentes de trabajo detectados desde ausentismos, con colaborador, cargo, area, diagnostico, fecha y dias de incapacidad.",
      "Seguir los dias transcurridos desde cada evento y detectar en rojo los que superaron los 15 dias sin cerrar la investigacion.",
      "Filtrar por estado (pendientes, en investigacion, cerradas, vencidas) y buscar por colaborador, cargo, area o diagnostico.",
      "Generar la investigacion con un boton: crea el borrador prellenado en Investigacion AT; si ya existia, avisa en vez de duplicar.",
      "Actualizar la lista para traer los ausentismos mas recientes.",
    ],
    noPuedes: [
      "Crear alertas a mano: nacen solas del registro de ausentismos con tipo accidente de trabajo.",
      "Completar la investigacion desde aqui: el detalle se diligencia en Investigacion AT.",
      "Borrar una alerta: desaparece de pendientes cuando su investigacion avanza o se cierra.",
    ],
    funcionalidades: [
      {
        nombre: "Deteccion automatica",
        descripcion:
          "El modulo lee los ausentismos de Gestion Humana y convierte cada accidente de trabajo en una alerta, sin que nadie tenga que reportarlo dos veces.",
      },
      {
        nombre: "Semaforo del plazo de 15 dias",
        descripcion:
          "Cada alerta muestra los dias transcurridos; pasadas los 15 dias sin investigacion cerrada queda como vencida y aparece un aviso destacado con el total de vencidas.",
      },
      {
        nombre: "Generar investigacion prellenada",
        descripcion:
          "Un boton crea el borrador de la investigacion con los datos del colaborador y del evento ya cargados. El sistema evita duplicados: si el accidente ya tiene investigacion, lo indica.",
      },
    ],
    consejos: [
      "Entra a este modulo con frecuencia: es la lista de chequeo de que nada se quedo sin investigar dentro del plazo legal.",
    ],
  },
  {
    modulo: "Investigaciones Realizadas",
    resumen: "Repositorio de consulta de todas las investigaciones de accidentes e incidentes, con su documento y sus soportes.",
    proposito:
      "Es el archivo historico de las investigaciones: permite consultarlas todas, ver su estado, verificar si se hicieron dentro del plazo de 15 dias y acceder a sus documentos. El boton Ver genera el documento en PDF no editable directamente desde los datos registrados, lo que evita que la investigacion se altere; si hace falta corregir, se puede adjuntar y descargar el original editable.",
    puedes: [
      "Consultar todas las investigaciones con fecha del evento, trabajador, tipo, gravedad, dias que tardo la investigacion y estado.",
      "Filtrar por estado (reportadas, en investigacion, cerradas), por anio del evento y buscar por trabajador, cargo, tipo, area o descripcion.",
      "Ver el documento de cualquier investigacion como PDF no editable generado desde lo registrado.",
      "Subir el original editable de la investigacion (por si hay que corregir) y descargarlo cuando ya esta adjunto.",
      "Cargar y consultar soportes adicionales por investigacion.",
      "Ver las tarjetas de resumen: total, abiertas, cerradas y porcentaje de cumplimiento del plazo de 15 dias.",
    ],
    noPuedes: [
      "Editar el contenido de una investigacion desde aqui: los registros se corrigen en Investigacion AT.",
      "Eliminar investigaciones del repositorio.",
    ],
    funcionalidades: [
      {
        nombre: "Documento siempre fiel",
        descripcion:
          "El PDF se genera en el momento desde los datos guardados, asi lo que se muestra siempre corresponde a lo registrado y nadie puede circular una version alterada.",
      },
      {
        nombre: "Original editable adjunto",
        descripcion:
          "Cada investigacion puede llevar adjunto su archivo original (hoja de calculo o documento) para correcciones; queda disponible para descarga junto al PDF.",
      },
      {
        nombre: "Control del plazo",
        descripcion:
          "La columna de dias a investigar se colorea segun si se cumplio o no el plazo de 15 dias, y el resumen muestra el porcentaje global de cumplimiento.",
      },
    ],
  },
  {
    modulo: "Examenes Médicos",
    resumen: "Examenes medicos ocupacionales: requisito de contratacion con dictamen apto / no apto y control de costos.",
    proposito:
      "Gestiona el examen medico de ingreso como compuerta de la contratacion: el candidato llega desde su hoja de vida, se le carga el documento del examen y se dictamina. Si es apto, sus documentos suben a Head Count y se habilita el contrato; si es no apto, la hoja de vida se rechaza y la contratacion queda bloqueada. El modulo tambien lleva el costo de cada examen (la empresa lo paga apruebe o no), importa el historico del personal antiguo y tiene una pestana aparte para los examenes periodicos.",
    puedes: [
      "Cargar un examen medico buscando al candidato por cedula o nombre entre las hojas de vida pendientes, con su documento adjunto, tipo, fecha, costo y observaciones.",
      "Guardarlo como pendiente y dictaminarlo despues con el boton Dictaminar (apto o no apto), o cambiar un dictamen ya dado.",
      "Dejar que el sistema lea el concepto de aptitud del documento cargado y clasifique apto / no apto automaticamente.",
      "Importar el historico del personal antiguo de Head Count como aptos, sin duplicar.",
      "Configurar el costo por defecto del examen y ver los totales: aptos, no aptos, pendientes, tasa de aprobacion, costo total y costo perdido en no aptos.",
      "Buscar por nombre o cedula, filtrar por estado del personal (activos, inactivos, todos) y ver o descargar el documento de cada examen.",
      "Consultar la pestana de examenes periodicos del personal activo.",
    ],
    noPuedes: [
      "Cargar un examen a alguien sin hoja de vida: primero se registra en el submodulo de Hojas de Vida.",
      "Contratar a un candidato con examen pendiente o no apto: el flujo de contratacion queda bloqueado hasta el dictamen apto.",
      "Recuperar un examen eliminado: la eliminacion es definitiva y pide confirmacion.",
    ],
    funcionalidades: [
      {
        nombre: "Compuerta de contratacion",
        descripcion:
          "El dictamen mueve el proceso: apto sube los documentos del candidato a Head Count y habilita el contrato; no apto rechaza la hoja de vida y bloquea la contratacion. El historico se conserva.",
      },
      {
        nombre: "Dictamen posterior",
        descripcion:
          "Un examen puede guardarse pendiente y decidirse despues con el dialogo de dictamen, donde tambien se ajustan costo y observaciones.",
      },
      {
        nombre: "Lectura automatica del concepto",
        descripcion:
          "El boton de validar aptitud lee el concepto de aptitud dentro de cada documento cargado y actualiza apto / no apto en lote, informando cuantos leyo y cuantos quedaron sin concepto.",
      },
      {
        nombre: "Control de costos",
        descripcion:
          "Cada examen registra su costo (con un valor por defecto configurable) y las tarjetas muestran el gasto total y cuanto se fue en examenes de candidatos no aptos.",
      },
      {
        nombre: "Importacion del historico",
        descripcion:
          "Trae como examenes de ingreso aptos al personal antiguo que ya estaba en Head Count. Es seguro repetirla: solo crea lo que falta.",
      },
    ],
  },
  {
    modulo: "MEDEVAC",
    resumen: "Directorio de emergencias medicas por colaborador: grupo sanguineo, alergias, afiliaciones y a quien avisar.",
    proposito:
      "Plan de emergencias medicas de LIP: por cada colaborador guarda la informacion critica para atender una emergencia (grupo sanguineo, alergias, EPS, ARL, celular) y el contacto al que hay que avisar con su parentesco y telefono. De cada persona se puede imprimir su tarjeta de emergencia, y del proyecto completo el directorio en PDF para tenerlo fisico en la operacion.",
    puedes: [
      "Agregar colaboradores al directorio digitando la cedula: el nombre, cargo, centro y celular se autocompletan desde el personal del proyecto.",
      "Registrar la informacion medica: grupo sanguineo, alergias, EPS y ARL.",
      "Guardar el contacto de emergencia con nombre, parentesco, telefono y correo, mas el mes de cumpleanos.",
      "Buscar en el directorio por nombre, cedula, cargo o grupo sanguineo.",
      "Ver la tarjeta de emergencia de cada colaborador y descargarla en PDF.",
      "Exportar el directorio completo (con los filtros aplicados) a PDF.",
      "Eliminar del directorio a quien ya no aplique.",
    ],
    noPuedes: [
      "Confiar ciegamente en la EPS y ARL autocompletadas: en el personal esas casillas suelen ser el documento de afiliacion, no el nombre; confirmalas a mano.",
      "Editar desde aqui los datos del personal: el directorio guarda su propia copia para emergencias.",
    ],
    funcionalidades: [
      {
        nombre: "Autorrelleno por cedula",
        descripcion:
          "Al digitar el documento y salir del campo (o pulsar Buscar), se traen nombre, cargo, centro y celular del personal del proyecto seleccionado. EPS y ARL quedan para confirmar manualmente.",
      },
      {
        nombre: "Tarjeta de emergencia",
        descripcion:
          "Ficha imprimible por colaborador con su grupo sanguineo destacado, alergias, afiliaciones y el recuadro 'en caso de emergencia avisar a', descargable en PDF con el formato de LIP.",
      },
      {
        nombre: "Directorio en PDF",
        descripcion:
          "Exporta el listado completo del proyecto (o el consolidado de todos, si no hay proyecto seleccionado) en una tabla lista para imprimir y publicar.",
      },
      {
        nombre: "Tarjetas de cobertura",
        descripcion:
          "Miden que porcentaje del directorio tiene grupo sanguineo y contacto de emergencia registrados, cuantas personas tienen alergias declaradas y quienes cumplen anos este mes.",
      },
    ],
    consejos: [
      "La meta es 100 por ciento de cobertura en grupo sanguineo y contacto de emergencia: las tarjetas de arriba se ponen en alerta cuando bajan de 95.",
    ],
  },
  {
    modulo: "Perfil Sociodemográfico",
    resumen: "Caracterizacion de la poblacion trabajadora: censo con dashboards y tabla detallada filtrable por cualquier columna.",
    proposito:
      "Presenta el censo sociodemografico que exige el SG-SST: quienes son los trabajadores, su edad, sexo, escolaridad, estado civil, estrato, vivienda, transporte, habitos y demas. La pestana de analisis lo muestra en graficas listas para el informe; la de tabla permite filtrar por cualquier columna y ver las tarjetas de analisis recalcularse en vivo con cada filtro. Filtra por proyecto con el selector global y por estado (activos, retirados o todos).",
    puedes: [
      "Ver las tarjetas generales: total de colaboradores, edad promedio, distribucion por sexo, cabezas de familia, antiguedad promedio, actividad fisica y fumadores.",
      "Consultar los dashboards: sexo, rango de edad, escolaridad, estado civil, estrato, turno, grupo etnico, vivienda, zona, transporte, EPS y habitos.",
      "Cambiar entre activos, retirados o todos.",
      "Filtrar la tabla detallada columna por columna (cada columna tiene su propio filtro) y por mes y anio de ingreso.",
      "Ver las tarjetas de analisis en vivo del grupo filtrado: cuantos son, edad y antiguedad promedio, y la escolaridad, estrato y cargo predominantes.",
      "Exportar a un archivo el listado con los filtros aplicados.",
    ],
    noPuedes: [
      "Crear o editar registros del censo desde aqui: es una vista de consulta y analisis.",
      "Ver datos de otros proyectos sin cambiar el selector global (sin proyecto seleccionado se muestra el consolidado).",
    ],
    funcionalidades: [
      {
        nombre: "Dashboards del censo",
        descripcion:
          "Graficas de torta y de barras por cada variable sociodemografica, listas para soportar el analisis de la poblacion trabajadora ante una auditoria.",
      },
      {
        nombre: "Filtro por columna",
        descripcion:
          "En la tabla, cada columna filtra por si sola: con lista desplegable cuando hay pocos valores y por texto cuando hay muchos (nombre, documento). Los filtros se combinan entre si.",
      },
      {
        nombre: "Analisis en vivo",
        descripcion:
          "Al filtrar, las tarjetas de arriba se recalculan sobre el grupo filtrado: sirve para responder preguntas como 'como es la poblacion de un cargo o una sede especifica'.",
      },
      {
        nombre: "Exportacion",
        descripcion: "Descarga el detalle filtrado con todas las columnas para trabajarlo por fuera o anexarlo a un informe.",
      },
    ],
  },
  {
    modulo: "Comunicación SST",
    resumen: "Canales de comunicacion del SG-SST: autorreportes de los trabajadores, PQRSF y registro de comunicaciones.",
    proposito:
      "Cubre el estandar de mecanismos de comunicacion del sistema. Tiene tres canales: el autorreporte, donde el trabajador informa condiciones o actos inseguros, su estado de salud o sugerencias; las PQRSF (peticiones, quejas, reclamos, sugerencias y felicitaciones) con su gestion hasta el cierre; y el registro de comunicaciones del sistema hacia la gente (charlas, carteleras, correos) con su tema y frecuencia.",
    puedes: [
      "Registrar autorreportes con sede, trabajador, tipo (condicion insegura, acto inseguro, estado de salud o sugerencia) y descripcion.",
      "Gestionar cada autorreporte cambiando su estado: abierto, en gestion o cerrado.",
      "Registrar PQRSF con remitente, tipo y descripcion, y llevarlas por abierto, respondido y cerrado.",
      "Registrar las comunicaciones emitidas: tema, a quien van dirigidas, por que medio y con que frecuencia.",
      "Consultar el historial de cada canal en su pestana.",
    ],
    noPuedes: [
      "Eliminar registros de ningun canal: la trazabilidad de lo reportado se conserva.",
      "Adjuntar archivos a los reportes desde esta pantalla.",
    ],
    funcionalidades: [
      {
        nombre: "Autorreporte del trabajador",
        descripcion:
          "Canal para que cualquier persona informe condiciones y actos inseguros o su estado de salud. Cada reporte se gestiona con estado hasta cerrarlo, dejando evidencia de que se atendio.",
      },
      {
        nombre: "PQRSF con ciclo de gestion",
        descripcion:
          "Las peticiones, quejas, reclamos, sugerencias y felicitaciones pasan por abierto, respondido y cerrado, con su color de estado en la tabla.",
      },
      {
        nombre: "Bitacora de comunicaciones",
        descripcion:
          "Registro de charlas, carteleras y correos del sistema hacia los trabajadores, como evidencia del plan de comunicacion.",
      },
    ],
  },
  {
    modulo: "Gestión del Cambio",
    resumen: "Evaluacion del impacto en seguridad y salud antes de implementar cambios de proceso, equipos, sustancias o instalaciones.",
    proposito:
      "Cubre el estandar de gestion del cambio: antes de implementar un cambio (un proceso nuevo, un equipo, una sustancia, una modificacion de instalaciones, un cambio normativo u organizacional) se registra aqui, se evalua su impacto en seguridad y salud, se definen los controles previos y se verifica que la matriz de peligros se haya actualizado y que la gente se haya capacitado. El cambio avanza por estados hasta quedar implementado.",
    puedes: [
      "Registrar un cambio con sede, tipo (proceso, equipo, sustancia, instalacion, normativo u organizacional), responsable y descripcion.",
      "Documentar el impacto del cambio en seguridad y salud y los controles definidos antes de implementarlo.",
      "Marcar si la matriz de peligros ya se actualizo y si la capacitacion ya se realizo.",
      "Llevar el estado del cambio: en evaluacion, aprobado o implementado, con su fecha de implementacion.",
      "Consultar el historial y actualizar el estado de cualquier cambio desde la tabla.",
    ],
    noPuedes: [
      "Eliminar cambios registrados: el historial se conserva como evidencia.",
      "Actualizar la matriz de peligros desde aqui: eso se hace en el modulo IPEVR y aqui solo se deja constancia.",
    ],
    funcionalidades: [
      {
        nombre: "Evaluacion previa del cambio",
        descripcion:
          "El formulario obliga a pensar el cambio antes de hacerlo: que impacto tiene en seguridad y salud y que controles se definen antes de implementar.",
      },
      {
        nombre: "Verificaciones de cierre",
        descripcion:
          "Dos casillas dejan constancia de si la matriz de peligros se actualizo y si la capacitacion se hizo; la columna de la tabla muestra el chequeo de la matriz de un vistazo.",
      },
      {
        nombre: "Estados del cambio",
        descripcion: "Cada cambio avanza de en evaluacion a aprobado y a implementado, con su color de estado y la fecha de implementacion.",
      },
    ],
  },
  {
    modulo: "Actividades y Comités",
    resumen: "Registro de capacitaciones, pausas activas, simulacros y demas actividades del SG-SST, mas la conformacion de los comites.",
    proposito:
      "Deja evidencia de la ejecucion del plan de trabajo del sistema: capacitaciones, inducciones y reinducciones, pausas activas, actividades de estilos de vida saludable, simulacros y reuniones de los comites. Ademas administra la conformacion del COPASST y del Comite de Convivencia: quienes son los miembros, su rol y el periodo de su designacion.",
    puedes: [
      "Registrar actividades con sede, tipo (capacitacion, pausa activa, estilos de vida, simulacro, induccion, reinduccion o reunion de comite), fecha, tema, facilitador, numero de asistentes y duracion en horas.",
      "Consultar el historial de actividades y las tarjetas de resumen: total, capacitaciones, pausas activas y asistentes acumulados.",
      "Agregar miembros a los comites (COPASST o Convivencia) con nombre, documento, rol (presidente, secretario, representantes o suplente) y periodo de inicio y fin.",
      "Alternar entre los dos comites para ver la conformacion de cada uno.",
    ],
    noPuedes: [
      "Adjuntar listas de asistencia o actas desde esta pantalla: el registro captura los datos de la actividad.",
      "Editar o eliminar actividades y miembros ya registrados.",
    ],
    funcionalidades: [
      {
        nombre: "Registro de actividades",
        descripcion:
          "Un solo formulario cubre todos los tipos de actividad del plan de trabajo, con asistentes y duracion para sustentar cobertura ante auditoria.",
      },
      {
        nombre: "Conformacion de comites",
        descripcion:
          "Miembros del COPASST y del Comite de Convivencia con su rol y periodo de vigencia, como evidencia de que los comites estan conformados y al dia.",
      },
      {
        nombre: "Tarjetas de resumen",
        descripcion: "Totales de actividades, capacitaciones, pausas activas y asistentes acumulados del proyecto.",
      },
    ],
  },
]
