export interface Product {
  id: number
  nombre: string
  peso_unitkg?: number
  pesobruto?: number
}

export interface Employee {
  id: number
  nombreempleado: string
}

export interface TolvaLine {
  id: string
  producto: Product | null
  cantidad: number
  pesoUnitkg?: number
  pesoTotal?: number
  pesoBrutoUnit?: number
  pesoBrutoTotal?: number
}

export interface TolvaData {
  fechaFabricacion: string
  lote: string
  productos: TolvaLine[]
  empleados: Employee[]
}
