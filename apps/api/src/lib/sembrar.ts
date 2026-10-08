import { BANCOS_VENEZUELA } from './bancos-venezuela.js';
import { hashContrasena, LONGITUD_MINIMA_CONTRASENA } from './contrasenas.js';
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

    return resultado;
  });
}
