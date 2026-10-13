/** El servidor acepta capturas de hasta 1 MB; se apunta por debajo para dejar margen. */
export const OBJETIVO_BYTES = 900_000;
const LADO_MAXIMO = 1600;
const CALIDADES = [0.85, 0.7, 0.55] as const;

/** Tamaño final de una imagen que se reduce para que su lado mayor no pase de `maximo`. */
export function dimensionesReducidas(
  ancho: number,
  alto: number,
  maximo = LADO_MAXIMO,
): { ancho: number; alto: number } {
  const mayor = Math.max(ancho, alto);
  if (mayor <= maximo) return { ancho, alto };
  const escala = maximo / mayor;
  return { ancho: Math.round(ancho * escala), alto: Math.round(alto * escala) };
}

/**
 * Reduce la captura antes de enviarla: una foto del teléfono pesa varios MB y la conexión de quien
 * paga puede ser mala (§5.4). Convierte a JPG con menos resolución y calidad hasta que quepa. Si el
 * navegador no sabe hacerlo, devuelve el archivo tal cual y el servidor decide.
 */
export async function comprimirImagen(archivo: Blob): Promise<Blob> {
  if (archivo.size <= OBJETIVO_BYTES) return archivo;
  try {
    const imagen = await createImageBitmap(archivo);
    const { ancho, alto } = dimensionesReducidas(imagen.width, imagen.height);
    const lienzo = document.createElement('canvas');
    lienzo.width = ancho;
    lienzo.height = alto;
    const contexto = lienzo.getContext('2d');
    if (!contexto) return archivo;
    contexto.drawImage(imagen, 0, 0, ancho, alto);
    imagen.close();

    let resultado: Blob | null = null;
    for (const calidad of CALIDADES) {
      resultado = await new Promise<Blob | null>((resolver) => {
        lienzo.toBlob(resolver, 'image/jpeg', calidad);
      });
      if (resultado && resultado.size <= OBJETIVO_BYTES) return resultado;
    }
    return resultado && resultado.size < archivo.size ? resultado : archivo;
  } catch {
    return archivo;
  }
}
