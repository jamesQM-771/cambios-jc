import { randomUUID } from 'node:crypto';
import { access, mkdtemp, readdir, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { FastifyInstance } from 'fastify';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import { cerrarApp, crearAppPrueba } from '../../../test/ayudas.js';
import {
  abrirSesion,
  asegurarEmpresa,
  crearUsuarioDePrueba,
  cuerpoError,
  llamar,
  presente,
} from '../../../test/auth.js';
import {
  formularioConArchivos,
  formularioLogo,
  jpegDePrueba,
  pngDePrueba,
} from '../../../test/imagenes.js';
import { crearPrisma, type PrismaClient } from '../../lib/prisma.js';

let prisma: PrismaClient;
let app: FastifyInstance | undefined;
let carpeta: string;
let token: string;
let adminId: string;
let original: Awaited<ReturnType<typeof empresaEnBase>>;

const empresaEnBase = () => prisma.empresa.findUniqueOrThrow({ where: { unica: true } });
const archivosDelLogo = async () =>
  (await readdir(join(carpeta, 'empresa')).catch(() => [])).sort();

beforeAll(async () => {
  prisma = crearPrisma();
  await asegurarEmpresa(prisma);
  original = await empresaEnBase();
  carpeta = await mkdtemp(join(tmpdir(), 'cambios-jc-logos-'));
  const admin = await crearUsuarioDePrueba(prisma, { rol: 'administrador' });
  adminId = admin.id;
  token = await abrirSesion(prisma, admin.id);
});

afterAll(async () => {
  // La empresa es una sola fila compartida: se deja como estaba para no afectar otras pruebas.
  await prisma.empresa.update({
    where: { unica: true },
    data: {
      nombre: original.nombre,
      nit: original.nit,
      telefono: original.telefono,
      whatsapp: original.whatsapp,
      direccion: original.direccion,
      logoUrl: original.logoUrl,
      monedaLocal: original.monedaLocal,
      zonaHoraria: original.zonaHoraria,
      textoPieRecibo: original.textoPieRecibo,
    },
  });
  await prisma.$disconnect();
  await rm(carpeta, { recursive: true, force: true });
});

afterEach(async () => {
  await cerrarApp(app);
  app = undefined;
});

function nuevaApp(): FastifyInstance {
  app = crearAppPrueba({
    sesionReal: true,
    prisma: crearPrisma(),
    config: { CARPETA_SUBIDAS: carpeta },
  });
  return app;
}

/** Sube un logo como administrador (el formulario se arma una sola vez: cuerpo y cabecera comparten límite). */
function subirLogo(api: FastifyInstance, nombre: string, tipo: string, contenido: Buffer) {
  const formulario = formularioLogo(nombre, tipo, contenido);
  return api.inject({
    method: 'POST',
    url: '/empresa/logo',
    payload: formulario.payload,
    headers: { ...formulario.headers, cookie: `cambios_sesion=${token}` },
  });
}

const accionesDe = (accion: string, entidadId: string) =>
  prisma.auditoria.findMany({ where: { accion, entidadId }, orderBy: { id: 'asc' } });

interface EmpresaJson {
  nombre: string;
  nit: string | null;
  telefono: string | null;
  whatsapp: string | null;
  direccion: string | null;
  logoUrl: string | null;
  monedaLocal: string;
  zonaHoraria: string;
  textoPieRecibo: string | null;
  actualizadaEn: string;
}

describe('acceso a la API de empresa', () => {
  const rutas: ['GET' | 'POST' | 'PATCH', string][] = [
    ['GET', '/empresa'],
    ['PATCH', '/empresa'],
    ['POST', '/empresa/logo'],
  ];

  it.each(rutas)('%s %s: sin sesión responde 401', async (metodo, url) => {
    expect((await llamar(nuevaApp(), metodo, url)).statusCode).toBe(401);
  });

  it.each(['vendedor', 'digitador'] as const)('un %s recibe 403', async (rol) => {
    const usuario = await crearUsuarioDePrueba(prisma, { rol });
    const tokenUsuario = await abrirSesion(prisma, usuario.id);
    const api = nuevaApp();

    for (const [metodo, url] of rutas) {
      const respuesta = await llamar(api, metodo, url, { token: tokenUsuario });
      expect(respuesta.statusCode, `${metodo} ${url}`).toBe(403);
    }
  });
});

describe('GET /empresa', () => {
  it('devuelve los datos de la empresa sin datos internos', async () => {
    const respuesta = await llamar(nuevaApp(), 'GET', '/empresa', { token });

    expect(respuesta.statusCode).toBe(200);
    const { empresa } = respuesta.json<{ empresa: EmpresaJson }>();
    const enBase = await empresaEnBase();
    expect(empresa).toMatchObject({
      nombre: enBase.nombre,
      monedaLocal: enBase.monedaLocal,
      zonaHoraria: enBase.zonaHoraria,
    });
    expect(Object.keys(empresa).sort()).toEqual(
      [
        'actualizadaEn',
        'direccion',
        'logoUrl',
        'monedaLocal',
        'nit',
        'nombre',
        'telefono',
        'textoPieRecibo',
        'whatsapp',
        'zonaHoraria',
      ].sort(),
    );
  });
});

describe('PATCH /empresa', () => {
  it('cambia los datos enviados y deja el antes y el después solo de lo que cambió', async () => {
    const antes = await empresaEnBase();
    const nombre = `Casa de Cambio ${randomUUID().slice(0, 6)}`;
    const api = nuevaApp();

    const respuesta = await llamar(api, 'PATCH', '/empresa', {
      token,
      cuerpo: {
        nombre: `  ${nombre}  `,
        nit: '900.123.456-7',
        telefono: '+57 300 123 4567',
        whatsapp: '3001234567',
        direccion: 'Avenida 0 # 10-20, Cúcuta',
        monedaLocal: 'COP',
        zonaHoraria: 'America/Bogota',
        textoPieRecibo: 'Gracias por su confianza',
      },
    });

    expect(respuesta.statusCode).toBe(200);
    expect(respuesta.json<{ empresa: EmpresaJson }>().empresa).toMatchObject({
      nombre,
      nit: '900.123.456-7',
      telefono: '+57 300 123 4567',
      whatsapp: '3001234567',
      direccion: 'Avenida 0 # 10-20, Cúcuta',
      textoPieRecibo: 'Gracias por su confianza',
    });
    const despues = await empresaEnBase();
    expect(despues.actualizadaEn.getTime()).toBeGreaterThan(antes.actualizadaEn.getTime());

    const registros = await accionesDe('empresa.editar', antes.id);
    const registro = registros.at(-1);
    expect(registro?.usuarioId).toBe(adminId);
    expect(registro?.antes).toMatchObject({ nombre: antes.nombre });
    expect(registro?.despues).toMatchObject({ nombre, nit: '900.123.456-7' });
    // Solo aparece lo que cambió: moneda y zona horaria eran iguales.
    expect(Object.keys(registro?.despues as object)).not.toContain('monedaLocal');
    expect(Object.keys(registro?.despues as object)).not.toContain('zonaHoraria');
  });

  it('un texto vacío o null borra el dato opcional', async () => {
    const api = nuevaApp();
    await llamar(api, 'PATCH', '/empresa', {
      token,
      cuerpo: { nit: '900.123.456-7', direccion: 'Calle 1' },
    });

    const respuesta = await llamar(api, 'PATCH', '/empresa', {
      token,
      cuerpo: { nit: '', direccion: null },
    });

    expect(respuesta.json<{ empresa: EmpresaJson }>().empresa).toMatchObject({
      nit: null,
      direccion: null,
    });
    const registro = (await accionesDe('empresa.editar', (await empresaEnBase()).id)).at(-1);
    expect(registro?.antes).toEqual({ nit: '900.123.456-7', direccion: 'Calle 1' });
    expect(registro?.despues).toEqual({ nit: null, direccion: null });
  });

  it('un cambio que no cambia nada no deja registro en la bitácora', async () => {
    const actual = await empresaEnBase();
    const antes = (await accionesDe('empresa.editar', actual.id)).length;

    const respuesta = await llamar(nuevaApp(), 'PATCH', '/empresa', {
      token,
      cuerpo: { nombre: actual.nombre, monedaLocal: actual.monedaLocal },
    });

    expect(respuesta.statusCode).toBe(200);
    expect((await accionesDe('empresa.editar', actual.id)).length).toBe(antes);
  });

  it.each([
    ['nombre vacío', { nombre: ' ' }],
    ['nombre demasiado largo', { nombre: 'a'.repeat(101) }],
    ['nombre null', { nombre: null }],
    ['moneda no soportada', { monedaLocal: 'EUR' }],
    ['zona horaria inexistente', { zonaHoraria: 'Mars/Phobos' }],
    ['teléfono con letras', { telefono: 'llamar-ya' }],
    ['WhatsApp con letras', { whatsapp: 'abc' }],
    ['NIT muy corto', { nit: '12' }],
    ['NIT con letras', { nit: 'abc-def-gh' }],
    ['texto al pie demasiado largo', { textoPieRecibo: 'x'.repeat(301) }],
    ['cuerpo vacío', {}],
  ])('rechaza %s', async (_caso, cuerpo) => {
    const antes = await empresaEnBase();

    const respuesta = await llamar(nuevaApp(), 'PATCH', '/empresa', { token, cuerpo });

    expect(respuesta.statusCode).toBe(400);
    expect(cuerpoError(respuesta).codigo).toBe('VALIDACION_FALLIDA');
    expect((await empresaEnBase()).actualizadaEn).toEqual(antes.actualizadaEn);
  });

  it('el logo no se puede cambiar por esta ruta (los campos desconocidos se ignoran)', async () => {
    const antes = await empresaEnBase();

    const respuesta = await llamar(nuevaApp(), 'PATCH', '/empresa', {
      token,
      cuerpo: { textoPieRecibo: 'Pie de prueba', logoUrl: '../../etc/passwd', id: randomUUID() },
    });

    expect(respuesta.statusCode).toBe(200);
    const despues = await empresaEnBase();
    expect(despues.logoUrl).toBe(antes.logoUrl);
    expect(despues.id).toBe(antes.id);
  });
});

describe('logo de la empresa', () => {
  it('sube un PNG, lo guarda con nombre del servidor y lo sirve igual, sin sesión', async () => {
    const contenido = pngDePrueba(500);
    const antes = await archivosDelLogo();
    const api = nuevaApp();

    const subida = await subirLogo(api, 'mi-logo.png', 'image/png', contenido);

    expect(subida.statusCode).toBe(200);
    const { empresa } = subida.json<{ empresa: EmpresaJson }>();
    expect(empresa.logoUrl).toMatch(/^\/empresa\/logo\?v=[0-9a-f]{32}$/);
    const enBase = await empresaEnBase();
    const clave = presente(enBase.logoUrl, 'la clave del logo');
    expect(clave).toMatch(/^empresa\/logo-[0-9a-f]{32}\.png$/);
    expect(await readFile(join(carpeta, ...clave.split('/')))).toEqual(contenido);
    expect((await archivosDelLogo()).length).toBe(antes.length + 1);

    // Se descarga sin iniciar sesión.
    const descarga = await api.inject({ method: 'GET', url: '/empresa/logo' });
    expect(descarga.statusCode).toBe(200);
    expect(descarga.headers['content-type']).toBe('image/png');
    expect(descarga.rawPayload).toEqual(contenido);
    expect(descarga.headers['cross-origin-resource-policy']).toBe('cross-origin');
    expect(descarga.headers['x-content-type-options']).toBe('nosniff');
    expect(descarga.headers['cache-control']).toContain('public');

    const registro = (await accionesDe('empresa.cambiar_logo', enBase.id)).at(-1);
    expect(registro?.usuarioId).toBe(adminId);
    expect(registro?.despues).toMatchObject({
      logo: clave,
      tipo: 'image/png',
      bytes: contenido.length,
    });
  });

  it('un JPEG se guarda como .jpg y se sirve como image/jpeg aunque el nombre diga .png', async () => {
    const contenido = jpegDePrueba(300);
    const api = nuevaApp();

    const subida = await subirLogo(api, 'parece.png', 'image/png', contenido);

    expect(subida.statusCode).toBe(200);
    expect(presente((await empresaEnBase()).logoUrl)).toMatch(/\.jpg$/);
    const descarga = await api.inject({ method: 'GET', url: '/empresa/logo' });
    expect(descarga.headers['content-type']).toBe('image/jpeg');
    expect(descarga.rawPayload).toEqual(contenido);
  });

  it('reemplazar el logo cambia el activo y conserva el archivo anterior en disco', async () => {
    const api = nuevaApp();
    const subir = (contenido: Buffer) => subirLogo(api, 'logo.png', 'image/png', contenido);
    const primero = pngDePrueba(100);
    const segundo = pngDePrueba(200);

    const a = (await subir(primero)).json<{ empresa: EmpresaJson }>().empresa.logoUrl;
    const claveA = presente((await empresaEnBase()).logoUrl);
    const b = (await subir(segundo)).json<{ empresa: EmpresaJson }>().empresa.logoUrl;
    const claveB = presente((await empresaEnBase()).logoUrl);

    expect(a).not.toBe(b);
    expect(claveA).not.toBe(claveB);
    await expect(access(join(carpeta, ...claveA.split('/')))).resolves.toBeUndefined();
    expect((await api.inject({ method: 'GET', url: '/empresa/logo' })).rawPayload).toEqual(segundo);
  });

  it('/auth/yo muestra la misma dirección del logo', async () => {
    const api = nuevaApp();
    const yo = await llamar(api, 'GET', '/auth/yo', { token });
    const empresa = await llamar(api, 'GET', '/empresa', { token });

    const esperado = empresa.json<{ empresa: EmpresaJson }>().empresa.logoUrl;
    expect(esperado).not.toBeNull();
    expect(yo.json<{ empresa: EmpresaJson }>().empresa.logoUrl).toBe(esperado);
  });

  describe('rechazos', () => {
    async function intentar(formulario: { payload: Buffer; headers: Record<string, string> }) {
      const antes = await empresaEnBase();
      const archivosAntes = await archivosDelLogo();
      const respuesta = await nuevaApp().inject({
        method: 'POST',
        url: '/empresa/logo',
        payload: formulario.payload,
        headers: { ...formulario.headers, cookie: `cambios_sesion=${token}` },
      });
      // Un rechazo no cambia el logo ni deja archivos nuevos.
      expect((await empresaEnBase()).logoUrl).toBe(antes.logoUrl);
      expect(await archivosDelLogo()).toEqual(archivosAntes);
      return respuesta;
    }

    it.each([
      [
        'un SVG',
        'logo.svg',
        'image/svg+xml',
        Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>'),
      ],
      ['texto que dice ser PNG', 'logo.png', 'image/png', Buffer.from('esto no es una imagen')],
      ['un archivo vacío', 'logo.png', 'image/png', Buffer.alloc(0)],
      ['un GIF', 'logo.gif', 'image/gif', Buffer.from('GIF89a\u0001\u0000\u0001\u0000', 'latin1')],
      ['un PDF', 'logo.pdf', 'application/pdf', Buffer.from('%PDF-1.7\n', 'latin1')],
    ])('rechaza %s', async (_caso, nombre, tipo, contenido) => {
      const respuesta = await intentar(formularioLogo(nombre, tipo, contenido));

      expect(respuesta.statusCode).toBe(400);
      expect(cuerpoError(respuesta).codigo).toBe('ARCHIVO_INVALIDO');
    });

    it('rechaza un archivo de más de 1 MB', async () => {
      const respuesta = await intentar(
        formularioLogo('grande.png', 'image/png', pngDePrueba(1_048_576)),
      );

      expect(respuesta.statusCode).toBe(413);
      expect(cuerpoError(respuesta).codigo).toBe('ARCHIVO_DEMASIADO_GRANDE');
    });

    it('acepta un archivo justo en el límite de 1 MB', async () => {
      const contenido = pngDePrueba(1_048_576 - pngDePrueba().length);
      expect(contenido.length).toBe(1_048_576);
      const respuesta = await subirLogo(nuevaApp(), 'limite.png', 'image/png', contenido);

      expect(respuesta.statusCode).toBe(200);
    });

    it('rechaza una petición sin archivo', async () => {
      const respuesta = await intentar(
        formularioConArchivos([{ campo: 'logo', valor: 'solo texto' }]),
      );

      expect(respuesta.statusCode).toBe(400);
      expect(cuerpoError(respuesta).codigo).toBe('ARCHIVO_INVALIDO');
    });

    it('rechaza una petición que no es un formulario con archivo', async () => {
      const respuesta = await nuevaApp().inject({
        method: 'POST',
        url: '/empresa/logo',
        payload: { logo: 'hola' },
        headers: { cookie: `cambios_sesion=${token}` },
      });

      expect(respuesta.statusCode).toBe(400);
      expect(cuerpoError(respuesta).codigo).toBe('ARCHIVO_INVALIDO');
    });

    it('rechaza más de un archivo', async () => {
      const respuesta = await intentar(
        formularioConArchivos([
          {
            campo: 'logo',
            nombreArchivo: 'a.png',
            tipoMime: 'image/png',
            contenido: pngDePrueba(),
          },
          {
            campo: 'otro',
            nombreArchivo: 'b.png',
            tipoMime: 'image/png',
            contenido: pngDePrueba(),
          },
        ]),
      );

      expect(respuesta.statusCode).toBe(400);
      expect(cuerpoError(respuesta).codigo).toBe('ARCHIVO_INVALIDO');
    });
  });

  it('el nombre del archivo que envía el cliente no se usa: no hay forma de escribir fuera de la carpeta', async () => {
    const respuesta = await subirLogo(
      nuevaApp(),
      '../../../../escapado.png',
      'image/png',
      pngDePrueba(10),
    );

    expect(respuesta.statusCode).toBe(200);
    const archivos = await archivosDelLogo();
    expect(archivos.every((nombre) => /^logo-[0-9a-f]{32}\.(png|jpg)$/.test(nombre))).toBe(true);
    expect(archivos.join()).not.toContain('escapado');
  });

  describe('GET /empresa/logo', () => {
    it('responde 404 si no hay logo', async () => {
      const guardado = (await empresaEnBase()).logoUrl;
      await prisma.empresa.update({ where: { unica: true }, data: { logoUrl: null } });
      try {
        const respuesta = await nuevaApp().inject({ method: 'GET', url: '/empresa/logo' });
        expect(respuesta.statusCode).toBe(404);
        expect(cuerpoError(respuesta).codigo).toBe('NO_ENCONTRADO');
      } finally {
        await prisma.empresa.update({ where: { unica: true }, data: { logoUrl: guardado } });
      }
    });

    it('responde 404 si el archivo ya no existe o la clave guardada no es válida', async () => {
      const guardado = (await empresaEnBase()).logoUrl;
      try {
        for (const clave of [
          'empresa/logo-00000000000000000000000000000000.png',
          '../../etc/passwd',
        ]) {
          await prisma.empresa.update({ where: { unica: true }, data: { logoUrl: clave } });
          const respuesta = await nuevaApp().inject({ method: 'GET', url: '/empresa/logo' });
          expect(respuesta.statusCode, clave).toBe(404);
          await cerrarApp(app);
        }
      } finally {
        await prisma.empresa.update({ where: { unica: true }, data: { logoUrl: guardado } });
      }
    });
  });
});
