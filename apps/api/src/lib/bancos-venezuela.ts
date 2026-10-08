/**
 * Bancos activos de Venezuela, para la semilla del catálogo (tarea 1.1). El código es el que pide
 * el Pago Móvil y son los 4 primeros dígitos de una cuenta (§5.1 de PROYECTO.md).
 *
 * Fuente: Banco Central de Venezuela, "Instituciones Bancarias Participantes (IBP) en el Sistema de
 * Cámara de Compensación Electrónica" (documento de mayo de 2025), contrastada con otras dos listas
 * publicadas (datos revisados el 2026-10-01). No incluye el 0001 (Banco Central de Venezuela): es el
 * banco central, no uno para el público, y no se usa en un Pago Móvil ni en una cuenta de cliente.
 */
export const BANCOS_VENEZUELA: ReadonlyArray<{ codigo: string; nombre: string }> = [
  { codigo: '0102', nombre: 'Banco de Venezuela' },
  { codigo: '0104', nombre: 'Venezolano de Crédito' },
  { codigo: '0105', nombre: 'Mercantil' },
  { codigo: '0108', nombre: 'Provincial' },
  { codigo: '0114', nombre: 'Bancaribe' },
  { codigo: '0115', nombre: 'Banco Exterior' },
  { codigo: '0128', nombre: 'Banco Caroní' },
  { codigo: '0134', nombre: 'Banesco' },
  { codigo: '0137', nombre: 'Sofitasa' },
  { codigo: '0138', nombre: 'Banco Plaza' },
  { codigo: '0146', nombre: 'Bangente' },
  { codigo: '0151', nombre: 'BFC Banco Fondo Común' },
  { codigo: '0156', nombre: '100% Banco' },
  { codigo: '0157', nombre: 'DelSur' },
  { codigo: '0163', nombre: 'Banco del Tesoro' },
  { codigo: '0166', nombre: 'Banco Agrícola de Venezuela' },
  { codigo: '0168', nombre: 'Bancrecer' },
  { codigo: '0169', nombre: 'R4 Banco Microfinanciero' },
  { codigo: '0171', nombre: 'Banco Activo' },
  { codigo: '0172', nombre: 'Bancamiga' },
  { codigo: '0173', nombre: 'Banco Internacional de Desarrollo' },
  { codigo: '0174', nombre: 'Banplus' },
  { codigo: '0175', nombre: 'Banco Digital de los Trabajadores' },
  { codigo: '0177', nombre: 'BANFANB' },
  { codigo: '0178', nombre: 'N58 Banco Digital' },
  { codigo: '0191', nombre: 'BNC Banco Nacional de Crédito' },
  { codigo: '0601', nombre: 'Instituto Municipal de Crédito Popular' },
];
