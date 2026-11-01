/**
 * Enlace para compartir un texto por WhatsApp (§5.15, primera etapa; D167). Abre WhatsApp con el
 * mensaje listo y deja que la persona elija el contacto: no se envía nada desde el servidor ni se
 * usa la API de WhatsApp Business (eso es la fase 12 completa, con un proveedor y sus credenciales).
 */
export function enlaceWhatsApp(texto: string, telefono?: string | null): string {
  const numero = (telefono ?? '').replace(/\D/g, '');
  return `https://wa.me/${numero}?text=${encodeURIComponent(texto)}`;
}
