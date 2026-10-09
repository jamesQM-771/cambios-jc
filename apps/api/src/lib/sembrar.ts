import { BANCOS_VENEZUELA } from './bancos-venezuela.js';
import { hashContrasena, LONGITUD_MINIMA_CONTRASENA } from './contrasenas.js';
import { DENOMINACIONES_SEMILLA } from './denominaciones-semilla.js';
import type { PrismaClient } from './prisma.js';

export interface DatosSemilla {
  loginAdmin: string;
  contrasenaAdmin: string;
}

export interface ResultadoSemilla {
  empresaCreada: boolean;
  sucursalCreada: boolean;
  administradorCreado: boolean;
  bancosCreados: number;
  denominacionesCreadas: number;
  lineasNegocioCreadas: number;
}

/**
 * Datos iniciales: empresa ficticia, sucursal principal y administrador inicial.
 * Se puede ejecutar varias veces: lo que ya existe no se toca (en particular, no
 * cambia la contraseña de un administrador existente).
 */
export async function sembrar(
  prisma: PrismaClient,
  datos: DatosSemilla,
): Promise<ResultadoSemilla> {
  const login = datos.loginAdmin.trim().toLowerCase();
  if (!login) throw new Error('ADMIN_LOGIN_INICIAL está vacío.');
  if (datos.contrasenaAdmin.length < LONGITUD_MINIMA_CONTRASENA) {
    throw new Error(
      `ADMIN_CONTRASENA_INICIAL debe tener al menos ${String(LONGITUD_MINIMA_CONTRASENA)} caracteres.`,
    );
  }
  // El hash se calcula fuera de la transacción: argon2 es lento a propósito.
  const hash = await hashContrasena(datos.contrasenaAdmin);

  return prisma.$transaction(async (tx) => {
    const resultado: ResultadoSemilla = {
      empresaCreada: false,
      sucursalCreada: false,
      administradorCreado: false,
      bancosCreados: 0,
      denominacionesCreadas: 0,
      lineasNegocioCreadas: 0,
    };

    if (!(await tx.empresa.findUnique({ where: { unica: true } }))) {
      const empresa = await tx.empresa.create({
        data: { nombre: 'Casa de Cambio Ejemplo', nit: '900000000-0', whatsapp: '3000000000' },
      });
      await tx.auditoria.create({
        data: {
          accion: 'seed.crear',
          entidad: 'empresa',
          entidadId: empresa.id,
          despues: { nombre: empresa.nombre },
        },
      });
      resultado.empresaCreada = true;
    }

    let sucursal = await tx.sucursal.findUnique({ where: { nombre: 'Principal' } });
    if (!sucursal) {
      sucursal = await tx.sucursal.create({ data: { nombre: 'Principal', ciudad: 'Cúcuta' } });
      await tx.auditoria.create({
        data: {
          accion: 'seed.crear',
          entidad: 'sucursal',
          entidadId: sucursal.id,
          despues: { nombre: sucursal.nombre },
        },
      });
      resultado.sucursalCreada = true;
    }

    if (!(await tx.usuario.findUnique({ where: { login } }))) {
      const admin = await tx.usuario.create({
        data: {
          nombre: 'Administrador',
          login,
          hashContrasena: hash,
          debeCambiarContrasena: true,
          rol: 'administrador',
          sucursalId: sucursal.id,
        },
      });
      // Nunca se registra el hash ni la contraseña en la bitácora.
      await tx.auditoria.create({
        data: {
          accion: 'seed.crear',
          entidad: 'usuario',
          entidadId: admin.id,
          despues: { login: admin.login, rol: admin.rol },
        },
      });
      resultado.administradorCreado = true;
    }

    // No se registra cada banco en la bitácora: son 27 filas de catálogo, no una acción de negocio.
    const { count } = await tx.banco.createMany({
      data: BANCOS_VENEZUELA.map(({ codigo, nombre }) => ({ codigo, nombre })),
      skipDuplicates: true,
    });
    resultado.bancosCreados = count;

    // Denominacion no tiene un índice único (dos pueden coexistir si una está inactiva, tarea 1.4):
    // no se puede usar createMany/skipDuplicates. Se compara a mano, igual que empresa/sucursal/admin.
    const existentes = await tx.denominacion.findMany({ select: { moneda: true, valor: true } });
    const clave = (moneda: string, valor: string) => `${moneda}:${Number(valor).toFixed(3)}`;
    const yaExisten = new Set(existentes.map((d) => clave(d.moneda, d.valor.toString())));
    const faltantes = DENOMINACIONES_SEMILLA.filter(
      (d) => !yaExisten.has(clave(d.moneda, d.valor)),
    );
    if (faltantes.length > 0) {
      const resultadoDenominaciones = await tx.denominacion.createMany({ data: faltantes });
      resultado.denominacionesCreadas = resultadoDenominaciones.count;
    }

    // "Bolívares en efectivo" se crea desactivada: Cambios JC no opera bolívares en efectivo
    // (D-confirmación #6 de PROYECTO.md), pero la línea existe para cuando otra instalación la active.
    const { count: lineasCreadas } = await tx.lineaNegocio.createMany({
      data: [
        {
          // Modo "porcentaje" (D64): proveedor + margen de venta (confirmado: 11 %).
          nombre: 'Transferencias a Venezuela',
          clase: 'remesa',
          monedaOrigen: 'COP',
          monedaDestino: 'VES',
          modoTasa: 'porcentaje',
          margenVenta: '11',
        },
        {
          // Modo "directo" (D64): compra y venta se publican ya calculadas, día a día.
          nombre: 'Dólares',
          clase: 'divisa_caja',
          monedaOrigen: 'USD',
          monedaDestino: 'COP',
          modoTasa: 'directo',
        },
        {
          nombre: 'Bolívares en efectivo',
          clase: 'divisa_caja',
          monedaOrigen: 'VES',
          monedaDestino: 'COP',
          activa: false,
          modoTasa: 'directo',
        },
      ],
      skipDuplicates: true,
    });
    resultado.lineasNegocioCreadas = lineasCreadas;

    return resultado;
  });
}
