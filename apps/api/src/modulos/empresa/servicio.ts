import type { Empresa, Prisma } from '../../generated/prisma/client.js';
import {
  versionDeClaveLogo,
  type Almacenamiento,
  type LogoAbierto,
} from '../../lib/almacenamiento.js';
import { ErrorApp } from '../../lib/errores.js';
import type { ImagenDetectada } from '../../lib/imagen.js';
import type { PrismaClient } from '../../lib/prisma.js';
import { registrarAuditoria } from '../../lib/registrar-auditoria.js';
import type { ContextoPeticion } from '../auth/servicio.js';

import type { CambiosEmpresa, EmpresaPublica } from './esquemas.js';

/** Dirección pública del logo. La versión (parte aleatoria del nombre) hace que el navegador recargue al cambiarlo. */
export function urlPublicaDelLogo(clave: string | null): string | null {
  const version = versionDeClaveLogo(clave);
  return version ? `/empresa/logo?v=${version}` : null;
}

export function aEmpresaPublica(fila: Empresa): EmpresaPublica {
  return {
    nombre: fila.nombre,
    nit: fila.nit,
    telefono: fila.telefono,
    whatsapp: fila.whatsapp,
    direccion: fila.direccion,
    logoUrl: urlPublicaDelLogo(fila.logoUrl),
    monedaLocal: fila.monedaLocal,
    zonaHoraria: fila.zonaHoraria,
    textoPieRecibo: fila.textoPieRecibo,
    actualizadaEn: fila.actualizadaEn,
  };
}

export interface LogoParaServir extends LogoAbierto {
  mime: 'image/png' | 'image/jpeg';
}

export type ServicioEmpresa = ReturnType<typeof crearServicioEmpresa>;

const CAMPOS_EDITABLES = [
  'nombre',
  'nit',
  'telefono',
  'whatsapp',
  'direccion',
  'monedaLocal',
  'zonaHoraria',
  'textoPieRecibo',
] as const;

const sinEmpresa = () =>
  new ErrorApp(
    404,
    'NO_ENCONTRADO',
    'La empresa aún no está configurada. Ejecuta los datos iniciales (npm run db:seed).',
  );

export function crearServicioEmpresa({
  prisma,
  almacenamiento,
}: {
  prisma: PrismaClient;
  almacenamiento: Almacenamiento;
}) {
  return {
    async obtener(): Promise<EmpresaPublica> {
      const empresa = await prisma.empresa.findUnique({ where: { unica: true } });
      if (!empresa) throw sinEmpresa();
      return aEmpresaPublica(empresa);
    },

    /** Cambia solo los datos enviados; la bitácora guarda el antes y el después de lo que cambió. */
    async editar(
      cambios: CambiosEmpresa,
      actorId: string,
      contexto: ContextoPeticion,
    ): Promise<EmpresaPublica> {
      return prisma.$transaction(async (tx) => {
        const actual = await tx.empresa.findUnique({ where: { unica: true } });
        if (!actual) throw sinEmpresa();

        // El esquema de Zod ya impide `null` en los campos obligatorios (nombre, moneda, zona horaria).
        const datos: Prisma.EmpresaUpdateInput = {};
        const antes: Record<string, unknown> = {};
        const despues: Record<string, unknown> = {};
        for (const campo of CAMPOS_EDITABLES) {
          const nuevo = cambios[campo];
          if (nuevo === undefined || nuevo === actual[campo]) continue;
          Object.assign(datos, { [campo]: nuevo });
          antes[campo] = actual[campo];
          despues[campo] = nuevo;
        }
        if (Object.keys(datos).length === 0) return aEmpresaPublica(actual);

        const editada = await tx.empresa.update({ where: { id: actual.id }, data: datos });
        await registrarAuditoria(tx, {
          usuarioId: actorId,
          accion: 'empresa.editar',
          entidad: 'empresa',
          entidadId: actual.id,
          antes,
          despues,
          ip: contexto.ip,
          agenteUsuario: contexto.agenteUsuario,
        });
        return aEmpresaPublica(editada);
      });
    },

    /** Guarda el logo nuevo y lo deja como el activo. El anterior se conserva en disco. */
    async cambiarLogo(
      contenido: Buffer,
      imagen: ImagenDetectada,
      actorId: string,
      contexto: ContextoPeticion,
    ): Promise<EmpresaPublica> {
      const existente = await prisma.empresa.findUnique({ where: { unica: true } });
      if (!existente) throw sinEmpresa();

      const clave = await almacenamiento.guardarLogo(contenido, imagen.extension);
      try {
        const editada = await prisma.$transaction(async (tx) => {
          const empresa = await tx.empresa.update({
            where: { id: existente.id },
            data: { logoUrl: clave },
          });
          await registrarAuditoria(tx, {
            usuarioId: actorId,
            accion: 'empresa.cambiar_logo',
            entidad: 'empresa',
            entidadId: existente.id,
            antes: { logo: existente.logoUrl },
            despues: { logo: clave, tipo: imagen.mime, bytes: contenido.length },
            ip: contexto.ip,
            agenteUsuario: contexto.agenteUsuario,
          });
          return empresa;
        });
        return aEmpresaPublica(editada);
      } catch (error) {
        // Si no se pudo registrar el cambio, no queda un archivo huérfano.
        await almacenamiento.descartarLogo(clave);
        throw error;
      }
    },

    /** El logo activo listo para enviarse, o `null` si no hay. */
    async abrirLogo(): Promise<LogoParaServir | null> {
      const empresa = await prisma.empresa.findUnique({
        where: { unica: true },
        select: { logoUrl: true },
      });
      if (!empresa?.logoUrl) return null;
      const abierto = await almacenamiento.abrirLogo(empresa.logoUrl);
      if (!abierto) return null;
      return { ...abierto, mime: empresa.logoUrl.endsWith('.png') ? 'image/png' : 'image/jpeg' };
    },
  };
}
