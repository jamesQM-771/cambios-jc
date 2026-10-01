import { randomUUID } from 'node:crypto';

import type { Rol } from '@cambios-jc/shared';
import type { FastifyInstance } from 'fastify';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import { cerrarApp, configPrueba, crearAppPrueba } from '../../../test/ayudas.js';
import {
  abrirSesion,
  aislarAdministradores,
  aTexto,
  asegurarEmpresa,
  codigoDe,
  crearUsuarioDePrueba,
  cuerpoError,
  iniciarSesion,
  llamar,
  presente,
  tokenDe,
  type UsuarioDePrueba,
} from '../../../test/auth.js';
import { verificarContrasena } from '../../lib/contrasenas.js';
import { crearPrisma, type PrismaClient } from '../../lib/prisma.js';
import { crearServicioAuth } from '../auth/servicio.js';

import { crearServicioUsuarios } from './servicio.js';

let prisma: PrismaClient;
let app: FastifyInstance | undefined;

beforeAll(async () => {
  prisma = crearPrisma();
  await asegurarEmpresa(prisma);
});

afterAll(async () => {
  await prisma.$disconnect();
});

afterEach(async () => {
  await cerrarApp(app);
  app = undefined;
});

function nuevaApp(): FastifyInstance {
  app = crearAppPrueba({ sesionReal: true, prisma: crearPrisma() });
  return app;
}

const etiqueta = () => randomUUID().slice(0, 8);
const usuarioEnBase = (id: string) => prisma.usuario.findUniqueOrThrow({ where: { id } });
const auditoriaDe = (accion: string, entidadId: string) =>
  prisma.auditoria.findMany({ where: { accion, entidadId }, orderBy: { id: 'asc' } });

/** Un administrador con sesión abierta, listo para llamar a la API. */
async function administradorConSesion(): Promise<{ admin: UsuarioDePrueba; token: string }> {
  const admin = await crearUsuarioDePrueba(prisma, { rol: 'administrador' });
  return { admin, token: await abrirSesion(prisma, admin.id) };
}

async function sucursal(activa = true) {
  return prisma.sucursal.create({
    data: { nombre: `Sucursal-${randomUUID()}`, ciudad: 'Cúcuta', activa },
  });
}

interface UsuarioJson {
  id: string;
  nombre: string;
  login: string;
  rol: Rol;
  sucursalId: string | null;
  sucursalNombre: string | null;
  activo: boolean;
  tiene2fa: boolean;
  debeCambiarContrasena: boolean;
}

const DATOS_INTERNOS = /hashContrasena|secreto2fa|intentosFallidos|ultimoPaso2fa|\$argon2/;

describe('acceso a la API de usuarios', () => {
  const idCualquiera = randomUUID();
  const rutas: ['GET' | 'POST' | 'PATCH', string][] = [
    ['GET', '/usuarios'],
    ['GET', `/usuarios/${idCualquiera}`],
    ['POST', '/usuarios'],
    ['PATCH', `/usuarios/${idCualquiera}`],
    ['POST', `/usuarios/${idCualquiera}/desactivar`],
    ['POST', `/usuarios/${idCualquiera}/reactivar`],
    ['POST', `/usuarios/${idCualquiera}/restablecer-contrasena`],
    ['POST', `/usuarios/${idCualquiera}/reiniciar-2fa`],
    ['POST', `/usuarios/${idCualquiera}/cerrar-sesiones`],
    ['GET', '/sucursales'],
  ];

  it.each(rutas)('%s %s: sin sesión responde 401', async (metodo, url) => {
    const respuesta = await llamar(nuevaApp(), metodo, url);
    expect(respuesta.statusCode).toBe(401);
  });

  it.each(['vendedor', 'digitador'] as const)(
    'un %s recibe 403 en todas las rutas',
    async (rol) => {
      const usuario = await crearUsuarioDePrueba(prisma, { rol });
      const token = await abrirSesion(prisma, usuario.id);
      const api = nuevaApp();

      for (const [metodo, url] of rutas) {
        const respuesta = await llamar(api, metodo, url, { token });
        expect(respuesta.statusCode, `${metodo} ${url}`).toBe(403);
        expect(cuerpoError(respuesta).codigo).toBe('SIN_PERMISO');
      }
    },
  );
});

describe('crear usuario', () => {
  it('crea el usuario con contraseña temporal, sin 2FA y obligado a cambiarla', async () => {
    const { admin, token } = await administradorConSesion();
    const api = nuevaApp();
    const login = `nuevo.${etiqueta()}`;

    const respuesta = await llamar(api, 'POST', '/usuarios', {
      token,
      cuerpo: { nombre: '  Ana Vendedora ', login: login.toUpperCase(), rol: 'vendedor' },
    });

    expect(respuesta.statusCode).toBe(201);
    const cuerpo = respuesta.json<{ usuario: UsuarioJson; contrasenaTemporal: string }>();
    expect(cuerpo.usuario).toMatchObject({
      nombre: 'Ana Vendedora',
      login,
      rol: 'vendedor',
      sucursalId: null,
      activo: true,
      tiene2fa: false,
      debeCambiarContrasena: true,
    });
    expect(cuerpo.contrasenaTemporal).toMatch(/^[a-zA-Z2-9]{16}$/);
    expect(respuesta.body).not.toMatch(DATOS_INTERNOS);

    // La contraseña temporal sirve para entrar y obliga a cambiarla; se guarda solo su hash.
    const enBase = await usuarioEnBase(cuerpo.usuario.id);
    expect(enBase.hashContrasena.startsWith('$argon2id$')).toBe(true);
    expect(await verificarContrasena(enBase.hashContrasena, cuerpo.contrasenaTemporal)).toBe(true);
    const entrada = await iniciarSesion(api, login, cuerpo.contrasenaTemporal);
    expect(entrada.json<{ siguientePaso: string }>().siguientePaso).toBe('cambiar_contrasena');

    // En la bitácora queda quién lo creó, sin la contraseña.
    const [registro] = await auditoriaDe('usuario.crear', cuerpo.usuario.id);
    expect(registro?.usuarioId).toBe(admin.id);
    expect(registro?.despues).toMatchObject({ login, nombre: 'Ana Vendedora', rol: 'vendedor' });
    expect(aTexto(registro)).not.toContain(cuerpo.contrasenaTemporal);
  });

  it('acepta una sucursal activa y la devuelve con su nombre', async () => {
    const { token } = await administradorConSesion();
    const sede = await sucursal();

    const respuesta = await llamar(nuevaApp(), 'POST', '/usuarios', {
      token,
      cuerpo: {
        nombre: 'Luis Digitador',
        login: `dig.${etiqueta()}`,
        rol: 'digitador',
        sucursalId: sede.id,
      },
    });

    expect(respuesta.statusCode).toBe(201);
    expect(respuesta.json<{ usuario: UsuarioJson }>().usuario).toMatchObject({
      sucursalId: sede.id,
      sucursalNombre: sede.nombre,
    });
  });

  it('rechaza un usuario repetido, aunque cambien las mayúsculas', async () => {
    const { token } = await administradorConSesion();
    const existente = await crearUsuarioDePrueba(prisma);

    for (const login of [existente.login, existente.login.toUpperCase()]) {
      const respuesta = await llamar(nuevaApp(), 'POST', '/usuarios', {
        token,
        cuerpo: { nombre: 'Repetido Uno', login, rol: 'vendedor' },
      });
      expect(respuesta.statusCode, login).toBe(409);
      expect(cuerpoError(respuesta).codigo).toBe('LOGIN_EN_USO');
      await cerrarApp(app);
    }
  });

  it.each([
    ['muy corto', 'ab'],
    ['con espacios', 'juan perez'],
    ['con tildes', 'josé'],
    ['con arroba', 'juan@correo'],
    ['demasiado largo', 'a'.repeat(41)],
  ])('rechaza un usuario %s', async (_caso, login) => {
    const { token } = await administradorConSesion();

    const respuesta = await llamar(nuevaApp(), 'POST', '/usuarios', {
      token,
      cuerpo: { nombre: 'Nombre Valido', login, rol: 'vendedor' },
    });

    expect(respuesta.statusCode).toBe(400);
    const detalles = cuerpoError(respuesta).detalles as { campo: string }[];
    expect(detalles.map((d) => d.campo)).toContain('login');
  });

  it('rechaza un rol que no existe (supervisor y cumplimiento se descartaron)', async () => {
    const { token } = await administradorConSesion();
    for (const rol of ['supervisor', 'cumplimiento', 'dueno']) {
      const respuesta = await llamar(nuevaApp(), 'POST', '/usuarios', {
        token,
        cuerpo: { nombre: 'Nombre Valido', login: `x.${etiqueta()}`, rol },
      });
      expect(respuesta.statusCode, rol).toBe(400);
      await cerrarApp(app);
    }
  });

  it('rechaza una sucursal inexistente o inactiva', async () => {
    const { token } = await administradorConSesion();
    const inactiva = await sucursal(false);

    for (const sucursalId of [randomUUID(), inactiva.id]) {
      const respuesta = await llamar(nuevaApp(), 'POST', '/usuarios', {
        token,
        cuerpo: { nombre: 'Nombre Valido', login: `x.${etiqueta()}`, rol: 'vendedor', sucursalId },
      });
      expect(respuesta.statusCode, sucursalId).toBe(400);
      expect(JSON.stringify(cuerpoError(respuesta).detalles)).toContain('sucursalId');
      await cerrarApp(app);
    }
  });

  it('rechaza un nombre vacío', async () => {
    const { token } = await administradorConSesion();
    const respuesta = await llamar(nuevaApp(), 'POST', '/usuarios', {
      token,
      cuerpo: { nombre: ' ', login: `x.${etiqueta()}`, rol: 'vendedor' },
    });
    expect(respuesta.statusCode).toBe(400);
  });
});

describe('listar y consultar usuarios', () => {
  it('filtra por rol, estado y texto, y pagina; nunca devuelve datos internos', async () => {
    const { token } = await administradorConSesion();
    const marca = etiqueta();
    const crear = async (sufijo: string, rol: Rol, activo = true) => {
      const usuario = await crearUsuarioDePrueba(prisma, { rol, activo });
      await prisma.usuario.update({
        where: { id: usuario.id },
        data: { nombre: `Listado ${marca} ${sufijo}` },
      });
      return usuario;
    };
    await crear('A', 'vendedor');
    await crear('B', 'vendedor');
    await crear('C', 'digitador');
    await crear('D', 'vendedor', false);
    const api = nuevaApp();
    const consultar = (consulta: string) =>
      llamar(api, 'GET', '/usuarios', { token, consulta: `busqueda=${marca}&${consulta}` });

    const todos = await consultar('porPagina=100');
    const cuerpo = todos.json<{ usuarios: UsuarioJson[]; total: number }>();
    expect(cuerpo.total).toBe(4);
    expect(cuerpo.usuarios.map((u) => u.nombre)).toEqual([
      `Listado ${marca} A`,
      `Listado ${marca} B`,
      `Listado ${marca} C`,
      `Listado ${marca} D`,
    ]);
    expect(todos.body).not.toMatch(DATOS_INTERNOS);

    expect((await consultar('rol=digitador')).json<{ total: number }>().total).toBe(1);
    expect((await consultar('activo=false')).json<{ total: number }>().total).toBe(1);
    expect((await consultar('activo=true&rol=vendedor')).json<{ total: number }>().total).toBe(2);

    const segunda = (await consultar('porPagina=3&pagina=2')).json<{
      usuarios: UsuarioJson[];
      total: number;
      pagina: number;
      porPagina: number;
    }>();
    expect(segunda).toMatchObject({ total: 4, pagina: 2, porPagina: 3 });
    expect(segunda.usuarios).toHaveLength(1);
  });

  it('la búsqueda ignora mayúsculas y encuentra por usuario', async () => {
    const { token } = await administradorConSesion();
    const usuario = await crearUsuarioDePrueba(prisma);

    const respuesta = await llamar(nuevaApp(), 'GET', '/usuarios', {
      token,
      consulta: `busqueda=${usuario.login.toUpperCase()}`,
    });

    expect(respuesta.json<{ usuarios: UsuarioJson[] }>().usuarios.map((u) => u.id)).toEqual([
      usuario.id,
    ]);
  });

  it('rechaza parámetros inválidos', async () => {
    const { token } = await administradorConSesion();
    const api = nuevaApp();
    for (const consulta of ['porPagina=101', 'pagina=0', 'rol=supervisor', 'activo=quizas']) {
      const respuesta = await llamar(api, 'GET', '/usuarios', { token, consulta });
      expect(respuesta.statusCode, consulta).toBe(400);
    }
  });

  it('el detalle devuelve el usuario; 404 si no existe; 400 si el id no es válido', async () => {
    const { token } = await administradorConSesion();
    const usuario = await crearUsuarioDePrueba(prisma, { rol: 'digitador' });
    const api = nuevaApp();

    const encontrado = await llamar(api, 'GET', `/usuarios/${usuario.id}`, { token });
    const noExiste = await llamar(api, 'GET', `/usuarios/${randomUUID()}`, { token });
    const malId = await llamar(api, 'GET', '/usuarios/no-es-un-id', { token });

    expect(encontrado.json<{ usuario: UsuarioJson }>().usuario).toMatchObject({
      id: usuario.id,
      login: usuario.login,
      rol: 'digitador',
    });
    expect(encontrado.body).not.toMatch(DATOS_INTERNOS);
    expect(noExiste.statusCode).toBe(404);
    expect(malId.statusCode).toBe(400);
  });
});

describe('editar usuario', () => {
  it('cambia nombre, rol y sucursal y deja el antes y el después solo de lo que cambió', async () => {
    const { admin, token } = await administradorConSesion();
    const usuario = await crearUsuarioDePrueba(prisma, { rol: 'vendedor' });
    const sede = await sucursal();
    const api = nuevaApp();

    const respuesta = await llamar(api, 'PATCH', `/usuarios/${usuario.id}`, {
      token,
      cuerpo: { nombre: 'Nombre Nuevo', rol: 'digitador', sucursalId: sede.id },
    });

    expect(respuesta.statusCode).toBe(200);
    expect(respuesta.json<{ usuario: UsuarioJson }>().usuario).toMatchObject({
      nombre: 'Nombre Nuevo',
      rol: 'digitador',
      sucursalId: sede.id,
      sucursalNombre: sede.nombre,
      login: usuario.login,
    });
    const [registro] = await auditoriaDe('usuario.editar', usuario.id);
    expect(registro?.usuarioId).toBe(admin.id);
    expect(registro?.antes).toEqual({
      nombre: 'Usuario de prueba',
      rol: 'vendedor',
      sucursalId: null,
    });
    expect(registro?.despues).toEqual({
      nombre: 'Nombre Nuevo',
      rol: 'digitador',
      sucursalId: sede.id,
    });

    // Quitar la sucursal (null) también es un cambio.
    const sinSucursal = await llamar(api, 'PATCH', `/usuarios/${usuario.id}`, {
      token,
      cuerpo: { sucursalId: null },
    });
    expect(sinSucursal.json<{ usuario: UsuarioJson }>().usuario.sucursalId).toBeNull();
  });

  it('un cambio que no cambia nada no deja registro en la bitácora', async () => {
    const { token } = await administradorConSesion();
    const usuario = await crearUsuarioDePrueba(prisma, { rol: 'vendedor' });

    const respuesta = await llamar(nuevaApp(), 'PATCH', `/usuarios/${usuario.id}`, {
      token,
      cuerpo: { rol: 'vendedor', nombre: 'Usuario de prueba' },
    });

    expect(respuesta.statusCode).toBe(200);
    expect(await auditoriaDe('usuario.editar', usuario.id)).toHaveLength(0);
  });

  it('rechaza un cuerpo vacío, datos inválidos y un usuario que no existe', async () => {
    const { token } = await administradorConSesion();
    const usuario = await crearUsuarioDePrueba(prisma);
    const api = nuevaApp();

    const vacio = await llamar(api, 'PATCH', `/usuarios/${usuario.id}`, { token, cuerpo: {} });
    const rolMalo = await llamar(api, 'PATCH', `/usuarios/${usuario.id}`, {
      token,
      cuerpo: { rol: 'supervisor' },
    });
    const noExiste = await llamar(api, 'PATCH', `/usuarios/${randomUUID()}`, {
      token,
      cuerpo: { nombre: 'Otro Nombre' },
    });

    expect(vacio.statusCode).toBe(400);
    expect(rolMalo.statusCode).toBe(400);
    expect(noExiste.statusCode).toBe(404);
  });

  it('el cambio de rol se aplica en la siguiente petición del usuario, sin volver a entrar', async () => {
    const { token } = await administradorConSesion();
    const vendedor = await crearUsuarioDePrueba(prisma, { rol: 'vendedor' });
    const tokenVendedor = await abrirSesion(prisma, vendedor.id);
    const api = nuevaApp();

    const antes = await llamar(api, 'GET', '/usuarios', { token: tokenVendedor });
    await llamar(api, 'PATCH', `/usuarios/${vendedor.id}`, {
      token,
      cuerpo: { rol: 'administrador' },
    });
    const despues = await llamar(api, 'GET', '/usuarios', { token: tokenVendedor });

    expect(antes.statusCode).toBe(403);
    expect(despues.statusCode).toBe(200);
  });

  it('el único administrador activo no puede quitarse el rol', async () => {
    const { admin, token } = await administradorConSesion();
    const reactivar = await aislarAdministradores(prisma, [admin.id]);
    try {
      const respuesta = await llamar(nuevaApp(), 'PATCH', `/usuarios/${admin.id}`, {
        token,
        cuerpo: { rol: 'vendedor' },
      });

      expect(respuesta.statusCode).toBe(409);
      expect(cuerpoError(respuesta).codigo).toBe('ULTIMO_ADMINISTRADOR');
      expect((await usuarioEnBase(admin.id)).rol).toBe('administrador');
    } finally {
      await reactivar();
    }
  });

  it('con otro administrador activo sí puede quitarse el rol', async () => {
    const { admin, token } = await administradorConSesion();
    const otro = await crearUsuarioDePrueba(prisma, { rol: 'administrador' });
    const reactivar = await aislarAdministradores(prisma, [admin.id, otro.id]);
    try {
      const respuesta = await llamar(nuevaApp(), 'PATCH', `/usuarios/${admin.id}`, {
        token,
        cuerpo: { rol: 'vendedor' },
      });

      expect(respuesta.statusCode).toBe(200);
      expect((await usuarioEnBase(admin.id)).rol).toBe('vendedor');
    } finally {
      await reactivar();
    }
  });

  it('cambiar el nombre del único administrador está permitido', async () => {
    const { admin, token } = await administradorConSesion();
    const reactivar = await aislarAdministradores(prisma, [admin.id]);
    try {
      const respuesta = await llamar(nuevaApp(), 'PATCH', `/usuarios/${admin.id}`, {
        token,
        cuerpo: { nombre: 'Dueño Principal' },
      });
      expect(respuesta.statusCode).toBe(200);
    } finally {
      await reactivar();
    }
  });
});

describe('desactivar y reactivar', () => {
  it('desactiva sin borrar, cierra sus sesiones e impide que entre; reactivar lo devuelve', async () => {
    const { admin, token } = await administradorConSesion();
    const usuario = await crearUsuarioDePrueba(prisma, { rol: 'vendedor' });
    const tokenUsuario = await abrirSesion(prisma, usuario.id);
    const api = nuevaApp();

    const desactivar = await llamar(api, 'POST', `/usuarios/${usuario.id}/desactivar`, { token });

    expect(desactivar.statusCode).toBe(200);
    expect(desactivar.json<{ usuario: UsuarioJson }>().usuario.activo).toBe(false);
    expect((await usuarioEnBase(usuario.id)).activo).toBe(false);
    const conSesionVieja = await llamar(api, 'GET', '/auth/yo', { token: tokenUsuario });
    expect(conSesionVieja.statusCode).toBe(401);
    const intento = await iniciarSesion(api, usuario.login, usuario.contrasena);
    expect(intento.statusCode).toBe(401);
    const [registro] = await auditoriaDe('usuario.desactivar', usuario.id);
    expect(registro?.usuarioId).toBe(admin.id);
    expect(registro?.despues).toMatchObject({ activo: false, sesionesCerradas: 1 });

    // Repetir la acción no hace nada nuevo.
    const otraVez = await llamar(api, 'POST', `/usuarios/${usuario.id}/desactivar`, { token });
    expect(otraVez.statusCode).toBe(200);
    expect(await auditoriaDe('usuario.desactivar', usuario.id)).toHaveLength(1);

    const reactivar = await llamar(api, 'POST', `/usuarios/${usuario.id}/reactivar`, { token });
    expect(reactivar.json<{ usuario: UsuarioJson }>().usuario.activo).toBe(true);
    const entra = await iniciarSesion(api, usuario.login, usuario.contrasena);
    expect(entra.statusCode).toBe(200);
    expect(await auditoriaDe('usuario.reactivar', usuario.id)).toHaveLength(1);
    const repetida = await llamar(api, 'POST', `/usuarios/${usuario.id}/reactivar`, { token });
    expect(repetida.statusCode).toBe(200);
    expect(await auditoriaDe('usuario.reactivar', usuario.id)).toHaveLength(1);
  });

  it('un administrador nunca puede desactivarse a sí mismo, aunque haya otros', async () => {
    const { admin, token } = await administradorConSesion();
    await crearUsuarioDePrueba(prisma, { rol: 'administrador' });

    const respuesta = await llamar(nuevaApp(), 'POST', `/usuarios/${admin.id}/desactivar`, {
      token,
    });

    expect(respuesta.statusCode).toBe(409);
    expect(cuerpoError(respuesta).codigo).toBe('NO_PUEDES_DESACTIVARTE');
    expect((await usuarioEnBase(admin.id)).activo).toBe(true);
  });

  it('un administrador puede desactivar a otro si queda al menos uno activo', async () => {
    const { admin, token } = await administradorConSesion();
    const otro = await crearUsuarioDePrueba(prisma, { rol: 'administrador' });
    const reactivar = await aislarAdministradores(prisma, [admin.id, otro.id]);
    try {
      const respuesta = await llamar(nuevaApp(), 'POST', `/usuarios/${otro.id}/desactivar`, {
        token,
      });
      expect(respuesta.statusCode).toBe(200);
    } finally {
      await reactivar();
    }
  });

  it('el servicio se niega a desactivar al único administrador activo', async () => {
    const unico = await crearUsuarioDePrueba(prisma, { rol: 'administrador' });
    const otroUsuario = await crearUsuarioDePrueba(prisma, { rol: 'vendedor' });
    const servicio = crearServicioUsuarios({
      prisma,
      auth: crearServicioAuth({ prisma, config: configPrueba() }),
    });
    const reactivar = await aislarAdministradores(prisma, [unico.id]);
    try {
      await expect(
        servicio.desactivar(unico.id, { id: otroUsuario.id }, { ip: null, agenteUsuario: null }),
      ).rejects.toMatchObject({ codigo: 'ULTIMO_ADMINISTRADOR' });
      expect((await usuarioEnBase(unico.id)).activo).toBe(true);
    } finally {
      await reactivar();
    }
  });

  it('dos administradores que se desactivan mutuamente a la vez no dejan el sistema sin administradores', async () => {
    const a = await crearUsuarioDePrueba(prisma, { rol: 'administrador' });
    const b = await crearUsuarioDePrueba(prisma, { rol: 'administrador' });
    const tokenA = await abrirSesion(prisma, a.id);
    const tokenB = await abrirSesion(prisma, b.id);
    const reactivar = await aislarAdministradores(prisma, [a.id, b.id]);
    try {
      const api = nuevaApp();

      const [deAaB, deBaA] = await Promise.all([
        llamar(api, 'POST', `/usuarios/${b.id}/desactivar`, { token: tokenA }),
        llamar(api, 'POST', `/usuarios/${a.id}/desactivar`, { token: tokenB }),
      ]);

      const estados = [deAaB.statusCode, deBaA.statusCode];
      expect(estados.filter((estado) => estado === 200)).toHaveLength(1);
      // La otra se rechaza por la regla (409) o porque su sesión ya se había cerrado (401).
      expect(estados.filter((estado) => estado === 409 || estado === 401)).toHaveLength(1);
      const activos = await prisma.usuario.count({
        where: { id: { in: [a.id, b.id] }, activo: true },
      });
      expect(activos).toBe(1);
    } finally {
      await reactivar();
    }
  });

  it('un usuario que no existe responde 404', async () => {
    const { token } = await administradorConSesion();
    const api = nuevaApp();
    for (const accion of ['desactivar', 'reactivar']) {
      const respuesta = await llamar(api, 'POST', `/usuarios/${randomUUID()}/${accion}`, { token });
      expect(respuesta.statusCode, accion).toBe(404);
    }
  });
});

describe('restablecer contraseña', () => {
  it('da una contraseña temporal nueva, cierra sesiones, levanta el bloqueo y conserva el 2FA', async () => {
    const { admin, token } = await administradorConSesion();
    const usuario = await crearUsuarioDePrueba(prisma, { con2fa: true });
    const tokenUsuario = await abrirSesion(prisma, usuario.id);
    await prisma.usuario.update({
      where: { id: usuario.id },
      data: { intentosFallidos: 3, bloqueadoHasta: new Date(Date.now() + 600_000) },
    });
    const api = nuevaApp();

    const respuesta = await llamar(api, 'POST', `/usuarios/${usuario.id}/restablecer-contrasena`, {
      token,
    });

    expect(respuesta.statusCode).toBe(200);
    const { contrasenaTemporal, usuario: devuelto } = respuesta.json<{
      contrasenaTemporal: string;
      usuario: UsuarioJson;
    }>();
    expect(contrasenaTemporal).toMatch(/^[a-zA-Z2-9]{16}$/);
    expect(devuelto).toMatchObject({ debeCambiarContrasena: true, tiene2fa: true });
    expect(respuesta.body).not.toMatch(DATOS_INTERNOS);

    const enBase = await usuarioEnBase(usuario.id);
    expect(enBase).toMatchObject({ intentosFallidos: 0, bloqueadoHasta: null, tiene2fa: true });
    expect((await llamar(api, 'GET', '/auth/yo', { token: tokenUsuario })).statusCode).toBe(401);

    // La contraseña anterior deja de servir; la temporal sí, y obliga a cambiarla.
    expect((await iniciarSesion(api, usuario.login, usuario.contrasena)).statusCode).toBe(401);
    const entrada = await iniciarSesion(api, usuario.login, contrasenaTemporal);
    expect(entrada.statusCode).toBe(200);
    expect(entrada.json<{ siguientePaso: string }>().siguientePaso).toBe('cambiar_contrasena');
    expect(tokenDe(entrada)).toBeDefined();

    const registros = await auditoriaDe('usuario.restablecer_contrasena', usuario.id);
    expect(registros).toHaveLength(1);
    expect(registros[0]?.usuarioId).toBe(admin.id);
    expect(aTexto(registros)).not.toContain(contrasenaTemporal);
    expect(aTexto(registros)).not.toContain(usuario.contrasena);
  });

  it('un administrador puede restablecer su propia contraseña; sus sesiones se cierran', async () => {
    const { admin, token } = await administradorConSesion();
    const api = nuevaApp();

    const respuesta = await llamar(api, 'POST', `/usuarios/${admin.id}/restablecer-contrasena`, {
      token,
    });

    expect(respuesta.statusCode).toBe(200);
    expect((await llamar(api, 'GET', '/auth/yo', { token })).statusCode).toBe(401);
  });

  it('un usuario que no existe responde 404', async () => {
    const { token } = await administradorConSesion();
    const respuesta = await llamar(
      nuevaApp(),
      'POST',
      `/usuarios/${randomUUID()}/restablecer-contrasena`,
      { token },
    );
    expect(respuesta.statusCode).toBe(404);
  });
});

describe('reiniciar el 2FA y cerrar sesiones', () => {
  it('reiniciar el 2FA borra el secreto y lo obliga a configurarlo de nuevo', async () => {
    const { admin, token } = await administradorConSesion();
    const usuario = await crearUsuarioDePrueba(prisma, { con2fa: true });
    const api = nuevaApp();

    const respuesta = await llamar(api, 'POST', `/usuarios/${usuario.id}/reiniciar-2fa`, { token });

    expect(respuesta.statusCode).toBe(200);
    expect(respuesta.json()).toEqual({ ok: true });
    expect(await usuarioEnBase(usuario.id)).toMatchObject({ tiene2fa: false, secreto2fa: null });
    const entrada = await iniciarSesion(api, usuario.login, usuario.contrasena);
    expect(entrada.json<{ siguientePaso: string }>().siguientePaso).toBe('configurar_2fa');
    const [registro] = await auditoriaDe('usuario.reiniciar_2fa', usuario.id);
    expect(registro?.usuarioId).toBe(admin.id);
    // El código del secreto viejo ya no abre nada.
    const secretoViejo = presente(usuario.secreto);
    const intento = await llamar(api, 'POST', '/auth/2fa/verificar', {
      token: tokenDe(entrada),
      cuerpo: { codigo: await codigoDe(secretoViejo) },
    });
    expect(intento.statusCode).toBe(409);
  });

  it('cerrar sesiones revoca todas las del usuario y no toca las de los demás', async () => {
    const { token } = await administradorConSesion();
    const usuario = await crearUsuarioDePrueba(prisma);
    const tokens = [await abrirSesion(prisma, usuario.id), await abrirSesion(prisma, usuario.id)];
    const api = nuevaApp();

    const respuesta = await llamar(api, 'POST', `/usuarios/${usuario.id}/cerrar-sesiones`, {
      token,
    });

    expect(respuesta.json()).toEqual({ sesionesCerradas: 2 });
    for (const t of tokens) {
      expect((await llamar(api, 'GET', '/auth/yo', { token: t })).statusCode).toBe(401);
    }
    expect((await llamar(api, 'GET', '/auth/yo', { token })).statusCode).toBe(200);
  });

  it('un usuario que no existe responde 404', async () => {
    const { token } = await administradorConSesion();
    const api = nuevaApp();
    for (const accion of ['reiniciar-2fa', 'cerrar-sesiones']) {
      const respuesta = await llamar(api, 'POST', `/usuarios/${randomUUID()}/${accion}`, { token });
      expect(respuesta.statusCode, accion).toBe(404);
    }
  });
});

describe('sucursales', () => {
  it('lista solo las activas, con sus datos básicos', async () => {
    const { token } = await administradorConSesion();
    const activa = await sucursal();
    const inactiva = await sucursal(false);

    const respuesta = await llamar(nuevaApp(), 'GET', '/sucursales', { token });

    expect(respuesta.statusCode).toBe(200);
    const { sucursales } = respuesta.json<{
      sucursales: { id: string; nombre: string; ciudad: string }[];
    }>();
    expect(sucursales).toContainEqual({ id: activa.id, nombre: activa.nombre, ciudad: 'Cúcuta' });
    expect(sucursales.map((s) => s.id)).not.toContain(inactiva.id);
  });
});

describe('usuario en minúsculas', () => {
  it('el acceso no distingue mayúsculas del usuario', async () => {
    const usuario = await crearUsuarioDePrueba(prisma);
    const respuesta = await iniciarSesion(
      nuevaApp(),
      usuario.login.toUpperCase(),
      usuario.contrasena,
    );
    expect(respuesta.statusCode).toBe(200);
  });

  it('la base de datos rechaza un usuario con mayúsculas', async () => {
    await expect(
      prisma.usuario.create({
        data: {
          nombre: 'Prueba',
          login: `MAYUS-${etiqueta()}`,
          hashContrasena: 'x',
          rol: 'vendedor',
        },
      }),
    ).rejects.toThrow();
  });
});
