import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState, type SyntheticEvent } from 'react';

import { Aviso } from '../../componentes/Aviso.js';
import { Boton } from '../../componentes/Boton.js';
import { Campo } from '../../componentes/Campo.js';
import { Cargando } from '../../componentes/Cargando.js';
import { mensajeDe } from '../../lib/api.js';
import { useTitulo } from '../../lib/titulo.js';
import { activar2fa, configurar2fa } from '../../modulos/auth/api.js';
import { CLAVE_SESION } from '../../modulos/auth/sesion.js';
import { useVolverAlAcceso } from '../../modulos/auth/useVolverAlAcceso.js';

/** El secreto en grupos de 4 letras, más fácil de leer y de escribir a mano. */
const agrupar = (secreto: string) => secreto.match(/.{1,4}/g)?.join(' ') ?? secreto;

export function PaginaConfigurar2fa() {
  useTitulo('Configura la verificación en dos pasos');
  const cliente = useQueryClient();
  const volverAlAcceso = useVolverAlAcceso();
  const [codigo, setCodigo] = useState('');
  const [copiado, setCopiado] = useState(false);

  const configuracion = useMutation({
    mutationFn: configurar2fa,
    onError: (error) => void volverAlAcceso(error),
  });

  // El secreto se genera una sola vez al abrir la pantalla (el modo estricto de React ejecuta los
  // efectos dos veces en desarrollo, y un segundo secreto invalidaría el QR que ya se está mostrando).
  const iniciado = useRef(false);
  useEffect(() => {
    if (iniciado.current) return;
    iniciado.current = true;
    configuracion.mutate();
  }, [configuracion]);

  const activar = useMutation({
    mutationFn: () => activar2fa(codigo),
    // Con la sesión completa, la pantalla de acceso redirige sola al sistema.
    onSuccess: () => cliente.invalidateQueries({ queryKey: CLAVE_SESION }),
    onError: (error) => {
      if (!volverAlAcceso(error)) setCodigo('');
    },
  });

  const enviar = (evento: SyntheticEvent) => {
    evento.preventDefault();
    activar.mutate();
  };

  const copiarSecreto = async (secreto: string) => {
    try {
      await navigator.clipboard.writeText(secreto);
      setCopiado(true);
    } catch {
      setCopiado(false); // sin permiso para copiar: la persona puede seleccionar el texto
    }
  };

  if (configuracion.isError) {
    return (
      <>
        <h1>Verificación en dos pasos</h1>
        <Aviso tipo="error">{mensajeDe(configuracion.error)}</Aviso>
      </>
    );
  }
  if (!configuracion.data) return <Cargando texto="Preparando tu código…" />;
  const { qr, secreto } = configuracion.data;

  return (
    <form onSubmit={enviar} noValidate>
      <h1>Configura la verificación en dos pasos</h1>
      <ol>
        <li>Instala Google Authenticator (u otra aplicación autenticadora) en tu teléfono.</li>
        <li>
          Escanea este código QR con la aplicación. Puedes escanearlo en{' '}
          <strong>todos los teléfonos que quieras usar</strong>: todos mostrarán los mismos códigos.
        </li>
        <li>Escribe aquí el código de 6 dígitos que muestra la aplicación.</li>
      </ol>
      <img className="qr" src={qr} alt="Código QR para la aplicación autenticadora" />
      <p className="campo__ayuda">Si no puedes escanearlo, escribe este código en la aplicación:</p>
      <div className="secreto">
        <code>{agrupar(secreto)}</code>
        <Boton variante="secundario" chico onClick={() => void copiarSecreto(secreto)}>
          {copiado ? 'Copiado' : 'Copiar'}
        </Boton>
      </div>
      {activar.isError && <Aviso tipo="error">{mensajeDe(activar.error)}</Aviso>}
      <Campo
        etiqueta="Código de 6 dígitos"
        className="codigo"
        inputMode="numeric"
        autoComplete="one-time-code"
        maxLength={6}
        pattern="[0-9]{6}"
        required
        value={codigo}
        onChange={(evento) => setCodigo(evento.target.value.replace(/\D/g, ''))}
      />
      <Boton type="submit" ancho cargando={activar.isPending} disabled={codigo.length !== 6}>
        Activar y entrar
      </Boton>
    </form>
  );
}
