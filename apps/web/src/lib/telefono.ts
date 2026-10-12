/**
 * Teléfonos: se guardan en formato internacional sin espacios (`+573001234567`) y se muestran
 * agrupados (`+57 300 123 4567`). El formato guardado cumple el patrón que ya valida la API (D83).
 */

export interface PaisTelefono {
  codigo: string;
  nombre: string;
  prefijo: string;
}

/** Colombia y Venezuela primero: son los del negocio. El resto, en orden alfabético. */
export const PAISES_TELEFONO: readonly PaisTelefono[] = [
  { codigo: 'CO', nombre: 'Colombia', prefijo: '57' },
  { codigo: 'VE', nombre: 'Venezuela', prefijo: '58' },
  { codigo: 'AR', nombre: 'Argentina', prefijo: '54' },
  { codigo: 'BR', nombre: 'Brasil', prefijo: '55' },
  { codigo: 'CL', nombre: 'Chile', prefijo: '56' },
  { codigo: 'EC', nombre: 'Ecuador', prefijo: '593' },
  { codigo: 'ES', nombre: 'España', prefijo: '34' },
  { codigo: 'US', nombre: 'Estados Unidos', prefijo: '1' },
  { codigo: 'MX', nombre: 'México', prefijo: '52' },
  { codigo: 'PA', nombre: 'Panamá', prefijo: '507' },
  { codigo: 'PE', nombre: 'Perú', prefijo: '51' },
];

export const PREFIJO_POR_DEFECTO = '57';

/** Longitud del número sin prefijo. Amplia a propósito: las reglas por país están por confirmar. */
export const DIGITOS_MINIMOS_TELEFONO = 7;
export const DIGITOS_MAXIMOS_TELEFONO = 12;

const soloDigitos = (texto: string): string => texto.replace(/\D/g, '');

/**
 * Separa un teléfono guardado en prefijo y número. Uno antiguo sin `+` se toma como número local
 * del país por defecto: no cambia en la base hasta que alguien lo edite y guarde.
 */
export function separarTelefono(valor: string | null | undefined): {
  prefijo: string;
  numero: string;
} {
  const texto = (valor ?? '').trim();
  const digitos = soloDigitos(texto);
  if (!texto.startsWith('+')) return { prefijo: PREFIJO_POR_DEFECTO, numero: digitos };
  // El prefijo más largo que coincida: "+593…" es Ecuador, no "+59" de otro país.
  const pais = [...PAISES_TELEFONO]
    .sort((a, b) => b.prefijo.length - a.prefijo.length)
    .find((candidato) => digitos.startsWith(candidato.prefijo));
  if (!pais) return { prefijo: PREFIJO_POR_DEFECTO, numero: digitos };
  return { prefijo: pais.prefijo, numero: digitos.slice(pais.prefijo.length) };
}

/** Valor que se envía a la API. Sin número no hay teléfono (texto vacío). */
export function unirTelefono(prefijo: string, numero: string): string {
  const digitos = soloDigitos(numero);
  return digitos === '' ? '' : `+${soloDigitos(prefijo)}${digitos}`;
}

/** Grupos de tres con los últimos cuatro juntos: "3001234567" → "300 123 4567". */
function agrupar(numero: string): string {
  if (numero.length <= 4) return numero;
  const final = numero.slice(-4);
  const inicio = numero.slice(0, -4);
  const grupos = inicio.match(/\d{1,3}(?=(\d{3})*$)/g) ?? [inicio];
  return [...grupos, final].join(' ');
}

/** Teléfono para leer: "+573001234567" → "+57 300 123 4567". */
export function formatearTelefono(valor: string | null | undefined): string {
  const { prefijo, numero } = separarTelefono(valor);
  return numero === '' ? '' : `+${prefijo} ${agrupar(numero)}`;
}

/** Mensaje de error del número, o `null` si es válido o está vacío (el teléfono es opcional). */
export function errorDeTelefono(numero: string): string | null {
  const digitos = soloDigitos(numero);
  if (digitos === '') return null;
  if (digitos.length < DIGITOS_MINIMOS_TELEFONO || digitos.length > DIGITOS_MAXIMOS_TELEFONO) {
    return `Escribe entre ${String(DIGITOS_MINIMOS_TELEFONO)} y ${String(DIGITOS_MAXIMOS_TELEFONO)} dígitos, sin el código del país.`;
  }
  return null;
}
