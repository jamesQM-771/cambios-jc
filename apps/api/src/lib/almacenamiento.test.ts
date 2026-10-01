import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { pngDePrueba } from '../../test/imagenes.js';

import { crearAlmacenamiento, versionDeClaveLogo, type Almacenamiento } from './almacenamiento.js';

let carpeta: string;
let almacen: Almacenamiento;

beforeAll(async () => {
  carpeta = await mkdtemp(join(tmpdir(), 'cambios-jc-almacen-'));
  almacen = crearAlmacenamiento(carpeta);
});

afterAll(async () => {
  await rm(carpeta, { recursive: true, force: true });
});

const leer = async (flujo: AsyncIterable<Buffer | string>) => {
  const trozos: Buffer[] = [];
  for await (const trozo of flujo) trozos.push(Buffer.from(trozo));
  return Buffer.concat(trozos);
};

describe('almacenamiento del logo', () => {
  it('guarda el archivo con un nombre generado por el servidor y lo devuelve tal cual', async () => {
    const contenido = pngDePrueba(100);

    const clave = await almacen.guardarLogo(contenido, 'png');

    expect(clave).toMatch(/^empresa\/logo-[0-9a-f]{32}\.png$/);
    expect(await readFile(join(carpeta, ...clave.split('/')))).toEqual(contenido);
    const abierto = await almacen.abrirLogo(clave);
    if (!abierto) throw new Error('el logo debía poder abrirse');
    expect(abierto.tamano).toBe(contenido.length);
    expect(await leer(abierto.flujo)).toEqual(contenido);
  });

  it('no deja archivos temporales y cada guardado tiene un nombre distinto', async () => {
    const claves = await Promise.all([
      almacen.guardarLogo(pngDePrueba(), 'png'),
      almacen.guardarLogo(pngDePrueba(), 'png'),
      almacen.guardarLogo(pngDePrueba(), 'jpg'),
    ]);

    expect(new Set(claves).size).toBe(3);
    const archivos = await readdir(join(carpeta, 'empresa'));
    expect(archivos.filter((nombre) => nombre.endsWith('.tmp'))).toEqual([]);
  });

  it.each([
    [''],
    ['../secreto.png'],
    ['empresa/../../secreto.png'],
    ['/etc/passwd'],
    ['empresa/logo-zz.png'],
    ['empresa/logo-00000000000000000000000000000000.gif'],
    ['empresa/logo-00000000000000000000000000000000.png/../../x'],
  ])('no abre la clave "%s"', async (clave) => {
    expect(await almacen.abrirLogo(clave)).toBeNull();
  });

  it('una clave válida cuyo archivo no existe devuelve null', async () => {
    expect(await almacen.abrirLogo('empresa/logo-00000000000000000000000000000000.png')).toBeNull();
  });

  it('descartar quita el archivo y es seguro con claves inválidas o que no existen', async () => {
    const clave = await almacen.guardarLogo(pngDePrueba(), 'png');

    await almacen.descartarLogo(clave);
    await almacen.descartarLogo(clave);
    await almacen.descartarLogo('../fuera.png');

    expect(await almacen.abrirLogo(clave)).toBeNull();
  });
});

describe('versionDeClaveLogo', () => {
  it('extrae la parte aleatoria de una clave válida', () => {
    expect(versionDeClaveLogo('empresa/logo-0123456789abcdef0123456789abcdef.jpg')).toBe(
      '0123456789abcdef0123456789abcdef',
    );
  });

  it('devuelve null para null o una clave que no es de logo', () => {
    expect(versionDeClaveLogo(null)).toBeNull();
    expect(versionDeClaveLogo('../x.png')).toBeNull();
    expect(versionDeClaveLogo('https://otro.sitio/logo.png')).toBeNull();
  });
});
