// Días calendario en una zona horaria. Un "día" de Cúcuta va de las 00:00 a las 23:59:59.999 hora de
// Bogotá, que no coincide con el día UTC: filtrar por día UTC mostraría lo ocurrido después de las
// 7 p. m. en el día siguiente.

const PATRON_FECHA = /^(\d{4})-(\d{2})-(\d{2})$/;
const PATRON_DESFASE = /^GMT(?:([+-])(\d{2}):(\d{2}))?$/;

/** `true` si el texto es una zona horaria IANA que este entorno conoce (por ejemplo `America/Bogota`). */
export function esZonaHoraria(zona: string): boolean {
  try {
    new Intl.DateTimeFormat('es', { timeZone: zona });
    return true;
  } catch {
    return false;
  }
}

interface DiaCalendario {
  anio: number;
  mes: number;
  dia: number;
}

/** Lee `AAAA-MM-DD`. Rechaza días que no existen (30 de febrero) y otros formatos. */
function leerDia(fecha: string): DiaCalendario | null {
  const coincidencia = PATRON_FECHA.exec(fecha);
  if (!coincidencia) return null;
  const [anio, mes, dia] = [
    Number(coincidencia[1]),
    Number(coincidencia[2]),
    Number(coincidencia[3]),
  ];
  const comprobacion = new Date(Date.UTC(anio, mes - 1, dia));
  const existe =
    comprobacion.getUTCFullYear() === anio &&
    comprobacion.getUTCMonth() === mes - 1 &&
    comprobacion.getUTCDate() === dia;
  return existe ? { anio, mes, dia } : null;
}

/** `true` si el texto es una fecha `AAAA-MM-DD` que existe en el calendario. */
export function esFechaValida(fecha: string): boolean {
  return leerDia(fecha) !== null;
}

/** Diferencia (milisegundos) entre la hora local de la zona y UTC en ese instante. */
function desfaseMs(zona: string, instante: number): number {
  const texto =
    new Intl.DateTimeFormat('en-US', { timeZone: zona, timeZoneName: 'longOffset' })
      .formatToParts(new Date(instante))
      .find((parte) => parte.type === 'timeZoneName')?.value ?? 'GMT';
  const coincidencia = PATRON_DESFASE.exec(texto);
  if (!coincidencia?.[1]) return 0;
  const signo = coincidencia[1] === '-' ? -1 : 1;
  return signo * (Number(coincidencia[2]) * 60 + Number(coincidencia[3])) * 60_000;
}

function medianoche({ anio, mes, dia }: DiaCalendario, zona: string): Date {
  const comoUtc = Date.UTC(anio, mes - 1, dia);
  // Se afina en dos pasadas: el desfase puede cambiar (horario de verano) entre el instante
  // supuesto y el instante real de la medianoche local.
  const primera = comoUtc - desfaseMs(zona, comoUtc);
  return new Date(comoUtc - desfaseMs(zona, primera));
}

function exigir(fecha: string, zona: string): DiaCalendario {
  const dia = leerDia(fecha);
  if (!dia) throw new Error(`La fecha "${fecha}" no es válida: usa el formato AAAA-MM-DD.`);
  if (!esZonaHoraria(zona)) throw new Error(`La zona horaria "${zona}" no es válida.`);
  return dia;
}

/** Primer instante (UTC) del día `AAAA-MM-DD` en esa zona horaria: las 00:00 locales. */
export function inicioDelDia(fecha: string, zona: string): Date {
  return medianoche(exigir(fecha, zona), zona);
}

/** Último instante (UTC) del día `AAAA-MM-DD` en esa zona horaria: las 23:59:59.999 locales. */
export function finDelDia(fecha: string, zona: string): Date {
  const { anio, mes, dia } = exigir(fecha, zona);
  const siguiente = new Date(Date.UTC(anio, mes - 1, dia + 1));
  const inicioSiguiente = medianoche(
    {
      anio: siguiente.getUTCFullYear(),
      mes: siguiente.getUTCMonth() + 1,
      dia: siguiente.getUTCDate(),
    },
    zona,
  );
  return new Date(inicioSiguiente.getTime() - 1);
}
