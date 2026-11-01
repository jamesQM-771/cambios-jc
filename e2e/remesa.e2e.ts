import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { expect, test, type Browser, type BrowserContext, type Page } from '@playwright/test';

import type { DatosE2e } from './preparar-datos.mjs';

const datos = JSON.parse(
  readFileSync(fileURLToPath(new URL('./.datos.json', import.meta.url)), 'utf8'),
) as DatosE2e;

// 50.000 pesos a tasa 3,76 = 13.297,872340… → truncado a 3 decimales (D15).
const PESOS = '50000';
const BOLIVARES = 'VES 13.297,872';

// Fase 4: el administrador compra 100.000 Bs a 3,70 a crédito antes del pago. Con el inventario vacío
// (la base se rehace), el costo es 3,70: bruta = (3,76 − 3,70) × 13.297,872 = 797,87; costo bancario
// por defecto de la cuenta 1,5 Bs × 3,70 = 5,55; neta = 792,32 (D140).
const GANANCIA_NETA = 'COP 792';
const PROVEEDOR = `Proveedor E2E ${String(Date.now()).slice(-6)}`;

/** Un PNG con firma y cabecera válidas: el servidor revisa el contenido, no el nombre. */
const CAPTURA = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d]),
  Buffer.from('IHDR', 'latin1'),
  Buffer.alloc(17, 1),
]);

async function contexto(
  browser: Browser,
  token: string | null,
  opciones: { movil?: boolean } = {},
): Promise<BrowserContext> {
  const nuevo = await browser.newContext({
    baseURL: 'http://localhost:5184',
    ...(opciones.movil ? { viewport: { width: 375, height: 812 }, isMobile: true } : {}),
  });
  if (token) {
    await nuevo.addCookies([
      { name: 'cambios_sesion', value: token, url: 'http://localhost:5184' },
    ]);
  }
  // La impresión de verdad abriría el diálogo del sistema: aquí solo se cuenta que se pidió.
  await nuevo.addInitScript(() => {
    const ventana = window as unknown as { __impresiones: number };
    ventana.__impresiones = 0;
    window.print = () => {
      ventana.__impresiones += 1;
    };
  });
  return nuevo;
}

const impresiones = (pagina: Page) =>
  pagina.evaluate(() => (window as unknown as { __impresiones: number }).__impresiones);

test.describe.serial('recorrido de una remesa', () => {
  let browser: Browser;
  let vendedor: BrowserContext;
  let paginaVendedor: Page;
  let codigo = '';

  test.beforeAll(async ({ browser: navegador }) => {
    browser = navegador;
    vendedor = await contexto(browser, datos.tokens.vendedor);
    paginaVendedor = await vendedor.newPage();
  });

  test.afterAll(async () => {
    await vendedor.close();
  });

  test('sin turno abierto el vendedor no registra remesas; abre su turno desde Mi turno', async () => {
    await paginaVendedor.goto('/remesas');
    await paginaVendedor.getByRole('button', { name: 'Nueva remesa' }).click();
    await expect(paginaVendedor.getByText(/No tienes un turno de caja abierto/)).toBeVisible();
    await paginaVendedor.goto('/turno');

    await paginaVendedor
      .getByLabel('Caja', { exact: true })
      .selectOption({ label: `${datos.caja.puesto} · ${datos.caja.sucursal}` });
    // La caja arranca vacía: se cuenta cero y se abre.
    await paginaVendedor.getByRole('button', { name: 'Abrir turno' }).click();

    await expect(
      paginaVendedor.getByRole('heading', { name: `Turno abierto en ${datos.caja.puesto}` }),
    ).toBeVisible();
  });

  test('el vendedor registra la remesa y se emite el recibo', async () => {
    await paginaVendedor.goto('/remesas');
    await expect(paginaVendedor.getByRole('heading', { name: 'Remesas' })).toBeVisible();

    await paginaVendedor.getByRole('button', { name: 'Nueva remesa' }).click();
    await paginaVendedor.getByLabel('Remitente').fill(datos.remitente.documento);
    await paginaVendedor.getByRole('button', { name: new RegExp(datos.remitente.nombre) }).click();
    await paginaVendedor.getByLabel('Beneficiario').fill(datos.beneficiario.documento);
    await paginaVendedor
      .getByRole('button', { name: new RegExp(datos.beneficiario.nombre) })
      .click();
    await paginaVendedor.getByRole('radio').first().check();
    await paginaVendedor.getByLabel('Pesos entregados (COP)').fill(PESOS);

    // La vista previa usa la misma conversión que el servidor.
    await expect(
      paginaVendedor.getByRole('dialog', { name: 'Nueva remesa' }).locator('.vista-previa'),
    ).toContainText(BOLIVARES);
    await paginaVendedor.getByRole('button', { name: 'Registrar remesa' }).click();

    await paginaVendedor.getByRole('button', { name: 'Emitir e imprimir' }).click();
    const ticket = paginaVendedor.getByRole('article', { name: /^Recibo \d+$/ });
    await expect(ticket).toBeVisible();
    await expect(ticket).not.toContainText('COPIA');
    await expect(ticket).toContainText('COP 50.000');
    await expect(ticket).toContainText(BOLIVARES);
    await expect.poll(() => impresiones(paginaVendedor)).toBe(1);

    codigo = (
      await ticket.locator('.recibo__fila', { hasText: 'Seguimiento' }).locator('dd').innerText()
    ).trim();
    expect(codigo).toMatch(/^[0-9A-HJKMNP-TV-Z]{12}$/);
    await paginaVendedor.getByRole('button', { name: 'Cerrar', exact: true }).click();
  });

  test('el administrador registra un proveedor y le compra bolívares a crédito; el inventario toma su costo', async () => {
    const admin = await contexto(browser, datos.tokens.administrador);
    const pagina = await admin.newPage();
    await pagina.goto('/contrapartes');
    await pagina.getByRole('button', { name: 'Nueva contraparte' }).click();
    const nueva = pagina.getByRole('dialog', { name: 'Nueva contraparte' });
    await nueva.getByLabel('Nombre').fill(PROVEEDOR);
    await nueva.getByRole('button', { name: 'Crear contraparte' }).click();
    await expect(pagina.getByText('Contraparte creada.')).toBeVisible();

    await pagina.goto('/compras');
    await pagina.getByRole('button', { name: 'Nueva compra' }).click();
    const compra = pagina.getByRole('dialog', { name: 'Nueva compra' });
    await compra.getByLabel('Contraparte').selectOption({ label: PROVEEDOR });
    await compra.getByLabel('Entran a').selectOption({ label: `${datos.cuentaOrigen} (VES)` });
    await compra.getByLabel(/^Cantidad recibida/).fill('100000');
    await compra.getByLabel(/^Tasa de compra/).fill('3,70');
    await expect(compra.getByText('COP 370.000')).toBeVisible();
    await compra.getByLabel('Forma de pago').selectOption('credito');
    await compra.getByRole('button', { name: 'Registrar compra' }).click();
    await expect(pagina.getByText('Compra registrada.')).toBeVisible();

    await pagina.goto('/inventario');
    const tarjeta = pagina.getByLabel('Inventario en VES');
    await expect(tarjeta).toContainText('VES 100.000,000');
    await expect(tarjeta).toContainText('3,70');
    await admin.close();
  });

  test('el digitador toma la transferencia, la paga con su captura y el vendedor se entera sin recargar', async () => {
    await paginaVendedor.goto('/remesas');
    await expect(
      paginaVendedor.locator('tr', { hasText: datos.remitente.nombre }).first(),
    ).toContainText('En cola');

    const digitador = await contexto(browser, datos.tokens.digitador, { movil: true });
    const pagina = await digitador.newPage();
    await pagina.goto('/');
    // Entra directo a su cola, sin menú.
    await expect(pagina.getByRole('heading', { name: 'Cola de pagos' })).toBeVisible();
    await expect(pagina.getByRole('navigation', { name: 'Menú principal' })).toHaveCount(0);

    const tarjeta = pagina.locator('li.transferencia', { hasText: BOLIVARES });
    await expect(tarjeta).toHaveCount(1);
    // Antes de tomarla solo ve el banco y el monto.
    await expect(tarjeta).not.toContainText(datos.beneficiario.titular);
    await tarjeta.getByRole('button', { name: 'Tomar' }).click();

    const mia = pagina.locator('li.transferencia--mia', { hasText: BOLIVARES });
    await expect(mia).toContainText(datos.beneficiario.titular);

    // Sin pesos, tasa ni datos del remitente en ninguna parte de la pantalla del digitador.
    const texto = await pagina.locator('body').innerText();
    for (const prohibido of [datos.remitente.nombre, datos.remitente.documento, 'COP', '50.000']) {
      expect(texto, `la pantalla del digitador muestra "${prohibido}"`).not.toContain(prohibido);
    }
    // Y en el teléfono nada se sale de la pantalla.
    const desborda = await pagina.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth,
    );
    expect(desborda).toBe(false);

    await mia.getByLabel('Cuenta desde la que pagaste').selectOption({ label: datos.cuentaOrigen });
    await mia.getByLabel('Referencia del banco (opcional)').fill(`E2E${String(Date.now())}`);
    await mia.getByLabel('Captura del comprobante').setInputFiles({
      name: 'captura.png',
      mimeType: 'image/png',
      buffer: CAPTURA,
    });
    await mia.getByRole('button', { name: 'Completar transferencia' }).click();
    await expect(pagina.getByText(BOLIVARES)).toHaveCount(0);

    // El vendedor, con su pantalla abierta, recibe el aviso en vivo (sin recargar).
    await expect(paginaVendedor.getByText('Una remesa pasó a: Completada.')).toBeVisible();
    await digitador.close();
  });

  test('el vendedor ve la remesa completada con la captura, y la reimpresión sale como COPIA', async () => {
    await paginaVendedor.goto('/remesas');
    const fila = paginaVendedor.locator('tr', { hasText: datos.remitente.nombre }).first();
    await expect(fila).toContainText('Completada');
    await fila.getByRole('button', { name: /Abrir remesa/ }).click();

    const detalle = paginaVendedor.getByRole('dialog', { name: 'Remesa' });
    await expect(detalle.getByText(codigo)).toBeVisible();
    const captura = detalle.getByRole('img', { name: /Captura del comprobante/ });
    await expect(captura).toBeVisible();
    const respuesta = await vendedor.request.get(
      new URL((await captura.getAttribute('src')) ?? '', 'http://localhost:5184').toString(),
    );
    expect(respuesta.status()).toBe(200);
    expect(respuesta.headers()['content-type']).toBe('image/png');

    await detalle.getByRole('button', { name: 'Recibo' }).click();
    await paginaVendedor.getByRole('button', { name: 'Emitir e imprimir' }).click();
    await expect(paginaVendedor.getByRole('article', { name: /copia/ })).toContainText('COPIA');
  });

  test('el administrador ve la ganancia neta de la remesa y la deuda con el proveedor', async () => {
    const admin = await contexto(browser, datos.tokens.administrador);
    const pagina = await admin.newPage();
    await pagina.goto('/remesas');
    const fila = pagina.locator('tr', { hasText: datos.remitente.nombre }).first();
    await fila.getByRole('button', { name: /Abrir remesa/ }).click();
    const detalle = pagina.getByRole('dialog', { name: 'Remesa' });
    await expect(detalle).toContainText('Ganancia neta');
    await expect(detalle).toContainText(GANANCIA_NETA);

    // El vendedor no la ve.
    await paginaVendedor.goto('/remesas');
    await paginaVendedor
      .locator('tr', { hasText: datos.remitente.nombre })
      .first()
      .getByRole('button', { name: /Abrir remesa/ })
      .click();
    await expect(paginaVendedor.getByRole('dialog', { name: 'Remesa' })).toContainText(codigo);
    await expect(paginaVendedor.getByRole('dialog', { name: 'Remesa' })).not.toContainText(
      'Ganancia',
    );
    await paginaVendedor.keyboard.press('Escape');

    await pagina.goto('/contrapartes');
    await expect(pagina.locator('tr', { hasText: PROVEEDOR })).toContainText('Le debo COP 370.000');
    await admin.close();
  });

  test('el vendedor registra un gasto y un traslado a la bóveda, y el libro los descuenta de su caja', async () => {
    await paginaVendedor.goto('/gastos');
    await paginaVendedor.getByRole('button', { name: 'Nuevo gasto' }).click();
    const gasto = paginaVendedor.getByRole('dialog', { name: 'Nuevo gasto' });
    await gasto.getByLabel('Categoría').selectOption({ label: datos.categoriaGasto });
    await gasto.getByLabel('Descripción').fill('Taxi al banco');
    await gasto.getByLabel('Monto (COP)').fill('10000');
    await gasto.getByRole('button', { name: 'Registrar gasto' }).click();
    await expect(paginaVendedor.getByText('Gasto registrado.')).toBeVisible();

    await paginaVendedor.goto('/traslados');
    await paginaVendedor.getByRole('button', { name: 'Nuevo traslado' }).click();
    const traslado = paginaVendedor.getByRole('dialog', { name: 'Nuevo traslado' });
    await traslado
      .getByLabel('Sale de')
      .selectOption({ label: `${datos.caja.cuentaEfectivo} · efectivo (COP)` });
    await traslado
      .getByLabel('Entra a')
      .selectOption({ label: `${datos.caja.boveda} · efectivo (COP)` });
    await traslado.getByLabel('Monto (COP)').fill('20000');
    await traslado.getByRole('button', { name: 'Trasladar' }).click();
    await expect(paginaVendedor.getByText('Traslado registrado.')).toBeVisible();
  });

  test('el vendedor cierra su turno contando el efectivo y el arqueo cuadra', async () => {
    // Entró 50.000 de la remesa en efectivo, salieron 10.000 de gasto y 20.000 al trasladar: 20.000.
    await paginaVendedor.goto('/turno');
    await paginaVendedor.getByRole('button', { name: 'Cerrar turno' }).click();
    const cierre = paginaVendedor.getByRole('dialog', { name: 'Cerrar turno' });
    await cierre.getByLabel('Cantidad de COP 10.000').fill('2');
    await cierre.getByRole('button', { name: 'Cerrar turno' }).click();

    await expect(paginaVendedor.getByRole('heading', { name: 'Turno cerrado' })).toBeVisible();
    await expect(
      paginaVendedor.getByRole('table', { name: 'Arqueo del cierre' }).getByText('Cuadrado'),
    ).toBeVisible();
  });

  test('el administrador cierra la jornada y ve el resumen del día', async () => {
    const admin = await contexto(browser, datos.tokens.administrador);
    const pagina = await admin.newPage();
    await pagina.goto('/jornada');
    const fila = pagina.locator('tr', { hasText: datos.caja.sucursal });
    await expect(fila).toContainText('Abierta');
    await fila.getByRole('button', { name: /Abrir la jornada/ }).click();

    const jornada = pagina.getByRole('dialog', { name: 'Jornada' });
    // Sin turnos abiertos: ya se puede cerrar. Se reporta el saldo de cada cuenta sin caja; la
    // explicación solo cuenta cuando hay diferencia, y si cuadra el servidor la ignora.
    await expect(jornada.getByText('No hay turnos abiertos ni pagos a medias.')).toBeVisible();
    await jornada
      .getByLabel(/^Saldo real de /)
      .first()
      .waitFor();
    const campos = jornada.getByLabel(/^Saldo real de /);
    for (let i = 0; i < (await campos.count()); i += 1) {
      const campo = campos.nth(i);
      const nombre = await campo.evaluate(
        (el) => (el as HTMLInputElement).labels?.[0]?.textContent ?? '',
      );
      await campo.fill(nombre.includes(datos.caja.boveda) ? '20000' : '0');
    }
    const explicaciones = jornada.getByLabel(/^Explicación de la diferencia en /);
    for (let i = 0; i < (await explicaciones.count()); i += 1) {
      await explicaciones.nth(i).fill('Cierre de la prueba E2E');
    }
    await jornada.getByRole('button', { name: 'Cerrar jornada' }).click();

    await expect(pagina.getByText('Jornada cerrada.')).toBeVisible();
    await expect(jornada.getByRole('button', { name: 'Reabrir la jornada' })).toBeVisible();
    await expect(
      jornada.locator('.resumen-dia > div', { hasText: 'Gastos operativos' }).first(),
    ).toContainText('COP 10.000');
    await expect(jornada.locator('.resumen-dia > div', { hasText: 'Traslados' })).toContainText(
      '1',
    );
    // Fase 4: la ganancia de la remesa pagada y la deuda con el proveedor entran al resumen.
    await expect(
      jornada.locator('.resumen-dia > div', { hasText: 'Ganancia de remesas' }),
    ).toContainText(GANANCIA_NETA);
    await expect(
      jornada.locator('.resumen-dia > div', { hasText: 'Contrapartes en COP' }),
    ).toContainText('Les debo COP 370.000');
    await admin.close();
  });

  test('el cliente consulta su envío con el código, sin iniciar sesión y sin ver datos de nadie', async () => {
    const anonimo = await contexto(browser, null);
    const pagina = await anonimo.newPage();

    await pagina.goto(`/seguimiento/${codigo}`);

    await expect(pagina.getByText('Enviada', { exact: true })).toBeVisible();
    await expect(pagina.getByText('Tu envío fue realizado.')).toBeVisible();
    await expect(pagina.getByText(BOLIVARES)).toBeVisible();
    const texto = await pagina.locator('body').innerText();
    for (const prohibido of [
      datos.remitente.nombre,
      datos.remitente.documento,
      datos.beneficiario.nombre,
      datos.beneficiario.titular,
      'COP',
    ]) {
      expect(texto, `el seguimiento público muestra "${prohibido}"`).not.toContain(prohibido);
    }

    await pagina.goto('/seguimiento/ZZZZZZZZZZZZ');
    await expect(pagina.getByText(/No encontramos un envío con ese código/)).toBeVisible();
    await anonimo.close();
  });

  test('las pantallas protegidas llevan al acceso sin sesión, y cada rol ve solo lo suyo', async () => {
    const anonimo = await contexto(browser, null);
    const sinSesion = await anonimo.newPage();
    await sinSesion.goto('/remesas');
    await expect(sinSesion).toHaveURL(/\/acceso/);
    await anonimo.close();

    // El vendedor no ve la cola de pagos ni la configuración.
    await paginaVendedor.goto('/cola');
    await expect(
      paginaVendedor.getByText('No tienes permiso para ver esta pantalla.'),
    ).toBeVisible();
    await paginaVendedor.goto('/configuracion');
    await expect(
      paginaVendedor.getByText('No tienes permiso para ver esta pantalla.'),
    ).toBeVisible();

    // El digitador no puede abrir las remesas ni los clientes.
    const digitador = await contexto(browser, datos.tokens.digitador);
    const pagina = await digitador.newPage();
    await pagina.goto('/remesas');
    await expect(pagina.getByText('No tienes permiso para ver esta pantalla.')).toBeVisible();
    await digitador.close();
  });
});
