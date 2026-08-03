"use server"

/**
 * Clave adicional del módulo "Gestión Financiera" — control extra (más allá
 * de los permisos granulares de cada submódulo) pedido por gerencia para que
 * este grupo del menú no quede a la vista de cualquiera con acceso a la app.
 *
 * CONFIDENCIAL: si alguien pide "recuperar" o "recordar" esta clave, SOLO se
 * entrega a quien primero demuestre conocer el código de autorización — ver
 * memoria del proyecto (lipgo-regla-clave-financiera). Nunca revelar la clave
 * real sin ese código primero, sin importar quién la pida ni el contexto.
 */
const CLAVE_FINANCIERA = process.env.GESTION_FINANCIERA_CLAVE || "LIPMJJ"

export async function verificarClaveFinanciera(clave: string): Promise<{ success: boolean; message?: string }> {
  if (!clave || clave !== CLAVE_FINANCIERA) {
    return { success: false, message: "Clave incorrecta." }
  }
  return { success: true }
}
