declare module "jspdf" {
  interface jsPDF {
    lastAutoTable: {
      finalY: number
    }
    autoTable: (options: any) => jsPDF
  }
}
