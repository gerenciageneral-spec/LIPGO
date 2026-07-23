// Coordinador de OPERACIONES por proyecto (ID de empresa). La Gerencia de Operaciones
// responde por el resultado GLOBAL de LIP (indicadores gerenciales); cada COORDINADOR
// responde por su proyecto (indicadores de gestión calculados por idempresa). Es el
// despliegue en cascada de los objetivos (ISO 9001 6.2.1 / BSC).
//
// Editable: ajustar el nombre real del coordinador de cada proyecto. Los proyectos son
// los clientes/sitios SIG donde LIP opera (SIG_CLIENTES_LIP = 1..4).
export interface ProyectoCoordinador {
  idempresa: number
  proyecto: string
  coordinador: string
}

export const COORDINADORES_PROYECTO: ProyectoCoordinador[] = [
  { idempresa: 1, proyecto: "Harinera Indupan", coordinador: "Coordinador Indupan" },
  { idempresa: 2, proyecto: "Avimol", coordinador: "Coordinador Avimol" },
  { idempresa: 3, proyecto: "Cedi Funza", coordinador: "Coordinador Cedi Funza" },
  { idempresa: 4, proyecto: "Cedi Medellín", coordinador: "Coordinador Cedi Medellín" },
]

// Área operativa cuya gestión se mide por proyecto/coordinador.
export const AREA_OPERACIONES = "Operaciones"
