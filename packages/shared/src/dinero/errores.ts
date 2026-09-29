export type CodigoErrorDinero =
  'VALOR_INVALIDO' | 'DIVISION_POR_CERO' | 'TASA_INVALIDA' | 'MONTO_NEGATIVO' | 'CUENTA_INVALIDA';

/** Error de las utilidades de dinero. El código es estable para que la API lo traduzca a su formato de error. */
export class ErrorDinero extends Error {
  readonly codigo: CodigoErrorDinero;

  constructor(codigo: CodigoErrorDinero, mensaje: string) {
    super(mensaje);
    this.name = 'ErrorDinero';
    this.codigo = codigo;
  }
}
