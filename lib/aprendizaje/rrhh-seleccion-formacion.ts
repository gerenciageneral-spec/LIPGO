// Guias del modulo Aprendizaje — area "rrhh-seleccion-formacion".
// Generado por entregas; la clave `modulo` debe coincidir EXACTA con el menu.
import type { ContenidoAprendizaje } from "@/lib/aprendizaje-content"

export const APRENDIZAJE_RRHH_A: ContenidoAprendizaje[] = [
  // ==========================================================================
  // RECLUTAMIENTO Y SELECCION
  // ==========================================================================
  {
    modulo: "Gestión de Solicitudes",
    resumen:
      "Administra los anticipos, permisos y certificados laborales que los empleados piden desde su portal.",
    proposito:
      "Es el tablero donde Gestion Humana atiende todo lo que los trabajadores solicitan desde el Portal del Trabajador. Muestra todas las solicitudes de todos los proyectos en un solo lugar, con indicadores del mes (cuantos anticipos y por cuanto dinero, tasa de aprobacion y quienes mas solicitan) y una tabla para decidir caso por caso.",
    puedes: [
      "Aprobar o rechazar anticipos; el rechazo siempre exige escribir el motivo y el empleado lo ve en su portal.",
      "Aprobar permisos con doble visto bueno: un boton para Gestion Humana y otro para Coordinacion; el permiso solo queda aprobado cuando ambos aprueban.",
      "Generar el certificado laboral en PDF con un clic; se descarga, queda guardado y la solicitud pasa a completada.",
      "Generar la autorizacion de descuento de un anticipo aprobado: indicas el numero de cuotas quincenales (1 a 24) y el sistema arma el PDF con la firma que el trabajador cargo en su portal.",
      "Ver el soporte del permiso, la evidencia de pago y la firma del trabajador cuando existen.",
      "Filtrar por estado (pendiente, aprobada, rechazada, completada), por tipo (certificado, anticipo, permiso) y por nombre de empleado.",
      "Copiar o abrir el link publico del Portal del Trabajador para compartirlo con los empleados.",
    ],
    noPuedes: [
      "Crear solicitudes en nombre del trabajador: nacen siempre desde el Portal del Trabajador.",
      "Aprobar un permiso con un solo rol: se necesita el visto bueno de Gestion Humana Y de Coordinacion.",
      "Recuperar una solicitud eliminada: el borrado es definitivo y desaparece tambien del portal del empleado.",
      "Filtrar por proyecto: este tablero muestra a proposito las solicitudes de todos los proyectos juntas.",
    ],
    funcionalidades: [
      {
        nombre: "Indicadores del mes",
        descripcion:
          "Tarjetas con el total y monto de anticipos del mes, la tasa de aprobacion (aprobadas vs rechazadas) y el top 3 de empleados que mas solicitan.",
      },
      {
        nombre: "Doble aprobacion de permisos",
        descripcion:
          "Cada permiso muestra el avance de sus dos vistos buenos (GH y Coord). Al rechazar eliges con cual rol rechazas y el motivo queda registrado.",
      },
      {
        nombre: "Certificado laboral automatico",
        descripcion:
          "El boton Generar Documento arma el certificado en PDF con los datos del empleado, lo descarga y deja la solicitud completada con el documento disponible.",
      },
      {
        nombre: "Autorizacion de descuento",
        descripcion:
          "Para anticipos aprobados: genera el PDF de autorizacion con el monto, las cuotas quincenales y la firma del trabajador. Si ya existia uno, el nuevo lo reemplaza.",
      },
      {
        nombre: "Eliminar solicitud",
        descripcion:
          "Cualquier fila se puede borrar de forma permanente, con un paso de confirmacion que muestra empleado, tipo y estado antes de ejecutar.",
      },
    ],
    consejos: [
      "Antes de generar la autorizacion de descuento verifica que el trabajador ya haya cargado su firma en el portal; el documento la incluye automaticamente.",
      "Usa el boton Actualizar si estas esperando una solicitud que el empleado acaba de enviar.",
    ],
  },
  {
    modulo: "Aprobación de Solicitudes de Personal",
    resumen:
      "Aprueba o rechaza las vacantes solicitadas, con doble visto bueno de RRHH y Operaciones.",
    proposito:
      "Cuando un area pide personal nuevo (una vacante), la solicitud llega aqui para ser decidida. Cada solicitud requiere dos aprobaciones independientes: la de Recursos Humanos y la del Gerente de Operaciones. Solo cuando ambas estan dadas, la solicitud queda aprobada y se puede avanzar con la contratacion.",
    puedes: [
      "Ver todas las solicitudes de personal con su cargo, cantidad de personas, turno, ciudad y rango salarial.",
      "Aprobar como RRHH o como Operaciones, cada rol con su propio boton en la fila.",
      "Rechazar desde cualquiera de los dos roles escribiendo el motivo, que es obligatorio y queda visible en la fila.",
      "Seguir el avance de cada solicitud: pendiente, en revision, aprobado o rechazado, con el detalle de que rol ya decidio.",
    ],
    noPuedes: [
      "Crear o editar la solicitud de personal desde aqui: los datos de la vacante se registran en otro modulo.",
      "Dejar una solicitud aprobada con un solo visto bueno: el estado global solo cambia cuando RRHH y Operaciones aprueban.",
      "Rechazar sin motivo: el sistema exige explicar la razon.",
    ],
    funcionalidades: [
      {
        nombre: "Tabla de vacantes",
        descripcion:
          "Listado con cargo, headcount solicitado, turno, ciudad, rango salarial y el estado de cada una de las dos aprobaciones.",
      },
      {
        nombre: "Aprobacion por rol",
        descripcion:
          "Cada columna (RRHH y Operaciones) tiene sus botones Aprobar y Rechazar. Al aprobar el segundo rol, la solicitud completa pasa a aprobada.",
      },
      {
        nombre: "Motivo de rechazo visible",
        descripcion:
          "Si una solicitud fue rechazada, el motivo escrito se muestra debajo del estado para que todos sepan la razon.",
      },
    ],
  },
  {
    modulo: "Hojas de Vida",
    resumen:
      "Banco de hojas de vida de candidatos: cargar, revisar, aceptar o rechazar.",
    proposito:
      "Es el primer paso del proceso de seleccion. Aqui se guardan las hojas de vida de los aspirantes con sus datos de contacto y el archivo adjunto. Cada hoja se marca como aceptada o rechazada; solo las aceptadas pueden pasar a entrevista. El listado corresponde al proyecto elegido en la barra superior.",
    puedes: [
      "Agregar una hoja de vida con nombre, cedula, cargo aspirado, correo, telefono, notas y el archivo (PDF, Word o imagen).",
      "Marcar cada hoja como aceptada o rechazada con los botones de la fila; el cambio es inmediato.",
      "Buscar por nombre, cedula, cargo o correo, y filtrar por estado (pendiente, aceptado, rechazado).",
      "Ver o descargar el archivo de la hoja de vida.",
      "Traer con un clic las hojas de vida que ya estan cargadas en Head Count, sin volver a subirlas (no crea duplicados por cedula).",
      "Ver el resultado de antecedentes del candidato cuando ya fue verificado: PDF, estado y puntaje de riesgo.",
    ],
    noPuedes: [
      "Editar los datos de una hoja ya guardada: si hay un error, eliminala y cargala de nuevo.",
      "Recuperar una hoja de vida eliminada: el borrado es definitivo.",
      "Pasar a entrevista un candidato cuya hoja no este aceptada: el modulo de Entrevistas solo muestra hojas aceptadas.",
    ],
    funcionalidades: [
      {
        nombre: "Carga con archivo adjunto",
        descripcion:
          "Formulario con los datos del candidato y su archivo. Nombre y archivo son obligatorios; se muestra el nombre y tamano del documento subido.",
      },
      {
        nombre: "Sincronizar desde Head Count",
        descripcion:
          "Trae al banco las hojas de vida que los colaboradores ya tienen en su expediente de Head Count. Informa cuantas se trajeron y cuantas se actualizaron.",
      },
      {
        nombre: "Columna de antecedentes",
        descripcion:
          "Si el candidato ya paso por verificacion de antecedentes, la fila muestra el enlace al PDF, la decision (aceptado o rechazado) y el puntaje de riesgo con su color.",
      },
      {
        nombre: "Decision rapida",
        descripcion:
          "Botones de aceptar y rechazar directamente en la tabla, ademas de ver, descargar y eliminar.",
      },
    ],
  },
  {
    modulo: "Antecedentes",
    resumen:
      "Certificados de Policia, Procuraduria y Contraloria por candidato, mas la investigacion en linea con decision de aceptar o rechazar.",
    proposito:
      "Concentra la verificacion de antecedentes de los candidatos. Permite dos caminos: subir manualmente los tres certificados clasicos (Policia, Procuraduria y Contraloria) asociados a una hoja de vida, o hacer la Investigacion en Compliance: una consulta en linea a decenas de fuentes oficiales que devuelve un puntaje de riesgo y un informe en PDF. Con ese resultado se decide aceptar o rechazar al candidato, y la decision viaja a su hoja de vida.",
    puedes: [
      "Cargar los certificados de Policia, Procuraduria y Contraloria de un candidato, buscandolo por cedula o nombre entre las hojas de vida.",
      "Hacer la Investigacion en Compliance por numero de documento (cedula, extranjeria, tarjeta de identidad, NIT o pasaporte); la funcion esta protegida por un codigo de acceso.",
      "Ver el resultado consolidado: si presenta riesgo, si es PEP, cuantas fuentes se consultaron y el puntaje de riesgo de 0 a 100 con sus componentes.",
      "Descargar el informe en tres versiones: completo, resumido o analista basico.",
      "Aceptar o rechazar al candidato con base en el resultado: se guarda el registro, el PDF y se envia a la hoja de vida; el rechazo deja bloqueada la contratacion.",
      "Traer los antecedentes ya cargados en Head Count sin volver a subirlos.",
      "Buscar en el listado por nombre o cedula y ver o descargar cada certificado.",
    ],
    noPuedes: [
      "Hacer la investigacion en linea sin el codigo de acceso: es una funcion protegida y el codigo no se comparte desde la app.",
      "Editar el resultado de una consulta: lo que devuelve la verificacion es el dato oficial.",
      "Consultar sin numero de documento: es el dato minimo obligatorio.",
    ],
    funcionalidades: [
      {
        nombre: "Carga manual de certificados",
        descripcion:
          "Dialogo para adjuntar hasta tres archivos (Policia, Procuraduria, Contraloria) al candidato elegido desde las hojas de vida. Basta con adjuntar al menos uno.",
      },
      {
        nombre: "Investigacion en Compliance",
        descripcion:
          "Consulta en linea protegida por codigo. Si la cedula coincide con una hoja de vida, el nombre se llena solo y el resultado queda enlazado a ese candidato. La consulta puede tardar porque revisa cerca de 46 fuentes.",
      },
      {
        nombre: "Puntaje de riesgo",
        descripcion:
          "Medidor de 0 a 100: hasta 50 presenta riesgo (rojo), 51 a 84 advertencia (amarillo), 85 o mas sin novedad (verde). Incluye el desglose operacional, LAFT y reputacional.",
      },
      {
        nombre: "Decision aceptar / rechazar",
        descripcion:
          "Con el resultado a la vista se toma la decision. Aceptar registra los antecedentes y los envia a la hoja de vida; rechazar deja bloqueada la contratacion del candidato.",
      },
      {
        nombre: "Fuentes consultadas",
        descripcion:
          "Detalle de cada lista o entidad revisada, marcando cuales reportaron riesgo o advertencia y el detalle de lo encontrado.",
      },
    ],
    consejos: [
      "Haz la investigacion antes de la entrevista: si el candidato queda rechazado te ahorras el resto del proceso.",
      "Guarda el PDF completo en el expediente: es el soporte de la decision.",
    ],
  },
  {
    modulo: "Entrevistas",
    resumen:
      "Registra la entrevista estructurada de los candidatos con hoja de vida aceptada.",
    proposito:
      "Formaliza la entrevista de seleccion. Solo se pueden entrevistar candidatos cuya hoja de vida ya fue aceptada; al elegirlo, sus datos basicos se llenan solos. El formulario recorre datos personales, contacto de emergencia, educacion y experiencia laboral, y cierra con el concepto del entrevistador: apto, no apto o aplazado.",
    puedes: [
      "Crear una entrevista buscando al candidato por cedula o nombre entre las hojas de vida aceptadas; nombre, cedula, correo y telefono se prellenan.",
      "Registrar datos personales (edad, nacimiento, procedencia, direccion, si sabe leer y escribir, tallas de pantalon y camisa), contacto de emergencia y educacion.",
      "Agregar varias experiencias laborales, cada una con empresa, cargo, fechas, jefe inmediato y su telefono, motivo de retiro y funciones.",
      "Dejar el concepto final (apto, no apto o aplazado) con observaciones del entrevistador.",
      "Ver el detalle completo de una entrevista, editarla o eliminarla.",
      "Buscar en el listado por nombre o cedula.",
    ],
    noPuedes: [
      "Entrevistar a un candidato sin hoja de vida aceptada: no aparece en el buscador del formulario.",
      "Adjuntar archivos a la entrevista: es un formulario de registro, los documentos van en la hoja de vida o el expediente.",
      "Recuperar una entrevista eliminada.",
    ],
    funcionalidades: [
      {
        nombre: "Formulario estructurado",
        descripcion:
          "Secciones de datos de la entrevista (entrevistador y fecha), datos personales, contacto de emergencia, educacion, experiencia laboral y concepto final.",
      },
      {
        nombre: "Experiencia laboral multiple",
        descripcion:
          "Boton Agregar para sumar tantas experiencias como tenga el candidato; las filas vacias se descartan solas al guardar.",
      },
      {
        nombre: "Concepto con semaforo",
        descripcion:
          "El concepto final se ve en la tabla con color: verde apto, rojo no apto, amarillo aplazado.",
      },
      {
        nombre: "Detalle de solo lectura",
        descripcion:
          "El boton de ver abre la entrevista completa organizada por secciones, sin riesgo de modificarla por accidente.",
      },
    ],
  },
  {
    modulo: "Gestión de Contratos",
    resumen:
      "Lleva el control de los contratos de los colaboradores: tipo, fechas, estado y causa de retiro.",
    proposito:
      "Registra y sigue el ciclo de vida del contrato de cada colaborador del proyecto elegido en la barra superior. Cada contrato tiene su tipo, fechas clave (inicio, fin, envio y firma), cargo, salario base y un estado que avanza de creado a enviado, firmado o rechazado. Al terminar la relacion laboral se registra la causa de retiro.",
    puedes: [
      "Crear un contrato eligiendo el colaborador (viene del Head Count del proyecto) y el tipo: indefinido, a termino fijo, temporal, periodo de prueba u obra labor.",
      "Registrar las fechas de inicio, fin (solo si no es indefinido), envio y firma, ademas de cargo y salario base.",
      "Cambiar el estado del contrato directamente en la tabla (creado, enviado, firmado, rechazado) sin abrir el formulario.",
      "Registrar la causa de retiro al editar: renuncia, justa causa o periodo de prueba.",
      "Descargar el documento del contrato cuando la fila tiene el archivo asociado.",
      "Editar o eliminar un contrato, con confirmacion antes de borrar.",
    ],
    noPuedes: [
      "Crear contratos los domingos: el sistema lo bloquea por regla de la operacion.",
      "Guardar sin colaborador y fecha de inicio: son obligatorios.",
      "Subir el archivo del contrato desde este formulario: aqui solo se consulta el documento cuando ya existe.",
    ],
    funcionalidades: [
      {
        nombre: "Formulario de contrato",
        descripcion:
          "Colaborador, tipo de contrato, fechas de inicio/fin/envio/firma, cargo, salario base y estado. Si el tipo es indefinido, la fecha fin se oculta.",
      },
      {
        nombre: "Estado editable en la tabla",
        descripcion:
          "El estado es un desplegable de color en cada fila: cambiarlo lo guarda de inmediato, ideal para marcar enviado o firmado sin abrir nada.",
      },
      {
        nombre: "Causa de retiro",
        descripcion:
          "Campo disponible al editar un contrato existente, para dejar documentado por que termino la relacion laboral.",
      },
      {
        nombre: "Fecha de creacion",
        descripcion:
          "Cada contrato muestra cuando fue registrado en el sistema, como referencia de solo lectura.",
      },
    ],
  },
  // ==========================================================================
  // DIRECTORIO Y EXPEDIENTES
  // ==========================================================================
  {
    modulo: "Gestión de Colaboradores",
    resumen:
      "Ficha completa del colaborador en dos partes: hoja de vida y datos del contrato con seguridad social.",
    proposito:
      "Registra la informacion completa de cada colaborador tal como la necesita la nomina y la seguridad social. El formulario va en dos pasos: la Parte 1 es la hoja de vida (nombres, documento, contacto, residencia, oficina y datos de pago bancario) y la Parte 2 es el contrato (tipo, fechas, sueldo, grupo de nomina, cargo, centro de costo) junto con EPS, pension, ARL, caja de compensacion, cesantias, deducciones y aportes voluntarios. El listado se filtra por el proyecto elegido en la barra superior.",
    puedes: [
      "Crear un colaborador completando primero la hoja de vida y luego la informacion del contrato; el sistema valida los campos obligatorios de cada paso.",
      "Elegir de listas ya cargadas el grupo de nomina, el cargo, el centro de costos, la EPS, el fondo de pension, la ARL y la caja de compensacion.",
      "Registrar datos de pago: metodo, entidad bancaria, tipo y numero de cuenta.",
      "Marcar salario integral y si aplica deduccion por dependientes, ademas de deducciones de vivienda, medicina prepagada y aportes voluntarios.",
      "Editar un colaborador existente: el formulario vuelve a abrirse en el paso 1 con todo lo guardado.",
      "Eliminar un colaborador con confirmacion.",
    ],
    noPuedes: [
      "Avanzar al paso 2 o guardar con campos obligatorios vacios: el sistema lo impide y marca lo que falta.",
      "Cambiar el estado activo/inactivo desde aqui: la baja del personal se maneja por la novedad de retiro y Head Count.",
      "Adjuntar documentos: los archivos del trabajador viven en el expediente de Head Count.",
    ],
    funcionalidades: [
      {
        nombre: "Formulario en dos pasos",
        descripcion:
          "Paso 1 hoja de vida (identidad, contacto, residencia, oficina, pago) y paso 2 contrato y seguridad social. Un indicador muestra en que paso estas y puedes volver atras sin perder lo escrito.",
      },
      {
        nombre: "Catalogos de nomina",
        descripcion:
          "Listas predefinidas de grupos de nomina, cargos, centros de costos, EPS, fondos de pension, ARL y cajas de compensacion, para que los datos queden escritos igual que en la nomina.",
      },
      {
        nombre: "Valores fuera de catalogo",
        descripcion:
          "Si un colaborador antiguo tiene un valor que ya no esta en la lista, el sistema lo conserva y lo muestra como opcion para no perderlo al editar.",
      },
      {
        nombre: "Listado con estado",
        descripcion:
          "Tabla con nombre completo, documento, cargo, correo, celular y estado (activo en verde, inactivo en rojo).",
      },
    ],
  },
  {
    modulo: "Head Count",
    resumen:
      "La fuente de verdad del personal: datos basicos, fecha de inicio, documentos del expediente, traslados y estado.",
    proposito:
      "Es el registro maestro del personal de la operacion. Aqui se crea cada persona con su identificacion, cargo, salario y sobre todo su fecha de inicio, que es la que manda para la nomina: antes de esa fecha no se paga nada. Tiene dos pestanas: Operativo (el personal del proyecto elegido en la barra superior) y Headcount Administrativo (todo el personal administrativo de la compania, sin importar el proyecto). Ademas concentra el expediente documental: cada fila permite subir y consultar los documentos de vinculacion.",
    puedes: [
      "Crear o editar una persona con identificacion, nombre, contrato Siigo, correo, celular, cargo, fecha de inicio, salario y fecha de retiro.",
      "Subir los documentos del expediente casilla por casilla: hoja de vida, copia del documento, afiliaciones (ARL, EPS, AFP, caja), certificados, antecedentes, examenes de ingreso, acta de dotacion, contrato, SST e induccion, entre otros.",
      "Buscar por identificacion y filtrar por estado (activo o inactivo).",
      "Trasladar una persona a otro proyecto eligiendo la empresa destino.",
      "Cambiar el estado entre Activo e Inactivo; esta accion pide una contrasena de administrador.",
      "Ver la ficha rapida de la persona: cargo, fecha de inicio, salario, correo y celular.",
      "Gestionar el personal administrativo en su propia pestana: alli el cargo es texto libre y todo registro nuevo queda marcado como administrativo.",
    ],
    noPuedes: [
      "Cambiar el estado de una persona sin la contrasena de administrador.",
      "Reemplazar un documento ya cargado desde la casilla: una vez subido, la casilla solo lo abre para consulta.",
      "Elegir cargos libres en la pestana operativa: el cargo se escoge de la lista fija (los cargos operativos definidos); el texto libre es solo para administrativos.",
    ],
    funcionalidades: [
      {
        nombre: "Pestanas Operativo y Administrativo",
        descripcion:
          "Operativo muestra el personal del proyecto seleccionado; Headcount Administrativo muestra todos los administrativos de la compania sin filtro de proyecto y marca automaticamente como administrativo lo que se cree alli.",
      },
      {
        nombre: "Expediente documental por casillas",
        descripcion:
          "Cada persona tiene una casilla por documento: gris si falta (clic para subir el archivo) y azul si ya existe (clic para verlo).",
      },
      {
        nombre: "Traslado entre proyectos",
        descripcion:
          "Mueve a la persona de un proyecto a otro sin perder su historial ni sus documentos.",
      },
      {
        nombre: "Cambio de estado protegido",
        descripcion:
          "Activar o inactivar exige contrasena de administrador. El personal inactivo queda fuera del archivo plano de nomina.",
      },
      {
        nombre: "Fecha de inicio y de retiro",
        descripcion:
          "La fecha de inicio define desde cuando se paga; la fecha de retiro se llena sola cuando se registra la novedad de retiro, aunque tambien se puede ajustar a mano.",
      },
    ],
    consejos: [
      "Registra la fecha de inicio correcta desde el primer dia: la nomina corta ahi y no paga nada anterior a esa fecha.",
      "Manten el expediente al dia: otros modulos (Carpetas de Trabajadores, indicadores de idoneidad) leen estos mismos documentos.",
    ],
  },
  {
    modulo: "Carpetas de Trabajadores",
    resumen:
      "Expediente digital de cada trabajador: sus documentos base y sus inducciones, en carpetas de solo consulta.",
    proposito:
      "Presenta el expediente de cada trabajador del proyecto como carpetas de archivo. A la izquierda esta la lista de todo el personal (viene del Head Count); al abrir una carpeta se ven dos secciones: Documentos base, con todos los archivos cargados en su expediente, e Inducciones, con cada evaluacion presentada, su puntaje, si aprobo y el PDF de evidencia. Es un modulo de consulta: aqui no se sube ni se modifica nada.",
    puedes: [
      "Buscar al trabajador por nombre o documento; el contador muestra cuantos coinciden sobre el total.",
      "Abrir la carpeta de un trabajador y ver sus documentos base (hoja de vida, afiliaciones, certificados, contrato, examenes, etc.) con acceso directo a cada archivo.",
      "Revisar las inducciones del trabajador: tema, codigo, fecha, puntaje obtenido, si aprobo o reprobo y el PDF de evidencia cuando existe.",
      "Consultar trabajadores de cualquier proyecto cambiando el proyecto en la barra superior.",
    ],
    noPuedes: [
      "Subir, reemplazar o eliminar documentos: los archivos se cargan en Head Count y las evidencias en los modulos de inducciones.",
      "Editar datos del trabajador: es una vista de expediente, no un formulario.",
    ],
    funcionalidades: [
      {
        nombre: "Lista de carpetas con buscador",
        descripcion:
          "Todo el personal del proyecto ordenado alfabeticamente; se filtra en vivo por nombre o documento.",
      },
      {
        nombre: "Subcarpeta Documentos base",
        descripcion:
          "Muestra unicamente los documentos que el trabajador si tiene cargados, cada uno con su boton Ver para abrirlo.",
      },
      {
        nombre: "Subcarpeta Inducciones",
        descripcion:
          "Cada induccion presentada con fecha, puntaje, resultado (aprobo o reprobo) y el enlace al PDF de evidencia si ya fue generado.",
      },
    ],
  },
  {
    modulo: "Panel LIP Gestión Humana",
    resumen:
      "Tablero en linea del talento humano por cliente: dotacion, formacion, ausentismo y accidentalidad.",
    proposito:
      "Resume en un solo tablero como esta el talento que presta el servicio en el cliente o sitio elegido en la barra superior, alineado con las normas de calidad, seguridad y ambiente. Combina indicadores de dotacion e idoneidad, formacion, cumplimiento de jornada y salud/seguridad, con graficas de apoyo. Todo se calcula en vivo con la informacion registrada en los demas modulos.",
    puedes: [
      "Filtrar por ano, mes y dia para ver el periodo que necesitas.",
      "Ver los indicadores de talento: colaboradores activos, cobertura de planta contra lo acordado, ausentismo, idoneidad documental (contrato + examen + ARL) y formacion (evaluaciones aprobadas y cobertura).",
      "Ver los indicadores de disponibilidad y seguridad: cumplimiento de jornada, accidentes de trabajo con sus dias de incapacidad, ausentismo medico, casos osteomusculares y costo del ausentismo para la empresa.",
      "Analizar las graficas de ausentismo por tipo (dias y casos) y de colaboradores activos por cargo.",
    ],
    noPuedes: [
      "Editar cifras desde el panel: es de solo lectura; los datos se corrigen en los modulos de origen (Head Count, asistencia, ausentismos, formacion).",
      "Ver varios clientes a la vez: el panel muestra el cliente o sitio elegido en la barra superior.",
    ],
    funcionalidades: [
      {
        nombre: "Filtro de periodo",
        descripcion:
          "Selectores de ano, mes y dia. El dia solo se habilita cuando hay mes elegido; dejar todo vacio muestra el acumulado.",
      },
      {
        nombre: "Indicadores con semaforo",
        descripcion:
          "Cada tarjeta se colorea segun su meta: verde cumple, amarillo cerca, rojo lejos. Por ejemplo cobertura de planta contra 100% o ausentismo contra 3%.",
      },
      {
        nombre: "Graficas de apoyo",
        descripcion:
          "Barras de ausentismo por tipo (dias y casos) y de distribucion de colaboradores activos por cargo.",
      },
    ],
  },
  // ==========================================================================
  // FORMACION
  // ==========================================================================
  {
    modulo: "Inducciones",
    resumen:
      "Crea inducciones con su material y cuestionario, programalas a los trabajadores y sigue su ejecucion.",
    proposito:
      "Administra las inducciones, re-inducciones y capacitaciones con evaluacion. Cada una se crea con su tema, codigo del sistema de gestion, material de estudio (presentacion, PDF, HTML o un enlace) y un cuestionario de preguntas con umbral de aprobacion. Luego se programa a los trabajadores: la induccion aparece en el portal de cada uno, y cuando el 100% la diligencia pasa sola a Ejecutada.",
    puedes: [
      "Crear una induccion con tema, tipo (induccion, capacitacion o re-induccion), codigo SIG, descripcion, mes y ano programado, y si es obligatoria.",
      "Adjuntar el material de estudio (PPT, PDF o HTML) o pegar una URL; los trabajadores y tu pueden descargarlo con el boton Material.",
      "Armar el cuestionario: preguntas de opcion multiple (a, b, c) o de verdadero/falso, marcando la respuesta correcta y cuantos aciertos se necesitan para aprobar.",
      "Programar la induccion: elegir a los trabajadores del proyecto a los que se les impartio; les aparece en su portal.",
      "Marcarla como administrativa para programarla a todo el personal administrativo sin importar el proyecto.",
      "Duplicarla en otros proyectos: copia material, preguntas y programacion (no copia los trabajadores asignados).",
      "Seguir el estado: sin programar, programada con avance (cuantos han respondido) o ejecutada.",
      "Consultar las pestanas Indicador (cumplimiento de inducciones) y Carpetas de trabajadores sin salir del modulo.",
    ],
    noPuedes: [
      "Responder el cuestionario por el trabajador: cada uno lo diligencia desde su portal.",
      "Marcar Ejecutada a mano: el estado cambia solo cuando todos los programados terminan.",
      "Guardar preguntas incompletas: cada pregunta necesita enunciado y, si es de opcion multiple, las tres opciones escritas.",
    ],
    funcionalidades: [
      {
        nombre: "Editor de induccion",
        descripcion:
          "Formulario con tema, tipo, codigo SIG, material adjunto o URL, mes/ano programado, umbral de aprobacion y los interruptores de obligatoria y administrativa.",
      },
      {
        nombre: "Cuestionario de evaluacion",
        descripcion:
          "Agrega tantas preguntas como necesites, de opcion multiple o verdadero/falso, y marca la correcta. El puntaje minimo de aprobacion se define por induccion.",
      },
      {
        nombre: "Programacion de trabajadores",
        descripcion:
          "Buscador con seleccion multiple (y boton de seleccionar todos) para asignar a quienes se les impartio. La induccion queda visible en el portal de cada trabajador.",
      },
      {
        nombre: "Duplicar en otros proyectos",
        descripcion:
          "Crea copias identicas de la induccion en los proyectos que elijas, para no armar el mismo cuestionario varias veces.",
      },
      {
        nombre: "Estados automaticos",
        descripcion:
          "Sin programar, Programada con contador de avance (por ejemplo 3/10) y Ejecutada cuando el 100% respondio el cuestionario.",
      },
    ],
  },
  {
    modulo: "Evidencia de Inducciones",
    resumen:
      "Todos los intentos de evaluacion de inducciones, con su puntaje, resultado y documento de evidencia.",
    proposito:
      "Es el registro de resultados de las inducciones: cada vez que un trabajador diligencia el cuestionario desde su portal, el intento queda aqui con su puntaje, si aprobo y la fecha. Desde este modulo se genera el documento de evidencia en PDF (incluye la firma del trabajador) que sirve como soporte del sistema de gestion.",
    puedes: [
      "Ver todos los intentos con trabajador, cedula, induccion, puntaje obtenido sobre el total, resultado (aprobado o no) y fecha.",
      "Buscar por nombre, cedula o nombre/codigo de la induccion.",
      "Generar el documento de evidencia en PDF de cualquier intento; queda guardado y se abre con el boton Ver.",
      "Eliminar una evaluacion: borra el resultado y la induccion queda abierta de nuevo para que el trabajador la diligencie.",
      "Ver los contadores de total de intentos y cuantos fueron aprobados.",
    ],
    noPuedes: [
      "Registrar o corregir un intento a mano: los resultados nacen del cuestionario que responde el trabajador en su portal.",
      "Recuperar una evaluacion eliminada: solo queda la opcion de que el trabajador vuelva a presentarla.",
    ],
    funcionalidades: [
      {
        nombre: "Tabla de intentos",
        descripcion:
          "Los intentos mas recientes primero, con puntaje (por ejemplo 4/5) y una insignia verde de Aprobado o roja de No aprobado.",
      },
      {
        nombre: "Generar documento",
        descripcion:
          "Arma el PDF de evidencia con el tema, el codigo, los datos del trabajador, el puntaje y su firma; lo guarda para consulta y lo abre en una pestana nueva.",
      },
      {
        nombre: "Eliminar y reabrir",
        descripcion:
          "Con confirmacion previa: borra el resultado del trabajador y la induccion vuelve a quedar pendiente en su portal para presentarla otra vez.",
      },
    ],
  },
  {
    modulo: "Gestión de Capacitaciones",
    resumen:
      "Catalogo de capacitaciones con su evidencia y la planilla de asistencia en PDF.",
    proposito:
      "Registra las capacitaciones dictadas: tema, categoria, fechas (con rango si dura varios dias), duracion, instructor y la empresa a la que aplica. Cada capacitacion puede llevar su archivo de evidencia y muestra cuantos colaboradores ya registraron asistencia frente al total del personal. Desde aqui tambien se genera la planilla de asistencia oficial en PDF con las firmas.",
    puedes: [
      "Crear una capacitacion con tema, categoria, fecha (y fecha fin si es de varios dias), duracion en horas, instructor y la empresa, que es obligatoria.",
      "Adjuntar la evidencia (imagen, PDF o documento de oficina) y consultarla desde la tabla.",
      "Ver el avance de asistencia de cada capacitacion: asistentes registrados contra el total del personal, en ambar si falta gente y verde si ya firmaron todos.",
      "Generar la planilla de asistencia en PDF: pide hora inicial y final, objetivo, cedula del capacitador, tipo (charla, capacitacion, entrenamiento u otro) y modalidad (interna o externa), e incluye las firmas registradas.",
      "Editar o eliminar una capacitacion con confirmacion.",
    ],
    noPuedes: [
      "Guardar sin tema, fecha y empresa: son obligatorios.",
      "Regenerar la planilla una vez creada: queda guardada y el boton pasa a consultarla directamente.",
      "Registrar las firmas de los asistentes desde aqui: eso se hace en Asistencia a Capacitaciones.",
    ],
    funcionalidades: [
      {
        nombre: "Listado global",
        descripcion:
          "La tabla muestra las capacitaciones de todos los proyectos; cada una guarda internamente a que empresa pertenece.",
      },
      {
        nombre: "Evidencia adjunta",
        descripcion:
          "Sube el soporte de la capacitacion (foto, PDF, Word o Excel) y abrelo desde la columna Evidencia.",
      },
      {
        nombre: "Contador de asistencia",
        descripcion:
          "Insignia asistentes/total por fila para saber de un vistazo a quien le falta firmar. El total excluye registros de prueba y auxiliares genericos.",
      },
      {
        nombre: "Planilla de asistencia PDF",
        descripcion:
          "Formato oficial con encabezado diligenciado (horas, objetivo, capacitador y su cedula, tipo, modalidad) y la lista de asistentes con sus firmas. Se descarga y queda guardada para consultas futuras.",
      },
    ],
  },
  {
    modulo: "Asistencia a Capacitaciones",
    resumen:
      "Registra quien asistio a cada capacitacion, con resultado y firma del colaborador en pantalla.",
    proposito:
      "Deja constancia de la asistencia a las capacitaciones. Cada registro une una capacitacion con un colaborador del proyecto elegido en la barra superior, indica si asistio, el resultado (aprobado, reprobado o pendiente) y captura la firma del colaborador dibujada en pantalla. Para grupos grandes existe el Registro Masivo: se seleccionan varios colaboradores y todos firman en una misma planilla digital.",
    puedes: [
      "Registrar asistencia individual: capacitacion, colaborador, si asistio, resultado, observaciones y la firma dibujada en el recuadro.",
      "Hacer el Registro Masivo en dos pasos: primero eliges la capacitacion y seleccionas los colaboradores (los que ya estan registrados aparecen bloqueados), luego cada uno firma en su recuadro y se guarda todo de una vez.",
      "Editar un registro: si el colaborador no vuelve a firmar, se conserva la firma anterior.",
      "Ver la miniatura de la firma en la tabla y abrirla en grande.",
      "Eliminar un registro con confirmacion.",
    ],
    noPuedes: [
      "Guardar el registro masivo si falta alguien: el sistema exige resultado elegido y firma de todos los seleccionados antes de guardar.",
      "Registrar dos veces al mismo colaborador en la misma capacitacion desde el masivo: aparece como Ya registrado y no se puede marcar.",
      "Ver colaboradores de otro proyecto: la lista sale del Head Count del proyecto activo.",
    ],
    funcionalidades: [
      {
        nombre: "Registro individual con firma",
        descripcion:
          "Formulario con capacitacion, colaborador, asistencia, resultado, observaciones y el recuadro para que el colaborador firme con el dedo o el mouse.",
      },
      {
        nombre: "Registro Masivo (planilla digital)",
        descripcion:
          "Paso 1: elegir capacitacion y seleccionar colaboradores con buscador y seleccionar todos. Paso 2: planilla con un recuadro de firma por persona, casilla de asistio y resultado. Todo se guarda en bloque y se informa cuantos quedaron registrados.",
      },
      {
        nombre: "Firmas guardadas",
        descripcion:
          "Cada firma se guarda como imagen y se ve en miniatura en la tabla; estas firmas son las que salen en la planilla PDF de la capacitacion.",
      },
    ],
    consejos: [
      "En el registro masivo revisa antes de guardar que cada persona haya elegido resultado y firmado: el sistema no deja guardar planillas incompletas y te dice exactamente a quien le falta.",
    ],
  },
  {
    modulo: "Evaluaciones de Desempeño",
    resumen:
      "Evalua periodicamente a los colaboradores con un formulario de 12 puntos y consulta el historial con puntaje y riesgo.",
    proposito:
      "Controla que cada colaborador del proyecto activo sea evaluado a tiempo y guarda el historial completo. La regla es: la primera evaluacion vence al mes de la fecha de ingreso y las siguientes al ano de la ultima. El tablero muestra quien esta al dia y quien esta pendiente o vencido; al evaluar se diligencia un formulario de 12 aspectos (seguridad, productividad, calidad, disciplina y actitud) que arroja un puntaje sobre 60 y un porcentaje de riesgo.",
    puedes: [
      "Ver los indicadores: total de colaboradores, cuantos estan al dia, cuantos pendientes y cuantas evaluaciones hechas.",
      "Revisar por colaborador la fecha de su ultima evaluacion, la fecha de la proxima y su estado (al dia, vencida o pendiente).",
      "Evaluar a un colaborador con el formulario de 12 preguntas agrupadas en seguridad, productividad, calidad, disciplina y actitud, con comentarios y firma del coordinador.",
      "Consultar el historial completo con fecha, evaluador, puntaje sobre 60 y porcentaje de riesgo con semaforo.",
      "Ver el detalle de cualquier evaluacion pasada y descargar su PDF cuando lo necesites.",
      "Buscar por nombre, cargo, cedula o evaluador en ambas pestanas.",
    ],
    noPuedes: [
      "Editar o borrar una evaluacion ya registrada: el historial es el soporte del seguimiento.",
      "Evaluar sin proyecto activo: primero elige la empresa en la barra superior.",
      "Cambiar las fechas de vencimiento: se calculan solas (ingreso + 1 mes la primera, ultima evaluacion + 1 ano las siguientes).",
    ],
    funcionalidades: [
      {
        nombre: "Pestana Colaboradores",
        descripcion:
          "Listado del personal con su estado de evaluacion. La proxima fecha se resalta en rojo cuando ya vencio y el boton Evaluar abre el formulario.",
      },
      {
        nombre: "Formulario de evaluacion",
        descripcion:
          "12 aspectos calificables en 5 grupos: seguridad (normas y conducta), productividad (metas y ritmo), calidad (mercancia y precision), disciplina (puntualidad, asistencia e instrucciones) y actitud (equipo, disposicion y proactividad), mas comentarios y firma del coordinador.",
      },
      {
        nombre: "Puntaje y riesgo",
        descripcion:
          "Cada evaluacion arroja un puntaje sobre 60 y un porcentaje de riesgo: verde bajo, ambar medio (30% o mas) y rojo alto (60% o mas).",
      },
      {
        nombre: "Historial con PDF",
        descripcion:
          "Todas las evaluaciones del proyecto con ver detalle y boton PDF que regenera y descarga el documento de cualquier evaluacion pasada.",
      },
    ],
  },
]
