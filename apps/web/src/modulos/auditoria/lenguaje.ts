/**
 * La bitácora guarda cada acción con un código (`usuario.reiniciar_2fa`). Aquí se traduce a lo que
 * una persona entiende (D87). Los registros no cambian: solo cambia cómo se leen. Una acción nueva
 * sin traducción se muestra con su código, y una prueba avisa de las que faltan.
 */

/** Código de la acción → qué pasó, en pasado y sin sujeto ("publicó una tasa"). */
export const FRASES_ACCION: Record<string, string> = {
  'auth.login': 'entró al sistema',
  'auth.logout': 'salió del sistema',
  'auth.login_fallido': 'intentó entrar con datos incorrectos',
  'auth.login_bloqueado': 'intentó entrar con la cuenta bloqueada',
  'auth.cuenta_bloqueada': 'quedó con la cuenta bloqueada por varios intentos fallidos',
  'auth.contrasena_correcta': 'escribió bien su contraseña (falta el código)',
  'auth.2fa_configurar': 'empezó a configurar la verificación en dos pasos',
  'auth.2fa_activar': 'activó la verificación en dos pasos',
  'usuario.crear': 'creó un usuario',
  'usuario.editar': 'editó un usuario',
  'usuario.desactivar': 'desactivó un usuario',
  'usuario.reactivar': 'reactivó un usuario',
  'usuario.cambiar_contrasena': 'cambió su contraseña',
  'usuario.restablecer_contrasena': 'restableció la contraseña de un usuario',
  'usuario.reiniciar_2fa': 'reinició la verificación en dos pasos de un usuario',
  'usuario.cerrar_sesiones': 'cerró las sesiones de un usuario',
  'empresa.editar': 'cambió los datos de la empresa',
  'empresa.cambiar_logo': 'cambió el logo de la empresa',
  'banco.crear': 'creó un banco',
  'banco.editar': 'editó un banco',
  'banco.desactivar': 'desactivó un banco',
  'banco.reactivar': 'reactivó un banco',
  'sucursal.crear': 'creó una sucursal',
  'sucursal.editar': 'editó una sucursal',
  'sucursal.desactivar': 'desactivó una sucursal',
  'sucursal.reactivar': 'reactivó una sucursal',
  'caja.crear': 'creó una caja',
  'caja.editar': 'editó una caja',
  'caja.desactivar': 'desactivó una caja',
  'caja.reactivar': 'reactivó una caja',
  'denominacion.crear': 'creó una denominación',
  'denominacion.editar': 'editó una denominación',
  'denominacion.desactivar': 'desactivó una denominación',
  'denominacion.reactivar': 'reactivó una denominación',
  'linea_negocio.crear': 'creó una línea de negocio',
  'linea_negocio.editar': 'editó una línea de negocio',
  'linea_negocio.desactivar': 'desactivó una línea de negocio',
  'linea_negocio.reactivar': 'reactivó una línea de negocio',
  'linea_negocio.configurar_tasa': 'cambió el modo o el margen de una línea',
  'cuenta_dinero.crear': 'creó una cuenta de dinero',
  'cuenta_dinero.editar': 'editó una cuenta de dinero',
  'cuenta_dinero.desactivar': 'desactivó una cuenta de dinero',
  'cuenta_dinero.reactivar': 'reactivó una cuenta de dinero',
  'tasa.publicar': 'publicó una tasa',
  'remesa.registrar': 'registró una remesa',
  'cliente.crear': 'registró un cliente',
  'cliente.editar': 'editó un cliente',
  'cliente.desactivar': 'desactivó un cliente',
  'cliente.reactivar': 'reactivó un cliente',
  'medio_pago.crear': 'agregó un medio de pago a un cliente',
  'medio_pago.desactivar': 'desactivó un medio de pago',
  'medio_pago.reactivar': 'reactivó un medio de pago',
  'seed.crear': 'creó los datos iniciales del sistema',
  'usuario.restablecer_acceso_emergencia':
    'restableció el acceso de un administrador desde el servidor',
};

/** Código de la entidad → de qué trata, para el filtro "Sobre qué". */
export const ETIQUETAS_ENTIDAD: Record<string, string> = {
  usuario: 'Usuarios',
  sesion: 'Accesos al sistema',
  empresa: 'Empresa',
  banco: 'Bancos',
  sucursal: 'Sucursales',
  caja: 'Cajas',
  denominacion: 'Denominaciones',
  linea_negocio: 'Líneas de negocio',
  cuenta_dinero: 'Cuentas de dinero',
  tasa: 'Tasas',
  operacion: 'Remesas',
  cliente: 'Clientes',
  medio_pago: 'Medios de pago',
};

/** Nombre legible de los campos que aparecen en el antes y el después. */
const ETIQUETAS_CAMPO: Record<string, string> = {
  nombre: 'Nombre',
  login: 'Usuario',
  rol: 'Rol',
  activo: 'Activo',
  activa: 'Activa',
  sucursalId: 'Sucursal (id)',
  tiene2fa: 'Verificación en dos pasos',
  debeCambiarContrasena: 'Contraseña temporal',
  nit: 'NIT',
  telefono: 'Teléfono',
  whatsapp: 'WhatsApp',
  direccion: 'Dirección',
  monedaLocal: 'Moneda local',
  zonaHoraria: 'Zona horaria',
  textoPieRecibo: 'Mensaje al pie del recibo',
  logoUrl: 'Logo',
  codigoBanco: 'Código del banco',
  pais: 'País',
  ciudad: 'Ciudad',
  moneda: 'Moneda',
  valor: 'Valor',
  clase: 'Clase',
  modoTasa: 'Modo de tasa',
  margenVenta: 'Margen de venta (%)',
  margenCompra: 'Margen de compra (%)',
  tasaReferencia: 'Tasa del proveedor',
  tasaCompra: 'Tasa de compra',
  tasaVenta: 'Tasa de venta',
  margenUsado: 'Margen usado (%)',
  motivo: 'Motivo',
  tipo: 'Tipo',
  titular: 'Titular',
  ultimos4Digitos: 'Últimos 4 dígitos',
  limiteDiario: 'Límite diario',
  comisionPorDefecto: 'Comisión por defecto',
  responsableId: 'Responsable (id)',
  bancoId: 'Banco (id)',
  lineaNegocioId: 'Línea de negocio (id)',
  publicadaPorId: 'Publicada por (id)',
  monedaOrigen: 'Moneda de origen',
  monedaDestino: 'Moneda de destino',
  vigenteDesde: 'Vigente desde',
  vigenteHasta: 'Vigente hasta',
};

/** "publicó una tasa", o el código tal cual si la acción todavía no tiene traducción. */
export const describirAccion = (codigo: string): string => FRASES_ACCION[codigo] ?? codigo;

export const etiquetaEntidad = (codigo: string): string => ETIQUETAS_ENTIDAD[codigo] ?? codigo;

export const etiquetaCampo = (campo: string): string => ETIQUETAS_CAMPO[campo] ?? campo;

/** Valor de un campo para leer: sí o no, raya si no hay dato, y el resto como texto. */
export function valorLegible(valor: unknown): string {
  if (valor === null || valor === undefined || valor === '') return '—';
  if (typeof valor === 'boolean') return valor ? 'Sí' : 'No';
  if (typeof valor === 'string') return valor;
  if (typeof valor === 'number' || typeof valor === 'bigint') return String(valor);
  return JSON.stringify(valor);
}

export interface CambioDeCampo {
  campo: string;
  antes: string;
  despues: string;
}

const esObjeto = (valor: unknown): valor is Record<string, unknown> =>
  typeof valor === 'object' && valor !== null && !Array.isArray(valor);

/**
 * Lista de campos con su valor antes y después. En una creación solo hay "después"; en lo demás
 * se muestran los campos cuyo valor cambió. Si los datos no son objetos, no hay lista.
 */
export function cambiosDe(antes: unknown, despues: unknown): CambioDeCampo[] {
  const previo = esObjeto(antes) ? antes : {};
  const nuevo = esObjeto(despues) ? despues : {};
  const campos = [...new Set([...Object.keys(previo), ...Object.keys(nuevo)])];
  return (
    campos
      .filter((campo) => JSON.stringify(previo[campo]) !== JSON.stringify(nuevo[campo]))
      .map((campo) => ({
        campo: etiquetaCampo(campo),
        antes: valorLegible(previo[campo]),
        despues: valorLegible(nuevo[campo]),
      }))
      // Un dato que no existía y sigue vacío (null frente a "sin dato") no es un cambio que mostrar.
      .filter((cambio) => cambio.antes !== cambio.despues)
  );
}
