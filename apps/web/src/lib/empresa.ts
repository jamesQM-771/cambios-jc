/**
 * Formato de los datos de la empresa que se capturan por partes y se guardan como un solo texto:
 * NIT (D82) y dirección (D84). Son funciones puras: solo reacomodan texto.
 */

// ---------- NIT ----------

export interface PartesNit {
  /** Número de identificación, solo dígitos. */
  numero: string;
  /** Dígito de verificación, o vacío si no se escribió. El sistema no lo calcula ni lo valida. */
  digito: string;
}

/** Largo del número sin el dígito de verificación. La API acepta hasta 20 caracteres en total. */
export const DIGITOS_MINIMOS_NIT = 5;
export const DIGITOS_MAXIMOS_NIT = 15;

const soloDigitos = (texto: string): string => texto.replace(/\D/g, '');

/** Separa un NIT guardado ("900.123.456-7" o "900123456-7") en número y dígito de verificación. */
export function separarNit(valor: string | null | undefined): PartesNit {
  const texto = (valor ?? '').trim();
  const guion = texto.lastIndexOf('-');
  if (guion === -1) return { numero: soloDigitos(texto), digito: '' };
  return {
    numero: soloDigitos(texto.slice(0, guion)),
    digito: soloDigitos(texto.slice(guion + 1)).slice(0, 1),
  };
}

/** Como se guarda: sin puntos, con el dígito de verificación tras un guion ("900123456-7"). */
export function unirNit({ numero, digito }: PartesNit): string {
  const limpio = soloDigitos(numero);
  if (limpio === '') return '';
  const verificador = soloDigitos(digito).slice(0, 1);
  return verificador === '' ? limpio : `${limpio}-${verificador}`;
}

/** Como se lee: con puntos de miles ("900.123.456-7"). */
export function formatearNit(valor: string | null | undefined): string {
  const { numero, digito } = separarNit(valor);
  if (numero === '') return '';
  const conPuntos = numero.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return digito === '' ? conPuntos : `${conPuntos}-${digito}`;
}

/** Mensaje de error del número, o `null` si es válido o está vacío (el NIT es opcional). */
export function errorDeNit(numero: string): string | null {
  if (numero === '') return null;
  if (numero.length < DIGITOS_MINIMOS_NIT) {
    return `El NIT debe tener al menos ${String(DIGITOS_MINIMOS_NIT)} dígitos.`;
  }
  return null;
}

// ---------- Dirección ----------

export const TIPOS_VIA = [
  'Calle',
  'Carrera',
  'Avenida',
  'Diagonal',
  'Transversal',
  'Circular',
  'Autopista',
  'Kilómetro',
] as const;

export interface PartesDireccion {
  tipoVia: string;
  /** Nombre o número de la vía: "10", "5A", "Libertadores". */
  via: string;
  /** Número del cruce, lo que va después de "#". */
  numero: string;
  /** Lo que va después del guion: la distancia a la esquina. */
  placa: string;
  /** Local, oficina, piso, barrio. */
  complemento: string;
  ciudad: string;
  departamento: string;
  pais: string;
}

export const DIRECCION_VACIA: PartesDireccion = {
  tipoVia: 'Calle',
  via: '',
  numero: '',
  placa: '',
  complemento: '',
  ciudad: '',
  departamento: '',
  pais: '',
};

export const LARGO_MAXIMO_DIRECCION = 200;

/** Las comas separan las partes al guardar: dentro de una parte se quitan. */
const sinComas = (texto: string): string => texto.replace(/,/g, ' ').replace(/\s+/g, ' ').trim();

/**
 * Une las partes en el texto que se guarda: "Calle 10 # 5-23 Local 2, Cúcuta, Norte de Santander,
 * Colombia". Sin vía ni ciudad no hay dirección (texto vacío).
 */
export function unirDireccion(partes: PartesDireccion): string {
  const via = sinComas(partes.via);
  const ciudad = sinComas(partes.ciudad);
  if (via === '' && ciudad === '') return '';
  const numero = sinComas(partes.numero);
  const placa = sinComas(partes.placa);
  const complemento = sinComas(partes.complemento);
  const cruce = numero === '' ? '' : ` # ${numero}${placa === '' ? '' : `-${placa}`}`;
  const primera =
    via === ''
      ? ''
      : `${partes.tipoVia} ${via}${cruce}${complemento === '' ? '' : ` ${complemento}`}`;
  return [primera, ciudad, sinComas(partes.departamento), sinComas(partes.pais)]
    .filter((parte) => parte !== '')
    .join(', ');
}

const PATRON_VIA = new RegExp(
  `^(${TIPOS_VIA.join('|')}) (\\S+)(?: # ([^\\s-]+)(?:-(\\S+))?)?(?: (.+))?$`,
);

/**
 * Separa una dirección guardada con el formato de `unirDireccion`. Devuelve `null` si no lo sigue
 * (una dirección antigua escrita a mano): esa se muestra como texto, sin adivinar sus partes.
 */
export function separarDireccion(valor: string | null | undefined): PartesDireccion | null {
  const texto = (valor ?? '').trim();
  if (texto === '') return { ...DIRECCION_VACIA };
  const [primera = '', ...resto] = texto.split(',').map((parte) => parte.trim());
  if (resto.length > 3) return null;
  const coincidencia = PATRON_VIA.exec(primera);
  if (!coincidencia) return null;
  const [, tipoVia = 'Calle', via = '', numero = '', placa = '', complemento = ''] = coincidencia;
  const [ciudad = '', departamento = '', pais = ''] = resto;
  return { tipoVia, via, numero, placa, complemento, ciudad, departamento, pais };
}
