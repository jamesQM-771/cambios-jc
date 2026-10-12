import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useRef, useState, type SyntheticEvent } from 'react';

import { Aviso } from '../../componentes/Aviso.js';
import { Boton } from '../../componentes/Boton.js';
import { Campo } from '../../componentes/Campo.js';
import { CampoAreaTexto } from '../../componentes/CampoAreaTexto.js';
import { CampoDigitos, CampoTelefono, ResumenErrores } from '../../componentes/CamposEspeciales.js';
import { CampoSelector } from '../../componentes/CampoSelector.js';
import { DialogoConfirmacion } from '../../componentes/DialogoConfirmacion.js';
import { SeccionFormulario } from '../../componentes/Pagina.js';
import { erroresPorCampo, mensajeDe } from '../../lib/api.js';
import {
  DIGITOS_MAXIMOS_NIT,
  DIRECCION_VACIA,
  errorDeNit,
  formatearNit,
  LARGO_MAXIMO_DIRECCION,
  separarDireccion,
  separarNit,
  TIPOS_VIA,
  unirDireccion,
  unirNit,
  type PartesDireccion,
} from '../../lib/empresa.js';
import { errorDeTelefono, formatearTelefono, separarTelefono } from '../../lib/telefono.js';
import {
  editarEmpresa,
  CLAVE_EMPRESA,
  type CambiosEmpresa,
  type Empresa,
} from '../../modulos/empresa/api.js';
import { CLAVE_SESION } from '../../modulos/auth/sesion.js';

const MONEDAS = [
  { codigo: 'COP', nombre: 'COP — Peso colombiano' },
  { codigo: 'USD', nombre: 'USD — Dólar estadounidense' },
  { codigo: 'VES', nombre: 'VES — Bolívar venezolano' },
];

/** Zonas más probables para este negocio. La que ya tenga la empresa se añade si no está aquí. */
const ZONAS = [
  { zona: 'America/Bogota', nombre: 'Colombia (Bogotá)' },
  { zona: 'America/Caracas', nombre: 'Venezuela (Caracas)' },
  { zona: 'America/Guayaquil', nombre: 'Ecuador (Guayaquil)' },
  { zona: 'America/Lima', nombre: 'Perú (Lima)' },
  { zona: 'America/Panama', nombre: 'Panamá' },
  { zona: 'America/Mexico_City', nombre: 'México (Ciudad de México)' },
  { zona: 'America/New_York', nombre: 'Estados Unidos (Nueva York)' },
  { zona: 'America/Santiago', nombre: 'Chile (Santiago)' },
  { zona: 'America/Argentina/Buenos_Aires', nombre: 'Argentina (Buenos Aires)' },
  { zona: 'America/Sao_Paulo', nombre: 'Brasil (São Paulo)' },
  { zona: 'Europe/Madrid', nombre: 'España (Madrid)' },
  { zona: 'UTC', nombre: 'UTC (hora universal)' },
];

/** Hora de este momento en una zona, para comprobar de un vistazo que es la correcta. */
function horaEn(zona: string): string | null {
  try {
    return new Intl.DateTimeFormat('es-CO', { timeStyle: 'short', timeZone: zona }).format(
      new Date(),
    );
  } catch {
    return null;
  }
}

/** Zona del equipo donde se está usando el sistema. Solo se informa: nunca se guarda ni se aplica (D85). */
function zonaDelDispositivo(): string | null {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone;
  } catch {
    return null;
  }
}

interface PropiedadesFormulario {
  empresa: Empresa;
  alGuardar: () => void;
}

/**
 * Los datos de la empresa, por secciones. Solo se envía lo que cambió; un texto vacío borra el
 * dato opcional. El NIT, los teléfonos y la dirección se capturan por partes y se guardan como un
 * solo texto (D82 a D84): mientras nadie los toque, lo guardado no cambia.
 */
export function FormularioEmpresa({ empresa, alGuardar }: PropiedadesFormulario) {
  const cliente = useQueryClient();
  const [valores, setValores] = useState({
    nombre: empresa.nombre,
    nit: empresa.nit ?? '',
    telefono: empresa.telefono ?? '',
    whatsapp: empresa.whatsapp ?? '',
    direccion: empresa.direccion ?? '',
    monedaLocal: empresa.monedaLocal,
    zonaHoraria: empresa.zonaHoraria,
    textoPieRecibo: empresa.textoPieRecibo ?? '',
  });
  const [prefijoTelefono, setPrefijoTelefono] = useState(separarTelefono(empresa.telefono).prefijo);
  const [prefijoWhatsapp, setPrefijoWhatsapp] = useState(separarTelefono(empresa.whatsapp).prefijo);
  // Una dirección antigua que no sigue el formato por partes se edita como texto, sin adivinarla.
  const [partesDireccion, setPartesDireccion] = useState<PartesDireccion | null>(() =>
    separarDireccion(empresa.direccion),
  );
  const [confirmandoZona, setConfirmandoZona] = useState(false);

  const cambiar = (campo: keyof typeof valores) => (valor: string) =>
    setValores((anteriores) => ({ ...anteriores, [campo]: valor }));

  const nit = separarNit(valores.nit);
  const campoDigito = useRef<HTMLInputElement>(null);
  const cambiarNit = (numero: string, digito: string) =>
    cambiar('nit')(unirNit({ numero, digito }));
  /** Si pegan el NIT completo ("900.123.456-7") en el primer campo, el dígito pasa al segundo. */
  const alEscribirNit = (texto: string) => {
    if (/-\s*\d\s*$/.test(texto)) {
      const pegado = separarNit(texto);
      cambiarNit(pegado.numero.slice(0, DIGITOS_MAXIMOS_NIT), pegado.digito);
      return;
    }
    // Al teclear el guion se salta al dígito de verificación, como al escribirlo en papel.
    if (texto.trimEnd().endsWith('-')) campoDigito.current?.focus();
    cambiarNit(texto.replace(/\D/g, '').slice(0, DIGITOS_MAXIMOS_NIT), nit.digito);
  };

  const cambiarParte = (parte: keyof PartesDireccion) => (valor: string) => {
    const nuevas = { ...(partesDireccion ?? DIRECCION_VACIA), [parte]: valor };
    setPartesDireccion(nuevas);
    cambiar('direccion')(unirDireccion(nuevas));
  };

  const cambios: CambiosEmpresa = {};
  for (const campo of Object.keys(valores) as (keyof typeof valores)[]) {
    const nuevo = valores[campo].trim();
    if (nuevo !== (empresa[campo] ?? '')) cambios[campo] = nuevo;
  }
  const hayCambios = Object.keys(cambios).length > 0;

  const guardar = useMutation({
    mutationFn: () => editarEmpresa(cambios),
    onSuccess: async (editada) => {
      cliente.setQueryData(CLAVE_EMPRESA, editada);
      // El encabezado muestra el nombre y el logo de la empresa: se actualizan también.
      await cliente.invalidateQueries({ queryKey: CLAVE_SESION });
      alGuardar();
    },
  });
  const delServidor = erroresPorCampo(guardar.error);

  // Solo se revisa lo que la persona cambió: un dato antiguo guardado no bloquea el resto.
  const errores = {
    nit: 'nit' in cambios ? errorDeNit(nit.numero) : null,
    telefono:
      'telefono' in cambios ? errorDeTelefono(separarTelefono(valores.telefono).numero) : null,
    whatsapp:
      'whatsapp' in cambios ? errorDeTelefono(separarTelefono(valores.whatsapp).numero) : null,
    direccion:
      valores.direccion.length > LARGO_MAXIMO_DIRECCION
        ? `La dirección completa no puede pasar de ${String(LARGO_MAXIMO_DIRECCION)} caracteres.`
        : null,
  };
  const listaErrores = Object.values(errores).filter((error) => error !== null);
  const [intentoFallido, setIntentoFallido] = useState(false);

  const enviar = (evento: SyntheticEvent) => {
    evento.preventDefault();
    if (!hayCambios) return;
    if (listaErrores.length > 0) {
      setIntentoFallido(true);
      return;
    }
    setIntentoFallido(false);
    // Cambiar la zona mueve cómo se ven todas las fechas: se confirma antes (D85).
    if ('zonaHoraria' in cambios) setConfirmandoZona(true);
    else guardar.mutate();
  };

  const horaActual = horaEn(valores.zonaHoraria);
  const zonaEquipo = zonaDelDispositivo();
  const zonasDisponibles = ZONAS.some((opcion) => opcion.zona === empresa.zonaHoraria)
    ? ZONAS
    : [{ zona: empresa.zonaHoraria, nombre: empresa.zonaHoraria }, ...ZONAS];

  return (
    <form className="formulario-empresa" onSubmit={enviar} noValidate>
      {guardar.isError && <Aviso tipo="error">{mensajeDe(guardar.error)}</Aviso>}
      {intentoFallido && <ResumenErrores errores={listaErrores} />}

      <SeccionFormulario
        titulo="Identidad"
        descripcion="El nombre aparece en el encabezado del sistema. El NIT se guarda sin puntos."
      >
        <Campo
          etiqueta="Nombre"
          required
          value={valores.nombre}
          onChange={(evento) => cambiar('nombre')(evento.target.value)}
          error={delServidor.nombre}
        />
        <div className="campos-en-fila campos-en-fila--nit">
          <Campo
            etiqueta="NIT"
            className="mono"
            inputMode="numeric"
            autoComplete="off"
            ayuda={
              nit.numero === ''
                ? 'Solo números, sin puntos.'
                : `Se muestra como ${formatearNit(valores.nit)}.`
            }
            value={nit.numero}
            onChange={(evento) => {
              alEscribirNit(evento.target.value);
            }}
            error={errores.nit ?? delServidor.nit}
          />
          <CampoDigitos
            ref={campoDigito}
            etiqueta="Dígito de verificación"
            className="mono"
            ayuda="El número después del guion."
            maxLength={1}
            valor={nit.digito}
            alCambiar={(digito) => {
              cambiarNit(nit.numero, digito);
            }}
          />
        </div>
      </SeccionFormulario>

      <SeccionFormulario
        titulo="Contacto"
        descripcion="Elige el país y escribe el número sin el código. Se guarda en formato internacional."
      >
        <CampoTelefono
          etiqueta="Teléfono"
          valor={valores.telefono}
          alCambiar={cambiar('telefono')}
          prefijo={prefijoTelefono}
          alCambiarPrefijo={setPrefijoTelefono}
          {...(valores.telefono === '' ? {} : { ayuda: formatearTelefono(valores.telefono) })}
          error={errores.telefono ?? delServidor.telefono}
        />
        <CampoTelefono
          etiqueta="WhatsApp"
          valor={valores.whatsapp}
          alCambiar={cambiar('whatsapp')}
          prefijo={prefijoWhatsapp}
          alCambiarPrefijo={setPrefijoWhatsapp}
          {...(valores.whatsapp === '' ? {} : { ayuda: formatearTelefono(valores.whatsapp) })}
          error={errores.whatsapp ?? delServidor.whatsapp}
        />
      </SeccionFormulario>

      <SeccionFormulario
        titulo="Dirección"
        descripcion="Escríbela por partes: el sistema la arma y la guarda como una sola línea."
      >
        {partesDireccion ? (
          <>
            <div className="campos-en-fila">
              <CampoSelector
                etiqueta="Tipo de vía"
                value={partesDireccion.tipoVia}
                onChange={(evento) => {
                  cambiarParte('tipoVia')(evento.target.value);
                }}
              >
                {TIPOS_VIA.map((tipo) => (
                  <option key={tipo} value={tipo}>
                    {tipo}
                  </option>
                ))}
              </CampoSelector>
              <Campo
                etiqueta="Vía"
                ayuda="Número o nombre: 10, 5A."
                autoComplete="off"
                value={partesDireccion.via}
                onChange={(evento) => {
                  cambiarParte('via')(evento.target.value);
                }}
              />
              <Campo
                etiqueta="Número"
                ayuda="Después del #."
                autoComplete="off"
                value={partesDireccion.numero}
                onChange={(evento) => {
                  cambiarParte('numero')(evento.target.value);
                }}
              />
              <Campo
                etiqueta="Placa"
                ayuda="Después del guion."
                autoComplete="off"
                value={partesDireccion.placa}
                onChange={(evento) => {
                  cambiarParte('placa')(evento.target.value);
                }}
              />
            </div>
            <Campo
              etiqueta="Complemento"
              ayuda="Opcional: local, oficina, piso o barrio."
              autoComplete="off"
              value={partesDireccion.complemento}
              onChange={(evento) => {
                cambiarParte('complemento')(evento.target.value);
              }}
            />
            <div className="campos-en-fila">
              <Campo
                etiqueta="Ciudad o municipio"
                autoComplete="off"
                value={partesDireccion.ciudad}
                onChange={(evento) => {
                  cambiarParte('ciudad')(evento.target.value);
                }}
              />
              <Campo
                etiqueta="Departamento o estado"
                autoComplete="off"
                value={partesDireccion.departamento}
                onChange={(evento) => {
                  cambiarParte('departamento')(evento.target.value);
                }}
              />
              <Campo
                etiqueta="País"
                autoComplete="off"
                value={partesDireccion.pais}
                onChange={(evento) => {
                  cambiarParte('pais')(evento.target.value);
                }}
              />
            </div>
            <p className="direccion-armada" role="status">
              {valores.direccion === '' ? (
                'Sin dirección.'
              ) : (
                <>
                  Se guardará así: <strong>{valores.direccion}</strong>
                </>
              )}
            </p>
            {(errores.direccion ?? delServidor.direccion) && (
              <span className="campo__error">{errores.direccion ?? delServidor.direccion}</span>
            )}
          </>
        ) : (
          <>
            <Campo
              etiqueta="Dirección"
              ayuda="Esta dirección se escribió como texto libre. Puedes corregirla aquí o volver a escribirla por partes."
              value={valores.direccion}
              onChange={(evento) => cambiar('direccion')(evento.target.value)}
              error={errores.direccion ?? delServidor.direccion}
            />
            <Boton
              variante="secundario"
              chico
              onClick={() => {
                setPartesDireccion({ ...DIRECCION_VACIA });
                cambiar('direccion')('');
              }}
            >
              Escribirla por partes
            </Boton>
          </>
        )}
      </SeccionFormulario>

      <SeccionFormulario
        titulo="Región"
        descripcion="La zona horaria es de la empresa: con ella se muestran todas las fechas, sin importar dónde esté el equipo."
      >
        <CampoSelector
          etiqueta="Moneda local"
          value={valores.monedaLocal}
          onChange={(evento) => cambiar('monedaLocal')(evento.target.value)}
          error={delServidor.monedaLocal}
        >
          {MONEDAS.map((moneda) => (
            <option key={moneda.codigo} value={moneda.codigo}>
              {moneda.nombre}
            </option>
          ))}
        </CampoSelector>
        <CampoSelector
          etiqueta="Zona horaria"
          {...(horaActual ? { ayuda: `Ahora mismo allí son las ${horaActual}.` } : {})}
          value={valores.zonaHoraria}
          onChange={(evento) => cambiar('zonaHoraria')(evento.target.value)}
          error={delServidor.zonaHoraria}
        >
          {zonasDisponibles.map((opcion) => (
            <option key={opcion.zona} value={opcion.zona}>
              {opcion.nombre}
            </option>
          ))}
        </CampoSelector>
        {zonaEquipo !== null && zonaEquipo !== valores.zonaHoraria && (
          <p className="campo__ayuda nota-zona">
            Este equipo está en otra zona ({zonaEquipo}). No pasa nada: el sistema sigue mostrando
            las fechas en la zona de la empresa.
          </p>
        )}
      </SeccionFormulario>

      <SeccionFormulario
        titulo="Recibos"
        descripcion="Todavía no tiene efecto: se usará cuando el sistema imprima recibos, en la fase de remesas."
      >
        <CampoAreaTexto
          etiqueta="Mensaje al pie del recibo"
          ayuda="Hasta 300 caracteres. Ejemplo: «Conserve este recibo. Reclamos dentro de las 24 horas»."
          maxLength={300}
          value={valores.textoPieRecibo}
          onChange={(evento) => cambiar('textoPieRecibo')(evento.target.value)}
          error={delServidor.textoPieRecibo}
        />
      </SeccionFormulario>

      <div className="formulario-empresa__pie">
        <Boton type="submit" cargando={guardar.isPending} disabled={!hayCambios}>
          Guardar cambios
        </Boton>
      </div>

      <DialogoConfirmacion
        abierto={confirmandoZona}
        titulo="¿Cambiar la zona horaria?"
        textoConfirmar="Sí, cambiarla"
        cargando={guardar.isPending}
        alConfirmar={() => {
          setConfirmandoZona(false);
          guardar.mutate();
        }}
        alCancelar={() => {
          setConfirmandoZona(false);
        }}
      >
        <p>
          Lo guardado no cambia, pero todas las fechas del sistema (también las antiguas) se verán
          en la zona nueva, y cambia qué operaciones caen en cada día.
        </p>
      </DialogoConfirmacion>
    </form>
  );
}
