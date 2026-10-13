import { urlApi } from '../lib/api.js';
import type { AnchoRecibo, Recibo } from '../modulos/recibos/tipos.js';

interface PropiedadesReciboTicket {
  recibo: Recibo;
  /** Ancho del papel: 58 mm o 80 mm. */
  ancho: AnchoRecibo;
}

/**
 * Ticket de una remesa (§5.3 de PROYECTO.md): lo mismo que se ve en pantalla es lo que sale por la
 * impresora térmica (la hoja de estilos oculta todo lo demás al imprimir). No calcula nada: los
 * montos y la fecha ya vienen formateados del servidor.
 */
export function ReciboTicket({ recibo, ancho }: PropiedadesReciboTicket) {
  const { empresa, beneficiario } = recibo;
  const filas: [string, string][] = [
    ['Comprobante N°', String(recibo.numeroComprobante)],
    ['Fecha', recibo.fechaTexto],
    [
      'Remitente',
      `${recibo.remitente.nombre} (${recibo.remitente.tipoDocumento} ${recibo.remitente.numeroDocumento})`,
    ],
    [
      'Titular',
      `${beneficiario.titular} (${beneficiario.tipoDocumento} ${beneficiario.numeroDocumento})`,
    ],
    ['Banco', `${beneficiario.banco.codigo} ${beneficiario.banco.nombre}`],
    beneficiario.tipoPago === 'cuenta_bancaria'
      ? ['Cuenta', beneficiario.numeroCuenta ?? '']
      : ['Pago móvil', beneficiario.telefonoPagoMovil ?? ''],
    ['Recibido', recibo.montoPesosTexto],
    ['Envío', recibo.montoBolivaresTexto],
    ['Atendió', recibo.vendedor],
    ['Seguimiento', recibo.codigoSeguimiento],
  ];

  return (
    <article
      className={`recibo recibo--${String(ancho)}`}
      aria-label={`Recibo ${String(recibo.numeroComprobante)}${recibo.esCopia ? ' (copia)' : ''}`}
    >
      {recibo.esCopia && <p className="recibo__copia">COPIA</p>}
      <header className="recibo__cabecera">
        {empresa.tieneLogo && <img className="recibo__logo" src={urlApi('/empresa/logo')} alt="" />}
        <h2 className="recibo__empresa">{empresa.nombre}</h2>
        {empresa.nit && <p>NIT {empresa.nit}</p>}
        {empresa.whatsapp && <p>WhatsApp {empresa.whatsapp}</p>}
        {empresa.telefono && empresa.telefono !== empresa.whatsapp && (
          <p>Tel. {empresa.telefono}</p>
        )}
        {empresa.direccion && <p>{empresa.direccion}</p>}
      </header>
      <dl className="recibo__datos">
        {filas.map(([titulo, valor]) => (
          <div key={titulo} className="recibo__fila">
            <dt>{titulo}</dt>
            <dd>{valor}</dd>
          </div>
        ))}
      </dl>
      {empresa.textoPie && <p className="recibo__pie">{empresa.textoPie}</p>}
    </article>
  );
}
