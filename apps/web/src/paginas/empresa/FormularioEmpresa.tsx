import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState, type SyntheticEvent } from 'react';

import { Aviso } from '../../componentes/Aviso.js';
import { Boton } from '../../componentes/Boton.js';
import { Campo } from '../../componentes/Campo.js';
import { CampoAreaTexto } from '../../componentes/CampoAreaTexto.js';
import { CampoSelector } from '../../componentes/CampoSelector.js';
import { erroresPorCampo, mensajeDe } from '../../lib/api.js';
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

const ZONAS_SUGERIDAS = ['America/Bogota', 'America/Caracas', 'America/New_York', 'UTC'];

interface PropiedadesFormulario {
  empresa: Empresa;
  alGuardar: () => void;
}

/** Los datos de la empresa. Solo se envía lo que cambió; un texto vacío borra el dato opcional. */
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

  const cambiar = (campo: keyof typeof valores) => (valor: string) =>
    setValores((anteriores) => ({ ...anteriores, [campo]: valor }));

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

  const enviar = (evento: SyntheticEvent) => {
    evento.preventDefault();
    if (hayCambios) guardar.mutate();
  };

  return (
    <form className="formulario-ancho seccion" onSubmit={enviar} noValidate>
      <h2>Datos de la empresa</h2>
      {guardar.isError && <Aviso tipo="error">{mensajeDe(guardar.error)}</Aviso>}
      <Campo
        etiqueta="Nombre"
        required
        value={valores.nombre}
        onChange={(evento) => cambiar('nombre')(evento.target.value)}
        error={delServidor.nombre}
      />
      <Campo
        etiqueta="NIT"
        ayuda="Con puntos y guion, por ejemplo 900.123.456-7."
        value={valores.nit}
        onChange={(evento) => cambiar('nit')(evento.target.value)}
        error={delServidor.nit}
      />
      <Campo
        etiqueta="Teléfono"
        type="tel"
        value={valores.telefono}
        onChange={(evento) => cambiar('telefono')(evento.target.value)}
        error={delServidor.telefono}
      />
      <Campo
        etiqueta="WhatsApp"
        type="tel"
        ayuda="Aparece en los recibos."
        value={valores.whatsapp}
        onChange={(evento) => cambiar('whatsapp')(evento.target.value)}
        error={delServidor.whatsapp}
      />
      <Campo
        etiqueta="Dirección"
        value={valores.direccion}
        onChange={(evento) => cambiar('direccion')(evento.target.value)}
        error={delServidor.direccion}
      />
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
      <Campo
        etiqueta="Zona horaria"
        list="zonas-horarias"
        ayuda="Con ella se muestran las fechas y horas. Ejemplo: America/Bogota."
        autoCapitalize="none"
        spellCheck={false}
        value={valores.zonaHoraria}
        onChange={(evento) => cambiar('zonaHoraria')(evento.target.value)}
        error={delServidor.zonaHoraria}
      />
      <datalist id="zonas-horarias">
        {ZONAS_SUGERIDAS.map((zona) => (
          <option key={zona} value={zona} />
        ))}
      </datalist>
      <CampoAreaTexto
        etiqueta="Texto al pie del recibo"
        ayuda="Hasta 300 caracteres."
        maxLength={300}
        value={valores.textoPieRecibo}
        onChange={(evento) => cambiar('textoPieRecibo')(evento.target.value)}
        error={delServidor.textoPieRecibo}
      />
      <Boton type="submit" cargando={guardar.isPending} disabled={!hayCambios}>
        Guardar cambios
      </Boton>
    </form>
  );
}
