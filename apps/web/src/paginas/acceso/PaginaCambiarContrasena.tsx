import { useMutation } from '@tanstack/react-query';
import { useState, type SyntheticEvent } from 'react';
import { useNavigate } from 'react-router';

import { Aviso } from '../../componentes/Aviso.js';
import { Boton } from '../../componentes/Boton.js';
import { Campo } from '../../componentes/Campo.js';
import { erroresPorCampo, mensajeDe } from '../../lib/api.js';
import { useTitulo } from '../../lib/titulo.js';
import { cambiarContrasena } from '../../modulos/auth/api.js';
import { RUTA_DE_PASO, useAcceso } from '../../modulos/auth/ContextoAcceso.js';
import { useVolverAlAcceso } from '../../modulos/auth/useVolverAlAcceso.js';

const LONGITUD_MINIMA = 10;

export function PaginaCambiarContrasena() {
  useTitulo('Cambia tu contraseña');
  const acceso = useAcceso();
  const navegar = useNavigate();
  const volverAlAcceso = useVolverAlAcceso();
  const [actual, setActual] = useState('');
  const [nueva, setNueva] = useState('');
  const [repetida, setRepetida] = useState('');
  const [intento, setIntento] = useState(false);

  const cambiar = useMutation({
    mutationFn: () => cambiarContrasena(actual, nueva),
    onSuccess: ({ siguientePaso }) => {
      acceso.alAvanzar(siguientePaso);
      void navegar(RUTA_DE_PASO[siguientePaso], { replace: true });
    },
    onError: (error) => {
      if (!volverAlAcceso(error)) setActual('');
    },
  });

  // Validación local para dar respuesta inmediata; el servidor vuelve a validar todo.
  const errores: Record<string, string> = {};
  if (nueva.length < LONGITUD_MINIMA) {
    errores.nueva = `Debe tener al menos ${String(LONGITUD_MINIMA)} caracteres.`;
  } else if (nueva === actual) {
    errores.nueva = 'La contraseña nueva debe ser distinta de la temporal.';
  }
  if (repetida !== nueva) errores.repetida = 'Las contraseñas no coinciden.';
  const delServidor = erroresPorCampo(cambiar.error);

  const enviar = (evento: SyntheticEvent) => {
    evento.preventDefault();
    setIntento(true);
    if (Object.keys(errores).length === 0) cambiar.mutate();
  };

  return (
    <form onSubmit={enviar} noValidate>
      <h1>Cambia tu contraseña</h1>
      <Aviso tipo="info">
        {acceso.nombre ? `Hola, ${acceso.nombre}. ` : ''}Tu contraseña es temporal. Elige una nueva
        antes de continuar.
      </Aviso>
      {cambiar.isError && <Aviso tipo="error">{mensajeDe(cambiar.error)}</Aviso>}
      <Campo
        etiqueta="Contraseña temporal"
        type="password"
        autoComplete="current-password"
        required
        value={actual}
        onChange={(evento) => setActual(evento.target.value)}
      />
      <Campo
        etiqueta="Contraseña nueva"
        type="password"
        autoComplete="new-password"
        ayuda={`Mínimo ${String(LONGITUD_MINIMA)} caracteres.`}
        required
        value={nueva}
        onChange={(evento) => setNueva(evento.target.value)}
        error={
          intento ? (errores.nueva ?? delServidor.contrasenaNueva) : delServidor.contrasenaNueva
        }
      />
      <Campo
        etiqueta="Repite la contraseña nueva"
        type="password"
        autoComplete="new-password"
        required
        value={repetida}
        onChange={(evento) => setRepetida(evento.target.value)}
        error={intento ? errores.repetida : undefined}
      />
      <Boton type="submit" ancho cargando={cambiar.isPending} disabled={!actual}>
        Cambiar contraseña
      </Boton>
    </form>
  );
}
